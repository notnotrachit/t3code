import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSavedEnvironments } from "../hooks/useSavedEnvironments";
import { useTheme, spacing } from "../theme";
import type { HomeScreenProps } from "../navigation/types";
import type { ColorSchemePreference } from "../theme";

export function HomeScreen({ navigation, route }: HomeScreenProps) {
  const { colors, preference, setPreference } = useTheme();
  const { environments, loading, addEnvironment, removeEnvironment, reload } =
    useSavedEnvironments();
  const [pairingUrl, setPairingUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle QR scan result
  useEffect(() => {
    const scanned = route.params?.scannedUrl;
    if (scanned) {
      setPairingUrl(scanned);
      navigation.setParams({ scannedUrl: undefined });
    }
  }, [route.params?.scannedUrl]);

  const handleAdd = async () => {
    if (!pairingUrl.trim()) {
      setError("Enter a pairing URL.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await addEnvironment({
        label: label.trim() || "Remote Server",
        pairingUrl: pairingUrl.trim(),
      });
      setPairingUrl("");
      setLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add.");
    }
    setAdding(false);
  };

  const themeOptions: ColorSchemePreference[] = ["system", "dark", "light"];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>T3 Code</Text>
        <View style={styles.themeRow}>
          {themeOptions.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setPreference(opt)}
              style={[styles.themeBtn, preference === opt && { backgroundColor: colors.accent }]}
            >
              <Text
                style={[
                  styles.themeBtnLabel,
                  { color: preference === opt ? "#fff" : colors.textMuted },
                ]}
              >
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Connect to Server</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.input, borderColor: colors.border, color: colors.text },
            ]}
            placeholder="Label (optional)"
            placeholderTextColor={colors.textMuted}
            value={label}
            onChangeText={setLabel}
          />
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.input, borderColor: colors.border, color: colors.text },
            ]}
            placeholder="Pairing URL"
            placeholderTextColor={colors.textMuted}
            value={pairingUrl}
            onChangeText={setPairingUrl}
            autoCapitalize="none"
          />
          {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.accent, flex: 1 }]}
              disabled={adding}
              onPress={() => void handleAdd()}
            >
              <Text style={styles.btnLabel}>{adding ? "Adding…" : "Add Server"}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.surfaceRaised }]}
              onPress={() => navigation.navigate("QRScan")}
            >
              <Text style={[styles.btnLabel, { color: colors.text }]}>📷 Scan QR</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Saved Servers</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : environments.length === 0 ? (
          <Text style={{ color: colors.textMuted, textAlign: "center" }}>
            No servers connected yet.
          </Text>
        ) : (
          environments.map((env) => (
            <Pressable
              key={env.environmentId}
              style={[styles.envRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => navigation.navigate("Workspace", { environmentId: env.environmentId })}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.envLabel, { color: colors.text }]}>{env.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{env.httpBaseUrl}</Text>
              </View>
              <Pressable onPress={() => void removeEnvironment(env.environmentId)} hitSlop={8}>
                <Text style={{ color: colors.danger, fontWeight: "600" }}>Remove</Text>
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 24, fontWeight: "800" },
  themeRow: { flexDirection: "row", gap: 4 },
  themeBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  themeBtnLabel: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { borderRadius: 12, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  input: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  btnRow: { flexDirection: "row", gap: spacing.sm },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: "center", paddingHorizontal: 16 },
  btnLabel: { color: "#fff", fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  envRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  envLabel: { fontSize: 15, fontWeight: "700" },
});
