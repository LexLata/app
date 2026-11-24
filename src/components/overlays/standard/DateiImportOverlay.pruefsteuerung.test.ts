// @vitest-environment jsdom
import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import '@/test/import/dateiImportOverlayAnzeigeAttrappen';
// Echte Prüfqueue und Quellen-/Konfliktdateiketten; nur native I/O-Grenzen ersetzt.

import { beforeEach, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  unlesbar: new Set<string>(),
  invoke: vi.fn(),
  emit: vi.fn(),
  banner: vi.fn(),
  vollbedarf: false,
  wiederholen: false,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: io.emit }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: io.banner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
const relativ = (pfad: string) => pfad.replace('/daten/LexLata/', '');
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    if (io.unlesbar.has(relativ(pfad))) throw Error('Zugriff verweigert');
    const xml = io.dateien.get(relativ(pfad));
    if (xml === undefined) throw Error('Datei fehlt');
    return xml;
  },
  exists: async (pfad: string) => io.dateien.has(relativ(pfad)),
  mkdir: async () => {},
  readDir: async (pfad: string) =>
    [...io.dateien.keys()]
      .filter((datei) => datei.startsWith(relativ(pfad) + '/'))
      .map((datei) => ({ name: datei.split('/').at(-1), isDirectory: false })),
}));
const konfliktdatei = 'markierungskonflikte.xml';
const gesetzdatei = 'gesetze/BGB_de-bund.xml';
const markierungsdatei = 'markierungen/BGB_de-bund-markierungen.xml';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  io.dateien.clear();
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  io.unlesbar.clear();
  io.vollbedarf = false;
  io.wiederholen = false;
  io.dateien.set(konfliktdatei, '<markierungskonflikte pruefstatus="aktuell"/>');
  io.dateien.set(
    gesetzdatei,
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>',
  );
  io.dateien.set(
    markierungsdatei,
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
  );
  io.emit.mockResolvedValue(undefined);
  io.invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad?: string; inhalt?: string } = {}) => {
      if (befehl === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(io.dateien);
      if (befehl === 'datei_sperre_erwerben') {
        return 'token';
      }
      if (befehl === 'datei_sperre_unterbrechen') return;
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'atomar_datei_schreiben') {
        io.dateien.set(erwarteVorhanden(args.relativerPfad), erwarteVorhanden(args.inhalt));
        return;
      }
      if (befehl === 'archiviere_beschaedigte_datei') {
        const pfad = erwarteVorhanden(args.relativerPfad);
        io.dateien.set('sicherung.xml', erwarteVorhanden(io.dateien.get(pfad)));
        io.dateien.delete(pfad);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      if (befehl === 'pruefvorgang_registrieren') return 'quelle';
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
        const uebernommen = io.wiederholen;
        io.wiederholen = false;
        return uebernommen;
      }
      if (befehl === 'pruefvorgang_vollpruefung_abschliessen') io.vollbedarf = false;
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: io.vollbedarf };
    },
  );
});

async function pruefer() {
  return import('@/lib/markierungen/markierungen.index');
}

function erwarteVorhanden<T>(wert: T | null | undefined): T {
  if (wert === null || wert === undefined) throw new Error('Erwarteter Testwert fehlt.');
  return wert;
}

