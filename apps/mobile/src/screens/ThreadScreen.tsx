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
import type { ClientOrchestrationCommand, ThreadId } from "@t3tools/contracts";

import type { SavedEnvironmentRecord } from "../types";
import { colors, spacing } from "../theme";
import { useEnvironmentSession } from "../hooks/useEnvironmentSession";
import { useThreadDetail } from "../hooks/useThreadDetail";
import { newCommandId, newMessageId } from "../lib/ids";

export function ThreadScreen(props: {
  readonly environment: SavedEnvironmentRecord;
  readonly threadId: ThreadId;
  readonly onBack: () => void;
}) {
  const { state, client } = useEnvironmentSession(props.environment);
  const { thread } = useThreadDetail(client, props.threadId);
  const [draftMessage, setDraftMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const shellThread = useMemo(
    () => state.shellSnapshot?.threads.find((candidate) => candidate.id === props.threadId) ?? null,
    [props.threadId, state.shellSnapshot],
  );

  const handleSend = async () => {
    if (!client) {
      return;
    }
    const messageText = draftMessage.trim();
    if (!messageText) {
      return;
    }
    setSending(true);
    setScreenError(null);
    try {
      const command: ClientOrchestrationCommand = {
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: props.threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: messageText,
          attachments: [],
        },
        createdAt: new Date().toISOString(),
        runtimeMode: shellThread?.runtimeMode ?? "full-access",
        interactionMode: shellThread?.interactionMode ?? "default",
      };
      await client.orchestration.dispatchCommand(command);
      setDraftMessage("");
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleInterrupt = async () => {
    if (!client) {
      return;
    }
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.turn.interrupt",
        commandId: newCommandId(),
        threadId: props.threadId,
        ...(shellThread?.latestTurn?.turnId ? { turnId: shellThread.latestTurn.turnId } : {}),
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : "Failed to interrupt turn.");
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack}>
          <Text style={styles.actionText}>Back</Text>
        </Pressable>
        <View style={styles.headerBody}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {thread?.title ?? shellThread?.title ?? "Thread"}
          </Text>
          <Text style={styles.headerMeta}>
            {shellThread?.session?.status ?? "idle"} ·{" "}
            {shellThread?.modelSelection.provider ?? "unknown"}
          </Text>
        </View>
        {shellThread?.latestTurn?.state === "running" ? (
          <Pressable onPress={() => void handleInterrupt()}>
            <Text style={[styles.actionText, styles.dangerText]}>Interrupt</Text>
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.timeline}>
        {thread === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
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
              <View style={styles.activitySection}>
                <Text style={styles.sectionTitle}>Activity</Text>
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
          </>
        )}
      </ScrollView>

      <View style={styles.composer}>
        {screenError ? <Text style={styles.error}>{screenError}</Text> : null}
        <TextInput
          placeholder="Send a follow-up"
          placeholderTextColor={colors.textMuted}
          value={draftMessage}
          onChangeText={setDraftMessage}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <Pressable onPress={() => void handleSend()} style={styles.sendButton}>
          <Text style={styles.sendButtonLabel}>{sending ? "Sending…" : "Send"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBody: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  headerMeta: {
    color: colors.textMuted,
    marginTop: 2,
  },
  actionText: {
    color: colors.accent,
    fontWeight: "600",
  },
  dangerText: {
    color: colors.danger,
  },
  spacer: {
    width: 60,
  },
  timeline: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  messageBubble: {
    borderRadius: 18,
    padding: spacing.md,
    gap: spacing.xs,
  },
  userBubble: {
    backgroundColor: "#15345f",
  },
  assistantBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
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
  activitySection: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  activityCard: {
    borderRadius: 14,
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
    padding: spacing.md,
    gap: spacing.sm,
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
    minHeight: 88,
    textAlignVertical: "top",
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendButtonLabel: {
    color: colors.text,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
  },
});
