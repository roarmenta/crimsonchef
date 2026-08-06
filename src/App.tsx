import { useEffect, useMemo, useState } from 'react';
import Palette from './components/Palette';
import Pouch from './components/Pouch';
import Results from './components/Results';
import { DATA_VERSION, RECIPES, STATIONS } from './data/gamedata';
import { matchAll, type Inventory } from './matcher';

const STORAGE_KEY = 'crimson-chef-inventory-v1';

function loadInventory(): Inventory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Inventory) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [inventory, setInventory] = useState<Inventory>(loadInventory);
  const [query, setQuery] = useState('');
  const [station, setStation] = useState('all');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  }, [inventory]);

  const add = (id: string, qty = 1) =>
    setInventory((inv) => {
      const next = { ...inv, [id]: (inv[id] ?? 0) + qty };
      if (next[id] <= 0) delete next[id];
      return next;
    });
  const remove = (id: string) =>
    setInventory((inv) => {
      const next = { ...inv };
      delete next[id];
      return next;
    });
  const clear = () => setInventory({});

  const results = useMemo(() => matchAll(RECIPES, inventory), [inventory]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter(
      (r) =>
        (station === 'all' || r.recipe.station === station) &&
        (!q || r.recipe.name.toLowerCase().includes(q)),
    );
  }, [results, query, station]);

  const hasInventory = Object.values(inventory).some((n) => n > 0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          🔥 Crimson Chef
          <span className="subtitle">Crimson Desert cooking companion</span>
        </h1>
        <div className="header-controls">
          <input
            type="search"
            placeholder="Search recipes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search recipes"
          />
          <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="Filter by cooking station">
            <option value="all">All stations</option>
            {STATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="app-body">
        <Palette onAdd={add} />
        <main>
          <Pouch inventory={inventory} onAdd={add} onRemove={remove} onClear={clear} />
          <Results results={filtered} hasInventory={hasInventory} />
        </main>
      </div>

      <footer className="app-footer">
        Recipe data compiled from IGN's Crimson Desert Cooking Guide ({DATA_VERSION}). Generic
        Meat/Vegetable/Grain/Fruit slots accept any ingredient of that category, matching the game's
        substitution rules. Fan-made tool — not affiliated with Pearl Abyss or IGN.
      </footer>
    </div>
  );
}