it.each(['erstimport', 'ersetzen', 'zusammenfuehren'] as const)(
  'Markierungsdatei-%s wartet mit echter Prüfsteuerung erst nach Quellfreigabe',
  async (weg) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
    const xml =
      '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand><kommentartext>Importiert</kommentartext></kommentar></inhalt></markierungen>';
    if (weg === 'erstimport') io.dateien.delete(markierungsdatei);
    io.dateien.set('Import.xml', xml);
    const original = erwarteVorhanden(io.invoke.getMockImplementation());
    const gehalten = new Set<string>();
    io.invoke.mockImplementation(async (befehl, args = {}) => {
      if (befehl === 'datei_sperre_erwerben') {
        expect(gehalten.has(args.relativerPfad)).toBe(false);
        gehalten.add(args.relativerPfad);
        return args.relativerPfad;
      }
      if (befehl === 'datei_sperre_freigeben') {
        gehalten.delete(args.token);
        return;
      }
      if (befehl === 'pruefvorgang_quelle_abschliessen')
        expect(gehalten.has(markierungsdatei)).toBe(false);
      return original(befehl, args);
    });
    const importiert = await importierePfade(['/daten/LexLata/Import.xml']);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const { act, createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { DateiImportOverlay } =
      await import('@/components/overlays/standard/DateiImportOverlay');
    const container = document.createElement('div');
    const wurzel = createRoot(container);
    try {
      await act(async () =>
        wurzel.render(
          createElement(DateiImportOverlay, {
            zustand: { art: 'fertig', ergebnis: importiert },
            onSchliessen: vi.fn(),
            onNeuLaden: vi.fn(),
          }),
        ),
      );
      if (weg !== 'erstimport') {
        const text = weg === 'ersetzen' ? 'Ersetzen' : 'Zusammenführen';
        const button = [...container.querySelectorAll('button')].find(
          (b) => b.textContent === text,
        );
        if (!button) throw new Error('Importaktion fehlt.');
        await act(async () => {
          button.click();
        });
      }
      expect(container.textContent).toContain('BGB');
      expect(container.textContent).not.toContain('Import.xml');
      expect(container.textContent).toContain(
        weg === 'erstimport'
          ? 'erfolgreich importiert'
          : weg === 'ersetzen'
            ? 'ersetzt'
            : 'zusammengeführt',
      );
    } finally {
      await act(async () => wurzel.unmount());
    }
    expect(io.dateien.get(markierungsdatei)).toContain('Importiert');
    expect(io.invoke).toHaveBeenCalledWith(
      'pruefvorgang_teilpruefung_abschliessen',
      expect.anything(),
    );
    expect(gehalten.size).toBe(0);
    expect(io.banner).not.toHaveBeenCalled();
  },
);

const titeldatei = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
const gesetzXML =
  '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>Neu</absatz></text></norm></inhalt></gesetz>';
const titelXML =
  '<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Neuer Titel</titel></norm></inhalt></nichtamtlicheTitel>';

it.each(['gesetz', 'titel'] as const)(
  '%s-Erstimport besitzt den echten Prüfabschluss ohne Banner',
  async (quelle) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
    const pfad = quelle === 'gesetz' ? gesetzdatei : titeldatei;
    io.dateien.delete(pfad);
    io.dateien.set('Import.xml', quelle === 'gesetz' ? gesetzXML : titelXML);
    const ergebnis = await importierePfade(['/daten/LexLata/Import.xml']);
    expect(ergebnis.berichtEintraege[0]?.abschluss).toBeDefined();
    expect(ergebnis.berichtEintraege[0]?.aktion).toBe('neu');
    expect(io.invoke).toHaveBeenCalledWith(
      'pruefvorgang_teilpruefung_abschliessen',
      expect.anything(),
    );
    expect(io.dateien.get(pfad)).toContain(quelle === 'gesetz' ? 'Neu' : 'Neuer Titel');
    expect(io.banner).not.toHaveBeenCalled();
  },
);

function installiereFehlerstand(fall: string, pfad: string) {
  const original = erwarteVorhanden(io.invoke.getMockImplementation());
  const gehalten = new Set<string>();
  io.invoke.mockImplementation(async (befehl, args = {}) => {
    if (befehl === 'datei_sperre_erwerben') {
      expect(gehalten.has(args.relativerPfad)).toBe(false);
      gehalten.add(args.relativerPfad);
      return args.relativerPfad;
    }
    if (befehl === 'datei_sperre_freigeben') {
      gehalten.delete(args.token);
      return;
    }
    if (befehl === 'pruefvorgang_quelle_abschliessen') expect(gehalten.has(pfad)).toBe(false);
    const fehlerbefehle: Record<string, string> = {
      vormerken: 'pruefvorgang_registrieren',
      quellabschluss: 'pruefvorgang_quelle_abschliessen',
      pruefstand: 'atomar_datei_schreiben',
      nachPruefstand: 'pruefvorgang_vollpruefung_abschliessen',
    };
    const zielIstPruefstand = io.dateien.has(pfad) && args.relativerPfad === konfliktdatei;
    const ausloesen = fall !== 'pruefstand' || zielIstPruefstand;
    if (befehl === fehlerbefehle[fall] && ausloesen) throw Error(`Fehler ${fall}`);
    if (befehl === 'pruefvorgang_fehler' || befehl === 'pruefvorgang_vollbedarf')
      io.vollbedarf = true;
    return original(befehl, args);
  });
  return { gehalten, original };
}

