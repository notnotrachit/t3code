import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useState } from "react";

import { HomeScreen } from "./src/screens/HomeScreen";
import { WorkspaceScreen } from "./src/screens/WorkspaceScreen";
import { colors } from "./src/theme";
import { useSavedEnvironments } from "./src/hooks/useSavedEnvironments";
import type { SavedEnvironmentRecord } from "./src/types";

export default function App() {
  const { environments, loading, error, addEnvironment, removeEnvironment, reload } =
    useSavedEnvironments();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);

  const selectedEnvironment = useMemo<SavedEnvironmentRecord | null>(
    () =>
      selectedEnvironmentId === null
        ? null
        : (environments.find(
            (environment) => environment.environmentId === selectedEnvironmentId,
          ) ?? null),
    [environments, selectedEnvironmentId],
  );

  const handleRemoveEnvironment = async (environmentId: string) => {
    await removeEnvironment(environmentId);
    if (selectedEnvironmentId === environmentId) {
      setSelectedEnvironmentId(null);
    }
  };

  let content;
  if (loading) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  } else if (selectedEnvironment === null) {
    content = (
      <HomeScreen
        environments={environments}
        error={error}
        onAddEnvironment={addEnvironment}
        onReload={reload}
        onRemoveEnvironment={handleRemoveEnvironment}
        onSelectEnvironment={(environmentId) => {
          setSelectedEnvironmentId(environmentId);
        }}
      />
    );
  } else {
    content = (
      <WorkspaceScreen
        environment={selectedEnvironment}
        onBack={() => {
          setSelectedEnvironmentId(null);
        }}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar />
        {content}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
