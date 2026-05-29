import { useCallback, useEffect, useState } from "react";

import type { AddEnvironmentInput, SavedEnvironmentRecord } from "../types";
import { bootstrapRemoteBearerSession, fetchRemoteEnvironmentDescriptor } from "../lib/remoteApi";
import { resolveRemotePairingTarget } from "../lib/remoteTarget";
import { sortedCopy } from "../lib/sorted";
import {
  loadSavedEnvironments,
  persistEnvironmentSecret,
  persistSavedEnvironments,
  removeEnvironmentSecret,
} from "../lib/storage";

export function useSavedEnvironments() {
  const [environments, setEnvironments] = useState<ReadonlyArray<SavedEnvironmentRecord>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await loadSavedEnvironments();
      setEnvironments(records);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load environments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addEnvironment = useCallback(
    async (input: AddEnvironmentInput) => {
      const resolvedTarget = resolveRemotePairingTarget(input);
      const descriptor = await fetchRemoteEnvironmentDescriptor({
        httpBaseUrl: resolvedTarget.httpBaseUrl,
      });
      const bearerSession = await bootstrapRemoteBearerSession({
        httpBaseUrl: resolvedTarget.httpBaseUrl,
        credential: resolvedTarget.credential,
      });

      const record: SavedEnvironmentRecord = {
        environmentId: descriptor.environmentId,
        label: input.label.trim() || descriptor.label,
        httpBaseUrl: resolvedTarget.httpBaseUrl,
        wsBaseUrl: resolvedTarget.wsBaseUrl,
        createdAt: new Date().toISOString(),
        lastConnectedAt: new Date().toISOString(),
      };

      const nextRecords = sortedCopy(
        [
          ...environments.filter(
            (environment) => environment.environmentId !== record.environmentId,
          ),
          record,
        ],
        (left, right) => left.label.localeCompare(right.label),
      );

      await persistSavedEnvironments(nextRecords);
      await persistEnvironmentSecret(record.environmentId, bearerSession.sessionToken);
      setEnvironments(nextRecords);
      return record;
    },
    [environments],
  );

  const removeEnvironment = useCallback(
    async (environmentId: string) => {
      const nextRecords = environments.filter(
        (environment) => environment.environmentId !== environmentId,
      );
      await persistSavedEnvironments(nextRecords);
      await removeEnvironmentSecret(environmentId);
      setEnvironments(nextRecords);
    },
    [environments],
  );

  return {
    environments,
    loading,
    error,
    reload,
    addEnvironment,
    removeEnvironment,
  };
}
