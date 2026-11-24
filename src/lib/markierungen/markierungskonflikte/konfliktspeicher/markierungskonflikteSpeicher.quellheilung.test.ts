// Integriert die begrenzte Quellheilung mit echten Gesetz-, Titel- und Markierungsladern,
// Vorabpflicht und Inhaltsvergleich; nur native Dateioperationen sind ersetzt.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emitTo } from '@tauri-apps/api/event';

const { dateien, unlesbar, unlesbarEinmal, invoke } = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  unlesbar: new Set<string>(),
  unlesbarEinmal: new Set<string>(),
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => {}) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (pfad: string) => {
    const relativ = pfad.replace('/daten/LexLata/', '');
    if (unlesbarEinmal.delete(relativ)) throw new Error('Vorübergehend unlesbar');
    if (unlesbar.has(relativ)) throw new Error('Zugriff verweigert');
    const inhalt = dateien.get(relativ);
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  }),
  exists: vi.fn(async (pfad: string) => dateien.has(pfad.replace('/daten/LexLata/', ''))),
  mkdir: vi.fn(),
  readDir: async (ordner: string) =>
    [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(ordner.replace('/daten/LexLata/', '') + '/'))
      .map((pfad) => ({ name: pfad.split('/').at(-1), isDirectory: false })),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  dateien.clear();
  unlesbar.clear();
  unlesbarEinmal.clear();
});

afterEach(() => vi.useRealTimers());

function erwarteterFehlername(quelltyp: string, ausgang: string): string {
  if (ausgang === 'unlesbar')
    return quelltyp === 'titel amtlich' ? 'KonfliktquellenPruefungFehler' : 'Error';
  if (quelltyp === 'gesetz') return 'BeschaedigteGesetzdateiFehler';
  if (quelltyp === 'titel amtlich' || quelltyp.startsWith('gemischt'))
    return 'KonfliktquellenPruefungFehler';
  if (quelltyp.startsWith('titel')) return 'BeschaedigteTiteldateiFehler';
  return 'BeschaedigteMarkierungsdateiFehler';
}

const reparierbaresXML =
  '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos>';

function beschaedigterInhalt(ausgang: string): string {
  if (ausgang === 'reparierbar') return reparierbaresXML;
  return ausgang === 'leer'
    ? '   '
    : ausgang === 'falsch zugeordnet'
      ? '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">Anderes Gesetz</gesetz></infos><inhalt/></nichtamtlicheTitel>'
      : ausgang === 'Parserfehler bei gültiger Wurzel'
        ? '<markierungen><infos><gesetz normgeber="de-bund">Anderes Gesetz</gesetz></infos><inhalt/></markierungen>'
        : '<kaputt>';
}

function erzeugeQuellen(quelltyp: string, ausgang: string) {
  const istTitel = quelltyp.startsWith('titel');
  const archiviert =
    ausgang === 'archiviert' ||
    ausgang === 'falsch zugeordnet' ||
    ausgang === 'Parserfehler bei gültiger Wurzel' ||
    (istTitel && ['leer', 'frisch leer'].includes(ausgang));
  const pfad =
    quelltyp === 'gesetz'
      ? ausgang.includes('reparierbar')
        ? 'gesetze/BGB_de-bund.xml'
        : 'gesetze/BGB_de-bund.xml'
      : istTitel
        ? 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml'
        : 'markierungen/BGB_de-bund-markierungen.xml';
  const original =
    '<markierungskonflikte pruefstatus="aktuell"><gesetz kurztitel="Alt" normgeber="de-bund"/></markierungskonflikte>';
  dateien.set('markierungskonflikte.xml', original);
  const beschaedigt = beschaedigterInhalt(ausgang);
  dateien.set(pfad, beschaedigt);
  if (ausgang === 'unlesbar') unlesbar.add(pfad);
  if (quelltyp.startsWith('gemischt')) {
    dateien.set('gesetze/BGB_de-bund.xml', beschaedigt);
    dateien.set('nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml', beschaedigt);
  }
  if (quelltyp === 'gemischt Zugriff') {
    dateien.set(
      'gesetze/BGB_de-bund.xml',
      '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>',
    );
    unlesbarEinmal.add('gesetze/BGB_de-bund.xml');
  }
  if (istTitel)
    dateien.set(
      'markierungen/BGB_de-bund-markierungen.xml',
      '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
    );
  if (quelltyp === 'titel amtlich')
    dateien.set(
      'gesetze/BGB_de-bund.xml',
      '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Amtlicher Titel</titel><absatz>Text</absatz></norm></inhalt></gesetz>',
    );
  const gueltig =
    quelltyp === 'gesetz'
      ? '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><absatz>Text</absatz></norm></inhalt></gesetz>'
      : istTitel
        ? '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></nichtamtlicheTitel>'
        : '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>';

  return { istTitel, archiviert, pfad, beschaedigt, gueltig };
}

