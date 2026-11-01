import { MAX_CRAFTS, type MatchResult, type SlotResult } from '../matcher';
import type { Domain } from '../types';

function slotLabel(domain: Domain, slot: SlotResult): string {
  const o = slot.option;
  return o.ingredient ? domain.ingredientById[o.ingredient].name : domain.groups[o.group!].label;
}

function RecipeCard({ domain, result }: { domain: Domain; result: MatchResult }) {
  const { recipe, status, slots, maxCrafts, prepSteps, missingBlueprints } = result;
  const recipeName = (id: string) => domain.recipes.find((r) => r.id === id)?.name ?? id;
  const blueprintName = (id: string) => domain.blueprints.find((b) => b.id === id)?.name ?? id;
  return (
    <article className={`recipe-card status-${status}`}>
      <header>
        <h3>{recipe.name}</h3>
        {status === 'craftable' && <span className="badge craft">Craft ×{maxCrafts >= MAX_CRAFTS ? `+` : maxCrafts}</span>}
        {status === 'prep' && <span className="badge prep">{domain.text.prepBadge}</span>}
        {status === 'blueprint' && <span className="badge blueprint">📜 Blueprint</span>}
      </header>
      <p className="recipe-meta">
        {recipe.station} · {recipe.tool}
      </p>
      {recipe.effects.length > 0 && <p className="recipe-effects">{recipe.effects.join(' · ')}</p>}
      <ul className="req-list">
        {slots.map((slot, i) => (
          <li key={i} className={slot.ok ? (slot.viaCraft ? 'prep' : 'have') : 'missing'}>
            {slotLabel(domain, slot)} ×{slot.need}
            {!slot.ok && <span className="have-count"> (have {slot.have})</span>}
            {slot.viaCraft && <span className="have-count"> (craft)</span>}
          </li>
        ))}
      </ul>
      {prepSteps.length > 0 && (
        <p className="prep-note">
          {domain.text.prepLead} {prepSteps.map((s) => `${recipeName(s.recipeId)} ×${s.count}`).join(', ')}
        </p>
      )}
      {missingBlueprints.length > 0 && (
        <p className="blueprint-note">📜 Needs blueprint: {missingBlueprints.map(blueprintName).join(', ')}</p>
      )}
      {recipe.notes?.map((note) => (
        <p key={note} className="recipe-note">
          {note}
        </p>
      ))}
    </article>
  );
}

interface Props {
  domain: Domain;
  results: MatchResult[];
  hasInventory: boolean;
}

export default function Results({ domain, results, hasInventory }: Props) {
  const craftable = results.filter((r) => r.status === 'craftable');
  const prep = results.filter((r) => r.status === 'prep');
  const blueprint = results.filter((r) => r.status === 'blueprint');
  const nearMiss = results
    .filter((r) => r.status === 'nearMiss')
    .sort((a, b) => a.missingCount - b.missingCount);
  const locked = results.filter((r) => r.status === 'locked');

  return (
    <section className="results">
      {!hasInventory && <p className="results-hint">{domain.text.emptyHint}</p>}

      {(craftable.length > 0 || prep.length > 0) && (
        <>
          <h2 className="section-title craftable-title">
            ✅ Craftable <span className="count">({craftable.length + prep.length})</span>
          </h2>
          <div className="card-grid">
            {craftable.map((r) => (
              <RecipeCard key={r.recipe.id} domain={domain} result={r} />
            ))}
            {prep.map((r) => (
              <RecipeCard key={r.recipe.id} domain={domain} result={r} />
            ))}
          </div>
        </>
      )}

      {blueprint.length > 0 && (
        <>
          <h2 className="section-title">
            📜 Blueprint needed <span className="count">({blueprint.length})</span>
          </h2>
          <div className="card-grid">
            {blueprint.map((r) => (
              <RecipeCard key={r.recipe.id} domain={domain} result={r} />
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
              <RecipeCard key={r.recipe.id} domain={domain} result={r} />
            ))}
          </div>
        </>
      )}

      {locked.length > 0 && (
        <details className="locked-section" open={!hasInventory}>
          <summary className="section-title">
            ⬜ Missing more {domain.text.itemNoun} <span className="count">({locked.length})</span>
          </summary>
          <div className="card-grid">
            {locked.map((r) => (
              <RecipeCard key={r.recipe.id} domain={domain} result={r} />
            ))}
          </div>
        </details>
      )}

      {results.length === 0 && <p className="results-hint">Nothing matches your filters.</p>}
    </section>
  );
}
