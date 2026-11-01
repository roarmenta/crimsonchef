import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_KEY, type ScanItem } from '../scanner-types';
import type { Domain } from '../types';

const KEY_STORAGE = 'crimson-chef-api-key';

// Storage can be blocked or full; the key then lives in memory for this session only.
function readStoredKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function writeStoredKey(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY_STORAGE);
    else localStorage.setItem(KEY_STORAGE, value);
  } catch {
    // Not persisted — the key will be asked for again next visit.
  }
}

type Stage = 'key' | 'pick' | 'scanning' | 'review' | 'error';

interface ReviewRow extends ScanItem {
  include: boolean;
}

interface Props {
  domain: Domain;
  onAdd: (id: string, qty?: number) => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([hidden])';

export default function Scanner({ domain, onAdd }: Props) {
  const byId = domain.ingredientById;
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState(readStoredKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [stage, setStage] = useState<Stage>('key');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [skipped, setSkipped] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const openModal = () => {
    setStage(apiKey ? 'pick' : 'key');
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    setRows([]);
    setError('');
  }, []);

  // Dialog behaviour: take focus on open, Escape closes (not mid-scan), Tab stays inside,
  // and focus returns to the button that opened it.
  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stageRef.current !== 'scanning') {
          e.preventDefault();
          close();
        }
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      trigger.current?.focus();
    };
  }, [open, close]);

  const saveKey = () => {
    const key = keyDraft.trim();
    if (!key) return;
    writeStoredKey(key);
    setApiKey(key);
    setKeyDraft('');
    setStage('pick');
  };
  const clearKey = () => {
    writeStoredKey(null);
    setApiKey('');
    setStage('key');
  };

  const handleFile = useCallback(
    async (file: File) => {
      setStage('scanning');
      // Lazy-load the scan engine (and the Anthropic SDK with it) on first use,
      // so the main bundle stays small for visitors who never scan.
      let scanner: typeof import('../scanner');
      try {
        scanner = await import('../scanner');
      } catch {
        setError('Could not load the scanner — check your connection and try again.');
        setStage('error');
        return;
      }
      try {
        const base64 = await scanner.fileToScaledJpeg(file);
        const result = await scanner.scanInventoryImage(apiKey, base64, domain);
        setRows(result.items.map((item) => ({ ...item, include: true })));
        setSkipped(result.skipped);
        setStage(result.items.length > 0 ? 'review' : 'error');
        if (result.items.length === 0) setError(`No ${domain.text.itemNoun} were recognized in that image.`);
      } catch (err) {
        setError(scanner.scanErrorMessage(err));
        setStage('error');
      }
    },
    [apiKey, domain],
  );

  useEffect(() => {
    if (!open || stage !== 'pick') return;
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        void handleFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, stage, handleFile]);

  const setRowQty = (index: number, qty: number) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, qty } : r)));
  const toggleRow = (index: number) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, include: !r.include } : r)));

  const included = rows.filter((r) => r.include && r.qty > 0);
  const confirm = () => {
    for (const row of included) onAdd(row.id, row.qty);
    close();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ghost-btn"
        onClick={openModal}
        title="Scan a screenshot of your in-game inventory"
      >
        📷 Scan screenshot
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div
            ref={dialog}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Scan inventory screenshot"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Scan inventory screenshot</h3>
              <button type="button" className="qty-btn remove" onClick={close} aria-label="Close">
                ✕
              </button>
            </div>

            {stage === 'key' && (
              <div className="modal-body">
                <p>
                  Scanning sends your screenshot to Claude (Anthropic's AI) to identify {domain.text.itemNoun}. It
                  needs your own Anthropic API key — each scan costs a few cents on your account.
                </p>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="sk-ant-…  (or type “demo” to preview with sample data)"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                  aria-label="Anthropic API key"
                />
                <button type="button" className="primary-btn" onClick={saveKey} disabled={!keyDraft.trim()}>
                  Save key
                </button>
                <p className="modal-fineprint">
                  The key is stored only in this browser (localStorage) and sent only to api.anthropic.com.
                  Images are sent to Anthropic for analysis. Get a key at console.anthropic.com.
                </p>
              </div>
            )}

            {stage === 'pick' && (
              <div className="modal-body">
                <button
                  type="button"
                  className={`dropzone ${dragOver ? 'drag-over' : ''}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
                    if (file) void handleFile(file);
                  }}
                >
                  Click to choose an image, drag one here, or paste (Ctrl/⌘+V)
                  <span className="dropzone-hint">
                    Console screenshots work best; phone photos of the TV work too.
                  </span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = '';
                  }}
                />
                <p className="modal-fineprint">
                  {apiKey === DEMO_KEY ? 'Demo mode — sample data, no API call. ' : ''}
                  <button type="button" className="link-btn" onClick={clearKey}>
                    {apiKey === DEMO_KEY ? 'Enter a real API key' : 'Change or remove API key'}
                  </button>
                </p>
              </div>
            )}

            {stage === 'scanning' && (
              <div className="modal-body">
                <p className="scanning-note">🔥 Reading your inventory…</p>
              </div>
            )}

            {stage === 'review' && (
              <div className="modal-body">
                <p>Found {rows.length} item{rows.length === 1 ? '' : 's'} — adjust before adding:</p>
                <ul className="review-list">
                  {rows.map((row, i) => (
                    <li key={`${row.id}-${i}`} className={row.confidence === 'low' ? 'low-confidence' : ''}>
                      <label className="review-row">
                        <input type="checkbox" checked={row.include} onChange={() => toggleRow(i)} />
                        <span className="review-name">{byId[row.id]?.name ?? row.id}</span>
                        <input
                          type="number"
                          min={0}
                          className="review-qty"
                          value={row.qty}
                          onChange={(e) => setRowQty(i, Math.max(0, parseInt(e.target.value, 10) || 0))}
                          aria-label={`Quantity of ${byId[row.id]?.name ?? row.id}`}
                        />
                      </label>
                      {row.confidence === 'low' && <p className="review-note">⚠️ {row.note || 'Uncertain — double-check'}</p>}
                    </li>
                  ))}
                </ul>
                {skipped && <p className="modal-fineprint">{skipped}</p>}
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={() => setStage('pick')}>
                    Scan another
                  </button>
                  <button type="button" className="primary-btn" onClick={confirm} disabled={included.length === 0}>
                    Add {included.length} to pouch
                  </button>
                </div>
              </div>
            )}

            {stage === 'error' && (
              <div className="modal-body">
                <p className="scan-error">{error}</p>
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={() => setStage('key')}>
                    Key settings
                  </button>
                  <button type="button" className="primary-btn" onClick={() => setStage('pick')}>
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
