import { useEffect, useState } from "react";
import { applyTheme, onSystemThemeChange, saveTheme, savedTheme, systemTheme } from "./lib/theme";

export default function ThemeToggle() {
    const [theme, setTheme] = useState(() => savedTheme() || systemTheme());

    useEffect(() => applyTheme(theme), [theme]);
    useEffect(() => onSystemThemeChange(setTheme), []);

    function toggle() {
        const next = theme === "dark" ? "light" : "dark";
        saveTheme(next);
        setTheme(next);
    }

    const isDark = theme === "dark";
    return (
        <button
            type="button"
            className="theme-toggle"
            onClick={toggle}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Light theme" : "Dark theme"}
        >
            <span className={`theme-icon ${isDark ? "is-dark" : ""}`} aria-hidden="true">
                {isDark ? "☀️" : "🌙"}
            </span>
        </button>
    );
}
