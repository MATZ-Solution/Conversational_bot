// Light/dark theme. The user's explicit choice is remembered; until they make
// one we follow the OS setting. index.html applies the same logic inline
// before first paint so there's no flash of the wrong theme.
const STORAGE_KEY = "matz.theme";
const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function savedTheme() {
    try {
        const t = localStorage.getItem(STORAGE_KEY);
        return t === "light" || t === "dark" ? t : null;
    } catch {
        return null;
    }
}

export function systemTheme() {
    return darkQuery()?.matches ? "dark" : "light";
}

export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // Not fatal: the choice just won't survive a reload.
    }
}

// Calls back when the OS theme changes, only while the user hasn't picked one.
export function onSystemThemeChange(callback) {
    const mq = darkQuery();
    if (!mq) return () => {};
    const handler = (e) => {
        if (!savedTheme()) callback(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
}
