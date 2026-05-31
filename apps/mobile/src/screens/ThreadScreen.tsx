import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ClientOrchestrationCommand, ThreadId } from "@t3tools/contracts";

import type { SavedEnvironmentRecord } from "../types";
import { colors, spacing } from "../theme";
import { useEnvironmentSession } from "../hooks/useEnvironmentSession";
import { useThreadDetail } from "../hooks/useThreadDetail";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { newCommandId, newMessageId } from "../lib/ids";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { ScrollToBottomFAB } from "../components/ScrollToBottomFAB";

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
  const [keyboardResetKey, setKeyboardResetKey] = useState(0);
  const { flatListRef, isAtBottom, onScroll, onContentSizeChange, scrollToEnd } = useAutoScroll();

  const shellThread = useMemo(
    () => state.shellSnapshot?.threads.find((t) => t.id === props.threadId) ?? null,
    [props.threadId, state.shellSnapshot],
  );

  useEffect(() => {
    if (Platform.OS === "ios") return;
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardResetKey((key) => key + 1);
    });
    return () => subscription.remove();
  }, []);

  const handleSend = async () => {
    if (!client) return;
    const text = draftMessage.trim();
    if (!text) return;
    setSending(true);
    setScreenError(null);
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: props.threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        createdAt: new Date().toISOString(),
        runtimeMode: shellThread?.runtimeMode ?? "full-access",
        interactionMode: shellThread?.interactionMode ?? "default",
      });
      setDraftMessage("");
      scrollToEnd();
    } catch (e) {
      setScreenError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  const handleInterrupt = async () => {
    if (!client) return;
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.turn.interrupt",
        commandId: newCommandId(),
        threadId: props.threadId,
        ...(shellThread?.latestTurn?.turnId ? { turnId: shellThread.latestTurn.turnId } : {}),
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      setScreenError(e instanceof Error ? e.message : "Failed to interrupt.");
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack}>
          <Text style={styles.action}>Back</Text>
        </Pressable>
        <View style={styles.headerBody}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {thread?.title ?? shellThread?.title ?? "Thread"}
          </Text>
          <Text style={styles.headerMeta}>
            {shellThread?.session?.status ?? "idle"} · {shellThread?.modelSelection.model ?? "auto"}
          </Text>
        </View>
        {shellThread?.latestTurn?.state === "running" ? (
          <Pressable onPress={() => void handleInterrupt()}>
            <Text style={styles.danger}>Stop</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <KeyboardAvoidingView
        key={Platform.OS === "ios" ? "ios-keyboard" : `android-keyboard-${keyboardResetKey}`}
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        contentContainerStyle={styles.keyboardContent}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {!thread ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              data={thread.messages}
              keyExtractor={(m) => m.id}
              onScroll={onScroll}
              onContentSizeChange={onContentSizeChange}
              scrollEventThrottle={16}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
              renderItem={({ item }) => (
                <MessageBubble
                  role={item.role as "user" | "assistant"}
                  text={item.text}
                  streaming={item.streaming}
                  meta={item.updatedAt}
                />
              )}
            />
            <ScrollToBottomFAB visible={!isAtBottom} onPress={scrollToEnd} />
            <Composer
              value={draftMessage}
              onChangeText={setDraftMessage}
              onSend={() => void handleSend()}
              sending={sending}
              disabled={!client}
              error={screenError}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  keyboardContent: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBody: { flex: 1, marginHorizontal: spacing.sm },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  headerMeta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  action: { color: colors.accent, fontWeight: "600" },
  danger: { color: colors.danger, fontWeight: "700" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
});
