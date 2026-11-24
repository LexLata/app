// FensterStartFehler.test.tsx
// Echte React-Ansicht mit bestehenden Sichtbarkeits-/Schließhooks und
// kontrollierter nativer Grenze; Fachkontexte bleiben unberührt.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FensterStartFehler } from './FensterStartFehler';

const native = vi.hoisted(() => ({
  show: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue(undefined),
  callbacks: new Map<string, () => Promise<void>>(),
  abmelden: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ show: native.show, close: native.close }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@/hooks/einstellungen/useAppAkzentfarbe', () => ({ useAppAkzentfarbe: () => {} }));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', () => ({
  hoereImEigenenFenster: (name: string, callback: () => Promise<void>) => {
    native.callbacks.set(name, callback);
    return { bereit: Promise.resolve(), abmelden: () => native.abmelden(name) };
  },
}));
let root: Root;
beforeEach(() => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  root = createRoot(document.getElementById('root')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('zeigt das versteckt gestartete Fenster, erhält Escape und native Schließanfrage auch im StrictMode', async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <FensterStartFehler erneutVersuchen={async () => true} />
      </StrictMode>,
    ),
  );
  await vi.waitFor(() => expect(native.show).toHaveBeenCalled());
  expect(native.invoke).toHaveBeenCalledWith('fenster_menu_status_aktualisieren');
  expect(document.querySelector('[role="alert"]')!.textContent).toContain(
    'konnte nicht geladen werden',
  );
  const escape = new window.Event('keydown');
  Object.assign(escape, { key: 'Escape' });
  window.dispatchEvent(escape);
  await vi.waitFor(() => expect(native.close).toHaveBeenCalledTimes(1));
  await native.callbacks.get('schliessen-anfrage')!();
  expect(native.close).toHaveBeenCalledTimes(2);
  expect(native.abmelden.mock.calls.filter(([name]) => name === 'schliessen-anfrage')).toHaveLength(
    1,
  );
});

it('sperrt Mehrfachklicks und gibt erneute Versuche nach Abschluss frei', async () => {
  let fertig!: (wert: boolean) => void;
  const erneutVersuchen = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        fertig = resolve;
      }),
  );
  await act(async () => root.render(<FensterStartFehler erneutVersuchen={erneutVersuchen} />));
  const button = document.querySelector('button')!;
  await act(async () => {
    button.click();
    button.click();
  });
  expect(erneutVersuchen).toHaveBeenCalledTimes(1);
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(button.textContent).toBe('Wird geladen …');
  await act(async () => fertig(true));
  expect(button.hasAttribute('disabled')).toBe(false);
  expect(button.textContent).toBe('Erneut versuchen');
  await act(async () => button.click());
  expect(erneutVersuchen).toHaveBeenCalledTimes(2);
  await act(async () => fertig(true));
});
