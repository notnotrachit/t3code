import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  ClientOrchestrationCommand,
  OrchestrationThreadShell,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";

import type { SavedEnvironmentRecord } from "../types";
import { colors, spacing } from "../theme";
import { useEnvironmentSession } from "../hooks/useEnvironmentSession";
import { resolveDefaultModelSelection } from "../lib/providers";
import { newCommandId, newMessageId, newThreadId } from "../lib/ids";

export function EnvironmentScreen(props: {
  readonly environment: SavedEnvironmentRecord;
  readonly onBack: () => void;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { state, client, reconnect } = useEnvironmentSession(props.environment);
  const [draftMessage, setDraftMessage] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const shell = state.shellSnapshot;
  const projects = shell?.projects ?? [];
  const selectedProject = projects[0] ?? null;
  const canCreateThread =
    selectedProject !== null && state.serverConfig !== null && client !== null;

  const groupedThreads = useMemo(() => {
    const byProject = new Map<string, OrchestrationThreadShell[]>();
    for (const thread of shell?.threads ?? []) {
      const current = byProject.get(thread.projectId) ?? [];
      current.push(thread);
      byProject.set(thread.projectId, current);
    }
    return byProject;
  }, [shell?.threads]);

  const handleStartThread = async () => {
    if (!client || !selectedProject || !state.serverConfig) {
      return;
    }
    setCreatingThread(true);
    setScreenError(null);
    try {
      const threadId = newThreadId();
      const now = new Date().toISOString();
      const messageText = draftMessage.trim();
      if (!messageText) {
        throw new Error("Enter a prompt before starting a thread.");
      }
      const modelSelection = resolveDefaultModelSelection(state.serverConfig, selectedProject);
      const title = messageText.split("\n")[0]?.trim().slice(0, 80) || "New mobile thread";
      const command: ClientOrchestrationCommand = {
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: messageText,
          attachments: [],
        },
        modelSelection,
        titleSeed: title,
        runtimeMode: "full-access" satisfies RuntimeMode,
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: selectedProject.id,
            title,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: now,
          },
        },
        createdAt: now,
      };
      await client.orchestration.dispatchCommand(command);
      setDraftMessage("");
      props.onOpenThread(threadId);
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : "Failed to create thread.");
    } finally {
      setCreatingThread(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={props.onBack}>
          <Text style={styles.actionText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{props.environment.label}</Text>
        <Pressable onPress={() => void reconnect()}>
          <Text style={styles.actionText}>Reconnect</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <Text style={styles.meta}>Status: {state.status}</Text>
        <Text style={styles.meta}>Role: {state.role ?? "unknown"}</Text>
        <Text style={styles.meta}>Host: {props.environment.httpBaseUrl}</Text>
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>New thread</Text>
        <Text style={styles.meta}>
          {selectedProject
            ? `Project: ${selectedProject.title}`
            : "No projects available on this environment."}
        </Text>
        <TextInput
          placeholder="Tell Codex or Claude what you want to do"
          placeholderTextColor={colors.textMuted}
          value={draftMessage}
          onChangeText={setDraftMessage}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <PrimaryButton
          disabled={!canCreateThread || creatingThread}
          label={creatingThread ? "Starting…" : "Start thread"}
          onPress={handleStartThread}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Threads</Text>
        {shell === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          projects.map((project) => (
            <View key={project.id} style={styles.projectSection}>
              <Text style={styles.projectTitle}>{project.title}</Text>
              {(groupedThreads.get(project.id) ?? []).map((thread) => (
                <Pressable
                  key={thread.id}
                  onPress={() => props.onOpenThread(thread.id)}
                  style={styles.threadCard}
                >
                  <View style={styles.threadCardBody}>
                    <Text style={styles.threadTitle}>{thread.title}</Text>
                    <Text style={styles.meta}>
                      {thread.session?.status ?? "idle"} · {thread.modelSelection.provider} ·{" "}
                      {thread.modelSelection.model}
                    </Text>
                    <Text style={styles.meta}>
                      {thread.hasPendingApprovals
                        ? "Pending approvals"
                        : thread.hasPendingUserInput
                          ? "Pending input"
                          : thread.hasActionableProposedPlan
                            ? "Plan ready"
                            : "No pending actions"}
                    </Text>
                  </View>
                  <Text style={styles.actionText}>Open</Text>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </View>

      {screenError ? <Text style={styles.notice}>{screenError}</Text> : null}
    </ScrollView>
  );
}

function PrimaryButton(props: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.primaryButton, props.disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.primaryButtonLabel}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: spacing.sm,
  },
  actionText: {
    color: colors.accent,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  meta: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonLabel: {
    color: colors.text,
    fontWeight: "700",
  },
  projectSection: {
    gap: spacing.sm,
  },
  projectTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  threadCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  threadCardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  threadTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
  },
  notice: {
    color: colors.textMuted,
    lineHeight: 20,
  },
});
