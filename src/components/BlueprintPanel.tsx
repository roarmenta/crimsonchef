import type { Domain } from '../types';

interface Props {
  domain: Domain;
  tracking: boolean;
  learned: Set<string>;
  onTrackingChange: (tracking: boolean) => void;
  onToggle: (id: string) => void;
  onSetAll: (learned: boolean) => void;
}

/** Knowledge gate: which blueprints the player has learned. Off by default — every recipe counts. */
export default function BlueprintPanel({ domain, tracking, learned, onTrackingChange, onToggle, onSetAll }: Props) {
  const blueprints = [...domain.blueprints].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="blueprints">
      <h2>📜 {domain.text.blueprintsHeading}</h2>
      <label className="toggle-row">
        <input type="checkbox" checked={tracking} onChange={(e) => onTrackingChange(e.target.checked)} />
        Only count blueprints I've learned
      </label>
      {tracking && (
        <>
          <p className="blueprint-summary">
            <span>
              {learned.size}/{blueprints.length} learned
            </span>
            <button type="button" className="link-btn" onClick={() => onSetAll(true)}>
              all
            </button>
            <button type="button" className="link-btn" onClick={() => onSetAll(false)}>
              none
            </button>
          </p>
          <ul className="blueprint-list">
            {blueprints.map((bp) => (
              <li key={bp.id}>
                <label>
                  <input type="checkbox" checked={learned.has(bp.id)} onChange={() => onToggle(bp.id)} />
                  {bp.name}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {domain.text.blueprintsNote && <p className="palette-note">{domain.text.blueprintsNote}</p>}
    </section>
  );
}
