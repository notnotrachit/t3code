import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme";

export function ScrollToBottomFAB(props: { visible: boolean; onPress: () => void }) {
  if (!props.visible) return null;
  return (
    <Pressable style={styles.fab} onPress={props.onPress}>
      <Text style={styles.arrow}>↓</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 12,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  arrow: { color: colors.text, fontSize: 18, fontWeight: "700" },
});
