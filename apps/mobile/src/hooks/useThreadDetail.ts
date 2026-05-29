import { useEffect, useState } from "react";
import type {
  OrchestrationCheckpointSummary,
  OrchestrationEvent,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationThread,
  OrchestrationThreadActivity,
  ThreadId,
} from "@t3tools/contracts";

import { sortedCopy } from "../lib/sorted";
import { type WsRpcClient } from "../lib/wsRpcClient";

function upsertById<T extends { readonly id: string }>(
  current: ReadonlyArray<T>,
  next: T,
): ReadonlyArray<T> {
  return [...current.filter((item) => item.id !== next.id), next];
}

function upsertCheckpoint(
  current: ReadonlyArray<OrchestrationCheckpointSummary>,
  next: OrchestrationCheckpointSummary,
): ReadonlyArray<OrchestrationCheckpointSummary> {
  return [...current.filter((checkpoint) => checkpoint.turnId !== next.turnId), next];
}

function applyThreadEvent(
  current: OrchestrationThread,
  event: OrchestrationEvent,
): OrchestrationThread {
  switch (event.type) {
    case "thread.message-sent": {
      const payload = event.payload;
      const existing = current.messages.find((message) => message.id === payload.messageId);
      const nextMessage: OrchestrationMessage = existing
        ? {
            ...existing,
            text:
              payload.streaming && existing.streaming
                ? `${existing.text}${payload.text}`
                : payload.text,
            attachments: payload.attachments,
            turnId: payload.turnId,
            streaming: payload.streaming,
            createdAt: existing.createdAt,
            updatedAt: payload.updatedAt,
          }
        : {
            id: payload.messageId,
            role: payload.role,
            text: payload.text,
            attachments: payload.attachments,
            turnId: payload.turnId,
            streaming: payload.streaming,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
          };

      return {
        ...current,
        messages: sortedCopy(upsertById(current.messages, nextMessage), (left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        ),
      };
    }
    case "thread.activity-appended":
      return {
        ...current,
        activities: sortedCopy(
          upsertById(current.activities, event.payload.activity as OrchestrationThreadActivity),
          (left, right) => left.createdAt.localeCompare(right.createdAt),
        ),
      };
    case "thread.proposed-plan-upserted":
      return {
        ...current,
        proposedPlans: sortedCopy(
          upsertById(
            current.proposedPlans,
            event.payload.proposedPlan as OrchestrationProposedPlan,
          ),
          (left, right) => left.createdAt.localeCompare(right.createdAt),
        ),
      };
    case "thread.turn-diff-completed":
      return {
        ...current,
        checkpoints: upsertCheckpoint(current.checkpoints, {
          turnId: event.payload.turnId,
          checkpointTurnCount: event.payload.checkpointTurnCount,
          checkpointRef: event.payload.checkpointRef,
          status: event.payload.status,
          files: event.payload.files,
          assistantMessageId: event.payload.assistantMessageId,
          completedAt: event.payload.completedAt,
        }),
      };
    case "thread.session-set":
      return {
        ...current,
        session: event.payload.session,
      };
    case "thread.meta-updated":
      return {
        ...current,
        ...(event.payload.title ? { title: event.payload.title } : {}),
        ...(event.payload.modelSelection ? { modelSelection: event.payload.modelSelection } : {}),
        ...(event.payload.branch !== undefined ? { branch: event.payload.branch } : {}),
        ...(event.payload.worktreePath !== undefined
          ? { worktreePath: event.payload.worktreePath }
          : {}),
        updatedAt: event.payload.updatedAt,
      };
    case "thread.runtime-mode-set":
      return {
        ...current,
        runtimeMode: event.payload.runtimeMode,
      };
    case "thread.interaction-mode-set":
      return {
        ...current,
        interactionMode: event.payload.interactionMode,
      };
    case "thread.archived":
      return {
        ...current,
        archivedAt: event.payload.archivedAt,
        updatedAt: event.payload.updatedAt,
      };
    case "thread.unarchived":
      return {
        ...current,
        archivedAt: null,
        updatedAt: event.payload.updatedAt,
      };
    default:
      return current;
  }
}

export function useThreadDetail(client: WsRpcClient | null, threadId: ThreadId | null) {
  const [thread, setThread] = useState<OrchestrationThread | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || threadId === null) {
      setThread(null);
      setError(null);
      return;
    }

    setThread(null);
    setError(null);

    const unsubscribe = client.orchestration.subscribeThread(
      { threadId },
      (item) => {
        if (item.kind === "snapshot") {
          setThread(item.snapshot.thread);
          return;
        }
        setThread((current) => (current ? applyThreadEvent(current, item.event) : current));
      },
      {
        onResubscribe: () => {
          setError(null);
        },
      },
    );

    return () => {
      unsubscribe();
    };
  }, [client, threadId]);

  return { thread, error };
}
