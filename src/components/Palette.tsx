import { useState } from 'react';
import type { Domain } from '../types';

interface Props {
  domain: Domain;
  onAdd: (id: string, qty?: number) => void;
}

export default function Palette({ domain, onAdd }: Props) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  return (
    <aside className="palette">
      <h2>{domain.text.paletteHeading}</h2>
      <input
        type="search"
        className="palette-search"
        placeholder={domain.text.paletteSearch}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label={domain.text.paletteSearch}
      />
      {domain.categories.map((cat) => {
        const items = domain.ingredients.filter(
          (i) => i.category === cat.id && (!q || i.name.toLowerCase().includes(q)),
        );
        if (items.length === 0) return null;
        return (
          <details key={cat.id} open={!cat.collapsed || q !== ''}>
            <summary>{cat.label}</summary>
            <div className="chip-list">
              {items.map((ing) => (
                <button
                  key={ing.id}
                  type="button"
                  className="chip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', ing.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(ing.id)}
                  title={`Add ${ing.name} (drag to pouch or click)`}
                >
                  {ing.name} <span className="chip-plus">＋</span>
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </aside>
  );
}
