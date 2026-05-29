import * as SecureStore from "expo-secure-store";

import type { SavedEnvironmentRecord } from "../types";

const ENVIRONMENT_REGISTRY_KEY = "t3.mobile.saved-environments";

function environmentSecretKey(environmentId: string): string {
  return `t3.mobile.secret.${environmentId}`;
}

export async function loadSavedEnvironments(): Promise<ReadonlyArray<SavedEnvironmentRecord>> {
  const raw = await SecureStore.getItemAsync(ENVIRONMENT_REGISTRY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as ReadonlyArray<SavedEnvironmentRecord>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function persistSavedEnvironments(
  records: ReadonlyArray<SavedEnvironmentRecord>,
): Promise<void> {
  await SecureStore.setItemAsync(ENVIRONMENT_REGISTRY_KEY, JSON.stringify(records));
}

export async function loadEnvironmentSecret(environmentId: string): Promise<string | null> {
  return SecureStore.getItemAsync(environmentSecretKey(environmentId));
}

export async function persistEnvironmentSecret(
  environmentId: string,
  token: string,
): Promise<void> {
  await SecureStore.setItemAsync(environmentSecretKey(environmentId), token);
}

export async function removeEnvironmentSecret(environmentId: string): Promise<void> {
  await SecureStore.deleteItemAsync(environmentSecretKey(environmentId));
}
