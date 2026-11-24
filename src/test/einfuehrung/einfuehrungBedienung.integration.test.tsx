// @vitest-environment jsdom
// Verhalten an den echten Einführungs-, Ansichts- und Speicheranschlüssen.
import { act } from 'react';
import { assert, expect, it, vi } from 'vitest';
import { io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import {
  abruf,
  dom,
  tabs,
  einfuehrung,
  aktivesElementId,
  eingeklappt,
  zeichneProbe,
  button,
  suchen,
  bis,
  aktiviereNachfuehrungTest,
  entnehmeFrames,
} from './einfuehrungBedienungTestAufbau';
it('P3-A5: der tatsächliche Suchcallback aktiviert nach Teilaktion 1 die favoritenfähige Zielnorm', async () => {
  await suchen();
  expect(einfuehrung.einfuehrungTeilaktion).toBe(2);
  expect(tabs.tabs.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe('a1');
  expect(aktivesElementId).toBe('a');
});

it.each([0, 1, 2, 3, 4, 5, 6, 7])(
  'P3-A3: Seitenleistenbuttons und Stern folgen der Teilaktion %s',
  async (t) => {
    await bis(t);
    expect(einfuehrung.einfuehrungTeilaktion).toBe(t);
    for (const [ziel, erlaubt] of Object.entries({
      oeffnen: t === 0,
      favorit: t === 2 || t === 3,
      lesezeichen: t === 4,
      zuklappen: t === 6,
      aufklappen: t === 7,
    })) {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        `button[data-einfuehrung-ziel="${ziel}"]`,
      );
      expect(buttons.length).toBe(ziel === 'favorit' ? 2 : 1);
      for (const b of buttons) expect(b.disabled, ziel).toBe(!erlaubt);
    }
  },
);
it.each([0, 1, 2, 3, 4, 5, 6, 7])(
  'P3-A4: Normklick, Überschriftenwahl und Titelklappen beachten Teilaktion %s',
  async (t) => {
    await bis(t);
    const vorher = aktivesElementId;
    const zeilen = dom.host.querySelectorAll<HTMLElement>('.gt-klapp-zeile');
    const normzeile = zeilen[3];
    assert(normzeile);
    await act(async () => normzeile.click());
    expect(aktivesElementId).toBe([0, 1, 3].includes(t) ? vorher : 'b');
    expect(eingeklappt).toBe(t >= 5 ? 1 : 0);
    const ueberschrift = zeilen[1];
    assert(ueberschrift);
    await act(async () => ueberschrift.click());
    expect(aktivesElementId).toBe(t >= 5 ? 'u' : [0, 1, 3].includes(t) ? vorher : 'b');
    expect(eingeklappt).toBe(t >= 5 ? 2 : 0);
  },
);
it.each([0, 1, 2, 3, 4, 5, -1])(
  'P3-A5b: echte Nachführung erhält die Auswahl bis Teilaktion 4 und führt danach nach (%s)',
  async (t) => {
    if (t < 0) await act(async () => einfuehrung.einfuehrungBeenden());
    else await bis(t);
    aktiviereNachfuehrungTest();
    await act(async () => dom.root.render(zeichneProbe()));
    const vorher = aktivesElementId;
    for (let i = 0; i < 5; i++) {
      const callbacks = entnehmeFrames();
      await act(async () => callbacks.forEach((fn) => fn(performance.now() + i * 1000)));
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const block = dom.host.querySelector<HTMLElement>('[data-index]');
    assert(block);
    const container = block.closest<HTMLElement>('[style*="overflow: auto"]');
    assert(container);
    await act(async () => {
      container.scrollTop = 850;
      container.dispatchEvent(new Event('scroll'));
    });
    const callbacks = entnehmeFrames();
    await act(async () => callbacks.forEach((fn) => fn(0)));
    await act(async () => vi.advanceTimersByTime(250));
    expect(aktivesElementId).toBe(t >= 0 && t <= 4 ? vorher : 'u');
  },
);

it.each(['offline', 'unbekannt'])(
  'P5-A5: nach %s bleibt die Suche wiederholbar und schaltet erst bei Erfolg weiter',
  async (art) => {
    io.dateien.set(
      'importindizes/de-bund.xml',
      '<?xml version="1.0"?><importindex version="1"><infos><verarbeitungszeit herkunft="nutzer">2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>bgb</abrufkennung></gesetz></inhalt></importindex>',
    );
    abruf.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => button('oeffnen').click());
    async function eingeben(text: string) {
      await act(async () => {
        const input = document.querySelector('input');
        assert(input);
        const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        assert(setzen);
        setzen.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await eingeben(art === 'offline' ? 'BGB' : 'UnbekanntesGesetz');
    await act(async () => vi.dynamicImportSettled());
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    await act(async () => vi.dynamicImportSettled());
    expect(einfuehrung.einfuehrungTeilaktion).toBe(1);
    expect(einfuehrung.keineVerbindung).toBe(art === 'offline');
    expect(document.querySelector('input')).not.toBeNull();
    await eingeben('GG');
    expect(einfuehrung.keineVerbindung).toBe(false);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true })),
    );
    expect(einfuehrung.einfuehrungTeilaktion).toBe(2);
    expect(document.querySelector('input')).toBeNull();
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.tabs[0]?.initialNorm).toBe('a1');
  },
);
