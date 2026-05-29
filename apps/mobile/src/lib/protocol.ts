import { WsRpcGroup } from "@t3tools/contracts";
import { Duration, Effect, Layer, Schedule } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

export interface WsProtocolLifecycleHandlers {
  readonly onAttempt?: (socketUrl: string) => void;
  readonly onOpen?: () => void;
  readonly onError?: (message: string) => void;
  readonly onClose?: (details: { readonly code: number; readonly reason: string }) => void;
}

export const makeWsRpcProtocolClient = RpcClient.make(WsRpcGroup);
type RpcClientFactory = typeof makeWsRpcProtocolClient;
export type WsRpcProtocolClient =
  RpcClientFactory extends Effect.Effect<infer Client, any, any> ? Client : never;
export type WsRpcProtocolSocketUrlProvider = string | (() => Promise<string>);

const WS_RECONNECT_MAX_RETRIES = 50;
type WebSocketEventName = "open" | "close" | "error" | "message";

type WebSocketEventMap = {
  readonly open: Event;
  readonly close: CloseEvent;
  readonly error: Event;
  readonly message: MessageEvent;
};

type WebSocketListener<TName extends WebSocketEventName> = (
  event: WebSocketEventMap[TName],
) => void;

interface ListenerRecord {
  readonly listener: (event: Event) => void;
  readonly once: boolean;
}

function formatSocketErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

function resolveWsRpcSocketUrl(rawUrl: string): string {
  const resolved = new URL(rawUrl);
  if (resolved.protocol !== "ws:" && resolved.protocol !== "wss:") {
    throw new Error(`Unsupported websocket transport URL protocol: ${resolved.protocol}`);
  }
  resolved.pathname = "/ws";
  return resolved.toString();
}

function getReconnectDelayMsForRetry(retryCount: number): number {
  return Math.min(500 * 2 ** retryCount, 15_000);
}

function createEventTargetWebSocket(
  socketUrl: string,
  protocols?: string | Array<string>,
): globalThis.WebSocket {
  const rawSocket = new globalThis.WebSocket(socketUrl, protocols);
  const listeners: Record<WebSocketEventName, Array<ListenerRecord>> = {
    open: [],
    close: [],
    error: [],
    message: [],
  };

  const emit = <TName extends WebSocketEventName>(
    type: TName,
    event: WebSocketEventMap[TName],
  ): void => {
    const activeListeners = [...listeners[type]];
    for (const entry of activeListeners) {
      entry.listener(event);
      if (entry.once) {
        removeEventListener(type, entry.listener);
      }
    }
  };

  const addEventListener = <TName extends WebSocketEventName>(
    type: TName,
    listener: WebSocketListener<TName>,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    const once = typeof options === "object" && options?.once === true;
    listeners[type].push({ listener: listener as (event: Event) => void, once });
  };

  const removeEventListener = <TName extends WebSocketEventName>(
    type: TName,
    listener: WebSocketListener<TName>,
  ): void => {
    listeners[type] = listeners[type].filter(
      (entry) => entry.listener !== (listener as (event: Event) => void),
    );
  };

  // eslint-disable-next-line unicorn/prefer-add-event-listener
  rawSocket.onopen = (event) => {
    emit("open", event as Event);
  };
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  rawSocket.onclose = (event) => {
    emit("close", event as CloseEvent);
  };
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  rawSocket.onerror = (event) => {
    emit("error", event as Event);
  };
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  rawSocket.onmessage = (event) => {
    emit("message", event as MessageEvent);
  };

  const socketWithEventTarget = rawSocket as globalThis.WebSocket & {
    addEventListener: typeof addEventListener;
    removeEventListener: typeof removeEventListener;
  };
  socketWithEventTarget.addEventListener = addEventListener;
  socketWithEventTarget.removeEventListener = removeEventListener;
  return socketWithEventTarget;
}

function composeLifecycleHandlers(
  handlers?: WsProtocolLifecycleHandlers,
): Required<WsProtocolLifecycleHandlers> {
  return {
    onAttempt: handlers?.onAttempt ?? (() => undefined),
    onOpen: handlers?.onOpen ?? (() => undefined),
    onError: handlers?.onError ?? (() => undefined),
    onClose: handlers?.onClose ?? (() => undefined),
  };
}

export function createWsRpcProtocolLayer(
  url: WsRpcProtocolSocketUrlProvider,
  handlers?: WsProtocolLifecycleHandlers,
) {
  const lifecycle = composeLifecycleHandlers(handlers);
  const resolvedUrl =
    typeof url === "function"
      ? Effect.promise(() => url()).pipe(
          Effect.map((rawUrl) => resolveWsRpcSocketUrl(rawUrl)),
          Effect.tapError((error) =>
            Effect.sync(() => {
              lifecycle.onError(formatSocketErrorMessage(error));
            }),
          ),
          Effect.orDie,
        )
      : resolveWsRpcSocketUrl(url);

  const trackingWebSocketConstructorLayer = Layer.succeed(
    Socket.WebSocketConstructor,
    (socketUrl, protocols) => {
      lifecycle.onAttempt(socketUrl);
      const socket = createEventTargetWebSocket(socketUrl, protocols);

      socket.addEventListener(
        "open",
        () => {
          lifecycle.onOpen();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          lifecycle.onError("Unable to connect to the T3 server WebSocket.");
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        (event) => {
          lifecycle.onClose({
            code: event.code,
            reason: event.reason,
          });
        },
        { once: true },
      );

      return socket;
    },
  );

  const socketLayer = Socket.layerWebSocket(resolvedUrl).pipe(
    Layer.provide(trackingWebSocketConstructorLayer),
  );

  const retryPolicy = Schedule.addDelay(Schedule.recurs(WS_RECONNECT_MAX_RETRIES), (retryCount) =>
    Effect.succeed(Duration.millis(getReconnectDelayMsForRetry(retryCount))),
  );

  return Layer.effect(
    RpcClient.Protocol,
    RpcClient.makeProtocolSocket({
      retryPolicy,
      retryTransientErrors: true,
    }),
  ).pipe(Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson)));
}
