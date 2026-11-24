// @vitest-environment jsdom
// FavoritenHinzufuegenOverlay.test.tsx
// Prüft Beispielschutz und unveränderte mehrzeilige Favoriteneingabe bis zur Speicherung.
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FavoritenHinzufuegenOverlay } from './FavoritenHinzufuegenOverlay';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
const speichern = vi.hoisted(() => vi.fn());
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  hinzufuegenFavoriten: speichern,
}));
afterEach(() => vi.unstubAllGlobals());
it('schützt das Beispiel zusammenhängend und lässt Leerzeichen, Tab und Zeilenumbruch im Feld bestehen', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const gesetz: GesetzDarstellung = gesetzMitNormen(['§ 280', '§ 433', '§ 985', 'Anlage 280'], {
    kurztitel: 'Art. 1',
    langtitel: 'Test',
    hatGliederungsartikel: false,
    kennung: ['280', '433', '985', 'anlage'],
  });
  let abschliessen!: (wert: Set<string>) => void;
  speichern.mockReturnValue(
    new Promise<Set<string>>((resolve) => {
      abschliessen = resolve;
    }),
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<FavoritenHinzufuegenOverlay gesetz={gesetz} onSchliessen={vi.fn()} />),
    );
    expect(host.textContent).toContain('Art\u00a0247 §\u00a01 EGBGB.');
    const feld = host.querySelector('textarea')!;
    const roh = '280  433\t985\n280';
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(feld, roh);
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(feld.value).toBe(roh);
    // CRLF-Normalisierung stammt vom Browser, nicht von der Anzeigeformatierung.
    const normalisiert = document.createElement('textarea');
    normalisiert.value = 'a\r\nb';
    expect(normalisiert.value).toBe('a\nb');
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Favoriten hinzufügen',
    )!;
    await act(async () => button.click());
    expect(speichern).toHaveBeenCalledExactlyOnceWith(gesetz, ['§ 280', '§ 433', '§ 985', '§ 280']);
    expect(feld.value).toBe(roh);
    expect(feld.disabled).toBe(true);
    expect(button.disabled).toBe(true);
    await act(async () => abschliessen(new Set(['§ 280', '§ 433', '§ 985'])));
    expect(feld.disabled).toBe(false);
    expect(feld.value).toBe(roh);
    expect(host.textContent).toContain('4 Favoriten hinzugefügt.');
  } finally {
    await act(async () => root.unmount());
  }
});

it.each([
  ['§ 90', '§ 9a'],
  ['§ 9', 'Art. 9'],
  ['§ 9', '§ 9'],
])(
  'speichert die Eingabe 9 bei %s und %s nicht und berichtet das fehlende Ziel',
  async (...bezeichnungen) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    speichern.mockClear();
    const gesetz = gesetzMitNormen(bezeichnungen);
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(<FavoritenHinzufuegenOverlay gesetz={gesetz} onSchliessen={vi.fn()} />),
      );
      const feld = host.querySelector('textarea')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          feld,
          '9',
        );
        feld.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () =>
        [...host.querySelectorAll('button')]
          .find((b) => b.textContent === 'Favoriten hinzufügen')!
          .click(),
      );
      expect(speichern).not.toHaveBeenCalled();
      expect(host.textContent).toContain('Keine der eingegebenen Normen wurde im Gesetz gefunden.');
    } finally {
      await act(async () => root.unmount());
    }
  },
);