it.each(
  ['markierung', 'gesetz', 'titel', 'titel amtlich', 'gemischt', 'gemischt Zugriff']
    .flatMap((quelltyp) =>
      [
        'archiviert',
        'gesichert_aber_nicht_entfernt',
        'Sicherungsfehler',
        'frisch gültig',
        'Parserfehler bei gültiger Wurzel',
        'leer',
        'frisch leer',
        'falsch zugeordnet',
        'unlesbar',
        'reparierbar',
        'frisch reparierbar',
      ]
        .filter(
          (ausgang) =>
            (quelltyp !== 'gemischt Zugriff' || ausgang === 'archiviert') &&
            (quelltyp === 'markierung' || ausgang !== 'Parserfehler bei gültiger Wurzel') &&
            ((ausgang !== 'leer' && ausgang !== 'frisch leer') ||
              quelltyp === 'gesetz' ||
              quelltyp.startsWith('titel')) &&
            (ausgang !== 'falsch zugeordnet' || quelltyp.startsWith('titel')) &&
            (ausgang !== 'unlesbar' || quelltyp === 'gesetz' || quelltyp.startsWith('titel')) &&
            (!ausgang.includes('reparierbar') || quelltyp === 'gesetz'),
        )
        .flatMap((ausgang) =>
          [
            'Vollprüfung',
            ...(['markierung', 'gesetz', 'titel'].includes(quelltyp) &&
            [
              'archiviert',
              'frisch gültig',
              'gesichert_aber_nicht_entfernt',
              'Sicherungsfehler',
              'unlesbar',
              'reparierbar',
            ].includes(ausgang)
              ? ['Anzeige', 'direkte Verifikation']
              : []),
          ].map((weg) => ({ quelltyp, ausgang, weg, fremdquelle: false })),
        ),
    )
    .concat(
      ['markierung', 'gesetz', 'titel'].flatMap((quelltyp) =>
        ['Anzeige', 'direkte Verifikation'].map((weg) => ({
          quelltyp,
          ausgang: 'archiviert',
          weg,
          fremdquelle: true,
        })),
      ),
    ),
)(
  'führt die begrenzte Quellheilung mit echtem Schutzpfad aus: $quelltyp / $ausgang / $weg / Fremdquelle: $fremdquelle',
  async ({ quelltyp, ausgang, weg, fremdquelle }) => {
    const speicher = await ladeSpeicherMitKette();
    speicher.initialisiereMarkierungen();
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    let konflikteGesperrt = false;
    let verbraucht = false;
    let vollbedarf = false;
    let offeneQuellen = 0;
    let nummer = 0;
    const { archiviert, pfad, beschaedigt, gueltig } = erzeugeQuellen(quelltyp, ausgang);
    const anzeige =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    const auftrag =
      weg === 'Vollprüfung'
        ? speicher.pruefeAlleMarkierungen
        : weg === 'Anzeige'
          ? anzeige.ladeMarkierungskonflikteFuerAnzeige
          : anzeige.verifiziereBekannteKonflikte;
    bereiteAnzeigeQuellenVor(weg, quelltyp, archiviert);
    if (fremdquelle) {
      offeneQuellen = 1;
      dateien.set(
        'markierungskonflikte.xml',
        dateien.get('markierungskonflikte.xml')!.replace('aktuell', 'ausstehend'),
      );
    }
    const sicherungen: string[] = [];
    type Argumente = {
      relativerPfad?: string;
      token?: string;
      inhalt?: string;
      erwarteterInhalt?: string;
      vorgaenge?: string[];
    };
    function bearbeiteSperre(befehl: string, args: Argumente) {
      if (befehl === 'datei_sperre_erwerben') {
        if (args.relativerPfad === 'markierungskonflikte.xml') {
          expect(konflikteGesperrt).toBe(false);
          konflikteGesperrt = true;
          return 'konflikt';
        }
        expect(konflikteGesperrt).toBe(false);
        return 'markierung';
      }
      if (befehl === 'datei_sperre_freigeben') {
        if (args.token === 'konflikt') konflikteGesperrt = false;
        return;
      }
      if (befehl === 'datei_sperre_unterbrechen') {
        expect(konflikteGesperrt).toBe(true);
        konflikteGesperrt = false;
        return;
      }
      if (befehl === 'datei_sperre_fortsetzen') {
        expect(konflikteGesperrt).toBe(false);
        konflikteGesperrt = true;
        return true;
      }
      return undefined;
    }
    function archiviere(args: Argumente) {
      expect(konflikteGesperrt).toBe(false);
      expect(verbraucht).toBe(true);
      const ziel = args.relativerPfad!;
      expect(args.erwarteterInhalt).toBe(dateien.get(ziel));
      if (ausgang === 'Sicherungsfehler') throw Error('Sichern unmöglich');
      if (ausgang === 'frisch reparierbar') {
        dateien.set(ziel, reparierbaresXML);
        return { status: 'veraendert', sicherungspfad: null };
      }
      if (ausgang === 'frisch leer' && dateien.get(ziel) !== '   ') {
        dateien.set(ziel, '   ');
        return { status: 'veraendert', sicherungspfad: null };
      }
      if (ausgang === 'frisch gültig') {
        dateien.set(
          ziel,
          quelltyp.startsWith('gemischt') && ziel.startsWith('gesetze/')
            ? '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>'
            : ziel.startsWith('nichtamtliche-titel/')
              ? '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></nichtamtlicheTitel>'
              : gueltig,
        );
        return { status: 'veraendert', sicherungspfad: null };
      }
      if (weg !== 'Vollprüfung' && archiviert) {
        const stand = dateien.get('markierungskonflikte.xml')!;
        dateien.set(
          'markierungskonflikte.xml',
          stand.replace('<markierungskonflikte ', '<markierungskonflikte inzwischen="frisch" '),
        );
      }
      sicherungen.push(dateien.get(ziel)!);
      dateien.set('sicherung.xml', dateien.get(ziel) ?? '');
      if (archiviert) dateien.delete(ziel);
      return { status: archiviert ? 'archiviert' : ausgang, sicherungspfad: 'sicherung.xml' };
    }
    async function nativeDatei(befehl: string, args: Argumente) {
      if (befehl === 'atomar_datei_schreiben') {
        dateien.set(args.relativerPfad!, args.inhalt!);
        return;
      }
      if (befehl === 'archiviere_beschaedigte_datei') return archiviere(args);
      throw Error(`Unerwarteter Dateiaufruf: ${befehl}`);
    }
    function pruefvorgang(befehl: string, args: Argumente) {
      if (befehl === 'pruefvorgang_quellen_abwarten') {
        expect(konflikteGesperrt).toBe(false);
        if (fremdquelle && offeneQuellen > 0) {
          expect(verbraucht).toBe(false);
          expect(sicherungen).toHaveLength(0);
          offeneQuellen = 0;
        }
        expect(offeneQuellen).toBe(0);
        return;
      }
      expect(konflikteGesperrt).toBe(true);
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
        if (offeneQuellen > 0) throw Error('Quellen sind noch offen.');
        if (!vollbedarf || verbraucht) return false;
        verbraucht = true;
        return true;
      }
      if (befehl === 'pruefvorgang_registrieren') {
        offeneQuellen++;
        return `v${++nummer}`;
      }
      if (
        befehl === 'pruefvorgang_quelle_abschliessen' ||
        (befehl === 'pruefvorgang_fehler' && args.vorgaenge?.length)
      )
        offeneQuellen--;
      if (befehl === 'pruefvorgang_vollbedarf' || befehl === 'pruefvorgang_fehler')
        vollbedarf = true;
      if (befehl === 'pruefvorgang_vollpruefung_abschliessen') {
        vollbedarf = false;
        verbraucht = false;
      }
      return { offeneQuellen, offenePruefungen: 0, vollbedarf };
    }
    invoke.mockImplementation(async (befehl: string, args: Argumente) => {
      if (befehl.startsWith('datei_sperre_')) return bearbeiteSperre(befehl, args);
      if (befehl.startsWith('pruefvorgang_')) return pruefvorgang(befehl, args);
      return nativeDatei(befehl, args);
    });
    if (archiviert || ausgang === 'frisch gültig') {
      const ergebnis = await auftrag();
      pruefeFrischeAnzeige(weg, quelltyp, archiviert, ergebnis);
      expect(dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="aktuell"');
      expect(dateien.get(pfad)).toBe(archiviert ? undefined : gueltig);
      expect(vollbedarf).toBe(false);
      pruefeFrischenGesamtstand(weg, quelltyp, archiviert);
    } else {
      await pruefeAuftragBeiUngeloestemQuellfehler(weg, quelltyp, ausgang, auftrag);
      await speicher.reiheInPruefungsKetteEin(async () => {});
      expect(dateien.get(pfad)).toBe(erwarteterQuellinhalt(ausgang, beschaedigt));
      expect(dateien.get('markierungskonflikte.xml')).toContain('kurztitel="Alt"');
      expect(dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="fehlgeschlagen"');
      expect(verbraucht).toBe(
        weg === 'Vollprüfung' || !['unlesbar', 'reparierbar'].includes(ausgang),
      );
    }
    if (weg !== 'Vollprüfung' && !archiviert && ausgang !== 'frisch gültig') {
      await auftrag().catch(() => undefined);
      await auftrag().catch(() => undefined);
    }
    await vi.runAllTimersAsync();
    await speicher.reiheInPruefungsKetteEin(async () => {});
    const quellenzahl =
      quelltyp === 'gemischt Zugriff' ? 2 : quelltyp.startsWith('gemischt') ? 3 : 1;
    expect(sicherungen).toHaveLength(
      archiviert || ausgang === 'gesichert_aber_nicht_entfernt' ? quellenzahl : 0,
    );
    const archivaufrufe = invoke.mock.calls.filter(
      ([befehl]) => befehl === 'archiviere_beschaedigte_datei',
    );
    const archivpfade = archivaufrufe.map(([, args]) => args.relativerPfad);
    pruefeArchivversuche(archivpfade, ausgang, quelltyp);
    if (quelltyp.startsWith('gemischt')) expect(archivpfade).toHaveLength(quellenzahl);
    expect(konflikteGesperrt).toBe(false);
    pruefeProtokolliertenHeilungsfehler(quelltyp, ausgang, protokoll);
    protokoll.mockRestore();
  },
);

function pruefeArchivversuche(pfade: string[], ausgang: string, quelltyp: string) {
  const wiederholung = ausgang === 'frisch leer' && quelltyp.startsWith('titel') ? 1 : 0;
  expect(pfade.length - new Set(pfade).size).toBe(wiederholung);
}

function pruefeProtokolliertenHeilungsfehler(
  quelltyp: string,
  ausgang: string,
  protokoll: ReturnType<typeof vi.spyOn>,
): void {
  if (quelltyp === 'gesetz' && ['frisch leer', 'frisch reparierbar'].includes(ausgang)) {
    const status = ausgang === 'frisch leer' ? 'leer' : 'ungueltig';
    expect(protokoll).toHaveBeenCalledWith(
      'Quellheilung fehlgeschlagen:',
      expect.objectContaining({
        heilungsfehler: [
          expect.objectContaining({
            message: `Gesetzquelle nach Sicherung weiterhin ${status}.`,
            cause: expect.objectContaining({ status }),
          }),
        ],
      }),
    );
  }
}

/** Der Anzeigevertrag liefert gespeicherte Fehlerbefunde; Prüfaufträge lehnen ab. */
async function pruefeAuftragBeiUngeloestemQuellfehler(
  weg: string,
  quelltyp: string,
  ausgang: string,
  auftrag: () => Promise<unknown>,
): Promise<void> {
  if (weg === 'Anzeige') {
    const ergebnis = await auftrag();
    expect(ergebnis).toMatchObject({ pruefstatus: 'fehlgeschlagen' });
    expect(ergebnis).toMatchObject({
      gesetze: expect.arrayContaining([
        expect.objectContaining({
          gesetz: expect.objectContaining(gesetzesreferenz({ kurztitel: 'Alt' })),
        }),
        expect.objectContaining({
          gesetz: expect.objectContaining(gesetzesreferenz({ kurztitel: 'BGB' })),
          nichtamtlicheTitelXmlFehlt: true,
        }),
      ]),
    });
  } else {
    await expect(auftrag()).rejects.toMatchObject({
      name: erwarteterAuftragsFehlername(weg, quelltyp, ausgang),
    });
  }
}

it.each(['Anzeige', 'direkte Verifikation'])(
  'schließt einen Anzeige-Quellfehler bei zuvor aktuellem Stand ab: %s',
  async (weg) => {
    const { verifiziereBekannteKonflikte, ladeMarkierungskonflikteFuerAnzeige } =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    const original = bereiteUnlesbareAnzeigequelleVor('aktuell');
    const auftrag =
      weg === 'Anzeige' ? ladeMarkierungskonflikteFuerAnzeige : verifiziereBekannteKonflikte;
    await auftrag().catch(() => undefined);
    expect(dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="fehlgeschlagen"');
    expect(dateien.get('markierungskonflikte.xml')).toContain(original);
    expect(invoke).toHaveBeenCalledWith('pruefvorgang_fehler', expect.anything());
  },
);

it('lädt gespeicherte fehlgeschlagene Befunde auch bei weiterhin unlesbarer Quelle', async () => {
  const { ladeMarkierungskonflikteFuerAnzeige } =
    await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
  bereiteUnlesbareAnzeigequelleVor('fehlgeschlagen');
  await expect(ladeMarkierungskonflikteFuerAnzeige()).resolves.toMatchObject({
    pruefstatus: 'fehlgeschlagen',
    gesetze: [
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
    ],
  });
});

function bereiteUnlesbareAnzeigequelleVor(status: string, vollbedarf = false): string {
  const block =
    '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt" /></gesetz>';
  dateien.set(
    'markierungskonflikte.xml',
    `<markierungskonflikte pruefstatus="${status}">${block}</markierungskonflikte>`,
  );
  const pfad = 'gesetze/BGB_de-bund.xml';
  dateien.set(
    pfad,
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>',
  );
  unlesbar.add(pfad);
  invoke.mockImplementation(
    async (befehl: string, args?: { relativerPfad?: string; inhalt?: string }) => {
      if (befehl === 'datei_sperre_erwerben') return 'konflikt';
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'atomar_datei_schreiben') dateien.set(args!.relativerPfad!, args!.inhalt!);
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return false;
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf };
    },
  );
  return block;
}