it.each(
  ['gesetz', 'titel'].flatMap((quelle) =>
    ['vormerken', 'quellabschluss', 'pruefstand', 'nachPruefstand'].map((fall) => [quelle, fall]),
  ),
)('%s unterscheidet echten Fehlerstand %s', async (quelle, fall) => {
  // Neue Modulinstanzen verhindern, dass die Prüfqueue des vorigen Falls beteiligt ist.
  vi.resetModules();
  const speicher = await pruefer();
  speicher.initialisiereMarkierungen();
  const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
  const pfad = quelle === 'gesetz' ? gesetzdatei : titeldatei;
  io.dateien.delete(pfad);
  io.dateien.set('Import.xml', quelle === 'gesetz' ? gesetzXML : titelXML);
  io.dateien.set(konfliktdatei, '<markierungskonflikte pruefstatus="aktuell"/>');
  io.vollbedarf = fall === 'nachPruefstand';
  const { gehalten, original } = installiereFehlerstand(fall, pfad);
  const ergebnis = await importierePfade(['/daten/LexLata/Import.xml']);
  const eintrag = ergebnis.berichtEintraege[0];
  expect(eintrag?.quelle).toBe('Import.xml');
  const text = JSON.stringify(ergebnis);
  expect(text).toContain(
    fall === 'vormerken'
      ? 'nicht vorgemerkt'
      : fall === 'quellabschluss'
        ? 'Prüfabschluss'
        : fall === 'pruefstand'
          ? 'nicht gespeichert'
          : 'wurde gespeichert',
  );
  expect(eintrag?.aktion).toBe(fall === 'vormerken' ? 'nichtUebernommen' : 'neu');
  expect(io.dateien.has(pfad)).toBe(fall !== 'vormerken');
  if (fall === 'nachPruefstand') expect(io.dateien.get(konfliktdatei)).toContain('fehlgeschlagen');
  if (fall === 'pruefstand' || fall === 'nachPruefstand') expect(io.vollbedarf).toBe(true);
  expect(gehalten.size).toBe(0);
  expect(io.banner).not.toHaveBeenCalled();
  io.invoke.mockImplementation(original);
});

it.each([
  ['gesetz', 'erfolg'],
  ['gesetz', 'fehler'],
  ['gesetz', 'geschlossen'],
  ['titel', 'erfolg'],
  ['titel', 'fehler'],
  ['titel', 'geschlossen'],
] as const)(
  '%s-Konflikt: Frist, Reloadfehler und später Abschluss %s bleiben im Overlay',
  async (quelle, ende) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
    const ereignisse = await import('@/lib/persistenz/gesetz/gesetz.index');
    let beenden!: () => void;
    let ablehnen!: (fehler: Error) => void;
    const lauf = new Promise<void>((resolve, reject) => {
      beenden = resolve;
      ablehnen = reject;
    });
    const abmelden =
      quelle === 'gesetz'
        ? ereignisse.beiSpeicherBatchAbgeschlossen(() => lauf)
        : ereignisse.beiNichtamtlicheTitelGeschrieben(() => lauf);
    if (quelle === 'titel')
      io.dateien.set(titeldatei, titelXML.replace('Neuer Titel', 'Alter Titel'));
    io.dateien.set('Import.xml', quelle === 'gesetz' ? gesetzXML : titelXML);
    const importiert = await importierePfade(['/daten/LexLata/Import.xml']);
    expect(importiert.konflikte).toHaveLength(1);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const { act, createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { DateiImportOverlay } =
      await import('@/components/overlays/standard/DateiImportOverlay');
    const container = document.createElement('div');
    const wurzel = createRoot(container);
    const reload = vi.fn(async () => {
      throw Error('Reload verweigert');
    });
    vi.useFakeTimers();
    try {
      await act(async () =>
        wurzel.render(
          createElement(DateiImportOverlay, {
            zustand: { art: 'fertig', ergebnis: importiert },
            onSchliessen: vi.fn(),
            onNeuLaden: reload,
          }),
        ),
      );
      const button = [...container.querySelectorAll('button')].find(
        (b) => b.textContent === 'Ersetzen',
      );
      if (!button) throw Error('Ersetzen fehlt.');
      await act(async () => {
        button.click();
        await vi.advanceTimersByTimeAsync(29_999);
      });
      expect(container.textContent).not.toContain('nach 30 Sekunden nicht bestätigt');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(container.textContent).toContain('nach 30 Sekunden nicht bestätigt');
      expect(container.textContent).toContain('BGB');
      expect(container.textContent).toContain('ersetzt');
      if (quelle === 'gesetz') expect(container.textContent).toContain('Reload verweigert');
      const vorherGeschrieben = io.invoke.mock.calls.filter(
        ([b, args]) =>
          b === 'atomar_datei_schreiben' &&
          args?.relativerPfad === (quelle === 'gesetz' ? gesetzdatei : titeldatei),
      ).length;
      expect(vorherGeschrieben).toBe(1);
      if (ende === 'geschlossen') await act(async () => wurzel.unmount());
      await act(async () => {
        if (ende === 'erfolg') beenden();
        else ablehnen(Error('Später Transportfehler'));
        await vi.advanceTimersByTimeAsync(0);
      });
      if (ende !== 'geschlossen') {
        expect(container.textContent).not.toContain('nach 30 Sekunden nicht bestätigt');
        expect(container.textContent).toContain('ersetzt');
        if (ende === 'fehler')
          expect(container.textContent?.match(/Später Transportfehler/g)).toHaveLength(1);
        if (quelle === 'gesetz') expect(container.textContent).toContain('Reload verweigert');
      }
      expect(
        io.invoke.mock.calls.filter(
          ([b, args]) =>
            b === 'atomar_datei_schreiben' &&
            args?.relativerPfad === (quelle === 'gesetz' ? gesetzdatei : titeldatei),
        ),
      ).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    } finally {
      abmelden();
      if (ende !== 'geschlossen') await act(async () => wurzel.unmount());
      vi.useRealTimers();
    }
  },
);

