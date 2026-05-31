import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const lines = diff.split("\n");
  return (
    <ScrollView horizontal style={styles.container}>
      <View>
        {lines.map((line, i) => (
          <Text key={i} style={[styles.line, lineStyle(line)]}>
            {line || " "}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

function lineStyle(line: string) {
  if (line.startsWith("+++") || line.startsWith("---")) return styles.fileLine;
  if (line.startsWith("@@")) return styles.hunkLine;
  if (line.startsWith("+")) return styles.addLine;
  if (line.startsWith("-")) return styles.removeLine;
  return styles.contextLine;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 400,
  },
  line: { fontFamily: "monospace", fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.sm },
  fileLine: { color: colors.text, fontWeight: "700" },
  hunkLine: { color: colors.accent, backgroundColor: "rgba(124,114,255,0.08)" },
  addLine: { color: colors.success, backgroundColor: "rgba(52,211,153,0.08)" },
  removeLine: { color: colors.danger, backgroundColor: "rgba(248,113,113,0.08)" },
  contextLine: { color: colors.textMuted },
});
