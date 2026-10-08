// MATZ's little face: a bouncy blob that blinks. Pure CSS, no assets.
// `mood="talking"` makes the mouth move while the agent speaks.
export default function Mascot({ size = "md", mood = "idle" }) {
    return (
        <div className={`mascot mascot-${size} mascot-${mood}`} aria-hidden="true">
            <span className="mascot-eye left" />
            <span className="mascot-eye right" />
            <span className="mascot-mouth" />
        </div>
    );
}
