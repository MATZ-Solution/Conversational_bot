// Onboarding options. The ids must match the Literal values in
// backend/main.py and the label maps in agent/agent.py.
export const LEVELS = [
    { id: "beginner", emoji: "🌱", label: "Just starting", hint: "I know some words and simple sentences" },
    { id: "intermediate", emoji: "🌿", label: "Getting there", hint: "I can talk, but I get stuck" },
    { id: "advanced", emoji: "🌳", label: "Pretty confident", hint: "I want to sound more natural" },
];

export const GOALS = [
    { id: "job_interview", emoji: "💼", label: "Job interviews" },
    { id: "daily_conversation", emoji: "💬", label: "Everyday chats" },
    { id: "work_meetings", emoji: "🧑‍💻", label: "Work meetings" },
    { id: "travel", emoji: "✈️", label: "Travel" },
    { id: "studies", emoji: "🎓", label: "Studies" },
];

export const STRUGGLES = [
    { id: "grammar", emoji: "🧩", label: "Grammar" },
    { id: "pronunciation", emoji: "🗣️", label: "Pronunciation" },
    { id: "vocabulary", emoji: "📚", label: "Finding words" },
    { id: "fluency", emoji: "🌊", label: "Speaking smoothly" },
    { id: "confidence", emoji: "💪", label: "Confidence" },
];

export const EMPTY_PROFILE = { name: "", level: null, goal: null, struggles: [] };

const STORAGE_KEY = "matz.profile.v1";

// Storage can be blocked (private mode, disabled site data), so every access
// is guarded and the app simply falls back to running onboarding again.
export function loadProfile() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        if (typeof saved?.name !== "string" || !saved.name.trim()) return null;
        return { ...EMPTY_PROFILE, ...saved };
    } catch {
        return null;
    }
}

export function saveProfile(profile) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
        // Not fatal: the user just sees onboarding again next visit.
    }
}

export function firstName(name) {
    return name.trim().split(/\s+/)[0] || "";
}

export function findOption(options, id) {
    return options.find((o) => o.id === id) || null;
}
