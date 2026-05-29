import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrchestrationShellSnapshot, OrchestrationShellStreamItem } from "@t3tools/contracts";

import type { EnvironmentSessionState, SavedEnvironmentRecord } from "../types";
import { fetchRemoteSessionState, resolveRemoteWebSocketConnectionUrl } from "../lib/remoteApi";
import { sortedCopy } from "../lib/sorted";
import { loadEnvironmentSecret, persistSavedEnvironments } from "../lib/storage";
import { WsTransport } from "../lib/wsTransport";
import { createWsRpcClient, type WsRpcClient } from "../lib/wsRpcClient";

const initialState: EnvironmentSessionState = {
  status: "idle",
  shellReady: false,
  error: null,
  role: null,
  descriptor: null,
  serverConfig: null,
  shellSnapshot: null,
};

const SHELL_BOOTSTRAP_TIMEOUT_MS = 10_000;

function applyShellItem(
  current: OrchestrationShellSnapshot | null,
  item: OrchestrationShellStreamItem,
): OrchestrationShellSnapshot | null {
  if (item.kind === "snapshot") {
    return item.snapshot;
  }

  if (current === null) {
    return null;
  }

  switch (item.kind) {
    case "project-upserted":
      return {
        ...current,
        projects: sortedCopy(
          [...current.projects.filter((project) => project.id !== item.project.id), item.project],
          (left, right) => left.title.localeCompare(right.title),
        ),
      };
    case "project-removed":
      return {
        ...current,
        projects: current.projects.filter((project) => project.id !== item.projectId),
        threads: current.threads.filter((thread) => thread.projectId !== item.projectId),
      };
    case "thread-upserted":
      return {
        ...current,
        threads: sortedCopy(
          [...current.threads.filter((thread) => thread.id !== item.thread.id), item.thread],
          (left, right) => right.updatedAt.localeCompare(left.updatedAt),
        ),
      };
    case "thread-removed":
      return {
        ...current,
        threads: current.threads.filter((thread) => thread.id !== item.threadId),
      };
  }
}

export function useEnvironmentSession(environment: SavedEnvironmentRecord) {
  const [state, setState] = useState<EnvironmentSessionState>(initialState);
  const [client, setClient] = useState<WsRpcClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeShell: (() => void) | null = null;
    let unsubscribeConfig: (() => void) | null = null;
    let activeClient: WsRpcClient | null = null;
    let shellBootstrapTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const start = async () => {
      setState((current) => ({
        ...current,
        status: "connecting",
        shellReady: false,
        shellSnapshot: null,
        error: null,
      }));
      try {
        const token = await loadEnvironmentSecret(environment.environmentId);
        if (!token) {
          throw new Error("Missing saved credential for this environment. Pair it again.");
        }

        if (cancelled) {
          return;
        }

        const transport = new WsTransport(
          () =>
            resolveRemoteWebSocketConnectionUrl({
              wsBaseUrl: environment.wsBaseUrl,
              httpBaseUrl: environment.httpBaseUrl,
              bearerToken: token,
            }),
          {
            onError: (message) => {
              if (cancelled) {
                return;
              }
              setState((current) => ({ ...current, status: "error", error: message }));
            },
            onClose: (details) => {
              if (cancelled) {
                return;
              }
              setState((current) => ({
                ...current,
                status: "disconnected",
                error: details.reason || "WebSocket disconnected.",
              }));
            },
          },
        );
        activeClient = createWsRpcClient(transport);
        setClient(activeClient);

        const [sessionState, serverConfig] = await Promise.all([
          fetchRemoteSessionState({
            httpBaseUrl: environment.httpBaseUrl,
            bearerToken: token,
          }),
          activeClient.server.getConfig(),
        ]);

        if (cancelled) {
          return;
        }

        setState((current) => ({
          ...current,
          status: "connected",
          shellReady: false,
          role: sessionState.authenticated ? (sessionState.role ?? null) : null,
          descriptor: serverConfig.environment,
          serverConfig,
          error: null,
        }));

        unsubscribeConfig = activeClient.server.subscribeConfig((event) => {
          if (event.type !== "snapshot" || cancelled) {
            return;
          }
          setState((current) => ({
            ...current,
            serverConfig: event.config,
            descriptor: event.config.environment,
          }));
        });

        unsubscribeShell = activeClient.orchestration.subscribeShell((item) => {
          if (cancelled) {
            return;
          }
          if (item.kind === "snapshot" && shellBootstrapTimeoutId !== null) {
            clearTimeout(shellBootstrapTimeoutId);
            shellBootstrapTimeoutId = null;
          }
          setState((current) => ({
            ...current,
            shellReady:
              item.kind === "snapshot"
                ? true
                : current.shellReady || current.shellSnapshot !== null,
            shellSnapshot: applyShellItem(current.shellSnapshot, item) ?? current.shellSnapshot,
          }));
        });

        shellBootstrapTimeoutId = setTimeout(() => {
          if (cancelled) {
            return;
          }
          setState((current) =>
            current.shellReady
              ? current
              : {
                  ...current,
                  status: "error",
                  error:
                    "Connected, but failed to load projects and threads from the server. Try reconnecting.",
                },
          );
        }, SHELL_BOOTSTRAP_TIMEOUT_MS);

        await updateLastConnectedAt(environment.environmentId);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState((current) => ({
          ...current,
          status: "error",
          error: error instanceof Error ? error.message : "Failed to connect to environment.",
        }));
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (shellBootstrapTimeoutId !== null) {
        clearTimeout(shellBootstrapTimeoutId);
      }
      unsubscribeShell?.();
      unsubscribeConfig?.();
      if (activeClient) {
        void activeClient.dispose();
      }
      setClient(null);
    };
  }, [environment.environmentId, environment.httpBaseUrl, environment.wsBaseUrl]);

  const reconnect = useCallback(async () => {
    if (!client) {
      return;
    }
    setState((current) => ({ ...current, status: "reconnecting", error: null }));
    try {
      await client.reconnect();
      setState((current) => ({
        ...current,
        status: "connected",
        shellReady: false,
        shellSnapshot: null,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Reconnect failed.",
      }));
    }
  }, [client]);

  return useMemo(() => ({ state, client, reconnect }), [client, reconnect, state]);
}

async function updateLastConnectedAt(environmentId: string): Promise<void> {
  const { loadSavedEnvironments } = await import("../lib/storage");
  const records = await loadSavedEnvironments();
  const connectedAt = new Date().toISOString();
  const nextRecords = [...records];
  const index = nextRecords.findIndex((record) => record.environmentId === environmentId);
  if (index === -1) {
    return;
  }
  nextRecords[index] = {
    ...nextRecords[index],
    lastConnectedAt: connectedAt,
  };
  await persistSavedEnvironments(nextRecords);
}
