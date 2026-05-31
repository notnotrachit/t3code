import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThreadId } from "@t3tools/contracts";
import { colors, spacing } from "../theme";
import { newCommandId } from "../lib/ids";
import type { WsRpcClient } from "../lib/wsRpcClient";

interface ApprovalCardProps {
  threadId: ThreadId;
  requestId: string;
  summary: string;
  kind: string;
  pending: boolean;
  client: WsRpcClient | null;
}

export function ApprovalCard({
  threadId,
  requestId,
  summary,
  kind,
  pending,
  client,
}: ApprovalCardProps) {
  const [responding, setResponding] = useState(false);
  const [resolved, setResolved] = useState(false);

  const respond = async (decision: "accept" | "acceptForSession" | "decline") => {
    if (!client || !pending) return;
    setResponding(true);
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.approval.respond",
        commandId: newCommandId(),
        threadId,
        requestId,
        decision,
        createdAt: new Date().toISOString(),
      });
      setResolved(true);
    } catch (_) {}
    setResponding(false);
  };

  return (
    <View style={[styles.card, pending ? styles.pending : styles.done]}>
      <Text style={styles.label}>⚠️ APPROVAL REQUEST</Text>
      <Text style={styles.summary}>{summary}</Text>
      <Text style={styles.kind}>{kind}</Text>
      {pending && !resolved ? (
        responding ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
        ) : (
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.acceptBtn]}
              onPress={() => void respond("accept")}
            >
              <Text style={styles.btnLabel}>Accept</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.acceptAllBtn]}
              onPress={() => void respond("acceptForSession")}
            >
              <Text style={styles.btnLabel}>Accept All</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.declineBtn]}
              onPress={() => void respond("decline")}
            >
              <Text style={styles.btnLabel}>Decline</Text>
            </Pressable>
          </View>
        )
      ) : (
        <Text style={styles.resolvedLabel}>✓ Resolved</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, padding: spacing.md, gap: spacing.xs, borderLeftWidth: 3 },
  pending: { backgroundColor: "rgba(251,191,36,0.08)", borderLeftColor: colors.warning },
  done: { backgroundColor: colors.card, borderLeftColor: colors.success },
  label: { color: colors.warning, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  summary: { color: colors.text, fontSize: 14, fontWeight: "600" },
  kind: { color: colors.textMuted, fontSize: 12 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  acceptBtn: { backgroundColor: colors.success },
  acceptAllBtn: { backgroundColor: colors.accent },
  declineBtn: { backgroundColor: colors.danger },
  btnLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
  resolvedLabel: { color: colors.success, fontSize: 13, fontWeight: "600", marginTop: 4 },
});
