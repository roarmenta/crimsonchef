import { useEffect, useMemo, useState } from 'react';
import type { Inventory } from '../matcher';
import { planPouch, planToText, type Pin, type Plan, type PlanStep, type Priority } from '../planner';
import type { Domain } from '../types';

interface Props {
  domain: Domain;
  inventory: Inventory;
  learned: Set<string> | null;
  onAdd: (id: string, qty?: number) => void;
}

interface Options {
  priority: Priority;
  fits: string[];
  pins: Pin[];
  skips: string[];
}

/** The plan freezes once the player starts ticking steps, so it doesn't reshuffle under them. */
interface Session {
  plan: Plan;
  done: boolean[];
  expectedKey: string;
  stale: boolean;
}

const BATCH_TITLES = ['From materials', 'Combine cores', 'Synthesize', 'Synthesize further'];

const optionsKey = (domain: Domain) => `crimson-chef-${domain.id}-plan-v1`;

function loadOptions(domain: Domain): Options {
  const defaults: Options = { priority: 'biggest', fits: domain.plan?.equipment ?? [], pins: [], skips: [] };
  try {
    const raw = localStorage.getItem(optionsKey(domain));
    if (!raw) return defaults;
    const p = JSON.parse(raw) as Partial<Options>;
    const recipeIds = new Set(domain.recipes.map((r) => r.id));
    return {
      priority: p.priority === 'tiers' ? 'tiers' : 'biggest',
      fits: Array.isArray(p.fits) ? p.fits.filter((f) => defaults.fits.includes(f)) : defaults.fits,
      pins: Array.isArray(p.pins)
        ? p.pins.filter((x) => recipeIds.has(x.recipeId) && Number.isInteger(x.count) && x.count > 0)
        : [],
      skips: Array.isArray(p.skips) ? p.skips.filter((id) => recipeIds.has(id)) : [],
    };
  } catch {
    return defaults;
  }
}

function saveOptions(domain: Domain, options: Options): void {
  try {
    localStorage.setItem(optionsKey(domain), JSON.stringify(options));
  } catch {
    // Not persisted; the options still apply for this session.
  }
}

const inventoryKey = (inv: Inventory) =>
  Object.entries(inv)
    .filter(([, q]) => q > 0)
    .sort()
    .map(([k, q]) => `${k}:${q}`)
    .join(',');

