import Anthropic from '@anthropic-ai/sdk';
import { DEMO_KEY, type ScanResult } from './scanner-types';
import type { Domain } from './types';

// Structured-outputs schema: the item id is an enum of the section's exact vocabulary,
// so a malformed or out-of-vocabulary response is impossible.
function schemaFor(domain: Domain) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'skipped'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'qty', 'confidence', 'note'],
          properties: {
            id: { type: 'string', enum: domain.ingredients.map((i) => i.id) },
            qty: { type: 'integer' },
            confidence: { type: 'string', enum: ['high', 'low'] },
            note: { type: 'string' },
          },
        },
      },
      skipped: { type: 'string' },
    },
  };
}

function promptFor(domain: Domain): string {
  const vocabulary = domain.ingredients
    .map((i) => `${i.id} — ${i.name}${i.aliases?.length ? ` (also: ${i.aliases.join(', ')})` : ''}`)
    .join('\n');
  return `You are reading a screenshot (or a photo of a screen) showing the Materials/inventory grid from the video game Crimson Desert. ${domain.text.scanGuide}

Quantities are the small number in the bottom-right corner of each occupied grid cell.

Map each item to exactly one id from this vocabulary; an id's "also:" list gives other in-game names that map to it:
${vocabulary}

Sum quantities when several stacks map to the same id, and mention the breakdown in "note". Summarize what you skipped in "skipped" (one short sentence).

Set confidence to "low" and explain in "note" whenever a mapping is ambiguous — unclear icons, look-alike items, or unreadable quantity digits. Otherwise use "high" with an empty note.`;
}

// Sample data per section, for the "demo" key: no API call, no key needed.
const DEMO_RESULTS: Record<string, ScanResult> = {
  cooking: {
    items: [
      { id: 'bird_meat', qty: 3, confidence: 'high', note: '' },
      { id: 'meat', qty: 15, confidence: 'high', note: '' },
      { id: 'vegetable', qty: 11, confidence: 'high', note: 'Onion ×8 + radish ×1 + carrot ×2' },
      { id: 'grains', qty: 3, confidence: 'high', note: '' },
      { id: 'fruit', qty: 16, confidence: 'high', note: 'Blueberries ×6 + raspberries ×10' },
      { id: 'salt', qty: 3, confidence: 'low', note: 'Two identical bags — could be salt or sugar' },
      { id: 'sugar', qty: 2, confidence: 'low', note: 'Two identical bags — could be salt or sugar' },
    ],
    skipped: 'Ignored insects, butterflies, cloth, bundles, a feather, drinks, and other non-food materials.',
  },
  abyss: {
    items: [
      { id: 'abyss_cell', qty: 6, confidence: 'high', note: '' },
      { id: 'garnet', qty: 2, confidence: 'high', note: '' },
      { id: 'attack_reagent', qty: 11, confidence: 'high', note: 'Monarch Butterfly ×8 + Peony ×3' },
      { id: 'defense_reagent', qty: 4, confidence: 'high', note: 'Cockroach ×4' },
      { id: 'medicinal_amphibian', qty: 2, confidence: 'high', note: 'Tree Frog ×2' },
      { id: 'core_destruction_1', qty: 1, confidence: 'low', note: 'Socket gem labelled "I" — family name hard to read' },
    ],
    skipped: 'Ignored meat, vegetables, berries, cloth, bundles, a feather, and drinks.',
  },
};

/** Downscale to keep uploads small and image-token cost low; JPEG re-encode. */
export async function fileToScaledJpeg(file: File, maxEdge = 2048): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export async function scanInventoryImage(apiKey: string, imageBase64: string, domain: Domain): Promise<ScanResult> {
  if (apiKey === DEMO_KEY) {
    await new Promise((r) => setTimeout(r, 600));
    return (
      DEMO_RESULTS[domain.id] ?? {
        items: domain.ingredients.slice(0, 3).map((i) => ({ id: i.id, qty: 1, confidence: 'high' as const, note: '' })),
        skipped: '',
      }
    );
  }

  // BYO-key: the key lives in this browser's localStorage and is sent only to
  // api.anthropic.com, hence the SDK's explicit browser opt-in below.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // If a safety classifier declines the image, the API re-runs the request on a
    // fallback model inside the same call (billed at that model's rates).
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: schemaFor(domain) } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          { type: 'text', text: promptFor(domain) },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to process this image. Try a different screenshot.');
  }
  // Thinking counts toward max_tokens, so a very busy screenshot can be cut off mid-JSON.
  if (response.stop_reason !== 'end_turn') {
    throw new Error('The scan was cut off before it finished — try a screenshot with fewer items, or crop it.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('The scan returned no result — try again.');
  }
  let result: ScanResult;
  try {
    result = JSON.parse(textBlock.text) as ScanResult;
  } catch {
    throw new Error('The scan returned something unreadable — try again.');
  }
  result.items = result.items.filter((item) => item.qty > 0);
  return result;
}

export function scanErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Your API key was rejected — open key settings and check it.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the API — wait a moment and try again.';
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the Anthropic API — check your connection.';
  }
  if (err instanceof Anthropic.APIError) {
    return `API error: ${err.message}`;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
