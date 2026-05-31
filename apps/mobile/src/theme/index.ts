export { darkColors, darkColors as colors, lightColors, type AppColors } from "./colors";
export { ThemeProvider, useTheme, type ColorSchemePreference } from "./ThemeContext";

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
