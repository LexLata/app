// @vitest-environment jsdom
// Öffentlicher Fensterbestand mit echtem Einzelweg und ausschließlich nativen Attrappen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import * as fs from '@tauri-apps/plugin-fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
const referenz = (kurztitel: string) => ({ kurztitel, normgeber: 'de-bund' });
function datei(kurztitel: string, langtitel = kurztitel, verarbeitungszeit?: string) {
  const zeit = verarbeitungszeit
    ? `<verarbeitungszeit>${verarbeitungszeit}</verarbeitungszeit>`
    : '';
  io.dateien.set(
    `gesetze/${kurztitel}_de-bund.xml`,
    `<gesetz><infos><kurztitel>${kurztitel}</kurztitel><langtitel>${langtitel}</langtitel><normgeber>de-bund</normgeber>${zeit}</infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>`,
  );
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  for (const name of ['A', 'B', 'C']) datei(name);
});
it('dedupliziert gleichzeitige und spätere Zugriffe auf dieselbe unveränderte Datei', async () => {
  const bestand = erzeugeGeladeneGesetze();
  await bestand.bereit;
  const lesen = vi.fn();
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) lesen();
    return undefined;
  };
  const [a, b] = await Promise.all([
    bestand.ladeGesetz(referenz('A')),
    bestand.ladeGesetz(referenz('a')),
  ]);
  expect(a).toBe(b);
  expect(await bestand.ladeGesetz(referenz('A'))).toEqual(a);
  expect(lesen).toHaveBeenCalledOnce();
  bestand.beenden();
});
it('liefert fehlende und nicht lesbare Dateien als Status', async () => {
  const bestand = erzeugeGeladeneGesetze();
  await bestand.bereit;
  expect(await bestand.ladeGesetz(referenz('Fehlt'))).toMatchObject({ status: 'fehlt' });
  io.vorLesen = () => {
    throw new Error('Gesperrt');
  };
  expect(await bestand.ladeGesetz(referenz('A'))).toMatchObject({ status: 'nicht-lesbar' });
  bestand.beenden();
});
it('entlädt die ältesten Gesetze ohne Tab und schützt auch mehrere Tabs derselben Referenz', async () => {
  const bestand = erzeugeGeladeneGesetze({ haltegrenze: 1 });
  await bestand.bereit;
  bestand.meldeOffenenTab(referenz('A'));
  bestand.meldeOffenenTab(referenz('A'));
  for (const name of ['A', 'B', 'C']) await bestand.ladeGesetz(referenz(name));
  expect(bestand.holeGeladenes(referenz('A'))).toBeDefined();
  expect(bestand.holeGeladenes(referenz('B'))).toBeUndefined();
  bestand.meldeGeschlossenenTab(referenz('A'));
  expect(bestand.holeGeladenes(referenz('A'))).toBeDefined();
  bestand.meldeGeschlossenenTab(referenz('A'));
  expect(bestand.holeGeladenes(referenz('C'))).toBeUndefined();
  expect(bestand.holeGeladenes(referenz('A'))).toBeDefined();
  bestand.beenden();
});
it('behält im Hilfsfenster nichts und lädt dort nicht vor', async () => {
  const bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  await bestand.bereit;
  expect(await bestand.ladeGesetz(referenz('A'))).toMatchObject({ status: 'geladen' });
  expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
  bestand.meldeOffenenTab(referenz('B'));
  await bestand.ladeGesetz(referenz('B'));
  expect(bestand.holeGeladenes(referenz('B'))).toBeDefined();
  bestand.meldeGeschlossenenTab(referenz('B'));
  expect(bestand.holeGeladenes(referenz('B'))).toBeUndefined();
  await bestand.vorladen([referenz('C')]);
  expect(bestand.holeGeladenes(referenz('C'))).toBeUndefined();
  bestand.beenden();
});
it.each(['gesetze-geaendert', 'gesetze-geloescht'] as const)(
  'entwertet verspätete Ergebnisse bei %s auch für wartende Aufrufer',
  async (ereignis) => {
    const bestand = erzeugeGeladeneGesetze();
    await bestand.bereit;
    let freigeben!: () => void;
    const warten = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    let begonnen = false;
    const alterInhalt = io.dateien.get('gesetze/A_de-bund.xml') ?? '';
    const originalLesen = fs.readTextFile;
    const leseZugriff = vi.spyOn(fs, 'readTextFile').mockImplementation(async (pfad, optionen) => {
      if (String(pfad).includes('/gesetze/A_') && !begonnen) {
        begonnen = true;
        await warten;
        return alterInhalt;
      }
      return originalLesen(pfad, optionen);
    });
    const alt = bestand.ladeGesetz(referenz('A'));
    await vi.waitFor(() => expect(begonnen).toBe(true));
    if (ereignis === 'gesetze-geaendert') datei('A', 'Aktuell');
    else io.dateien.delete('gesetze/A_de-bund.xml');
    await sendeGlobal(ereignis, [referenz('A')]);
    if (ereignis === 'gesetze-geaendert')
      await vi.waitFor(() =>
        expect(bestand.holeGeladenes(referenz('A'))?.langtitel).toBe('Aktuell'),
      );
    freigeben();
    const ergebnis = await alt;
    if (ereignis === 'gesetze-geaendert') {
      expect(ergebnis).toMatchObject({ status: 'geladen', gesetz: { langtitel: 'Aktuell' } });
      expect(bestand.holeGeladenes(referenz('A'))?.langtitel).toBe('Aktuell');
    } else {
      expect(ergebnis).toMatchObject({ status: 'fehlt' });
      expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
    }
    leseZugriff.mockRestore();
    bestand.beenden();
  },
);
it('behält beim Neuladen ohne fachliche Änderung den Datenstand und übernimmt nur die neue Verarbeitungszeit; eine fachliche Änderung erneuert ihn', async () => {
  datei('A', 'A', '2026-01-01T10:00:00Z');
  const bestand = erzeugeGeladeneGesetze();
  await bestand.bereit;
  bestand.meldeOffenenTab(referenz('A'));
  await bestand.ladeGesetz(referenz('A'));
  const vorher = bestand.holeGeladenes(referenz('A'));
  const datenstand = bestand.holeDatenstand(referenz('A'));
  expect(datenstand).toBeDefined();
  const austausch = vi.fn();
  bestand.vorAustauschAbonnieren(austausch);
  datei('A', 'A', '2026-02-01T10:00:00Z');
  await sendeGlobal('gesetze-geaendert', [referenz('A')]);
  await vi.waitFor(() =>
    expect(bestand.holeGeladenes(referenz('A'))?.verarbeitungszeit).toEqual(
      new Date('2026-02-01T10:00:00Z'),
    ),
  );
  expect(bestand.holeDatenstand(referenz('A'))).toBe(datenstand);
  // Laufzeit-IDs der gebauten Ansichten bleiben gültig.
  expect(bestand.holeGeladenes(referenz('A'))?.elemente).toBe(vorher?.elemente);
  expect(austausch).not.toHaveBeenCalled();
  datei('A', 'Geändert', '2026-02-01T10:00:00Z');
  await sendeGlobal('gesetze-geaendert', [referenz('A')]);
  await vi.waitFor(() => expect(bestand.holeGeladenes(referenz('A'))?.langtitel).toBe('Geändert'));
  expect(bestand.holeDatenstand(referenz('A'))).not.toBe(datenstand);
  expect(austausch).toHaveBeenCalledOnce();
  bestand.beenden();
});
it('lädt bei Änderungen nur betroffene geladene Gesetze und benachrichtigt Abonnenten', async () => {
  const bestand = erzeugeGeladeneGesetze();
  await bestand.bereit;
  await bestand.ladeGesetz(referenz('A'));
  await bestand.ladeGesetz(referenz('B'));
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad);
    return undefined;
  };
  const melden = vi.fn();
  const abmelden = bestand.abonnieren(melden);
  datei('A', 'Neu');
  await sendeGlobal('gesetze-geaendert', [referenz('A'), referenz('C')]);
  await vi.waitFor(() => expect(bestand.holeGeladenes(referenz('A'))?.langtitel).toBe('Neu'));
  expect(gelesen).toHaveLength(1);
  expect(gelesen[0]).toContain('/A_de-bund.xml');
  expect(melden).toHaveBeenCalled();
  await sendeGlobal('gesetze-geloescht', [referenz('A')]);
  expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
  abmelden();
  const anzahl = melden.mock.calls.length;
  await sendeGlobal('gesetze-geaendert', [referenz('C')]);
  expect(melden).toHaveBeenCalledTimes(anzahl);
  bestand.beenden();
});
it('lädt begrenzt erst im Leerlauf vor und lässt Benutzerzugriffe davor zu', async () => {
  const bestand = erzeugeGeladeneGesetze({ vorladegrenze: 1 });
  await bestand.bereit;
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad);
    return undefined;
  };
  let leerlauf: IdleRequestCallback | undefined;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    leerlauf = callback;
    return 1;
  });
  const { vorladen } = bestand;
  const vorbereitung = vorladen([referenz('A'), referenz('C')]);
  await bestand.ladeGesetz(referenz('B'));
  expect(gelesen).toHaveLength(1);
  expect(gelesen[0]).toContain('/B_');
  leerlauf?.({ didTimeout: false, timeRemaining: () => 20 });
  await vorbereitung;
  expect(bestand.holeGeladenes(referenz('A'))).toBeDefined();
  expect(bestand.holeGeladenes(referenz('C'))).toBeUndefined();
  vi.unstubAllGlobals();
  bestand.beenden();
});
it('übernimmt geprüfte Einzelgesetze ohne erneutes Dateilesen und schützt offene Tabs', async () => {
  const bestand = erzeugeGeladeneGesetze({ haltegrenze: 0 });
  const gesetz = { ...referenz('A'), langtitel: 'A', hatGliederungsartikel: false, elemente: [] };
  bestand.meldeOffenenTab(referenz('A'));
  const lesen = vi.fn();
  io.vorLesen = lesen;
  bestand.uebernehmeGeladenes(gesetz);
  expect(bestand.holeGeladenes(referenz('A'))).toBe(gesetz);
  expect(await bestand.ladeGesetz(referenz('A'))).toMatchObject({ gesetz });
  expect(lesen).not.toHaveBeenCalled();
  bestand.meldeGeschlossenenTab(referenz('A'));
  expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
  bestand.beenden();
});
it.each(['gesetze-geaendert', 'gesetze-geloescht'] as const)(
  'prüft die Generation nochmals nach der Austauschvorbereitung (%s)',
  async (ereignis) => {
    const bestand = erzeugeGeladeneGesetze();
    await bestand.ladeGesetz(referenz('A'));
    bestand.meldeOffenenTab(referenz('A'));
    let abmelden = () => {};
    const vorbereiten = vi.fn(() => {
      abmelden();
      if (ereignis === 'gesetze-geaendert') datei('A', 'Jüngster Stand');
      else io.dateien.delete('gesetze/A_de-bund.xml');
      // Ein neues natives Ereignis kann während einer synchronen Vorbereitung eintreffen.
      for (const empfangen of io.listener.get(ereignis) ?? [])
        empfangen({ payload: [referenz('A')] });
    });
    abmelden = bestand.vorAustauschAbonnieren(vorbereiten);
    datei('A', 'Überholter Stand');
    await sendeGlobal('gesetze-geaendert', [referenz('A')]);
    const ergebnis = await bestand.ladeGesetz(referenz('A'));
    expect(vorbereiten).toHaveBeenCalledOnce();
    if (ereignis === 'gesetze-geaendert') {
      expect(ergebnis).toMatchObject({
        status: 'geladen',
        gesetz: { langtitel: 'Jüngster Stand' },
      });
      expect(bestand.holeGeladenes(referenz('A'))?.langtitel).toBe('Jüngster Stand');
    } else {
      expect(ergebnis).toMatchObject({ status: 'fehlt' });
      expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
    }
    bestand.beenden();
  },
);

