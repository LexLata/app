// @vitest-environment jsdom
// Beenden-Anfrage in Hilfsfenstern mit Schließschutz: dieselbe Rückfrage wie
// beim Fensterkreuz, das Fenster selbst schließt nicht.
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const nativ = vi.hoisted(() => ({
  invoke: vi.fn(),
  message: vi.fn(),
  destroy: vi.fn(),
  anfrage: undefined as undefined | ((event: { payload: { id: number } }) => void),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: nativ.message }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async () => () => {},
    destroy: nativ.destroy,
  }),
}));
// Nur die Beenden-Anfrage wird zugestellt; übrige Listener bleiben stumm.
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, callback: NonNullable<typeof nativ.anfrage>) => {
      if (name === 'beenden-anfrage') nativ.anfrage = callback;
      return () => {};
    },
  }),
}));

import { useFensterSchliessenAbsichern } from './useFensterSchliessenAbsichern';

let root: Root;
const speichern = vi.fn(async () => true);

function Formular({ startText }: { startText: string }) {
  const [text] = useState(startText);
  useFensterSchliessenAbsichern(text !== '', () => {}, speichern);
  return <textarea defaultValue={text} />;
}

async function zeige(text: string) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Formular startText={text} />));
  await vi.waitFor(() => expect(nativ.anfrage).toBeDefined());
  return container;
}

async function anfragen(id: number) {
  await act(async () => nativ.anfrage?.({ payload: { id } }));
  await vi.waitFor(() =>
    expect(nativ.invoke).toHaveBeenCalledWith('beenden_anfrage_antworten', expect.anything()),
  );
  return nativ.invoke.mock.calls.find(([name]) => name === 'beenden_anfrage_antworten')?.[1];
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  nativ.anfrage = undefined;
  nativ.invoke.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('stellt bei ungespeichertem Text die bestehende Rückfrage; „Abbrechen“ lässt Fenster und Text unverändert', async () => {
  nativ.message.mockResolvedValue('Abbrechen');
  const container = await zeige('Entwurf');

  expect(await anfragen(3)).toEqual({ id: 3, bereit: false });
  expect(nativ.message).toHaveBeenCalledWith(
    'Ungespeicherte Änderungen: Wie möchten Sie fortfahren?',
    expect.objectContaining({
      buttons: { yes: 'Speichern', no: 'Verwerfen', cancel: 'Abbrechen' },
    }),
  );
  expect(speichern).not.toHaveBeenCalled();
  expect(nativ.destroy).not.toHaveBeenCalled();
  expect(container.querySelector('textarea')?.value).toBe('Entwurf');
});

it('speichert auf Wunsch und meldet dann bereit, ohne das Fenster zu schließen', async () => {
  nativ.message.mockResolvedValue('Speichern');
  await zeige('Entwurf');
  expect(await anfragen(4)).toEqual({ id: 4, bereit: true });
  expect(speichern).toHaveBeenCalledOnce();
  expect(nativ.destroy).not.toHaveBeenCalled();
});

it('meldet ohne Änderungen sofort bereit', async () => {
  await zeige('');
  expect(await anfragen(5)).toEqual({ id: 5, bereit: true });
  expect(nativ.message).not.toHaveBeenCalled();
  expect(nativ.destroy).not.toHaveBeenCalled();
});
