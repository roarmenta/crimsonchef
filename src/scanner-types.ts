// Shared between the Scanner UI (loaded eagerly) and the scanner engine
// (src/scanner.ts, lazy-loaded so the Anthropic SDK stays out of the main bundle).

export interface ScanItem {
  id: string;
  qty: number;
  confidence: 'high' | 'low';
  note: string;
}

export interface ScanResult {
  items: ScanItem[];
  skipped: string;
}

/** Typing 'demo' instead of an API key previews the feature with sample data — no network call. */
export const DEMO_KEY = 'demo';