it('lädt nur bei nutzbarem Leerlaufbudget vor und öffnet vorgeladene sowie behaltene Gesetze ohne Dateizugriff', async () => {
  const callbacks: IdleRequestCallback[] = [];
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const bestand = erzeugeGeladeneGesetze();
  try {
    await bestand.bereit;
    const vorladen = bestand.vorladen([referenz('A')]);
    expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
    callbacks.shift()?.({ didTimeout: false, timeRemaining: () => 0 });
    await Promise.resolve();
    expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
    expect(callbacks).toHaveLength(1);
    callbacks.shift()?.({ didTimeout: false, timeRemaining: () => 20 });
    await vorladen;
    expect(bestand.holeGeladenes(referenz('A'))).toBeDefined();
    await bestand.ladeGesetz(referenz('B'));
    bestand.meldeOffenenTab(referenz('B'));
    bestand.meldeGeschlossenenTab(referenz('B'));
    const zugriffe = [
      vi.spyOn(fs, 'readTextFile'),
      vi.spyOn(fs, 'readDir'),
      vi.spyOn(fs, 'exists'),
    ];
    const vorher = zugriffe.map((zugriff) => zugriff.mock.calls.length);
    const nativeAufrufe = io.invoke.mock.calls.length;
    try {
      await bestand.ladeGesetz(referenz('A'));
      await bestand.ladeGesetz(referenz('B'));
      for (const [i, zugriff] of zugriffe.entries())
        expect(zugriff.mock.calls).toHaveLength(vorher[i] ?? 0);
      expect(io.invoke.mock.calls).toHaveLength(nativeAufrufe);
    } finally {
      for (const zugriff of zugriffe) zugriff.mockRestore();
    }
  } finally {
    bestand.beenden();
    vi.unstubAllGlobals();
  }
});