it('behält den tatsächlichen Sicherungspfad der beschädigten Titelbestandsquelle im Gesetzimport', async () => {
  const speicher = await pruefer();
  speicher.initialisiereMarkierungen();
  const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
  io.dateien.delete(gesetzdatei);
  io.dateien.set(titeldatei, '<kaputt>');
  io.wiederholen = true;
  io.dateien.set('Import.xml', gesetzXML);
  const ergebnis = await importierePfade(['/daten/LexLata/Import.xml']);
  expect(ergebnis.berichtEintraege[0]?.aktion).toBe('neu');
  const meldungen = ergebnis.berichtEintraege[0]?.meldungen?.map((m) => m.text).join(' ');
  expect(ergebnis.berichtEintraege[0]?.meldungen).toContainEqual(
    expect.objectContaining({
      grund: 'imDatenordnerGesichert',
      betroffen: titeldatei.split('/').at(-1),
    }),
  );
  expect(meldungen).not.toContain('sicherung.xml');
  expect(io.dateien.get('sicherung.xml')).toBe('<kaputt>');
  expect(io.dateien.has(gesetzdatei)).toBe(true);
  expect(io.banner).not.toHaveBeenCalled();
});

it.each([true, false])(
  'trennt zwei Dateiempfänger und paralleles Nichtimportieren (eigener Empfänger: %s)',
  async (eigenerEmpfaenger) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
    const { speichereGesetz } = await import('@/lib/persistenz/gesetz/gesetz.index');
    const { erzeugeAktionsMeldungsSammlung } = await import('@/lib/domain/app/aktionsMeldung');
    const fremd = erzeugeAktionsMeldungsSammlung();
    const ereignisse = await import('@/lib/persistenz/gesetz/gesetz.index');
    const { erfasseAktionsFolgelauf } = await import('@/lib/domain/app/aktionsMeldung');
    const { meldePersistenzBefund } = await import('@/lib/persistenz/kern/kern.index');
    // Jeder Datei-Import schließt seinen eigenen Sammelbatch ab; der direkte
    // Speichervorgang läuft über den fensterweiten Batch.
    const batchAusloeser: string[][] = [];
    const abmelden = ereignisse.beiSpeicherBatchAbgeschlossen((gesetze, _vorgaenge, ausloeser) => {
      batchAusloeser.push(gesetze.map((g) => g.kurztitel));
      // Ein Batch ohne Meldungsempfänger übergibt keine Auslöser.
      for (const a of ausloeser ??
        gesetze.map((gesetz) => ({ gesetz, meldungEmpfangen: undefined }))) {
        meldePersistenzBefund(
          {
            typ: 'warnung',
            art: 'hinweis',
            anlass: 'pruefabschluss',
            aenderungsstand: 'keine',
            text: `Eigener Befund ${a.gesetz.kurztitel}`,
          },
          a.meldungEmpfangen,
        );
        if (a.gesetz.kurztitel === 'AAA')
          erfasseAktionsFolgelauf(a.meldungEmpfangen, Promise.reject(Error('Nur AAA abgelehnt')));
      }
    });
    try {
      const xml = (name: string) => gesetzXML.replaceAll('BGB', name);
      io.dateien.set('a.xml', xml('AAA'));
      io.dateien.set('b.xml', xml('BBB'));
      const [a, b] = await Promise.all([
        importierePfade(['/daten/LexLata/a.xml']),
        importierePfade(['/daten/LexLata/b.xml']),
        speichereGesetz({ kurztitel: 'CCC', normgeber: 'de-bund' }, xml('CCC'), {
          inhaltGeaendert: true,
          meldungEmpfangen: eigenerEmpfaenger ? fremd.meldungEmpfangen : undefined,
        }),
      ]);
      await fremd.warteAufAbschluss(30_000);
      await ereignisse.warteAufSpeicherBatchAbschluss();
      expect(batchAusloeser.flat().sort()).toEqual(['AAA', 'BBB', 'CCC']);
      expect(batchAusloeser).toContainEqual(['AAA']);
      expect(batchAusloeser).toContainEqual(['BBB']);
      expect(a.berichtEintraege[0]?.aktion).toBe('neu');
      expect(b.berichtEintraege[0]?.aktion).toBe('neu');
      expect(a.berichtEintraege[0]?.quelle).toBe('a.xml');
      expect(b.berichtEintraege[0]?.quelle).toBe('b.xml');
      const aText = JSON.stringify(a);
      const bText = JSON.stringify(b);
      expect(aText).toContain('Eigener Befund AAA');
      expect(aText).toContain('Nur AAA abgelehnt');
      expect(aText).not.toContain('Eigener Befund BBB');
      expect(aText).not.toContain('Eigener Befund CCC');
      expect(bText).toContain('Eigener Befund BBB');
      expect(bText).not.toContain('AAA abgelehnt');
      expect(bText).not.toContain('Eigener Befund CCC');
      expect(fremd.meldungen().map((m) => m.text)).toEqual(
        eigenerEmpfaenger ? ['Eigener Befund CCC'] : [],
      );
      for (const name of ['AAA', 'BBB', 'CCC'])
        expect(io.dateien.has(`gesetze/${name}_de-bund.xml`)).toBe(true);
      expect(
        io.invoke.mock.calls.filter(
          ([befehl]) => befehl === 'pruefvorgang_teilpruefung_abschliessen',
        ).length,
      ).toBeGreaterThanOrEqual(3);
      if (eigenerEmpfaenger) expect(io.banner).not.toHaveBeenCalled();
      else {
        expect(io.banner).toHaveBeenCalledTimes(1);
        expect(io.banner.mock.calls[0]?.[0]?.text).toBe('Eigener Befund CCC');
      }
    } finally {
      abmelden();
    }
  },
);

