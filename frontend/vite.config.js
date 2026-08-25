import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxies /api/* to the FastAPI backend during `npm run dev`, so the
// browser only ever talks to http://localhost:5173 and CORS is a non-issue
// for local testing. Change the target if your backend runs elsewhere.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:8000",
                changeOrigin: true,
            },
        },
    },
});