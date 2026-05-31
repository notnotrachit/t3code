import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

interface ComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string | null;
  controls?: ReactNode;
}

export function Composer({
  value,
  onChangeText,
  onSend,
  sending,
  disabled,
  placeholder,
  error,
  controls,
}: ComposerProps) {
  const canSend = !disabled && !sending && value.trim().length > 0;
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingBottom: spacing.sm + Math.max(insets.bottom, 8) }]}>
      {error ? (
        <Text style={s.error} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
      {controls ? <View style={s.controls}>{controls}</View> : null}
      <View style={s.row}>
        <TextInput
          placeholder={placeholder ?? "Message…"}
          placeholderTextColor={colors.textMuted}
          multiline
          value={value}
          onChangeText={onChangeText}
          style={s.input}
          maxLength={100000}
        />
        <Pressable
          disabled={!canSend}
          onPress={onSend}
          style={[s.sendBtn, !canSend && s.sendDisabled]}
        >
          <Text style={s.sendIcon}>{sending ? "…" : "↑"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  error: { color: colors.danger, fontSize: 12, marginBottom: 4 },
  controls: { marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.35 },
  sendIcon: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
