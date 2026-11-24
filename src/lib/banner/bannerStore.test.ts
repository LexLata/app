// bannerStore.test.ts
//
// Reine Store-Logik (kein I/O, kein Tauri) – testet zeigeBanner/
// bannerAktualisieren/bannerSchliessen/
// alleBannerSchliessen/subscribe/getSnapshot direkt. Wird u.a. von
// importindexErstellungSteuerung.test.ts als echte Abhängigkeit mitverwendet;
// diese Datei deckt den Store selbst ab (Merge-Verhalten, Listener,
// Reihenfolge), unabhängig von ProzessBanner/versucheZuStarten.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  zeigeBanner,
  bannerAktualisieren,
  bannerDauerMs,
  bannerSchliessen,
  alleBannerSchliessen,
  subscribe,
  getSnapshot,
  erzeugeErweiterbaresBanner,
} from './bannerStore';

beforeEach(() => {
  alleBannerSchliessen();
});

describe('zeigeBanner', () => {
  it('hängt ein neues Banner unten an den Stapel an', () => {
    const id1 = zeigeBanner({ art: 'systemfehler', text: 'Erstes' });
    const id2 = zeigeBanner({ art: 'systemfehler', text: 'Zweites' });
    expect(getSnapshot().map((b) => b.id)).toEqual([id1, id2]);
  });

  it('setzt typ standardmäßig auf "info", wenn nicht angegeben', () => {
    zeigeBanner({ art: 'systemfehler', text: 'X' });
    expect(getSnapshot()[0]!.typ).toBe('info');
  });

  it('übernimmt einen explizit übergebenen typ', () => {
    zeigeBanner({ art: 'systemfehler', text: 'X', typ: 'fehler' });
    expect(getSnapshot()[0]!.typ).toBe('fehler');
  });

  it('übernimmt Bannerart und aktion, falls übergeben', () => {
    const aktion = { label: 'Tu was', onClick: vi.fn() };
    zeigeBanner({ art: 'vorgangsergebnis', text: 'X', aktion });
    expect(getSnapshot()[0]).toMatchObject({ art: 'vorgangsergebnis', aktion });
  });

  it('startet bei gleichem offenem Bedienhinweis dessen Zeit neu statt eines zweiten Banners', () => {
    const id = zeigeBanner({ art: 'bedienhinweis', text: 'Nicht möglich.', typ: 'warnung' });
    const erneut = zeigeBanner({ art: 'bedienhinweis', text: 'Nicht möglich.', typ: 'warnung' });
    expect(erneut).toBe(id);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]?.zeitNeustarts).toBe(1);
  });

  it('legt für anderen Text oder andere Bannerart ein eigenes Banner an', () => {
    zeigeBanner({ art: 'bedienhinweis', text: 'A' });
    zeigeBanner({ art: 'bedienhinweis', text: 'B' });
    zeigeBanner({ art: 'systemfehler', text: 'A' });
    zeigeBanner({ art: 'systemfehler', text: 'A' });
    expect(getSnapshot()).toHaveLength(4);
  });
});

