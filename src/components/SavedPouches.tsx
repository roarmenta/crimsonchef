import { useEffect, useState } from 'react';
import type { Inventory } from '../matcher';
import {
  defaultPouchName,
  inventoryKey,
  loadSavedPouches,
  MAX_NAME_LENGTH,
  newPouchId,
  normalizeName,
  savedPouchesKey,
  storeSavedPouches,
  type SavedPouch,
  unitCount,
} from '../pouches';
import type { Domain } from '../types';

interface Props {
  domain: Domain;
  inventory: Inventory;
  onReplace: (inventory: Inventory) => void;
}

/** Save the current pouch under a name, and load, rename, overwrite or delete saved ones. */
export default function SavedPouches({ domain, inventory, onReplace }: Props) {
  const [saved, setSaved] = useState<SavedPouch[]>(() => loadSavedPouches(domain));
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Another tab saved or deleted a pouch: show the shared list.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === savedPouchesKey(domain)) setSaved(loadSavedPouches(domain));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [domain]);

  const persist = (next: SavedPouch[]) => {
    setSaved(next);
    storeSavedPouches(domain, next);
  };
  // Writes that follow a confirm dialog start from what is actually stored, so a save made in
  // another tab while the dialog was open isn't overwritten with this tab's stale list.
  const live = () => loadSavedPouches(domain);
  // Only ids this build knows count as items (unknown ids are carried for other builds but never shown).
  const visible = (inv: Inventory): Inventory =>
    Object.fromEntries(Object.entries(inv).filter(([id, q]) => q > 0 && domain.ingredientById[id] !== undefined));
  const count = unitCount(visible(inventory));
  const currentKey = inventoryKey(visible(inventory));
  const isLoaded = (p: SavedPouch) => inventoryKey(visible(p.inventory)) === currentKey;
  const currentIsSaved = saved.some(isLoaded);

  const save = () => {
    if (count === 0) {
      setNaming(false);
      setFeedback('Add something to the pouch first.');
      return;
    }
    const current = live();
    const name = normalizeName(nameDraft, current);
    persist([...current, { id: newPouchId(), name, inventory: { ...inventory }, savedAt: new Date().toISOString() }]);
    setNaming(false);
    setNameDraft('');
    setFeedback(`Saved as “${name}”.`);
  };
  const load = (p: SavedPouch) => {
    if (isLoaded(p)) return;
    if (count > 0 && !currentIsSaved && !window.confirm(`Replace your current pouch (${count} items) with “${p.name}”? The current pouch isn't saved.`)) return;
    onReplace({ ...p.inventory });
    setFeedback(`Loaded “${p.name}”.`);
  };
  const overwrite = (p: SavedPouch) => {
    if (!window.confirm(`Overwrite “${p.name}” with your current pouch (${count} items)?`)) return;
    const current = live();
    if (!current.some((s) => s.id === p.id)) {
      persist(current);
      setFeedback(`“${p.name}” was deleted in another tab.`);
      return;
    }
    persist(current.map((s) => (s.id === p.id ? { ...s, inventory: { ...inventory }, savedAt: new Date().toISOString() } : s)));
    setFeedback(`Updated “${p.name}”.`);
  };
  const remove = (p: SavedPouch) => {
    if (!window.confirm(`Delete “${p.name}”?`)) return;
    persist(live().filter((s) => s.id !== p.id));
    setFeedback(`Deleted “${p.name}”.`);
  };
  // Close the name row if the pouch empties under it.
  useEffect(() => {
    if (count === 0) setNaming(false);
  }, [count]);

  const startRename = (p: SavedPouch) => {
    setRenamingId(p.id);
    setRenameDraft(p.name);
  };
  const finishRename = () => {
    if (renamingId === null) return;
    const current = live();
    const name = normalizeName(renameDraft, current.filter((s) => s.id !== renamingId));
    persist(current.map((s) => (s.id === renamingId ? { ...s, name } : s)));
    setRenamingId(null);
  };

  return (
    <div className="saved-pouches">
      <div className="saved-pouches-row">
        {naming ? (
          <>
            <input
              type="text"
              value={nameDraft}
              maxLength={MAX_NAME_LENGTH}
              placeholder={defaultPouchName(saved)}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setNaming(false);
              }}
              aria-label="Name for this pouch"
            />
            <button type="button" className="primary-btn" onClick={save}>
              Save
            </button>
            <button type="button" className="ghost-btn" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ghost-btn"
            disabled={count === 0}
            title={count === 0 ? 'Add something to the pouch first' : 'Keep a copy of this pouch under a name'}
            onClick={() => {
              setFeedback(null);
              setNaming(true);
            }}
          >
            💾 Save pouch as…
          </button>
        )}
        {feedback && <span className="pouch-feedback">{feedback}</span>}
      </div>

      {saved.length > 0 && (
        <ul className="saved-list" aria-label="Saved pouches">
          {saved.map((p) => {
            const loaded = isLoaded(p);
            return (
              <li key={p.id} className={`saved-chip ${loaded ? 'active' : ''}`}>
                {renamingId === p.id ? (
                  <input
                    type="text"
                    value={renameDraft}
                    maxLength={MAX_NAME_LENGTH}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    aria-label={`New name for ${p.name}`}
                  />
                ) : (
                  <button
                    type="button"
                    className="saved-load"
                    onClick={() => load(p)}
                    title={loaded ? 'This pouch is loaded' : `Load ${p.name}`}
                    aria-pressed={loaded}
                  >
                    {p.name} <span className="saved-count">{unitCount(visible(p.inventory))}</span>
                  </button>
                )}
                <button type="button" className="qty-btn" onClick={() => startRename(p)} title="Rename" aria-label={`Rename ${p.name}`}>
                  ✎
                </button>
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => overwrite(p)}
                  disabled={loaded || count === 0}
                  title="Overwrite with the current pouch"
                  aria-label={`Overwrite ${p.name} with the current pouch`}
                >
                  ⟳
                </button>
                <button type="button" className="qty-btn remove" onClick={() => remove(p)} title="Delete" aria-label={`Delete ${p.name}`}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
