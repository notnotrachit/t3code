import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { OrchestrationCheckpointSummary, ThreadId } from "@t3tools/contracts";
import { DiffViewer } from "./DiffViewer";
import { colors, spacing } from "../theme";
import type { WsRpcClient } from "../lib/wsRpcClient";

interface CheckpointCardProps {
  checkpoint: OrchestrationCheckpointSummary;
  threadId: ThreadId;
  client: WsRpcClient | null;
}

export function CheckpointCard({ checkpoint, threadId, client }: CheckpointCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const files = checkpoint.files ?? [];
  const additions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const deletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (diff || !client) return;
    setLoading(true);
    try {
      const result = await client.orchestration.getTurnDiff({
        threadId,
        turnId: checkpoint.turnId,
      });
      setDiff(result?.diff ?? "No diff available");
    } catch (_) {
      setDiff("Failed to load diff");
    }
    setLoading(false);
  };

  return (
    <Pressable onPress={() => void handleExpand()} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>📦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {files.length} file{files.length !== 1 ? "s" : ""} changed
          </Text>
          <Text style={styles.stats}>
            <Text style={styles.add}>+{additions}</Text>{" "}
            <Text style={styles.del}>-{deletions}</Text>
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
      </View>
      {expanded ? (
        <View style={styles.body}>
          {files.map((f, i) => (
            <Text key={i} style={styles.fileName}>
              {f.path} <Text style={styles.add}>+{f.additions ?? 0}</Text>{" "}
              <Text style={styles.del}>-{f.deletions ?? 0}</Text>
            </Text>
          ))}
          {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} /> : null}
          {diff ? <DiffViewer diff={diff} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { fontSize: 16 },
  title: { color: colors.text, fontSize: 13, fontWeight: "700" },
  stats: { fontSize: 12, marginTop: 2 },
  add: { color: colors.success },
  del: { color: colors.danger },
  chevron: { color: colors.textMuted, fontSize: 12 },
  body: { marginTop: spacing.sm, gap: spacing.xs },
  fileName: { color: colors.textMuted, fontSize: 12, fontFamily: "monospace" },
});
