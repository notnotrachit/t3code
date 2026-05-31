/**
 * KiroAdapterLive — Kiro CLI (`kiro-cli acp`) via ACP.
 *
 * @module KiroAdapterLive
 */

import {
  ApprovalRequestId,
  type KiroSettings,
  EventId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderUserInputAnswers,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  type ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { ChildProcessSpawner } from "effect/unstable/process";
import type * as EffectAcpErrors from "effect-acp/errors";

import { ServerConfig } from "../../config.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { acpPermissionOutcome, mapAcpToAdapterError } from "../acp/AcpAdapterSupport.ts";
import {
  AcpSessionRuntime,
  type AcpSessionRuntimeShape,
  type AcpSpawnInput,
} from "../acp/AcpSessionRuntime.ts";
import {
  makeAcpAssistantItemEvent,
  makeAcpContentDeltaEvent,
  makeAcpPlanUpdatedEvent,
  makeAcpToolCallEvent,
} from "../acp/AcpCoreRuntimeEvents.ts";
import { parsePermissionRequest } from "../acp/AcpRuntimeModel.ts";
import { makeAcpNativeLoggerFactory } from "../acp/AcpNativeLogging.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import type { EventNdjsonLogger } from "./EventNdjsonLogger.ts";

const PROVIDER = ProviderDriverKind.make("kiro");

export interface KiroAdapterLiveOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly nativeEventLogger?: EventNdjsonLogger;
  readonly instanceId?: ProviderInstanceId;
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>;
}

interface PendingUserInput {
  readonly answers: Deferred.Deferred<ProviderUserInputAnswers>;
}

interface KiroSessionContext {
  readonly threadId: ThreadId;
  session: ProviderSession;
  readonly scope: Scope.Closeable;
  readonly acp: AcpSessionRuntimeShape;
  acpSessionId: string | undefined;
  notificationFiber: Fiber.Fiber<void, never> | undefined;
  readonly pendingApprovals: Map<ApprovalRequestId, PendingApproval>;
  readonly pendingUserInputs: Map<ApprovalRequestId, PendingUserInput>;
  readonly turns: Array<{ id: TurnId; items: Array<unknown> }>;
  activeTurnId: TurnId | undefined;
  stopped: boolean;
}

function buildKiroAcpSpawnInput(
  settings: KiroSettings,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
  model?: string,
): AcpSpawnInput {
  return {
    command: settings.binaryPath,
    args: ["acp", ...(model && model !== "auto" ? ["--model", model] : [])],
    cwd,
    ...(environment ? { env: environment } : {}),
  };
}

export function makeKiroAdapter(
  kiroSettings: KiroSettings,
  options?: KiroAdapterLiveOptions,
): Effect.Effect<
  ProviderAdapterShape<ProviderAdapterError>,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto | ServerConfig | Scope.Scope
