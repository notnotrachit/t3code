import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

interface ToolCallCardProps {
  summary: string;
  kind: string;
  status?: string;
  detail?: string;
}

const ICONS: Record<string, string> = {
  file_write: "📝",
  file_read: "📖",
  file_change: "📝",
  command_execution: "⚡",
  shell_command: "⚡",
  web_search: "🔍",
  assistant_message: "💬",
  unknown: "🔧",
};

export function ToolCallCard({ summary, kind, status, detail }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = ICONS[kind] ?? ICONS.unknown;
  const isDone = status === "completed";
  const isFail = status === "failed";

  return (
    <Pressable onPress={() => detail && setExpanded(!expanded)} style={s.card}>
      <View style={s.row}>
        <Text style={s.icon}>{icon}</Text>
        <Text style={s.summary} numberOfLines={expanded ? undefined : 1}>
          {summary}
        </Text>
        {isDone && <Text style={s.check}>✓</Text>}
        {isFail && <Text style={s.fail}>✗</Text>}
      </View>
      {expanded && detail ? <Text style={s.detail}>{detail}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { paddingVertical: 6, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { fontSize: 13 },
  summary: { flex: 1, color: colors.textMuted, fontSize: 13 },
  check: { color: colors.success, fontSize: 13 },
  fail: { color: colors.danger, fontSize: 13 },
  detail: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 4,
    marginLeft: 21,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    padding: 8,
  },
});
