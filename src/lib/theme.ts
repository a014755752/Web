export type Theme = "light" | "dark";

export const themeStorageKey = "campus-review:theme";

export const restoreThemeScript = `try {
  if (localStorage.getItem(${JSON.stringify(themeStorageKey)}) === "dark") {
    document.documentElement.dataset.theme = "dark";
  }
} catch {}`;
