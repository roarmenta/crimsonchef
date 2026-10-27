import { useState } from 'react';
import type { Inventory } from '../matcher';
import { parseIngredientList } from '../parser';
import type { Domain } from '../types';

interface Props {
  domain: Domain;
  inventory: Inventory;
  onAdd: (id: string, qty?: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function Pouch({ domain, inventory, onAdd, onRemove, onClear }: Props) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const byId = domain.ingredientById;

  const entries = Object.entries(inventory).filter(([, qty]) => qty > 0);

  const submitText = () => {
    if (!text.trim()) return;
    const { added, unknown } = parseIngredientList(domain, text);
    for (const { id, qty } of added) onAdd(id, qty);
    const parts: string[] = [];
    if (added.length > 0) {
      parts.push(`Added ${added.map(({ id, qty }) => `${byId[id].name} ×${qty}`).join(', ')}.`);
    }
    if (unknown.length > 0) {
      parts.push(`Didn't recognize: ${unknown.join(', ')}.`);
    }
    setFeedback(parts.join(' ') || null);
    if (unknown.length === 0) setText('');
  };

  return (
    <section
      className={`pouch ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (byId[id]) onAdd(id);
      }}
    >
      <div className="pouch-header">
        <h2>Your Pouch</h2>
        <div className="pouch-header-actions">
          {entries.length > 0 && (
            <button type="button" className="ghost-btn" onClick={onClear}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="pouch-empty">{domain.text.pouchEmpty}</p>
      ) : (
        <div className="pouch-chips">
          {entries.map(([id, qty]) => (
            <span key={id} className="pouch-chip">
              <button type="button" className="qty-btn" onClick={() => onAdd(id, -1)} aria-label={`Remove one ${byId[id].name}`}>
                −
              </button>
              <span className="pouch-chip-name">
                {byId[id].name} <b>×{qty}</b>
              </span>
              <button type="button" className="qty-btn" onClick={() => onAdd(id, 1)} aria-label={`Add one ${byId[id].name}`}>
                +
              </button>
              <button type="button" className="qty-btn remove" onClick={() => onRemove(id)} aria-label={`Remove all ${byId[id].name}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="pouch-input-row">
        <input
          type="text"
          value={text}
          placeholder={domain.text.pasteExample}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitText()}
          aria-label={`Type or paste a list of ${domain.text.itemNoun}`}
        />
        <button type="button" className="primary-btn" onClick={submitText}>
          Add
        </button>
      </div>
      {feedback && <p className="pouch-feedback">{feedback}</p>}
    </section>
  );
}