describe('bannerDauerMs', () => {
  it.each([
    ['bedienhinweis', 5000],
    ['erfolg', 5000],
    ['vorgangsergebnis', undefined],
    ['vorgangsfortschritt', undefined],
    ['dateibefunde', undefined],
    ['nichtGeladeneGesetze', undefined],
    ['systemfehler', undefined],
  ] as const)('%s → %s', (art, dauer) => {
    expect(bannerDauerMs({ art })).toBe(dauer);
  });

  it('lässt ein Banner mit Aktion immer stehen', () => {
    expect(
      bannerDauerMs({ art: 'erfolg', aktion: { label: 'X', onClick: vi.fn() } }),
    ).toBeUndefined();
  });

  it('vergibt jedem Banner eine eigene, eindeutige id', () => {
    const id1 = zeigeBanner({ art: 'systemfehler', text: 'A' });
    const id2 = zeigeBanner({ art: 'systemfehler', text: 'B' });
    expect(id1).not.toBe(id2);
  });

  it('benachrichtigt registrierte Listener', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    zeigeBanner({ art: 'systemfehler', text: 'X' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('bannerAktualisieren', () => {
  it('aktualisiert nur die übergebenen Felder, Rest bleibt unverändert', () => {
    const id = zeigeBanner({ art: 'systemfehler', text: 'Alt', typ: 'info' });
    bannerAktualisieren(id, { text: 'Neu' });
    expect(getSnapshot()[0]).toMatchObject({ text: 'Neu', typ: 'info' });
  });

  it('MUTATIONSTEST: aktion: null entfernt eine bestehende Aktion (nicht dasselbe wie "nicht übergeben")', () => {
    const aktion = { label: 'X', onClick: vi.fn() };
    const id = zeigeBanner({ art: 'systemfehler', text: 'X', aktion });
    bannerAktualisieren(id, { aktion: null });
    expect(getSnapshot()[0]!.aktion).toBeUndefined();
  });

  it('aktion nicht übergeben (undefined) lässt eine bestehende Aktion unangetastet', () => {
    const aktion = { label: 'X', onClick: vi.fn() };
    const id = zeigeBanner({ art: 'systemfehler', text: 'X', aktion });
    bannerAktualisieren(id, { text: 'Neuer Text' });
    expect(getSnapshot()[0]!.aktion).toBe(aktion);
  });

  it('setzt eine neue aktion, wenn übergeben', () => {
    const id = zeigeBanner({ art: 'systemfehler', text: 'X' });
    const neueAktion = { label: 'Y', onClick: vi.fn() };
    bannerAktualisieren(id, { aktion: neueAktion });
    expect(getSnapshot()[0]!.aktion).toBe(neueAktion);
  });

  it('setzt laedt, wenn übergeben', () => {
    const id = zeigeBanner({ art: 'systemfehler', text: 'X' });
    bannerAktualisieren(id, { laedt: true });
    expect(getSnapshot()[0]!.laedt).toBe(true);
  });

  it('hat keine Wirkung, wenn die id nicht (mehr) existiert', () => {
    const id = zeigeBanner({ art: 'systemfehler', text: 'X' });
    bannerSchliessen(id);
    expect(() => bannerAktualisieren(id, { text: 'Y' })).not.toThrow();
    expect(getSnapshot()).toEqual([]);
  });

  it('betrifft nur das Banner mit passender id, andere bleiben unangetastet', () => {
    const id1 = zeigeBanner({ art: 'systemfehler', text: 'A' });
    const id2 = zeigeBanner({ art: 'systemfehler', text: 'B' });
    bannerAktualisieren(id1, { text: 'A-neu' });
    expect(getSnapshot().find((b) => b.id === id2)!.text).toBe('B');
  });
});

describe('bannerSchliessen', () => {
  it('entfernt genau das Banner mit der übergebenen id', () => {
    const id1 = zeigeBanner({ art: 'systemfehler', text: 'A' });
    const id2 = zeigeBanner({ art: 'systemfehler', text: 'B' });
    bannerSchliessen(id1);
    expect(getSnapshot().map((b) => b.id)).toEqual([id2]);
  });

  it('hat keine Wirkung, wenn die id nicht existiert', () => {
    zeigeBanner({ art: 'systemfehler', text: 'A' });
    bannerSchliessen('unbekannte-id');
    expect(getSnapshot()).toHaveLength(1);
  });
});

describe('alleBannerSchliessen', () => {
  it('entfernt alle vorhandenen Banner auf einmal', () => {
    zeigeBanner({ art: 'systemfehler', text: 'A' });
    zeigeBanner({ art: 'systemfehler', text: 'B' });
    alleBannerSchliessen();
    expect(getSnapshot()).toEqual([]);
  });
});

describe('subscribe', () => {
  it('gibt eine Funktion zurück, die den Listener wieder entfernt', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    unsubscribe();
    zeigeBanner({ art: 'systemfehler', text: 'X' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('benachrichtigt mehrere registrierte Listener bei jeder Änderung', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const u1 = subscribe(listener1);
    const u2 = subscribe(listener2);
    zeigeBanner({ art: 'systemfehler', text: 'X' });
    bannerAktualisieren(getSnapshot()[0]!.id, { text: 'Y' });
    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener2).toHaveBeenCalledTimes(2);
    u1();
    u2();
  });
});

describe('erzeugeErweiterbaresBanner', () => {
  const inhalt = (daten: string[]) => ({
    inhalt: { text: daten.join(' '), typ: 'warnung' as const },
    daten,
  });

  it('beginnt ein Banner, erweitert es mit dem bisherigen Inhalt und beginnt nach dem Schließen neu', () => {
    const erweitere = erzeugeErweiterbaresBanner<string[]>('dateibefunde');
    const bisherige: (string[] | undefined)[] = [];
    const ergaenze = (neu: string) =>
      erweitere((bisher) => {
        bisherige.push(bisher);
        return inhalt([...(bisher ?? []), neu]);
      });
    const erste = ergaenze('A');
    const zweite = ergaenze('B');
    expect(zweite).toBe(erste);
    expect(getSnapshot()).toMatchObject([{ id: erste, art: 'dateibefunde', text: 'A B' }]);
    bannerSchliessen(erste ?? '');
    const dritte = ergaenze('C');
    expect(dritte).not.toBe(erste);
    expect(getSnapshot()).toMatchObject([{ id: dritte, text: 'C' }]);
    expect(bisherige).toEqual([undefined, ['A'], undefined]);
  });

  it('führt je Bannerart einen eigenen Inhalt, lässt bei undefined alles unverändert und vergisst beim Schließen aller Banner', () => {
    const befunde = erzeugeErweiterbaresBanner<string[]>('dateibefunde');
    const gesetze = erzeugeErweiterbaresBanner<string[]>('nichtGeladeneGesetze');
    befunde(() => inhalt(['A']));
    const bisherGesetze = vi.fn(() => inhalt(['G']));
    gesetze(bisherGesetze);
    expect(bisherGesetze).toHaveBeenCalledWith(undefined);
    expect(befunde(() => undefined)).toBeUndefined();
    expect(getSnapshot().map((b) => [b.art, b.text])).toEqual([
      ['dateibefunde', 'A'],
      ['nichtGeladeneGesetze', 'G'],
    ]);
    alleBannerSchliessen();
    const bisherNachAllemSchliessen = vi.fn(() => inhalt(['N']));
    befunde(bisherNachAllemSchliessen);
    expect(bisherNachAllemSchliessen).toHaveBeenCalledWith(undefined);
  });
});
