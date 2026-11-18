export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "facturin_theme";

export const getStoredTheme = (): Theme => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
};

export const isDark = (theme: Theme): boolean =>
  theme === "dark" ||
  (theme === "system" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches);

/** Aplica el tema al <html> (clase "dark") y lo recuerda en este navegador. */
export const applyTheme = (theme: Theme, persist = false): void => {
  document.documentElement.classList.toggle("dark", isDark(theme));
  if (!persist) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // sin almacenamiento disponible: el tema solo dura esta sesión
  }
};
