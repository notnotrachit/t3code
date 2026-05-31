import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";
import type { QRScanScreenProps } from "../navigation/types";
import { useTheme, spacing } from "../theme/index";

export function QRScanScreen({ navigation }: QRScanScreenProps) {
  const { colors } = useTheme();
  const [url, setUrl] = useState("");

  const handleSubmit = () => {
    if (url.trim()) {
      navigation.navigate("Home", { scannedUrl: url.trim() });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Enter Pairing URL</Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Paste the pairing URL from your T3 Code desktop app, or scan the QR code displayed there.
      </Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.input, borderColor: colors.border, color: colors.text },
        ]}
        placeholder="https://..."
        placeholderTextColor={colors.textMuted}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoFocus
      />
      <Pressable style={[styles.btn, { backgroundColor: colors.accent }]} onPress={handleSubmit}>
        <Text style={styles.btnLabel}>Connect</Text>
      </Pressable>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={{ color: colors.accent, fontWeight: "600", marginTop: 16 }}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  hint: { fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  input: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  btn: { width: "100%", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  btnLabel: { color: "#fff", fontWeight: "700" },
});
