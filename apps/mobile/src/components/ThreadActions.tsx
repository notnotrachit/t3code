import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ThreadId } from "@t3tools/contracts";
import { colors, spacing } from "../theme";
import { newCommandId } from "../lib/ids";
import type { WsRpcClient } from "../lib/wsRpcClient";

interface ThreadActionsProps {
  threadId: ThreadId;
  title: string;
  client: WsRpcClient | null;
  onDeleted?: () => void;
}

export function ThreadActions({ threadId, title, client, onDeleted }: ThreadActionsProps) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(title);

  const dispatch = async (command: any) => {
    if (!client) return;
    try {
      await client.orchestration.dispatchCommand(command);
    } catch (_) {}
  };

  const handleRename = async () => {
    if (!newTitle.trim()) return;
    await dispatch({
      type: "thread.meta.update",
      commandId: newCommandId(),
      threadId,
      title: newTitle.trim(),
      createdAt: new Date().toISOString(),
    });
    setRenaming(false);
    setOpen(false);
  };

  const handleArchive = async () => {
    await dispatch({
      type: "thread.archive",
      commandId: newCommandId(),
      threadId,
      createdAt: new Date().toISOString(),
    });
    setOpen(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete Thread", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await dispatch({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId,
            createdAt: new Date().toISOString(),
          });
          setOpen(false);
          onDeleted?.();
        },
      },
    ]);
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <Text style={styles.trigger}>⋯</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {renaming ? (
              <View style={styles.renameForm}>
                <TextInput
                  style={styles.input}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  autoFocus
                />
                <Pressable style={styles.btn} onPress={() => void handleRename()}>
                  <Text style={styles.btnLabel}>Save</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    setNewTitle(title);
                    setRenaming(true);
                  }}
                >
                  <Text style={styles.rowText}>✏️ Rename</Text>
                </Pressable>
                <Pressable style={styles.row} onPress={() => void handleArchive()}>
                  <Text style={styles.rowText}>📦 Archive</Text>
                </Pressable>
                <Pressable style={styles.row} onPress={handleDelete}>
                  <Text style={[styles.rowText, { color: colors.danger }]}>🗑️ Delete</Text>
                </Pressable>
                <Pressable style={styles.row} onPress={() => setOpen(false)}>
                  <Text style={[styles.rowText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { color: colors.textMuted, fontSize: 20, paddingHorizontal: 8 },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  renameForm: { gap: spacing.sm },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnLabel: { color: "#fff", fontWeight: "700" },
});
