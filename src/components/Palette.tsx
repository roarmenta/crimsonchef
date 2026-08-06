import { useState } from 'react';
import { CATEGORY_LABELS, INGREDIENTS } from '../data/gamedata';
import type { Category } from '../types';

const CATEGORY_ORDER: Category[] = ['meat', 'seafood', 'produce', 'basic', 'special', 'dish'];

interface Props {
  onAdd: (id: string, qty?: number) => void;
}

export default function Palette({ onAdd }: Props) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  return (
    <aside className="palette">
      <h2>Ingredients</h2>
      <input
        type="search"
        className="palette-search"
        placeholder="Search ingredients…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Search ingredients"
      />
      {CATEGORY_ORDER.map((cat) => {
        const items = INGREDIENTS.filter(
          (i) => i.category === cat && (!q || i.name.toLowerCase().includes(q)),
        );
        if (items.length === 0) return null;
        return (
          <details key={cat} open={cat !== 'dish' && cat !== 'special'}>
            <summary>{CATEGORY_LABELS[cat]}</summary>
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