it.each(['Anzeige', 'direkte Verifikation'])(
  'erhält bei gescheitertem Statusschreiben den Fehler und alle Daten: %s',
  async (weg) => {
    const anzeige =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    bereiteUnlesbareAnzeigequelleVor('aktuell');
    const original = dateien.get('markierungskonflikte.xml');
    const quellinhalt = dateien.get('gesetze/BGB_de-bund.xml');
    const nativ = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'atomar_datei_schreiben') throw new Error('Statusschreiben unmöglich');
      return nativ(befehl, args);
    });
    const auftrag =
      weg === 'Anzeige'
        ? anzeige.ladeMarkierungskonflikteFuerAnzeige
        : anzeige.verifiziereBekannteKonflikte;
    await expect(auftrag()).rejects.toThrow(
      'Die Gesetze konnten nicht vollständig geladen werden.',
    );
    expect(invoke).toHaveBeenCalledWith('pruefvorgang_fehler', expect.anything());
    expect(dateien.get('markierungskonflikte.xml')).toBe(original);
    expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe(quellinhalt);
    expect(invoke.mock.calls.some(([befehl]) => befehl === 'archiviere_beschaedigte_datei')).toBe(
      false,
    );
  },
);

function bereiteAnzeigeQuellenVor(weg: string, quelltyp: string, archiviert: boolean): void {
  if (weg !== 'Vollprüfung') {
    dateien.set(
      'markierungskonflikte.xml',
      '<markierungskonflikte pruefstatus="aktuell"><gesetz kurztitel="Alt" normgeber="de-bund"/><gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="nichtamtliche-titel-xml-fehlt" /></gesetz></markierungskonflikte>',
    );
    if (quelltyp !== 'gesetz')
      dateien.set(
        'gesetze/BGB_de-bund.xml',
        '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>',
      );
  }
  if (weg !== 'Vollprüfung' && quelltyp === 'gesetz' && archiviert) {
    dateien.set(
      'gesetze/GG_de-bund.xml',
      '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>GG</kurztitel></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><absatz>Text</absatz></norm></inhalt></gesetz>',
    );
    dateien.set(
      'markierungen/GG_de-bund-markierungen.xml',
      '<markierungen version="1"><infos><gesetz normgeber="de-bund">GG</gesetz></infos><inhalt><verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>§ 1 BGB</verweistext><verweisziel><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>§ 1</bezeichnung><verweistextZeichenbereich start="0" ende="7"/><elementstand><textlaenge>4</textlaenge></elementstand></verweisziel></verweisinhalt></verweismarkierung></inhalt></markierungen>',
    );
  }
}

