/**
 * KiroProvider — probe and snapshot logic for the Kiro CLI ACP runtime.
 *
 * @module provider/Layers/KiroProvider
 */
import type { KiroSettings, ServerProviderModel } from "@t3tools/contracts";
import { ProviderDriverKind } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities } from "@t3tools/shared/model";

import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const PROVIDER = ProviderDriverKind.make("kiro");
const KIRO_PRESENTATION = {
  displayName: "Kiro",
  showInteractionModeToggle: true,
} as const;
const EMPTY_CAPABILITIES = createModelCapabilities({ optionDescriptors: [] });
const BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  { slug: "auto", name: "Auto", isCustom: false, capabilities: EMPTY_CAPABILITIES },
  {
    slug: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "claude-opus-4.7",
    name: "Claude Opus 4.7",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "claude-opus-4.5",
    name: "Claude Opus 4.5",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  { slug: "deepseek-3.2", name: "DeepSeek 3.2", isCustom: false, capabilities: EMPTY_CAPABILITIES },
  { slug: "minimax-m2.5", name: "MiniMax M2.5", isCustom: false, capabilities: EMPTY_CAPABILITIES },
  { slug: "minimax-m2.1", name: "MiniMax M2.1", isCustom: false, capabilities: EMPTY_CAPABILITIES },
  { slug: "glm-5", name: "GLM-5", isCustom: false, capabilities: EMPTY_CAPABILITIES },
  {
    slug: "qwen3-coder-next",
    name: "Qwen3 Coder Next",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

export function buildInitialKiroProviderSnapshot(
  settings: KiroSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = providerModelsFromSettings(
      BUILT_IN_MODELS,
      PROVIDER,
      settings.customModels,
      EMPTY_CAPABILITIES,
    );

    if (!settings.enabled) {
      return buildServerProvider({
        presentation: KIRO_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Kiro is disabled in T3 Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: KIRO_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking Kiro CLI availability...",
      },
    });
  });
}

export const checkKiroProviderStatus = (
  settings: KiroSettings,
  environment: NodeJS.ProcessEnv,
): Effect.Effect<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = providerModelsFromSettings(
      BUILT_IN_MODELS,
      PROVIDER,
      settings.customModels,
      EMPTY_CAPABILITIES,
    );

    if (!settings.enabled) {
      return buildServerProvider({
        presentation: KIRO_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Kiro is disabled in T3 Code settings.",
        },
      });
    }

    const binaryPath = settings.binaryPath;
    const versionProbe = yield* spawnAndCollect(
      binaryPath,
      ChildProcess.make(binaryPath, ["--version"], { env: environment }),
    ).pipe(Effect.timeoutOption(4000), Effect.result);

    if (Result.isFailure(versionProbe)) {
      const error = versionProbe.failure;
      return buildServerProvider({
        presentation: KIRO_PRESENTATION,
        enabled: true,
        checkedAt,
        models,
        probe: {
          installed: !isCommandMissingCause(error),
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: isCommandMissingCause(error)
            ? `Kiro CLI not found at "${binaryPath}". Install it from https://kiro.dev/cli/`
            : `Failed to execute Kiro CLI health check: ${error instanceof Error ? error.message : String(error)}.`,
        },
      });
    }

    if (Option.isNone(versionProbe.success)) {
      return buildServerProvider({
        presentation: KIRO_PRESENTATION,
        enabled: true,
        checkedAt,
        models,
        probe: {
          installed: true,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Kiro CLI health check timed out.",
        },
      });
    }

    const versionResult = versionProbe.success.value;
    const version = parseGenericCliVersion(versionResult.stdout || versionResult.stderr);

    return buildServerProvider({
      driver: PROVIDER,
      presentation: KIRO_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version,
        status: "ready",
        auth: { status: "authenticated" },
      },
    });
  });
