import { useState } from "react";
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ModelSelection, ServerProvider, ThreadId } from "@t3tools/contracts";
import { colors, spacing } from "../theme";
import { newCommandId } from "../lib/ids";
import type { WsRpcClient } from "../lib/wsRpcClient";

interface ModelPickerProps {
  providers: readonly ServerProvider[];
  currentModel?: string;
  threadId?: ThreadId;
  client: WsRpcClient | null;
  disabled?: boolean;
  onModelSelectionChange?: (modelSelection: ModelSelection) => void;
}

type ModelItem = { slug: string; name: string; provider: ServerProvider };
type Section = { title: string; data: ModelItem[] };

export function ModelPicker({
  providers,
  currentModel,
  threadId,
  client,
  disabled,
  onModelSelectionChange,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);

  const sections: Section[] = providers
    .filter((p) => p.enabled && p.installed && p.models.length > 0 && p.status !== "disabled")
    .map((p) => ({
      title: p.displayName ?? p.driver,
      data: p.models.map((m) => ({ slug: m.slug, name: m.name, provider: p })),
    }));

  const handleSelect = async (item: ModelItem) => {
    setOpen(false);
    const modelSelection = {
      instanceId: item.provider.instanceId,
      model: item.slug,
    } as ModelSelection;
    onModelSelectionChange?.(modelSelection);
    if (!client || !threadId) return;
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId,
        modelSelection,
      });
    } catch (_) {}
  };

  return (
    <>
      <Pressable disabled={disabled} onPress={() => setOpen(true)} style={styles.chip}>
        <Text style={styles.chipText} numberOfLines={1}>
          {currentModel ?? "auto"}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Model</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>
          <SectionList
            sections={sections}
            keyExtractor={(item) => `${item.provider.instanceId}:${item.slug}`}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, item.slug === currentModel && styles.rowSelected]}
                onPress={() => void handleSelect(item)}
              >
                <Text style={styles.modelName}>{item.name}</Text>
                {item.slug === currentModel && <Text style={styles.check}>✓</Text>}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            stickySectionHeadersEnabled
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "600", maxWidth: 160 },
  chevron: { color: colors.textMuted, fontSize: 10 },
  modal: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  close: { color: colors.accent, fontWeight: "600", fontSize: 16 },
  sectionHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  rowSelected: { backgroundColor: colors.sidebarSelected },
  modelName: { color: colors.text, fontSize: 15 },
  check: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md },
});
