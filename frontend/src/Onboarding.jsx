import { useEffect, useRef, useState } from "react";
import Mascot from "./Mascot";
import { EMPTY_PROFILE, GOALS, LEVELS, STRUGGLES, firstName } from "./lib/profile";

const STEP_COUNT = 4; // name -> level -> goal -> struggles
const AUTO_ADVANCE_MS = 320; // long enough to see the selection pop

// Short, tap-first onboarding. Only the name is required; every other step
// can be skipped and the agent will ask about whatever is missing.
export default function Onboarding({ initialProfile, onDone }) {
    const [step, setStep] = useState(0);
    const [profile, setProfile] = useState({ ...EMPTY_PROFILE, ...initialProfile });
    const advanceTimer = useRef(null);

    useEffect(() => () => clearTimeout(advanceTimer.current), []);

    const name = firstName(profile.name);

    function update(patch) {
        setProfile((p) => ({ ...p, ...patch }));
    }

    function goTo(nextStep) {
        clearTimeout(advanceTimer.current);
        setStep(Math.max(0, Math.min(nextStep, STEP_COUNT - 1)));
    }

    function pickAndAdvance(field, id) {
        update({ [field]: id });
        clearTimeout(advanceTimer.current);
        advanceTimer.current = setTimeout(() => goTo(step + 1), AUTO_ADVANCE_MS);
    }

    function toggleStruggle(id) {
        update({
            struggles: profile.struggles.includes(id)
                ? profile.struggles.filter((s) => s !== id)
                : [...profile.struggles, id],
        });
    }

    function finish() {
        onDone({ ...profile, name: profile.name.trim() });
    }

    return (
        <div className="card onboarding">
            <div className="ob-header">
                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => goTo(step - 1)}
                    aria-label="Back"
                    style={{ visibility: step > 0 ? "visible" : "hidden" }}
                >
                    ←
                </button>
                <div
                    className="progress"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={STEP_COUNT}
                    aria-valuenow={step + 1}
                >
                    <div
                        className="progress-fill"
                        style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
                    />
                </div>
            </div>

            {/* key={step} remounts the body so each step slides in fresh */}
            <div className="ob-step" key={step}>
                {step === 0 && (
                    <form
                        className="ob-body"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (profile.name.trim()) goTo(1);
                        }}
                    >
                        <Bubble>
                            Hi! I'm <b>MATZ</b> 👋
                            <br />
                            What should I call you?
                        </Bubble>
                        <input
                            className="name-input"
                            autoFocus
                            value={profile.name}
                            onChange={(e) => update({ name: e.target.value })}
                            placeholder="Your name"
                            maxLength={50}
                            aria-label="Your name"
                        />
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={!profile.name.trim()}
                        >
                            Continue
                        </button>
                        <p className="fine-print">3 quick taps and we're talking ⚡</p>
                    </form>
                )}

                {step === 1 && (
                    <div className="ob-body">
                        <Bubble>
                            Nice to meet you, <b>{name}</b>! 🎉
                            <br />
                            How does your English feel right now?
                        </Bubble>
                        <div className="option-list">
                            {LEVELS.map((o) => (
                                <OptionCard
                                    key={o.id}
                                    option={o}
                                    selected={profile.level === o.id}
                                    onClick={() => pickAndAdvance("level", o.id)}
                                />
                            ))}
                        </div>
                        <SkipLink onClick={() => goTo(2)} />
                    </div>
                )}

                {step === 2 && (
                    <div className="ob-body">
                        <Bubble>What do you want English for?</Bubble>
                        <div className="chip-grid">
                            {GOALS.map((o) => (
                                <Chip
                                    key={o.id}
                                    option={o}
                                    selected={profile.goal === o.id}
                                    onClick={() => pickAndAdvance("goal", o.id)}
                                />
                            ))}
                        </div>
                        <SkipLink onClick={() => goTo(3)} />
                    </div>
                )}

                {step === 3 && (
                    <div className="ob-body">
                        <Bubble>
                            Last one! What feels tricky?
                            <br />
                            <span className="bubble-sub">Pick as many as you like</span>
                        </Bubble>
                        <div className="chip-grid">
                            {STRUGGLES.map((o) => (
                                <Chip
                                    key={o.id}
                                    option={o}
                                    selected={profile.struggles.includes(o.id)}
                                    onClick={() => toggleStruggle(o.id)}
                                />
                            ))}
                        </div>
                        <button type="button" className="btn-primary" onClick={finish}>
                            {profile.struggles.length
                                ? "Let's talk! 🎙️"
                                : "Skip & start talking 🎙️"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function Bubble({ children }) {
    return (
        <div className="mascot-row">
            <Mascot size="sm" />
            <p className="bubble">{children}</p>
        </div>
    );
}

function OptionCard({ option, selected, onClick }) {
    return (
        <button
            type="button"
            className={`option-card ${selected ? "selected" : ""}`}
            onClick={onClick}
            aria-pressed={selected}
        >
            <span className="option-emoji" aria-hidden="true">
                {option.emoji}
            </span>
            <span className="option-text">
                <span className="option-label">{option.label}</span>
                <span className="option-hint">{option.hint}</span>
            </span>
        </button>
    );
}

function Chip({ option, selected, onClick }) {
    return (
        <button
            type="button"
            className={`chip ${selected ? "selected" : ""}`}
            onClick={onClick}
            aria-pressed={selected}
        >
            <span aria-hidden="true">{option.emoji}</span> {option.label}
        </button>
    );
}

function SkipLink({ onClick }) {
    return (
        <button type="button" className="link-btn" onClick={onClick}>
            Not sure? Skip, MATZ will ask
        </button>
    );
}