export default function PlanPanel({ domain, inventory, learned, onAdd }: Props) {
  const config = domain.plan!;
  const [options, setOptions] = useState(() => loadOptions(domain));
  const [session, setSession] = useState<Session | null>(null);
  const [copied, setCopied] = useState(false);
  const recipeById = useMemo(() => Object.fromEntries(domain.recipes.map((r) => [r.id, r])), [domain]);
  const recipeName = (id: string) => recipeById[id]?.name ?? id;
  const ingName = (id: string) => domain.ingredientById[id]?.name ?? id;

  useEffect(() => saveOptions(domain, options), [domain, options]);

  const livePlan = useMemo(
    () =>
      planPouch(domain, inventory, {
        learned,
        priority: options.priority,
        pins: options.pins,
        skips: options.skips,
        fits: options.fits.length === config.equipment.length ? null : options.fits,
      }),
    [domain, inventory, learned, options, config.equipment.length],
  );

  useEffect(() => {
    if (session && !session.stale && inventoryKey(inventory) !== session.expectedKey) {
      setSession({ ...session, stale: true });
    }
  }, [inventory, session]);

  const plan = session?.plan ?? livePlan;
  const done = session?.done ?? plan.steps.map(() => false);
  const allDone = plan.steps.length > 0 && done.every(Boolean);
  // A step can only be ticked once the pouch holds its inputs, i.e. after the steps it depends on.
  const canDo = (step: PlanStep) => step.inputs.every((x) => (inventory[x.id] ?? 0) >= x.qty);

  const markDone = (index: number) => {
    const step = plan.steps[index];
    if (!step || done[index] || !canDo(step)) return;
    const next: Inventory = { ...inventory };
    for (const input of step.inputs) {
      next[input.id] = (next[input.id] ?? 0) - input.qty;
      if (next[input.id] <= 0) delete next[input.id];
      onAdd(input.id, -input.qty);
    }
    if (step.outputId) {
      next[step.outputId] = (next[step.outputId] ?? 0) + step.count;
      onAdd(step.outputId, step.count);
    }
    const nextDone = [...done];
    nextDone[index] = true;
    setSession({ plan, done: nextDone, expectedKey: inventoryKey(next), stale: false });
  };

  const update = (patch: Partial<Options>) => {
    setSession(null);
    setOptions((o) => ({ ...o, ...patch }));
  };
  const pinCount = (recipeId: string) => options.pins.find((p) => p.recipeId === recipeId)?.count;
  const setPin = (recipeId: string, count: number) => {
    // Edit a pin in place so the pin order (priority) is kept.
    const exists = options.pins.some((p) => p.recipeId === recipeId);
    const pins =
      count > 0
        ? exists
          ? options.pins.map((p) => (p.recipeId === recipeId ? { recipeId, count } : p))
          : [...options.pins, { recipeId, count }]
        : options.pins.filter((p) => p.recipeId !== recipeId);
    update({ pins, skips: options.skips.filter((id) => id !== recipeId) });
  };
  const skip = (recipeId: string) =>
    update({ skips: [...options.skips, recipeId], pins: options.pins.filter((p) => p.recipeId !== recipeId) });
  const unskip = (recipeId: string) => update({ skips: options.skips.filter((id) => id !== recipeId) });
  const toggleFit = (chip: string) =>
    update({ fits: options.fits.includes(chip) ? options.fits.filter((f) => f !== chip) : [...options.fits, chip] });
  const resetOptions = () => update({ priority: 'biggest', fits: config.equipment, pins: [], skips: [] });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(planToText(domain, plan));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; the text is still on screen.
    }
  };

  const hasItems = plan.totalUnits > 0;
  const summary = plan.products.length
    ? `Makes ${plan.products.map((p) => `${recipeName(p.recipeId)}${p.count > 1 ? ` ×${p.count}` : ''}`).join(' + ')} · uses ${plan.usedUnits} of ${plan.totalUnits} items · ${plan.totalPoints} pts`
    : hasItems
      ? 'Nothing craftable yet — the cards below show what each core needs.'
      : 'Add materials to get a plan.';
  const customized = options.priority !== 'biggest' || options.fits.length !== config.equipment.length || options.pins.length > 0 || options.skips.length > 0;

  // Steps grouped into batches by depth.
  const batches: Array<{ depth: number; indexes: number[] }> = [];
  plan.steps.forEach((s, i) => {
    const last = batches[batches.length - 1];
    if (last && last.depth === s.depth) last.indexes.push(i);
    else batches.push({ depth: s.depth, indexes: [i] });
  });

  return (
    <section className="plan" aria-label={config.heading}>
      <div className="plan-header">
        <h2>🧭 {config.heading}</h2>
        {plan.steps.length > 0 && (
          <div className="pouch-header-actions">
            <button type="button" className="ghost-btn" onClick={copy}>
              {copied ? 'Copied!' : 'Copy plan'}
            </button>
          </div>
        )}
      </div>
      <p className="plan-summary">{summary}</p>

      {hasItems && (
        <div className="plan-controls">
          <div className="plan-control-group" role="group" aria-label="Priority">
            <button type="button" className={`chip-toggle ${options.priority === 'biggest' ? 'on' : ''}`} aria-pressed={options.priority === 'biggest'} onClick={() => update({ priority: 'biggest' })}>
              Biggest core first
            </button>
            <button type="button" className={`chip-toggle ${options.priority === 'tiers' ? 'on' : ''}`} aria-pressed={options.priority === 'tiers'} onClick={() => update({ priority: 'tiers' })}>
              Most tier III
            </button>
          </div>
          <div className="plan-control-group" role="group" aria-label="Equipment to craft for">
            {config.equipment.map((chip) => (
              <button key={chip} type="button" className={`chip-toggle ${options.fits.includes(chip) ? 'on' : ''}`} aria-pressed={options.fits.includes(chip)} onClick={() => toggleFit(chip)}>
                {chip}
              </button>
            ))}
          </div>
          {customized && (
            <button type="button" className="link-btn" onClick={resetOptions}>
              reset
            </button>
          )}
        </div>
      )}

      {session?.stale && (
        <p className="plan-banner">
          Your pouch changed outside this plan.{' '}
          <button type="button" className="link-btn" onClick={() => setSession(null)}>
            Replan
          </button>
        </p>
      )}
      {allDone && !session?.stale && (
        <p className="plan-banner">
          All steps done 🎉{' '}
          <button type="button" className="link-btn" onClick={() => setSession(null)}>
            Plan again
          </button>
        </p>
      )}

      {plan.shortfalls.map((s) => (
        <p key={s.recipeId} className="plan-shortfall">
          📌 {recipeName(s.recipeId)}:{' '}
          {s.blueprint
            ? `blueprint not learned (${domain.blueprints.find((b) => b.id === s.blueprint)?.name ?? s.blueprint}).`
            : `this pouch can make ${s.made} of ${s.wanted}.`}{' '}
          <button type="button" className="link-btn" onClick={() => setPin(s.recipeId, 0)}>
            unpin
          </button>
        </p>
      ))}

      {plan.products.length > 0 && (
        <ul className="plan-products">
          {plan.products.map((p) => {
            const recipe = recipeById[p.recipeId];
            const pinned = pinCount(p.recipeId);
            const shown = Math.max(pinned ?? 0, p.count);
            return (
              <li key={p.recipeId} className="plan-product">
                <span className="plan-product-name">
                  {pinned ? '📌 ' : ''}
                  {recipe.name}
                </span>
                <span className="plan-product-meta">
                  {recipe.station} · {recipe.tool} · {p.points * p.count} pts
                </span>
                <span className="plan-product-actions">
                  <button type="button" className="qty-btn" onClick={() => (shown <= 1 ? skip(p.recipeId) : setPin(p.recipeId, shown - 1))} aria-label={shown <= 1 ? `Skip ${recipe.name}` : `One fewer ${recipe.name}`}>
                    −
                  </button>
                  <b>×{p.count}</b>
                  <button type="button" className="qty-btn" onClick={() => setPin(p.recipeId, shown + 1)} aria-label={`One more ${recipe.name}`}>
                    +
                  </button>
                  <button type="button" className="qty-btn remove" onClick={() => skip(p.recipeId)} aria-label={`Skip ${recipe.name}`} title="Don't make this">
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {options.skips.length > 0 && (
        <p className="modal-fineprint">
          Skipped:{' '}
          {options.skips.map((id, i) => (
            <span key={id}>
              {i > 0 ? ', ' : ''}
              {recipeName(id)}{' '}
              <button type="button" className="link-btn" onClick={() => unskip(id)}>
                undo
              </button>
            </span>
          ))}
        </p>
      )}

      {batches.map((batch, b) => (
        <div key={batch.depth} className="plan-batch">
          <h3>
            {b + 1}. {BATCH_TITLES[Math.min(batch.depth, BATCH_TITLES.length) - 1]}
          </h3>
          <ol className="plan-steps">
            {batch.indexes.map((i) => {
              const step = plan.steps[i];
              return (
                <li key={step.recipeId} className={`plan-step ${done[i] ? 'done' : ''}`}>
                  <label>
                    <input type="checkbox" checked={done[i]} disabled={done[i] || session?.stale || !canDo(step)} title={!done[i] && !canDo(step) ? 'Finish the earlier steps first' : undefined} onChange={() => markDone(i)} aria-label={`Done: craft ${recipeName(step.recipeId)} ×${step.count}`} />
                    <span className="plan-step-text">
                      <b>
                        Craft {recipeName(step.recipeId)} ×{step.count}
                      </b>{' '}
                      <span className="plan-step-mats">{step.inputs.map((x) => `${ingName(x.id)} ×${x.qty}`).join(', ')}</span>
                      {step.forProducts.length > 0 && <span className="plan-step-for"> → for {step.forProducts.map(recipeName).join(', ')}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      {hasItems && plan.leftover.length > 0 && (
        <p className="modal-fineprint">Left over: {plan.leftover.map((l) => `${ingName(l.id)} ×${l.qty}`).join(', ')}</p>
      )}
      {hasItems && (
        <p className="modal-fineprint">
          Points: {domain.ingredientById[config.unitIngredient ?? '']?.name ?? 'materials'} inside a core × 1 / 2 / 4 for tier I / II / III, since each
          synthesis turns two cores into one that takes one socket. "Biggest core first" makes the tallest cores; "Most tier III" spreads
          into more tier III cores. Tick a step when you've crafted it and the pouch updates.
        </p>
      )}
    </section>
  );
}
