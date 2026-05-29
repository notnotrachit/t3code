import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import type {
  ClientOrchestrationCommand,
  OrchestrationProjectShell,
  OrchestrationThreadShell,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";

import { useEnvironmentSession } from "../hooks/useEnvironmentSession";
import { useThreadDetail } from "../hooks/useThreadDetail";
import { newCommandId, newMessageId, newThreadId } from "../lib/ids";
import { resolveDefaultModelSelection } from "../lib/providers";
import { colors, spacing } from "../theme";
import type { SavedEnvironmentRecord } from "../types";

const EMPTY_THREADS: readonly OrchestrationThreadShell[] = [];
const EMPTY_PROJECTS: readonly OrchestrationProjectShell[] = [];

export function WorkspaceScreen(props: {
  readonly environment: SavedEnvironmentRecord;
  readonly onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const wideLayout = width >= 900;
  const { state, client, reconnect } = useEnvironmentSession(props.environment);
  const [selectedThreadId, setSelectedThreadId] = useState<ThreadId | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newThreadPrompt, setNewThreadPrompt] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const shell = state.shellSnapshot;
  const projects = shell?.projects ?? EMPTY_PROJECTS;
  const threads = shell?.threads ?? EMPTY_THREADS;
  const groupedThreads = useMemo(() => {
    const byProject = new Map<string, OrchestrationThreadShell[]>();
    for (const thread of threads) {
      const current = byProject.get(thread.projectId) ?? [];
      current.push(thread);
      byProject.set(thread.projectId, current);
    }
    return byProject;
  }, [threads]);

  useEffect(() => {
    if (selectedThreadId && threads.some((thread) => thread.id === selectedThreadId)) {
      return;
    }
    setSelectedThreadId(threads[0]?.id ?? null);
  }, [selectedThreadId, threads]);

  const selectedProject = projects[0] ?? null;
  const selectedThreadShell = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );
  const { thread, error: threadError } = useThreadDetail(client, selectedThreadId);

  const handleCreateThread = async () => {
    if (!client || !selectedProject || !state.serverConfig) {
      return;
    }
    const prompt = newThreadPrompt.trim();
    if (!prompt) {
      setScreenError("Enter a prompt before starting a thread.");
      return;
    }

    setCreatingThread(true);
    setScreenError(null);
    try {
      const threadId = newThreadId();
      const now = new Date().toISOString();
      const modelSelection = resolveDefaultModelSelection(state.serverConfig, selectedProject);
      const title = prompt.split("\n")[0]?.trim().slice(0, 80) || "New thread";
      const command: ClientOrchestrationCommand = {
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: prompt,
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
      setNewThreadPrompt("");
      setSelectedThreadId(threadId);
      setSidebarOpen(false);
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : "Failed to create thread.");
    } finally {
      setCreatingThread(false);
    }
  };

  const handleSend = async () => {
    if (!client || !selectedThreadId) {
      return;
    }
    const prompt = replyDraft.trim();
    if (!prompt) {
      return;
    }

    setSending(true);
    setScreenError(null);
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: selectedThreadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: prompt,
          attachments: [],
        },
        createdAt: new Date().toISOString(),
        runtimeMode: selectedThreadShell?.runtimeMode ?? "full-access",
        interactionMode: selectedThreadShell?.interactionMode ?? "default",
      });
      setReplyDraft("");
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleInterrupt = async () => {
    if (!client || !selectedThreadId) {
      return;
    }

    setScreenError(null);
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.turn.interrupt",
        commandId: newCommandId(),
        threadId: selectedThreadId,
        ...(selectedThreadShell?.latestTurn?.turnId
          ? { turnId: selectedThreadShell.latestTurn.turnId }
          : {}),
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : "Failed to interrupt turn.");
    }
  };

  const sidebar = (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <View style={styles.sidebarHeaderCopy}>
          <Text style={styles.sidebarEyebrow}>Remote Client</Text>
          <Text numberOfLines={1} style={styles.sidebarTitle}>
            {props.environment.label}
          </Text>
          <Text numberOfLines={1} style={styles.sidebarMeta}>
            {props.environment.httpBaseUrl}
          </Text>
        </View>
        <Pressable onPress={props.onBack}>
          <Text style={styles.headerAction}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.connectionPanel}>
        <StatusPill
          tone={
            state.status === "connected" && state.shellReady
              ? "success"
              : state.status === "error"
                ? "danger"
                : "neutral"
          }
          label={
            state.status === "connected" && !state.shellReady ? "Syncing workspace" : state.status
          }
        />
        <Text style={styles.sidebarMeta}>Role: {state.role ?? "unknown"}</Text>
        <Pressable onPress={() => void reconnect()}>
          <Text style={styles.headerAction}>Reconnect</Text>
        </Pressable>
      </View>

      <View style={styles.newThreadPanel}>
        <Text style={styles.panelTitle}>New Thread</Text>
        <TextInput
          placeholder="Tell Codex or Claude what to do"
          placeholderTextColor={colors.textMuted}
          multiline
          value={newThreadPrompt}
          onChangeText={setNewThreadPrompt}
          style={[styles.input, styles.newThreadInput]}
        />
        <PrimaryButton
          disabled={!selectedProject || !client || !state.serverConfig || creatingThread}
          label={creatingThread ? "Starting…" : "Start thread"}
          onPress={handleCreateThread}
        />
      </View>

      <ScrollView style={styles.threadList} contentContainerStyle={styles.threadListContent}>
        {!state.shellReady ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.sidebarMeta}>Loading projects and threads…</Text>
          </View>
        ) : (
          projects.map((project) => (
            <View key={project.id} style={styles.projectGroup}>
              <Text style={styles.projectTitle}>{project.title}</Text>
              {(groupedThreads.get(project.id) ?? []).map((threadItem) => {
                const selected = threadItem.id === selectedThreadId;
                return (
                  <Pressable
                    key={threadItem.id}
                    onPress={() => {
                      setSelectedThreadId(threadItem.id);
                      setSidebarOpen(false);
                    }}
                    style={[styles.threadRow, selected ? styles.threadRowSelected : null]}
                  >
                    <View style={styles.threadRowBody}>
                      <Text numberOfLines={1} style={styles.threadRowTitle}>
                        {threadItem.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.threadRowMeta}>
                        {threadItem.session?.status ?? "idle"} ·{" "}
                        {threadItem.modelSelection.provider}
                      </Text>
                    </View>
                    {(threadItem.hasPendingApprovals ||
                      threadItem.hasPendingUserInput ||
                      threadItem.hasActionableProposedPlan) && <View style={styles.threadBadge} />}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.screen}>
      {!wideLayout ? (
        <View style={styles.mobileHeader}>
          <Pressable onPress={() => setSidebarOpen(true)}>
            <Text style={styles.headerAction}>Threads</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.mobileHeaderTitle}>
            {selectedThreadShell?.title ?? props.environment.label}
          </Text>
          <Pressable onPress={props.onBack}>
            <Text style={styles.headerAction}>Back</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.workspace}>
        {wideLayout ? sidebar : null}
        <View style={styles.mainPane}>
          <View style={styles.chatHeader}>
            <View style={styles.chatHeaderCopy}>
              <Text numberOfLines={1} style={styles.chatTitle}>
                {selectedThreadShell?.title ?? "No thread selected"}
              </Text>
              <Text style={styles.chatMeta}>
                {selectedThreadShell?.session?.status ?? state.status} ·{" "}
                {selectedThreadShell?.modelSelection.provider ?? "workspace"}
              </Text>
            </View>
            {selectedThreadShell?.latestTurn?.state === "running" ? (
              <Pressable onPress={() => void handleInterrupt()}>
                <Text style={styles.interruptText}>Interrupt</Text>
              </Pressable>
            ) : null}
          </View>

          {!state.shellReady ? (
            <View style={styles.centeredState}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.centeredTitle}>Loading workspace</Text>
              <Text style={styles.centeredMeta}>
                Waiting for the server to send projects and threads.
              </Text>
            </View>
          ) : selectedThreadId === null ? (
            <View style={styles.centeredState}>
              <Text style={styles.centeredTitle}>No thread selected</Text>
              <Text style={styles.centeredMeta}>
                Start a new thread or choose one from the sidebar.
              </Text>
            </View>
          ) : thread === null ? (
            <View style={styles.centeredState}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.centeredTitle}>Loading thread</Text>
              <Text style={styles.centeredMeta}>
                Pulling the latest messages and activity for this thread.
              </Text>
            </View>
          ) : (
            <>
              <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
                {thread.messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      message.role === "user" ? styles.userBubble : styles.assistantBubble,
                    ]}
                  >
                    <Text style={styles.messageRole}>{message.role.toUpperCase()}</Text>
                    <Text style={styles.messageText}>{message.text || "(empty message)"}</Text>
                    <Text style={styles.messageMeta}>
                      {message.streaming ? "Streaming…" : message.updatedAt}
                    </Text>
                  </View>
                ))}

                {thread.activities.length > 0 ? (
                  <View style={styles.activityGroup}>
                    <Text style={styles.panelTitle}>Activity</Text>
                    {thread.activities.map((activity) => (
                      <View key={activity.id} style={styles.activityCard}>
                        <Text style={styles.activityTitle}>{activity.summary}</Text>
                        <Text style={styles.messageMeta}>
                          {activity.kind} · {activity.createdAt}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.composer}>
                <TextInput
                  placeholder="Message the thread"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={replyDraft}
                  onChangeText={setReplyDraft}
                  style={[styles.input, styles.replyInput]}
                />
                <PrimaryButton
                  disabled={!client || sending}
                  label={sending ? "Sending…" : "Send"}
                  onPress={handleSend}
                />
              </View>
            </>
          )}

          {state.error || threadError || screenError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{screenError ?? threadError ?? state.error}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {!wideLayout ? (
        <Modal
          animationType="slide"
          presentationStyle="pageSheet"
          visible={sidebarOpen}
          onRequestClose={() => setSidebarOpen(false)}
        >
          <View style={styles.modalScreen}>{sidebar}</View>
        </Modal>
      ) : null}
    </View>
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
      onPress={() => void props.onPress()}
      style={[styles.primaryButton, props.disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.primaryButtonLabel}>{props.label}</Text>
    </Pressable>
  );
}

function StatusPill(props: {
  readonly tone: "neutral" | "success" | "danger";
  readonly label: string;
}) {
  return (
    <View
      style={[
        styles.statusPill,
        props.tone === "success"
          ? styles.statusPillSuccess
          : props.tone === "danger"
            ? styles.statusPillDanger
            : styles.statusPillNeutral,
      ]}
    >
      <Text style={styles.statusPillLabel}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mobileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  mobileHeaderTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginHorizontal: spacing.sm,
  },
  headerAction: {
    color: colors.accent,
    fontWeight: "600",
  },
  workspace: {
    flex: 1,
    flexDirection: "row",
  },
  modalScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sidebar: {
    width: 320,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    flex: 1,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sidebarHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sidebarEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sidebarTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  sidebarMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  connectionPanel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillNeutral: {
    backgroundColor: colors.statusNeutral,
  },
  statusPillSuccess: {
    backgroundColor: colors.statusSuccess,
  },
  statusPillDanger: {
    backgroundColor: colors.statusDanger,
  },
  statusPillLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  newThreadPanel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  threadList: {
    flex: 1,
  },
  threadListContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  loadingPanel: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  projectGroup: {
    gap: spacing.sm,
  },
  projectTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  threadRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  threadRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.sidebarSelected,
  },
  threadRowBody: {
    flex: 1,
    gap: 4,
  },
  threadRowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  threadRowMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  threadBadge: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  mainPane: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  chatHeaderCopy: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.md,
  },
  chatTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  chatMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  interruptText: {
    color: colors.danger,
    fontWeight: "700",
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  centeredTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  centeredMeta: {
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 420,
  },
  timeline: {
    flex: 1,
  },
  timelineContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  messageBubble: {
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
  },
  userBubble: {
    alignSelf: "flex-end",
    width: "100%",
    maxWidth: 720,
    backgroundColor: colors.userBubble,
    borderColor: colors.userBubbleBorder,
  },
  assistantBubble: {
    width: "100%",
    maxWidth: 720,
    backgroundColor: colors.assistantBubble,
    borderColor: colors.border,
  },
  messageRole: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  messageMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  activityGroup: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  activityCard: {
    borderRadius: 10,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  activityTitle: {
    color: colors.text,
    fontWeight: "600",
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  newThreadInput: {
    minHeight: 108,
    textAlignVertical: "top",
  },
  replyInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
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
  errorBanner: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.statusDanger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    lineHeight: 20,
  },
});
