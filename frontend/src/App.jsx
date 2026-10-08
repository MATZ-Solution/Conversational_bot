import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import Mascot from "./Mascot";
import Onboarding from "./Onboarding";
import ThemeToggle from "./ThemeToggle";
import Transcript from "./Transcript";
import { apiUrl } from "./lib/api";
import {
    GOALS,
    LEVELS,
    STRUGGLES,
    findOption,
    firstName,
    loadProfile,
    saveProfile,
} from "./lib/profile";

// "onboarding" -> first visit (or editing answers)
// "ready" -> returning user, one tap to start
// "connecting" -> waiting on token + room join
// "in-call" -> connected, mic live
// "error" -> something failed
export default function App() {
    const [profile, setProfile] = useState(loadProfile);
    const [status, setStatus] = useState(() => (profile ? "ready" : "onboarding"));
    const [errorMsg, setErrorMsg] = useState("");
    const [muted, setMuted] = useState(false);
    const [agentSpeaking, setAgentSpeaking] = useState(false);
    // [{ id, role: "agent" | "user", text, final, corrections: [] }]
    const [messages, setMessages] = useState([]);

    const roomRef = useRef(null);
    const audioElRef = useRef(null);

    // Always leave the room cleanly if the tab closes mid-call.
    useEffect(() => {
        return () => {
            roomRef.current?.disconnect();
        };
    }, []);

    function finishOnboarding(answers) {
        saveProfile(answers);
        setProfile(answers);
        startConversation(answers);
    }

    async function startConversation(learner) {
        if (!learner?.name) return;

        setStatus("connecting");
        setErrorMsg("");
        setMessages([]);

        try {
            const res = await fetch(apiUrl("/api/start-conversation"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: learner.name,
                    level: learner.level,
                    goal: learner.goal,
                    struggles: learner.struggles,
                }),
            });

            if (!res.ok) {
                const detail = await res.json().catch(() => null);
                throw new Error(detail?.detail || `Server returned ${res.status}`);
            }

            const { livekit_url, token } = await res.json();

            const room = new Room();
            roomRef.current = room;

            // Play whatever audio track the agent publishes (its TTS voice).
            room.on(RoomEvent.TrackSubscribed, (track) => {
                if (track.kind === Track.Kind.Audio) {
                    track.attach(audioElRef.current);
                }
            });

            // Rough "is the bot talking" indicator, driven by active speaker updates.
            room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
                const botSpeaking = speakers.some(
                    (p) => p.identity !== room.localParticipant.identity
                );
                setAgentSpeaking(botSpeaking);
            });

            // Live captions for both sides. The agent streams one segment as
            // word-by-word deltas; user STT re-sends the full text on every
            // interim update. Accumulating per stream and replacing the
            // segment's text handles both.
            room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
                const attrs = reader.info.attributes || {};
                const id = attrs["lk.segment_id"] || reader.info.id;
                const role =
                    participantInfo.identity === room.localParticipant.identity
                        ? "user"
                        : "agent";
                let text = "";
                for await (const chunk of reader) {
                    text += chunk;
                    upsertMessage(setMessages, { id, role, text, final: false });
                }
                const final = role === "agent" || attrs["lk.transcription_final"] === "true";
                upsertMessage(setMessages, { id, role, text, final });
            });

            // Grammar correction cards sent by the agent's show_correction tool.
            room.registerTextStreamHandler("matz.correction", async (reader) => {
                try {
                    const c = JSON.parse(await reader.readAll());
                    if (c?.you_said && c?.better) {
                        attachCorrection(setMessages, c);
                    }
                } catch (err) {
                    console.warn("Bad correction payload", err);
                }
            });

            room.on(RoomEvent.Disconnected, () => {
                setStatus("ready");
                setAgentSpeaking(false);
            });

            await room.connect(livekit_url, token);
            await room.localParticipant.setMicrophoneEnabled(true);

            setStatus("in-call");
        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || "Could not start the conversation.");
            setStatus("error");
            roomRef.current?.disconnect();
            roomRef.current = null;
        }
    }

    async function toggleMute() {
        const room = roomRef.current;
        if (!room) return;
        const nextMuted = !muted;
        await room.localParticipant.setMicrophoneEnabled(!nextMuted);
        setMuted(nextMuted);
    }

    function endCall() {
        roomRef.current?.disconnect();
        roomRef.current = null;
        setStatus(profile ? "ready" : "onboarding");
        setMuted(false);
    }

    return (
        <div className="page">
            {/* Hidden element the agent's TTS audio plays through */}
            <audio ref={audioElRef} autoPlay />
            <ThemeToggle />

            {status === "onboarding" && (
                <Onboarding initialProfile={profile} onDone={finishOnboarding} />
            )}

            {status === "ready" && profile && (
                <WelcomeBack
                    profile={profile}
                    onStart={() => startConversation(profile)}
                    onEdit={() => setStatus("onboarding")}
                />
            )}

            {status === "connecting" && (
                <div className="card center">
                    <Mascot size="lg" />
                    <p className="title">Getting MATZ ready…</p>
                    <div className="dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                    </div>
                </div>
            )}

            {status === "error" && (
                <div className="card center">
                    <Mascot size="lg" mood="sad" />
                    <p className="title">Oops, that didn't work</p>
                    <p className="error">{errorMsg}</p>
                    <button
                        className="btn-primary"
                        onClick={() => setStatus(profile ? "ready" : "onboarding")}
                    >
                        Try again
                    </button>
                </div>
            )}

            {status === "in-call" && (
                <div className="card call-card">
                    <div className="call-header">
                        <Mascot size="sm" mood={agentSpeaking ? "talking" : "idle"} />
                        <div>
                            <p className="call-name">MATZ</p>
                            <p className="subtitle">
                                {agentSpeaking ? "Speaking…" : muted ? "You're muted" : "Listening…"}
                            </p>
                        </div>
                    </div>
                    <Transcript messages={messages} />
                    <div className="controls">
                        <button className="btn-secondary" onClick={toggleMute}>
                            {muted ? "Unmute" : "Mute"}
                        </button>
                        <button className="btn-danger" onClick={endCall}>
                            End call
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Returning visitor: skip onboarding, show what MATZ remembers, one tap to start.
function WelcomeBack({ profile, onStart, onEdit }) {
    const tags = [
        findOption(LEVELS, profile.level),
        findOption(GOALS, profile.goal),
        ...profile.struggles.map((id) => findOption(STRUGGLES, id)),
    ].filter(Boolean);

    return (
        <div className="card center">
            <Mascot size="lg" />
            <p className="title">Welcome back, {firstName(profile.name)}! 👋</p>
            <p className="subtitle">Ready for today's practice?</p>
            {tags.length > 0 && (
                <div className="tag-row">
                    {tags.map((t) => (
                        <span key={t.id} className="tag">
                            <span aria-hidden="true">{t.emoji}</span> {t.label}
                        </span>
                    ))}
                </div>
            )}
            <button className="btn-primary" onClick={onStart}>
                Start talking 🎙️
            </button>
            <button className="link-btn" onClick={onEdit}>
                Change my answers
            </button>
        </div>
    );
}
function upsertMessage(setMessages, next) {
    setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === next.id);
        if (i === -1) {
            if (!next.text.trim()) return prev;
            return [...prev, { ...next, corrections: [] }];
        }
        const copy = prev.slice();
        copy[i] = { ...copy[i], text: next.text, final: next.final };
        return copy;
    });
}

const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, "").replace(/\s+/g, " ").trim();

// Attach to the most recent of the learner's last few lines that contains the
// flagged phrase; fall back to their latest line.
function attachCorrection(setMessages, c) {
    setMessages((prev) => {
        const userIdx = [];
        for (let i = prev.length - 1; i >= 0 && userIdx.length < 3; i--) {
            if (prev[i].role === "user") userIdx.push(i);
        }
        if (userIdx.length === 0) return prev;

        const needle = normalize(c.you_said);
        const target = userIdx.find((i) => normalize(prev[i].text).includes(needle)) ?? userIdx[0];
        const correction = {
            id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            you_said: c.you_said,
            better: c.better,
            reason: c.reason || "",
        };
        const copy = prev.slice();
        copy[target] = { ...copy[target], corrections: [...copy[target].corrections, correction] };
        return copy;
    });
}