> {
  return Effect.gen(function* () {
    const boundInstanceId = options?.instanceId ?? ProviderInstanceId.make("kiro");
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const serverConfig = yield* Effect.service(ServerConfig);
    const crypto = yield* Crypto.Crypto;
    const makeAcpNativeLoggers = yield* makeAcpNativeLoggerFactory();

    const sessions = new Map<ThreadId, KiroSessionContext>();
    const threadLocksRef = yield* SynchronizedRef.make(new Map<string, Semaphore.Semaphore>());
    const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();

    const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
    const randomUUIDv4 = crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) =>
          new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "crypto/randomUUIDv4",
            detail: "Failed to generate Kiro runtime identifier.",
            cause,
          }),
      ),
    );
    const nextEventId = Effect.map(randomUUIDv4, (id) => EventId.make(id));
    const makeEventStamp = () => Effect.all({ eventId: nextEventId, createdAt: nowIso });

    const getThreadSemaphore = (threadId: string) =>
      SynchronizedRef.modifyEffect(threadLocksRef, (current) => {
        const existing = Option.fromNullishOr(current.get(threadId));
        return Option.match(existing, {
          onNone: () =>
            Semaphore.make(1).pipe(
              Effect.map((semaphore) => {
                const next = new Map(current);
                next.set(threadId, semaphore);
                return [semaphore, next] as const;
              }),
            ),
          onSome: (semaphore) => Effect.succeed([semaphore, current] as const),
        });
      });

    const withThreadLock = <A, E, R>(threadId: string, effect: Effect.Effect<A, E, R>) =>
      Effect.flatMap(getThreadSemaphore(threadId), (semaphore) => semaphore.withPermit(effect));

    const offerRuntimeEvent = (event: ProviderRuntimeEvent) =>
      PubSub.publish(runtimeEventPubSub, event).pipe(Effect.asVoid);

    const requireSession = (
      threadId: ThreadId,
    ): Effect.Effect<KiroSessionContext, ProviderAdapterSessionNotFoundError> => {
      const ctx = sessions.get(threadId);
      if (!ctx || ctx.stopped) {
        return Effect.fail(
          new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId }),
        );
      }
      return Effect.succeed(ctx);
    };

    const adapter: ProviderAdapterShape<ProviderAdapterError> = {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "in-session" },

      startSession: (input) =>
        withThreadLock(
          input.threadId,
          Effect.gen(function* () {
            const existing = sessions.get(input.threadId);
            if (existing && !existing.stopped) {
              return existing.session;
            }

            const sessionScope = yield* Scope.make();
            const cwd = input.cwd ?? serverConfig.cwd;
            const acpNativeLoggers = makeAcpNativeLoggers(input.threadId);

            const acp = yield* Effect.gen(function* () {
              const acpLayer = AcpSessionRuntime.layer({
                spawn: buildKiroAcpSpawnInput(
                  kiroSettings,
                  cwd,
                  options?.environment,
                  input.modelSelection?.model,
                ),
                cwd,
                clientInfo: { name: "t3-code", version: "0.0.0" },
                ...(acpNativeLoggers.requestLogger
                  ? { requestLogger: acpNativeLoggers.requestLogger }
                  : {}),
              }).pipe(
                Layer.provide(
                  Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
                ),
              );
              const acpContext = yield* Layer.build(acpLayer);
              return yield* Effect.service(AcpSessionRuntime).pipe(Effect.provide(acpContext));
            }).pipe(
              Effect.provideService(Scope.Scope, sessionScope),
              Effect.mapError(
                (cause) =>
                  new ProviderAdapterProcessError({
                    provider: PROVIDER,
                    threadId: input.threadId,
                    detail:
                      typeof cause === "object" && cause !== null && "message" in cause
                        ? String((cause as { message: unknown }).message)
                        : String(cause),
                    cause,
                  }),
              ),
            );

            const pendingApprovals = new Map<ApprovalRequestId, PendingApproval>();
            const pendingUserInputs = new Map<ApprovalRequestId, PendingUserInput>();

            // Wire permission handler
            yield* acp
              .handleRequestPermission((request) =>
                Effect.gen(function* () {
                  const requestId = ApprovalRequestId.make(yield* randomUUIDv4);
                  const runtimeRequestId = RuntimeRequestId.make(requestId);
                  const parsed = parsePermissionRequest(request);
                  const decision = yield* Deferred.make<ProviderApprovalDecision>();
                  pendingApprovals.set(requestId, { decision });

                  yield* offerRuntimeEvent({
                    type: "approval.requested",
                    ...(yield* makeEventStamp()),
                    provider: PROVIDER,
                    instanceId: boundInstanceId,
                    threadId: input.threadId,
                    turnId: ctx?.activeTurnId,
                    requestId: runtimeRequestId,
                    payload: {
                      requestType: parsed.requestType,
                      title: parsed.title,
                      detail: parsed.detail,
                    },
                    raw: {
                      source: "acp.jsonrpc",
                      method: "request_permission",
                      payload: request,
                    },
                  });

                  const resolved = yield* Deferred.await(decision);
                  pendingApprovals.delete(requestId);

                  yield* offerRuntimeEvent({
                    type: "approval.resolved",
                    ...(yield* makeEventStamp()),
                    provider: PROVIDER,
                    instanceId: boundInstanceId,
                    threadId: input.threadId,
                    turnId: ctx?.activeTurnId,
                    requestId: runtimeRequestId,
                    payload: { outcome: acpPermissionOutcome(resolved) },
                  });

                  return { outcome: acpPermissionOutcome(resolved) };
                }),
              )
              .pipe(Effect.provideService(Scope.Scope, sessionScope));

            // Start the ACP session
            const startResult = yield* acp
              .start()
              .pipe(
                Effect.mapError((cause) =>
                  mapAcpToAdapterError(PROVIDER, input.threadId, "start", cause),
                ),
              );

            const createdAt = yield* nowIso;
            const session: ProviderSession = {
              threadId: input.threadId,
              provider: PROVIDER,
              providerInstanceId: boundInstanceId,
              status: "running",
              runtimeMode: "full-access",
              cwd,
              model: input.modelSelection?.model ?? "auto",
              createdAt,
              updatedAt: createdAt,
            };

            const ctx: KiroSessionContext = {
              threadId: input.threadId,
              session,
              scope: sessionScope,
              acp,
              acpSessionId: startResult.sessionId,
              notificationFiber: undefined,
              pendingApprovals,
              pendingUserInputs,
              turns: [],
              activeTurnId: undefined,
              stopped: false,
            };

            // Start notification fiber to stream ACP events
            const notificationFiber = yield* acp.getEvents().pipe(
              Stream.runForEach((parsed) =>
                Effect.gen(function* () {
                  const stamp = yield* makeEventStamp();
                  switch (parsed._tag) {
                    case "ToolCallUpdated":
                      yield* offerRuntimeEvent(
                        makeAcpToolCallEvent({
                          stamp,
                          provider: PROVIDER,
                          threadId: input.threadId,
                          turnId: ctx.activeTurnId,
                          toolCall: parsed.toolCall,
                          rawPayload: parsed.rawPayload,
                        }),
                      );
                      return;
                    case "ContentDelta":
                      yield* offerRuntimeEvent(
                        makeAcpContentDeltaEvent({
                          stamp,
                          provider: PROVIDER,
                          threadId: input.threadId,
                          turnId: ctx.activeTurnId,
                          ...(parsed.itemId ? { itemId: parsed.itemId } : {}),
                          text: parsed.text,
                          rawPayload: parsed.rawPayload,
                        }),
                      );
                      return;
                    case "AssistantItemStarted":
                      yield* offerRuntimeEvent(
                        makeAcpAssistantItemEvent({
                          stamp,
                          provider: PROVIDER,
                          threadId: input.threadId,
                          turnId: ctx.activeTurnId,
                          itemId: parsed.itemId,
                          lifecycle: "item.started",
                        }),
                      );
                      return;
                    case "AssistantItemCompleted":
                      yield* offerRuntimeEvent(
                        makeAcpAssistantItemEvent({
                          stamp,
                          provider: PROVIDER,
                          threadId: input.threadId,
                          turnId: ctx.activeTurnId,
                          itemId: parsed.itemId,
                          lifecycle: "item.completed",
                        }),
                      );
                      return;
                    case "PlanUpdated":
                      yield* offerRuntimeEvent(
                        makeAcpPlanUpdatedEvent({
                          stamp,
                          provider: PROVIDER,
                          threadId: input.threadId,
                          turnId: ctx.activeTurnId,
                          payload: parsed.payload,
                          source: "acp.jsonrpc",
                          method: "session/update",
                          rawPayload: parsed.rawPayload,
                        }),
                      );
                      return;
                    case "ModeChanged":
                      return;
                  }
                }),
              ),
              Effect.catch(() => Effect.void),
              Effect.forkIn(sessionScope),
            );
            ctx.notificationFiber = notificationFiber;

            sessions.set(input.threadId, ctx);
            return session;
          }),
        ),

      sendTurn: (input) =>
        Effect.gen(function* () {
          const ctx = yield* requireSession(input.threadId);
          const turnId = TurnId.make(yield* randomUUIDv4);
          ctx.activeTurnId = turnId;
          ctx.turns.push({ id: turnId, items: [] });

          // Emit turn.started so orchestration layer tracks this turn
          yield* offerRuntimeEvent({
            type: "turn.started",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            turnId,
            payload: { model: input.modelSelection?.model ?? "auto" },
          });

          const promptContent = [{ type: "text" as const, text: input.input ?? "" }];

          // Switch model mid-session if changed
          const model = input.modelSelection?.model;
          if (model && model !== "auto") {
            yield* ctx.acp.setModel(model).pipe(Effect.ignore);
          }

          const promptExit = yield* ctx.acp.prompt({ prompt: promptContent }).pipe(Effect.exit);

          // Only emit turn.completed if not already interrupted
          if (ctx.activeTurnId === turnId) {
            const stamp = yield* makeEventStamp();
            if (Exit.isSuccess(promptExit)) {
              const stopReason = promptExit.value.stopReason;
              yield* offerRuntimeEvent({
                type: "turn.completed",
                ...stamp,
                provider: PROVIDER,
                threadId: input.threadId,
                turnId,
                payload: {
                  state: stopReason === "cancelled" ? "interrupted" : "completed",
                  ...(stopReason ? { stopReason } : {}),
                },
              });
            } else {
              yield* offerRuntimeEvent({
                type: "turn.completed",
                ...stamp,
                provider: PROVIDER,
                threadId: input.threadId,
                turnId,
                payload: { state: "failed" },
              });
            }
            ctx.activeTurnId = undefined;
          }

          return { threadId: input.threadId, turnId };
        }),

      interruptTurn: (threadId) =>
        Effect.gen(function* () {
          const ctx = yield* requireSession(threadId);
          yield* Effect.ignore(
            ctx.acp.cancel.pipe(
              Effect.mapError((cause) =>
                mapAcpToAdapterError(PROVIDER, threadId, "session/cancel", cause),
              ),
            ),
          );
          // Emit turn.completed with interrupted state so the UI stops showing "working"
          if (ctx.activeTurnId) {
            yield* offerRuntimeEvent({
              type: "turn.completed",
              ...(yield* makeEventStamp()),
              provider: PROVIDER,
              threadId,
              turnId: ctx.activeTurnId,
              payload: { state: "interrupted", stopReason: "cancelled" },
            });
            ctx.activeTurnId = undefined;
          }
        }),

      respondToRequest: (threadId, requestId, decision) =>
        Effect.gen(function* () {
          const ctx = yield* requireSession(threadId);
          const pending = ctx.pendingApprovals.get(requestId);
          if (pending) {
            yield* Deferred.succeed(pending.decision, decision);
            ctx.pendingApprovals.delete(requestId);
          }
        }),

      respondToUserInput: (threadId, requestId, answers) =>
        Effect.gen(function* () {
          const ctx = yield* requireSession(threadId);
          const pending = ctx.pendingUserInputs.get(requestId);
          if (pending) {
            yield* Deferred.succeed(pending.answers, answers);
            ctx.pendingUserInputs.delete(requestId);
          }
        }),

      stopSession: (threadId) =>
        Effect.gen(function* () {
          const ctx = sessions.get(threadId);
          if (!ctx) return;
          ctx.stopped = true;
          if (ctx.notificationFiber) {
            yield* Fiber.interrupt(ctx.notificationFiber);
          }
          yield* Scope.close(ctx.scope, Exit.void);
          sessions.delete(threadId);
        }),

      listSessions: () =>
        Effect.succeed(
          Array.from(sessions.values())
            .filter((ctx) => !ctx.stopped)
            .map((ctx) => ctx.session),
        ),

      hasSession: (threadId) =>
        Effect.succeed(sessions.has(threadId) && !sessions.get(threadId)!.stopped),

      readThread: (threadId) =>
        Effect.gen(function* () {
          const ctx = yield* requireSession(threadId);
          return {
            threadId,
            turns: ctx.turns.map((turn) => ({ id: turn.id, items: turn.items })),
          };
        }),

      rollbackThread: (threadId, numTurns) =>
        Effect.gen(function* () {
          const ctx = yield* requireSession(threadId);
          const removed = Math.min(numTurns, ctx.turns.length);
          ctx.turns.splice(ctx.turns.length - removed, removed);
          return {
            threadId,
            turns: ctx.turns.map((turn) => ({ id: turn.id, items: turn.items })),
          };
        }),

      stopAll: () =>
        Effect.forEach(Array.from(sessions.keys()), (threadId) => adapter.stopSession(threadId), {
          discard: true,
        }),

      streamEvents: Stream.fromPubSub(runtimeEventPubSub),
    };

    return adapter;
  });
}
