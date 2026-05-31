import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MarkdownBody } from "./MarkdownBody";
import { colors, spacing } from "../theme";

interface MessageBubbleProps {
  role: "user" | "assistant";
  text: string | null | undefined;
  streaming?: boolean;
  meta?: string;
}

export function MessageBubble({ role, text, streaming, meta }: MessageBubbleProps) {
  const hasText = text && text.trim().length > 0;
  const isUser = role === "user";

  if (isUser) {
    return (
      <View style={s.userRow}>
        <View style={s.userBubble}>
          <Text style={s.userText}>{text || ""}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.assistantRow}>
      {hasText ? (
        <MarkdownBody content={text} streaming={streaming} />
      ) : streaming ? (
        <View style={s.thinkRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={s.thinkText}>Thinking…</Text>
        </View>
      ) : (
        <Text style={s.genText}>Generating…</Text>
      )}
      {streaming && hasText ? <View style={s.streamDot} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  userRow: { alignItems: "flex-end" },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderColor: colors.userBubbleBorder,
    borderWidth: 1,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
  },
  userText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  assistantRow: { paddingRight: 32 },
  thinkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  thinkText: { color: colors.textMuted, fontSize: 14 },
  genText: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },
  streamDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 4 },
});