function pruefeFrischeAnzeige(
  weg: string,
  quelltyp: string,
  archiviert: boolean,
  ergebnis: unknown,
): void {
  if (weg === 'Anzeige') {
    expect(ergebnis).toMatchObject({ pruefstatus: 'aktuell' });
    if (quelltyp === 'gesetz' && archiviert)
      expect(ergebnis).toMatchObject({
        gesetze: [
          {
            gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
            eintraege: [
              {
                zielKonflikte: [
                  { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), typ: 'zielGesetzFehlt' },
                ],
              },
            ],
          },
        ],
      });
  }
}

function pruefeFrischenGesamtstand(weg: string, quelltyp: string, archiviert: boolean): void {
  if (weg !== 'Vollprüfung' && archiviert) {
    expect(dateien.get('markierungskonflikte.xml')).toContain('inzwischen="frisch"');
    if (quelltyp === 'gesetz') {
      expect(dateien.get('markierungskonflikte.xml')).toContain('kurztitel="GG"');
      expect(dateien.get('markierungskonflikte.xml')).toContain('ziel-gesetz-fehlt');
    }
  }
}

function erwarteterAuftragsFehlername(weg: string, quelltyp: string, ausgang: string): string {
  return weg !== 'Vollprüfung' && quelltyp !== 'markierung'
    ? 'GesetzquellenPruefungFehler'
    : erwarteterFehlername(quelltyp, ausgang);
}
function erwarteterQuellinhalt(ausgang: string, beschaedigt: string): string {
  if (ausgang === 'frisch reparierbar') return reparierbaresXML;
  return ausgang === 'frisch leer' ? '   ' : beschaedigt;
}

