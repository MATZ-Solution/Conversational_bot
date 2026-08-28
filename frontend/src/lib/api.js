const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export function apiUrl(path) {
    return `${BASE_URL}${path}`;
}