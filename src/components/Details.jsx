// "Show details" toggle + the collapsible list it opens, shared by the Experience and Projects cards.
// Split in two so a card can put the panel somewhere other than right after the button.

export function DetailsToggle({ open, onToggle, controls }) {
  return (
    <button type="button" className="tl-toggle" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      {open ? "Hide details" : "Show details"}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
  );
}

// stays mounted so the height can animate; inert keeps it out of tab order while closed.
// The inner div is what clips: spacing lives inside it so nothing shows when collapsed.
export function DetailsPanel({ open, id, points }) {
  return (
    <div className={`tl-details${open ? " open" : ""}`} id={id} inert={!open}>
      <div>
        <ul className="tl-points">
          {points.map((pt) => <li key={pt}>{pt}</li>)}
        </ul>
      </div>
    </div>
  );
}