it.each(
  ['Anzeige', 'direkte Verifikation'].flatMap((weg) =>
    [false, true].map((vollbedarf) => ({ weg, vollbedarf })),
  ),
)(
  'beachtet das native Heilungsbudget bei $weg und Vollbedarf $vollbedarf',
  async ({ weg, vollbedarf }) => {
    const anzeige =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    const block = bereiteUnlesbareAnzeigequelleVor('aktuell', vollbedarf);
    const pfad = 'gesetze/BGB_de-bund.xml';
    unlesbar.delete(pfad);
    dateien.set(pfad, '<kaputt>');
    const auftrag =
      weg === 'Anzeige'
        ? anzeige.ladeMarkierungskonflikteFuerAnzeige
        : anzeige.verifiziereBekannteKonflikte;
    for (let nummer = 0; nummer < 3; nummer++) {
      if (weg === 'Anzeige')
        await expect(auftrag()).resolves.toMatchObject({
          pruefstatus: 'fehlgeschlagen',
          gesetze: [
            {
              gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
              fehlendesGesetz: true,
              eintraege: [],
            },
          ],
        });
      else await expect(auftrag()).rejects.toThrow();
    }
    expect(dateien.get(pfad)).toBe('<kaputt>');
    expect(dateien.get('markierungskonflikte.xml')).toContain(block);
    expect(dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="fehlgeschlagen"');
    expect(invoke.mock.calls.some(([befehl]) => befehl === 'archiviere_beschaedigte_datei')).toBe(
      false,
    );
  },
);

it.each(['Anzeige', 'direkte Verifikation'])(
  'beendet erneutes Laden durch den Fehlerstatusbroadcast ohne Folgebroadcast: %s',
  async (weg) => {
    const anzeige =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    const block = bereiteUnlesbareAnzeigequelleVor('aktuell');
    dateien.set(
      'markierungskonflikte.xml',
      dateien
        .get('markierungskonflikte.xml')!
        .replace('<markierungskonflikte ', '<markierungskonflikte erweiterung="erhalten" '),
    );
    const auftrag =
      weg === 'Anzeige'
        ? anzeige.ladeMarkierungskonflikteFuerAnzeige
        : anzeige.verifiziereBekannteKonflikte;
    const nachladen: Promise<unknown>[] = [];
    let broadcasts = 0;
    // Wie der Fensterlistener: die Benachrichtigung reiht einen neuen Ladeauftrag ein.
    // Die Schranke schützt nur den Test vor einer tatsächlichen Endlosschleife.
    vi.mocked(emitTo).mockImplementation(async (_ziel, ereignis) => {
      if (ereignis !== 'markierungskonflikte-geaendert') return;
      broadcasts++;
      if (broadcasts < 4) nachladen.push(auftrag().catch(() => undefined));
    });
    try {
      await auftrag().catch(() => undefined);
      while (nachladen.length > 0) await nachladen.shift();
      expect(broadcasts).toBe(1);
      expect(
        invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben'),
      ).toHaveLength(1);
      expect(invoke.mock.calls.filter(([befehl]) => befehl === 'pruefvorgang_fehler')).toHaveLength(
        2,
      );
      expect(dateien.get('markierungskonflikte.xml')).toContain(block);
      expect(dateien.get('markierungskonflikte.xml')).toContain('erweiterung="erhalten"');
      expect(dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="fehlgeschlagen"');
    } finally {
      vi.mocked(emitTo).mockResolvedValue(undefined);
    }
  },
);

it('lässt eine unlesbare Konfliktdatei trotz gespeicherten Fehlerstatus als echten Ladefehler bestehen', async () => {
  const { ladeMarkierungskonflikteFuerAnzeige } =
    await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
  bereiteUnlesbareAnzeigequelleVor('fehlgeschlagen');
  const gespeichert = dateien.get('markierungskonflikte.xml');
  unlesbar.add('markierungskonflikte.xml');
  await expect(ladeMarkierungskonflikteFuerAnzeige()).rejects.toThrow('Zugriff verweigert');
  expect(dateien.get('markierungskonflikte.xml')).toBe(gespeichert);
});

it.each(['<konflikt typ="gesetz-fehlt" zusatz="erhalten" />', '<konflikt typ="gesetz-fehlt"   />'])(
  'erhält gespeicherten gesetzFehlt bei zulässigem erweiterten Konflikttag: %s',
  async (konflikt) => {
    const { ladeMarkierungskonflikteFuerAnzeige } =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    bereiteUnlesbareAnzeigequelleVor('fehlgeschlagen');
    const gespeichert = `<markierungskonflikte pruefstatus="fehlgeschlagen"><gesetz kurztitel="BGB" normgeber="de-bund">${konflikt}</gesetz></markierungskonflikte>`;
    dateien.set('markierungskonflikte.xml', gespeichert);
    await expect(ladeMarkierungskonflikteFuerAnzeige()).resolves.toMatchObject({
      pruefstatus: 'fehlgeschlagen',
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    });
    expect(dateien.get('markierungskonflikte.xml')).toBe(gespeichert);
    expect(invoke).toHaveBeenCalledWith('pruefvorgang_fehler', expect.anything());
  },
);

it.each(
  ['gesetz', 'titel', 'markierung'].flatMap((quelltyp) =>
    ['archiviert', 'gesichert_aber_nicht_entfernt', 'Sicherungsfehler'].map((ausgang) => ({
      quelltyp,
      ausgang,
    })),
  ),
)(
  'Quellheilung für $quelltyp / $ausgang erhält Befund und Quelle am Auftragsempfänger',
  async ({ quelltyp, ausgang }) => {
    vi.resetModules();
    const speicher = await ladeSpeicherMitKette();
    speicher.initialisiereMarkierungen();
    const { pfad, beschaedigt } = erzeugeQuellen(quelltyp, ausgang);
    let wiederholungVerbraucht = false;
    invoke.mockImplementation(
      async (befehl: string, args?: { relativerPfad: string; inhalt: string }) => {
        if (befehl === 'datei_sperre_erwerben') return 'token';
        if (befehl === 'datei_sperre_fortsetzen') return true;
        if (befehl === 'datei_sperre_freigeben' || befehl === 'pruefvorgang_quellen_abwarten')
          return;
        if (befehl === 'pruefvorgang_registrieren') return 'quelle';
        if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
          const uebernommen = !wiederholungVerbraucht;
          wiederholungVerbraucht = true;
          return uebernommen;
        }
        if (befehl === 'atomar_datei_schreiben') {
          dateien.set(args!.relativerPfad, args!.inhalt);
          return;
        }
        if (befehl === 'archiviere_beschaedigte_datei') {
          if (ausgang === 'Sicherungsfehler') throw new Error('Sichern unmöglich');
          dateien.set('sicherung.xml', dateien.get(args!.relativerPfad) ?? '');
          if (ausgang === 'archiviert') dateien.delete(args!.relativerPfad);
          return { status: ausgang, sicherungspfad: 'sicherung.xml' };
        }
        return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
      },
    );
    const quellen = await import('@/test/tabs/gesetzSpeicherTestzugang');
    const markierungen = await import('@/lib/markierungen/eintrag/eintrag.index');
    const empfangen = vi.fn();
    const auftrag = speicher.reiheInPruefungsKetteEin(
      async () => {
        if (quelltyp === 'gesetz') await quellen.ladeAlleGesetzeFuerPruefung();
        else if (quelltyp === 'titel')
          await quellen.ladeNichtamtlicheTitelFuerPruefung(gesetzesreferenz({ kurztitel: 'BGB' }));
        else await markierungen.ladeEintraegeFuerPruefung(gesetzesreferenz({ kurztitel: 'BGB' }));
      },
      true,
      true,
      true,
      false,
      empfangen,
    );
    if (ausgang === 'archiviert') await auftrag;
    else await expect(auftrag).rejects.toThrow();
    expect(empfangen).toHaveBeenCalledWith(
      expect.objectContaining({
        art:
          ausgang === 'Sicherungsfehler' || (quelltyp === 'markierung' && ausgang !== 'archiviert')
            ? 'fehler'
            : 'hinweis',
        anlass: 'sicherung',
        aenderungsstand: ausgang === 'Sicherungsfehler' ? 'keine' : 'teilweise',
      }),
    );
    if (ausgang === 'archiviert') expect(dateien.has(pfad)).toBe(false);
    else expect(dateien.get(pfad)).toBe(beschaedigt);
    await vi.runAllTimersAsync();
  },
);

it('bereinigt Befunde vor der vollständigen Konfliktprüfung und entfernt überholte Konfliktkennungen', async () => {
  vi.resetModules();
  const speicher = await ladeSpeicherMitKette();
  speicher.initialisiereMarkierungen();
  const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
  const original =
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><textstelle/><kommentartext>verworfen</kommentartext></kommentar><kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 2</bezeichnung><kommentartext>lesbar</kommentartext></kommentar></inhalt></markierungen>';
  dateien.set(pfad, original);
  dateien.set(
    'markierungskonflikte.xml',
    '<markierungskonflikte version="1" pruefstatus="aktuell"><gesetz kurztitel="BGB" normgeber="de-bund"><kommentar><bezeichnung>§ 1</bezeichnung><kommentartext>verworfen</kommentartext><konflikt typ="pauschaler-bezug-fehlt" /></kommentar></gesetz></markierungskonflikte>',
  );
  let wiederholung = false;
  invoke.mockImplementation(
    async (
      befehl: string,
      args: { relativerPfad: string; inhalt: string; erwarteterInhalt: string },
    ) => {
      if (befehl === 'datei_sperre_erwerben') return 'token';
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'datei_sperre_freigeben' || befehl === 'pruefvorgang_quellen_abwarten') return;
      if (befehl === 'pruefvorgang_registrieren') return 'vorgang';
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
        const erlaubt = !wiederholung;
        wiederholung = true;
        return erlaubt;
      }
      if (befehl === 'archiviere_beschaedigte_datei') {
        expect(args.erwarteterInhalt).toBe(original);
        dateien.set('befunde.bak', original);
        dateien.delete(args.relativerPfad);
        return { status: 'archiviert', sicherungspfad: 'befunde.bak' };
      }
      if (befehl === 'atomar_datei_schreiben') {
        dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    },
  );
  const empfangen = vi.fn();
  await speicher.pruefeAlleMarkierungen(empfangen);
  await vi.runAllTimersAsync();
  expect(dateien.get('befunde.bak')).toBe(original);
  expect(dateien.get(pfad)).toContain('<kommentartext>lesbar</kommentartext>');
  expect(dateien.get(pfad)).not.toContain('verworfen');
  const konflikte = dateien.get('markierungskonflikte.xml');
  expect(konflikte).toContain('pruefstatus="aktuell"');
  expect(konflikte).not.toContain('verworfen');
  expect(konflikte).not.toContain('<bezeichnung>§ 1</bezeichnung>');
  expect(konflikte).toContain('gesetz-fehlt');
  expect(empfangen.mock.calls.filter(([meldung]) => meldung.anlass === 'sicherung')).toHaveLength(
    1,
  );
  expect(
    invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
});

it('prüft den unveränderten importierten Beispielbestand beim App-Start ohne Quellenfehler', async () => {
  vi.resetModules();
  const { readFileSync } = await import('node:fs');
  const speicher = await ladeSpeicherMitKette();
  speicher.initialisiereMarkierungen();
  for (const [quelle, ziel] of [
    ['mkh-gesetz.xml', 'gesetze/MKH_de-bund.xml'],
    ['mkn-gesetz.xml', 'gesetze/MKN_de-bund.xml'],
    ['mkh-nichtamtliche-titel.xml', 'nichtamtliche-titel/MKH_de-bund-nichtamtliche-titel.xml'],
    ['mkh-markierungen.xml', 'markierungen/MKH_de-bund-markierungen.xml'],
    ['mkn-markierungen.xml', 'markierungen/MKN_de-bund-markierungen.xml'],
    ['mkf-markierungen.xml', 'markierungen/MKF_de-bund-markierungen.xml'],
  ] as const)
    dateien.set(ziel, readFileSync(`docs/doku/testdaten/${quelle}`, 'utf8'));
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'datei_sperre_erwerben') return 'token';
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'atomar_datei_schreiben') {
        dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return false;
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    },
  );
  const empfangen = vi.fn();
  await speicher.pruefeErforderlicheVollpruefung(empfangen);
  expect(dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="aktuell"');
  expect(empfangen).not.toHaveBeenCalled();
});

