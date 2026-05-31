import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { darkColors, lightColors, type AppColors } from "./colors";

export type ColorSchemePreference = "dark" | "light" | "system";

interface ThemeContextValue {
  colors: AppColors;
  colorScheme: "dark" | "light";
  preference: ColorSchemePreference;
  setPreference: (pref: ColorSchemePreference) => void;
}

const STORAGE_KEY = "t3_theme_preference";

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  colorScheme: "dark",
  preference: "system",
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? "dark";
  const [preference, setPreferenceState] = useState<ColorSchemePreference>("system");

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === "dark" || stored === "light" || stored === "system") {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = (pref: ColorSchemePreference) => {
    setPreferenceState(pref);
    SecureStore.setItemAsync(STORAGE_KEY, pref);
  };

  const colorScheme = preference === "system" ? systemScheme : preference;
  const colors = colorScheme === "dark" ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, colorScheme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
