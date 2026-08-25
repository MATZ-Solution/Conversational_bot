import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

// "idle" -> typing name
// "connecting" -> waiting on token + room join
// "in-call" -> connected, mic live
// "error" -> something failed
export default function App() {
    const [name, setName] = useState("");
    const [status, setStatus] = useState("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [muted, setMuted] = useState(false);
    const [agentSpeaking, setAgentSpeaking] = useState(false);

    const roomRef = useRef(null);
    const audioElRef = useRef(null);

    // Always leave the room cleanly if the tab closes mid-call.
    useEffect(() => {
        return () => {
            roomRef.current?.disconnect();
        };
    }, []);

    async function startConversation(e) {
        e.preventDefault();
        const cleanName = name.trim();
        if (!cleanName) return;

        setStatus("connecting");
        setErrorMsg("");

        try {
            const res = await fetch("/api/start-conversation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: cleanName }),
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

            room.on(RoomEvent.Disconnected, () => {
                setStatus("idle");
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
        setStatus("idle");
        setMuted(false);
        setName("");
    }

    return (
        <div className="page">
            {/* Hidden element the agent's TTS audio plays through */}
            <audio ref={audioElRef} autoPlay />

            {status === "idle" && (
                <form className="card" onSubmit={startConversation}>
                    <h1>Daily Chat</h1>
                    <p className="subtitle">What should the bot call you?</p>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        maxLength={50}
                    />
                    <button type="submit" disabled={!name.trim()}>
                        Start conversation
                    </button>
                </form>
            )}

            {status === "connecting" && (
                <div className="card">
                    <p>Connecting…</p>
                </div>
            )}

            {status === "error" && (
                <div className="card">
                    <p className="error">{errorMsg}</p>
                    <button onClick={() => setStatus("idle")}>Try again</button>
                </div>
            )}

            {status === "in-call" && (
                <div className="card">
                    <div className={`orb ${agentSpeaking ? "orb-active" : ""}`} />
                    <p className="subtitle">
                        {agentSpeaking ? "Sana is speaking…" : "Listening…"}
                    </p>
                    <div className="controls">
                        <button onClick={toggleMute}>
                            {muted ? "Unmute" : "Mute"}
                        </button>
                        <button className="end" onClick={endCall}>
                            End call
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}