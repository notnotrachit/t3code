import type {
  ModelSelection,
  OrchestrationProjectShell,
  ProviderKind,
  ServerConfig,
  ServerProvider,
} from "@t3tools/contracts";

import { sortedCopy } from "./sorted";

const PROVIDER_PRIORITY: readonly ProviderKind[] = ["codex", "claudeAgent"];

export function resolveDefaultModelSelection(
  config: ServerConfig,
  project: OrchestrationProjectShell,
): ModelSelection {
  if (project.defaultModelSelection) {
    return project.defaultModelSelection;
  }

  const providers = sortedCopy(
    config.providers.filter(
      (provider) => provider.enabled && provider.installed && provider.models.length > 0,
    ),
    (left, right) => providerRank(left) - providerRank(right),
  );
  const provider = providers[0];
  const model = provider?.models[0];

  if (!provider || !model) {
    throw new Error("No configured provider models are available on this environment.");
  }

  return {
    provider: provider.provider,
    model: model.slug,
  };
}

function providerRank(provider: ServerProvider): number {
  const index = PROVIDER_PRIORITY.indexOf(provider.provider);
  return index === -1 ? PROVIDER_PRIORITY.length : index;
}
