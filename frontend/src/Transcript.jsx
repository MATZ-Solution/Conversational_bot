import { useEffect, useRef, useState } from "react";

// Chat-style live transcript. Agent text grows word by word in sync with its
// voice; user text shows interim guesses (muted) until the final transcript.
// Grammar mistakes MATZ flags (via its show_correction tool) are underlined
// and open a "You said / Better" card the learner can read and retry.
export default function Transcript({ messages }) {
    const listRef = useRef(null);
    const stickToBottom = useRef(true);
    const [openId, setOpenId] = useState(null);

    // Auto-open the newest correction so the learner sees it right away.
    const latestCorrectionId = lastCorrectionId(messages);
    useEffect(() => {
        if (latestCorrectionId) setOpenId(latestCorrectionId);
    }, [latestCorrectionId]);

    // Follow new text unless the learner has scrolled up to re-read.
    useEffect(() => {
        const el = listRef.current;
        if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    }, [messages, openId]);

    function onScroll() {
        const el = listRef.current;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    }

    function toggle(id) {
        setOpenId((current) => (current === id ? null : id));
    }

    return (
        <div className="transcript" ref={listRef} onScroll={onScroll} aria-live="polite">
            {messages.length === 0 && (
                <p className="transcript-empty">MATZ is about to say hi 👋</p>
            )}

            {messages.map((m) => (
                <div key={m.id} className={`msg msg-${m.role}`}>
                    <span className="msg-who">{m.role === "agent" ? "MATZ" : "You"}</span>
                    <div className={`msg-bubble ${m.final ? "" : "msg-live"}`}>
                        {m.role === "user"
                            ? splitWithMistakes(m.text, m.corrections).map((part, i) =>
                                  part.correction ? (
                                      <button
                                          key={i}
                                          type="button"
                                          className="mistake"
                                          onClick={() => toggle(part.correction.id)}
                                          aria-expanded={openId === part.correction.id}
                                      >
                                          {part.text}
                                      </button>
                                  ) : (
                                      <span key={i}>{part.text}</span>
                                  )
                              )
                            : m.text}
                    </div>

                    {m.corrections.map((c) =>
                        openId === c.id ? (
                            <CorrectionCard key={c.id} correction={c} onClose={() => setOpenId(null)} />
                        ) : (
                            <button
                                key={c.id}
                                type="button"
                                className="tip-pill"
                                onClick={() => toggle(c.id)}
                            >
                                ✏️ {c.better}
                            </button>
                        )
                    )}
                </div>
            ))}
        </div>
    );
}

function CorrectionCard({ correction, onClose }) {
    return (
        <div className="correction-card">
            <button
                type="button"
                className="correction-close"
                onClick={onClose}
                aria-label="Close correction"
            >
                ×
            </button>
            <div className="correction-row">
                <span className="correction-label">You said</span>
                <s className="correction-wrong">{correction.you_said}</s>
            </div>
            <div className="correction-row">
                <span className="correction-label">Better</span>
                <b className="correction-right">{correction.better}</b>
            </div>
            {correction.reason && <p className="correction-reason">💡 {correction.reason}</p>}
            <p className="correction-retry">🎙️ Now say it again out loud</p>
        </div>
    );
}

function lastCorrectionId(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const cs = messages[i].corrections;
        if (cs.length) return cs[cs.length - 1].id;
    }
    return null;
}

// Splits text into plain parts and underlined mistake parts. A correction
// whose phrase isn't found verbatim still shows as a pill under the bubble.
function splitWithMistakes(text, corrections) {
    const lower = text.toLowerCase();
    const ranges = [];
    for (const c of corrections) {
        const start = lower.indexOf(c.you_said.toLowerCase());
        if (start === -1) continue;
        const end = start + c.you_said.length;
        if (ranges.some((r) => start < r.end && end > r.start)) continue;
        ranges.push({ start, end, correction: c });
    }
    ranges.sort((a, b) => a.start - b.start);

    const parts = [];
    let pos = 0;
    for (const r of ranges) {
        if (r.start > pos) parts.push({ text: text.slice(pos, r.start) });
        parts.push({ text: text.slice(r.start, r.end), correction: r.correction });
        pos = r.end;
    }
    if (pos < text.length) parts.push({ text: text.slice(pos) });
    return parts;
}