it.each(['nichtEntfernt', 'fehlgeschlagen'] as const)(
  'berichtet Titelbestandssicherung %s mit Quelle und bewahrtem Gesetz',
  async (fall) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
    io.dateien.delete(gesetzdatei);
    io.dateien.set(titeldatei, '<kaputt>');
    io.dateien.set('Import.xml', gesetzXML);
    io.wiederholen = true;
    const original = erwarteVorhanden(io.invoke.getMockImplementation());
    io.invoke.mockImplementation(async (befehl, args = {}) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        if (fall === 'fehlgeschlagen') throw Error('Sicherung verweigert');
        return {
          status: 'gesichert_aber_nicht_entfernt',
          sicherungspfad: 'nichtamtliche-titel/BGB-Sicherung.xml',
        };
      }
      return original(befehl, args);
    });
    const ergebnis = await importierePfade(['/daten/LexLata/Import.xml']);
    const bericht = ergebnis.berichtEintraege[0];
    expect(bericht?.aktion).toBe('neu');
    const meldungen = bericht?.meldungen?.map((m) => m.text).join(' ');
    expect(bericht?.meldungen).toContainEqual(
      expect.objectContaining({
        grund: fall === 'fehlgeschlagen' ? 'sicherungFehlgeschlagen' : 'gesichertNichtEntfernt',
        betroffen: titeldatei.split('/').at(-1),
      }),
    );
    expect(meldungen).toContain(fall === 'fehlgeschlagen' ? 'nicht gesichert' : 'nicht entfernt');
    expect(meldungen).not.toContain('BGB-Sicherung.xml');
    expect(io.dateien.has(gesetzdatei)).toBe(true);
    expect(io.dateien.get(titeldatei)).toBe('<kaputt>');
    expect(io.banner).not.toHaveBeenCalled();
  },
);
