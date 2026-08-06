import { GROUPS, INGREDIENT_BY_ID } from '../data/gamedata';
import type { MatchResult, SlotResult } from '../matcher';

function slotLabel(slot: SlotResult): string {
  const o = slot.option;
  return o.ingredient ? INGREDIENT_BY_ID[o.ingredient].name : GROUPS[o.group!].label;
}

function RecipeCard({ result }: { result: MatchResult }) {
  const { recipe, status, slots, maxCrafts, prepDishes } = result;
  return (
    <article className={`recipe-card status-${status}`}>
      <header>
        <h3>{recipe.name}</h3>
        {status === 'craftable' && <span className="badge craft">Craft ×{maxCrafts}</span>}
        {status === 'prep' && <span className="badge prep">Cook prereqs</span>}
      </header>
      <p className="recipe-meta">
        {recipe.station} · {recipe.tool}
      </p>
      {recipe.effects.length > 0 && (
        <p className="recipe-effects">{recipe.effects.join(' · ')}</p>
      )}
      <ul className="req-list">
        {slots.map((slot, i) => (
          <li key={i} className={slot.ok ? 'have' : 'missing'}>
            {slotLabel(slot)} ×{slot.need}
            {!slot.ok && <span className="have-count"> (have {slot.have})</span>}
          </li>
        ))}
      </ul>
      {status === 'prep' && prepDishes.length > 0 && (
        <p className="prep-note">
          First cook: {[...new Set(prepDishes)].map((id) => INGREDIENT_BY_ID[id].name).join(', ')}
        </p>
      )}
    </article>
  );
}

interface Props {
  results: MatchResult[];
  hasInventory: boolean;
}

export default function Results({ results, hasInventory }: Props) {
  const craftable = results.filter((r) => r.status === 'craftable');
  const prep = results.filter((r) => r.status === 'prep');
  const nearMiss = results
    .filter((r) => r.status === 'nearMiss')
    .sort((a, b) => a.missingCount - b.missingCount);
  const locked = results.filter((r) => r.status === 'locked');

  return (
    <section className="results">
      {!hasInventory && (
        <p className="results-hint">
          Your pouch is empty — add ingredients to light up recipes. Everything below shows what each
          dish needs.
        </p>
      )}

      {(craftable.length > 0 || prep.length > 0) && (
        <>
          <h2 className="section-title craftable-title">
            ✅ Craftable <span className="count">({craftable.length + prep.length})</span>
          </h2>
          <div className="card-grid">
            {craftable.map((r) => (
              <RecipeCard key={r.recipe.id} result={r} />
            ))}
            {prep.map((r) => (
              <RecipeCard key={r.recipe.id} result={r} />
            ))}
          </div>
        </>
      )}

      {nearMiss.length > 0 && (
        <>
          <h2 className="section-title">
            🟡 Almost there <span className="count">({nearMiss.length})</span>
          </h2>
          <div className="card-grid">
            {nearMiss.map((r) => (
              <RecipeCard key={r.recipe.id} result={r} />
            ))}
          </div>
        </>
      )}

      {locked.length > 0 && (
        <details className="locked-section" open={!hasInventory}>
          <summary className="section-title">
            ⬜ Missing more ingredients <span className="count">({locked.length})</span>
          </summary>
          <div className="card-grid">
            {locked.map((r) => (
              <RecipeCard key={r.recipe.id} result={r} />
            ))}
          </div>
        </details>
      )}

      {results.length === 0 && <p className="results-hint">No recipes match your filters.</p>}
    </section>
  );
}
