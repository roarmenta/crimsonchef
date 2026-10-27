import { useEffect, useMemo, useState } from 'react';
import BlueprintPanel from './components/BlueprintPanel';
import Palette from './components/Palette';
import Pouch from './components/Pouch';
import Results from './components/Results';
import { matchAll, type Inventory } from './matcher';
import type { Domain } from './types';

interface BlueprintState {
  tracking: boolean;
  learned: string[];
}

function blueprintKey(domain: Domain): string {
  return `crimson-chef-${domain.id}-blueprints-v1`;
}

/** Storage can be blocked or full; the app then keeps working for this session only. */
function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted — same as a private window with site data blocked.
  }
}

function loadInventory(domain: Domain): Inventory {
  try {
    const raw = localStorage.getItem(domain.storageKey);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    // Drop ids the dataset no longer knows and anything that isn't a positive count.
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          domain.ingredientById[entry[0]] !== undefined && typeof entry[1] === 'number' && entry[1] > 0,
      ),
    );
  } catch {
    return {};
  }
}

function loadBlueprints(domain: Domain): BlueprintState {
  try {
    const raw = localStorage.getItem(blueprintKey(domain));
    const parsed = raw ? (JSON.parse(raw) as Partial<BlueprintState>) : {};
    const known = new Set(domain.blueprints.map((b) => b.id));
    return {
      tracking: parsed.tracking === true,
      learned: Array.isArray(parsed.learned) ? parsed.learned.filter((id) => known.has(id)) : [],
    };
  } catch {
    return { tracking: false, learned: [] };
  }
}

/** One crafting system's workspace: its pouch, blueprint tracker, filters and results. */
export default function DomainView({ domain }: { domain: Domain }) {
  const [inventory, setInventory] = useState<Inventory>(() => loadInventory(domain));
  const [blueprints, setBlueprints] = useState<BlueprintState>(() => loadBlueprints(domain));
  const [query, setQuery] = useState('');
  const [station, setStation] = useState('all');

  useEffect(() => {
    persist(domain.storageKey, inventory);
  }, [domain, inventory]);

  useEffect(() => {
    if (domain.blueprints.length > 0) persist(blueprintKey(domain), blueprints);
  }, [domain, blueprints]);

  // Another tab wrote to our keys: re-read instead of overwriting its changes with a stale copy.
  // (Writing an unchanged value fires no storage event, so the two tabs can't ping-pong.)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === domain.storageKey) setInventory(loadInventory(domain));
      if (e.key === blueprintKey(domain)) setBlueprints(loadBlueprints(domain));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [domain]);

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

  const learned = useMemo(
    () => (blueprints.tracking ? new Set(blueprints.learned) : null),
    [blueprints],
  );
  const results = useMemo(() => matchAll(domain, inventory, { learned }), [domain, inventory, learned]);

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
    <div className="app-body">
      <div className="sidebar">
        <Palette domain={domain} onAdd={add} />
        {domain.blueprints.length > 0 && (
          <BlueprintPanel
            domain={domain}
            tracking={blueprints.tracking}
            learned={learned ?? new Set()}
            onTrackingChange={(tracking) => setBlueprints((s) => ({ ...s, tracking }))}
            onToggle={(id) =>
              setBlueprints((s) => ({
                ...s,
                learned: s.learned.includes(id) ? s.learned.filter((x) => x !== id) : [...s.learned, id],
              }))
            }
            onSetAll={(all) =>
              setBlueprints((s) => ({ ...s, learned: all ? domain.blueprints.map((b) => b.id) : [] }))
            }
          />
        )}
      </div>
      <main>
        <Pouch domain={domain} inventory={inventory} onAdd={add} onRemove={remove} onClear={clear} />
        <div className="results-toolbar">
          <input
            type="search"
            placeholder={domain.text.recipeSearch}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={domain.text.recipeSearch}
          />
          {domain.stations.length > 1 && (
            <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="Filter by station">
              <option value="all">{domain.text.allStations}</option>
              {domain.stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
        <Results domain={domain} results={filtered} hasInventory={hasInventory} />
      </main>
    </div>
  );
}
