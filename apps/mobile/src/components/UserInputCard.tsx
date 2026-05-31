import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ThreadId } from "@t3tools/contracts";
import { colors, spacing } from "../theme";
import { newCommandId } from "../lib/ids";
import type { WsRpcClient } from "../lib/wsRpcClient";

interface UserInputCardProps {
  threadId: ThreadId;
  requestId: string;
  question: string;
  pending: boolean;
  client: WsRpcClient | null;
}

export function UserInputCard({
  threadId,
  requestId,
  question,
  pending,
  client,
}: UserInputCardProps) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!client || !pending || !answer.trim()) return;
    setSubmitting(true);
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.user-input.respond",
        commandId: newCommandId(),
        threadId,
        requestId,
        answers: { response: answer.trim() },
        createdAt: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (_) {}
    setSubmitting(false);
  };

  return (
    <View style={[styles.card, pending ? styles.pending : styles.done]}>
      <Text style={styles.label}>❓ AGENT QUESTION</Text>
      <Text style={styles.question}>{question}</Text>
      {pending && !submitted ? (
        submitting ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
        ) : (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Type your answer…"
              placeholderTextColor={colors.textMuted}
              value={answer}
              onChangeText={setAnswer}
              multiline
            />
            <Pressable
              style={[styles.btn, !answer.trim() && styles.btnDisabled]}
              disabled={!answer.trim()}
              onPress={() => void handleSubmit()}
            >
              <Text style={styles.btnLabel}>Submit</Text>
            </Pressable>
          </View>
        )
      ) : (
        <Text style={styles.submitted}>✓ Answered: {answer || "(submitted)"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, padding: spacing.md, gap: spacing.xs, borderLeftWidth: 3 },
  pending: { backgroundColor: "rgba(124,114,255,0.06)", borderLeftColor: colors.accent },
  done: { backgroundColor: colors.card, borderLeftColor: colors.success },
  label: { color: colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  question: { color: colors.text, fontSize: 14, fontWeight: "600" },
  form: { gap: spacing.sm, marginTop: spacing.sm },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
  submitted: { color: colors.success, fontSize: 13, fontWeight: "600", marginTop: 4 },
});