it('benennt fremde Dateizuordnung im Prüfhinweis und archiviert die Quelle ohne Übernahme', async () => {
  vi.resetModules();
  const speicher = await ladeSpeicherMitKette();
  speicher.initialisiereMarkierungen();
  const pfad = 'markierungen/MKN_de-bund-markierungen.xml';
  const original =
    '<markierungen><infos><gesetz normgeber="de-bund">MKH</gesetz></infos><inhalt/></markierungen>';
  dateien.set(pfad, original);
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.set(pfad + '.bak', original);
        dateien.delete(pfad);
        return { status: 'archiviert', sicherungspfad: pfad + '.bak' };
      }
      if (befehl === 'datei_sperre_erwerben') return 'token';
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'atomar_datei_schreiben') {
        dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return false;
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    },
  );
  const empfangen = vi.fn();
  await speicher.pruefeAlleMarkierungen(empfangen);
  await vi.runAllTimersAsync();
  const texte = empfangen.mock.calls.map(([meldung]) => meldung.text).join(' ');
  expect(texte).toContain('MKN_de-bund-markierungen.xml');
  expect(texte).not.toContain(pfad);
  expect(texte).toContain('Erwartet: MKN (de-bund); enthalten: MKH (de-bund).');
  expect(texte).not.toContain('konnte nicht gespeichert werden');
  expect(dateien.get(pfad)).toBeUndefined();
  expect(dateien.get(pfad + '.bak')).toBe(original);
  expect(
    invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
});

async function ladeSpeicherMitKette() {
  const [speicher, kette] = await Promise.all([
    import('./markierungskonflikteSpeicher'),
    import('./markierungskonflikteSpeicher.pruefkette'),
  ]);
  return { ...speicher, reiheInPruefungsKetteEin: kette.reiheInPruefungsKetteEin };
}