it('gibt anstehender Benutzereingabe auch bei freiem Leerlaufbudget Vorrang', async () => {
  const callbacks: IdleRequestCallback[] = [];
  let eingabe = true;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  Object.defineProperty(navigator, 'scheduling', {
    configurable: true,
    value: { isInputPending: () => eingabe },
  });
  const bestand = erzeugeGeladeneGesetze();
  try {
    const lauf = bestand.vorladen([referenz('A')]);
    callbacks.shift()?.({ didTimeout: false, timeRemaining: () => 20 });
    await Promise.resolve();
    expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
    expect(callbacks).toHaveLength(1);
    eingabe = false;
    callbacks.shift()?.({ didTimeout: false, timeRemaining: () => 20 });
    await lauf;
    expect(bestand.holeGeladenes(referenz('A'))).toBeDefined();
  } finally {
    bestand.beenden();
    Reflect.deleteProperty(navigator, 'scheduling');
    vi.unstubAllGlobals();
  }
});

it('wartet ohne Leerlauf-API nach einer Eingabe erneut auf eine Ruhephase', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestIdleCallback', undefined);
  const bestand = erzeugeGeladeneGesetze();
  try {
    await bestand.bereit;
    const lauf = bestand.vorladen([referenz('A')]);
    await vi.advanceTimersByTimeAsync(49);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await vi.advanceTimersByTimeAsync(1);
    expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
    await vi.advanceTimersByTimeAsync(50);
    await lauf;
    expect(bestand.holeGeladenes(referenz('A'))).toBeDefined();
  } finally {
    bestand.beenden();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it.each(['Leerlauf-API', 'Timerfallback'])(
  'beendet wartendes Vorladen samt Eingabelauschen und %s beim Bestandsende',
  async (art) => {
    vi.useFakeTimers();
    const callbacks: IdleRequestCallback[] = [];
    const abbrechen = vi.fn();
    vi.stubGlobal(
      'requestIdleCallback',
      art === 'Leerlauf-API'
        ? (callback: IdleRequestCallback) => {
            callbacks.push(callback);
            return callbacks.length;
          }
        : undefined,
    );
    vi.stubGlobal('cancelIdleCallback', abbrechen);
    const anmelden = vi.spyOn(document, 'addEventListener');
    const abmelden = vi.spyOn(document, 'removeEventListener');
    const bestand = erzeugeGeladeneGesetze();
    try {
      await bestand.bereit;
      const lauf = bestand.vorladen([referenz('A')]);
      if (art === 'Leerlauf-API')
        callbacks.shift()?.({ didTimeout: false, timeRemaining: () => 0 });
      else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        await vi.advanceTimersByTimeAsync(50);
      }
      bestand.beenden();
      expect(
        abmelden.mock.calls.filter(([name]) =>
          ['pointerdown', 'keydown', 'input', 'wheel'].includes(name),
        ),
      ).toHaveLength(4);
      if (art === 'Leerlauf-API') expect(abbrechen).toHaveBeenCalled();
      else expect(vi.getTimerCount()).toBe(0);
      await lauf;
      const zugriffe = io.invoke.mock.calls.length;
      callbacks.shift()?.({ didTimeout: false, timeRemaining: () => 20 });
      await vi.advanceTimersByTimeAsync(100);
      await bestand.vorladen([referenz('B')]);
      expect(io.invoke.mock.calls).toHaveLength(zugriffe);
      expect(bestand.holeGeladenes(referenz('A'))).toBeUndefined();
      expect(
        anmelden.mock.calls.filter(([name]) =>
          ['pointerdown', 'keydown', 'input', 'wheel'].includes(name),
        ),
      ).toHaveLength(4);
    } finally {
      bestand.beenden();
      anmelden.mockRestore();
      abmelden.mockRestore();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  },
);
it('unterscheidet in der Bestandsauskunft vorgeladene, behaltene und in Tabs gezeigte Gesetze', async () => {
  datei('D');
  const bestand = erzeugeGeladeneGesetze();
  await bestand.bereit;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    queueMicrotask(() => callback({ didTimeout: false, timeRemaining: () => 20 }));
    return 1;
  });
  await bestand.vorladen([referenz('A'), referenz('B'), referenz('D')]);
  // B wird nach dem Vorladen benutzt, D in einem Tab geöffnet, C nur einzeln geladen;
  // die Volltextsuche liest A ohne Behalten und benutzt es damit nicht.
  await bestand.ladeGesetz(referenz('B'));
  bestand.meldeOffenenTab(referenz('D'));
  await bestand.ladeGesetz(referenz('C'));
  await bestand.ladeGesetz(referenz('A'), undefined, { behalten: false });
  const zustaende = () => {
    const { fenstertyp, gesetze } = bestand.holeBestandsauskunft();
    return gesetze.map((g) => `${fenstertyp} ${g.gesetz.kurztitel}: ${g.zustand}`).sort();
  };
  expect(zustaende()).toEqual([
    'hauptfenster A: vorgeladen',
    'hauptfenster B: behalten',
    'hauptfenster C: behalten',
    'hauptfenster D: in Tabs',
  ]);
  bestand.meldeGeschlossenenTab(referenz('D'));
  expect(zustaende()).toContain('hauptfenster D: behalten');
  bestand.beenden();
  expect(zustaende()).toEqual([]);
  vi.unstubAllGlobals();
});
