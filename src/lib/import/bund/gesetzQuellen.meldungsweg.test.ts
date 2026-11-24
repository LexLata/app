// Echte Dispatch-/Bund-/BW-Quellenketten bis Gesetz-/Titelpersistenz; native I/O und Netzwerk ersetzt.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  erfasseAktionsFolgelauf,
  erzeugeAktionsMeldungsSammlung,
  type AktionsMeldung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { dateiAttrappen, gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import {
  aktualisiereGesetz,
  importiereGesetze,
  importiereGesetzesreferenz,
} from '@/lib/import/import.index';
import { aktualisierungVomInternet, importiereVomInternet } from './gesetzImportBund';
import {
  speichereVerweismarkierung,
  versucheFehlendeGesetzeImportieren,
} from '@/lib/markierungen/markierungen.index';
import {
  aktualisierungGesetzVomInternetBW,
  importiereGesetzVomInternetBW,
} from '@/lib/import/bw/bw.index';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  fetch: vi.fn(),
  banner: vi.fn(),
  vormerken: vi.fn(),
  abschliessen: vi.fn(),
  euFehler: false,
  gesetzOrdnerFehler: false,
  gesetzOrdnerFehlerNachSchreiben: false,
  frischerFremdBefund: false,
  archivstatus: null as null | 'archiviert' | 'gesichert_aber_nicht_entfernt',
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn() }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: io.banner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => {
  const basis = dateiAttrappen(io.dateien, async (pfad) => {
    const inhalt = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  });
  return {
    ...basis,
    readDir: async (pfad: string) => {
      if (pfad === 'resources/europa' && io.euFehler) throw new Error('EU-Verzeichnis');
      if (pfad.endsWith('/gesetze') && io.gesetzOrdnerFehler) throw new Error('Gesetzordner');
      const eintraege = await basis.readDir(pfad);
      return eintraege.map((eintrag) => ({ ...eintrag, isFile: true }));
    },
  };
});
const bundXML =
  '<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Ein erster Satz. Siehe § 1. Weiterer Satz.</P></Content></text></textdaten></norm></dokumente>';
const bwHTML =
  '<html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000</title><meta charset="utf-8"></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1 Titel</h4><p>Ein erster Satz. Siehe § 1. Weiterer Satz.</p></div></body></html>';
const quellen = [
  {
    normgeber: 'de-bund',
    importieren: importiereVomInternet,
    aktualisieren: aktualisierungVomInternet,
  },
  {
    normgeber: 'de-bw',
    importieren: importiereGesetzVomInternetBW,
    aktualisieren: aktualisierungGesetzVomInternetBW,
  },
] as const;
const pruefempfaenger = { vormerken: io.vormerken, abschliessen: io.abschliessen };
let meldungen: AktionsMeldung[];
const empfangen = (meldung: AktionsMeldung) => meldungen.push(meldung);
function schreiben() {
  return io.invoke.mock.calls.filter(
    ([name, args]) =>
      name === 'atomar_datei_schreiben' && args.relativerPfad.startsWith('gesetze/'),
  );
}
function schreibeAttrappenDatei(args: { relativerPfad: string; inhalt: string }) {
  io.dateien.set(args.relativerPfad, args.inhalt);
  if (!args.relativerPfad.startsWith('gesetze/')) return;
  if (io.gesetzOrdnerFehlerNachSchreiben) io.gesetzOrdnerFehler = true;
  if (io.frischerFremdBefund) io.dateien.set('gesetze/Frisch_de-sn.xml', 'kaputt');
}
function titelScheitert(normgeber: string, sperrfehler = 'wartefrist') {
  io.dateien.set(
    `resources/nichtamtliche-titel/${normgeber.toLowerCase()}/TestG.xml`,
    '<nichtamtlicheTitel/>',
  );
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (name: string, args: { relativerPfad: string }) => {
    if (
      name === 'datei_sperre_erwerben' &&
      args.relativerPfad.startsWith('nichtamtliche-titel/') &&
      args.relativerPfad.toLowerCase().includes(`_${normgeber.toLowerCase()}`)
    )
      throw sperrfehler;
    return original(name, args);
  });
}
async function vorhandenes(quelle: (typeof quellen)[number]): Promise<GesetzDarstellung> {
  const ergebnis = await quelle.importieren('testg', undefined, undefined, undefined, empfangen);
  if (ergebnis.art !== 'erfolg') throw new Error(JSON.stringify(ergebnis));
  meldungen = [];
  io.banner.mockClear();
  io.invoke.mockClear();
  return ergebnis.gesetz;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  io.dateien.clear();
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  io.euFehler = false;
  io.gesetzOrdnerFehler = false;
  io.gesetzOrdnerFehlerNachSchreiben = false;
  io.frischerFremdBefund = false;
  io.archivstatus = null;
  meldungen = [];
  registrierePruefpflichtigeAenderung(pruefempfaenger);
  io.vormerken.mockResolvedValue('vorgang');
  io.abschliessen.mockResolvedValue(undefined);
  for (const [kategorie, datenquellenname] of [
    ['de-bund', 'gesetze-im-internet.de'],
    ['de-bw', 'landesrecht-bw.de'],
  ]) {
    io.dateien.set(
      `importindizes/${kategorie}.xml`,
      `<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>${kategorie}</normgeber><datenquelle name="${datenquellenname}"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>TestG</abrufkennung></gesetz></inhalt></importindex>`,
    );
  }
  io.fetch.mockImplementation(async () => ({
    ok: true,
    arrayBuffer: async () => zipSync({ 'gesetz.xml': strToU8(bundXML) }).buffer,
  }));
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === 'lade_gesetz_html_bw') return bwHTML;
      if (name === 'import_aktualisierung_starten') return 'importvorgang';
      if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
      if (name === 'gesetz_import_sperre_freigeben' || name === 'import_aktualisierung_beenden')
        return;
      if (name === 'archiviere_beschaedigte_datei' && io.archivstatus) {
        io.dateien.set(`${args.relativerPfad}.sicherung`, io.dateien.get(args.relativerPfad)!);
        if (io.archivstatus === 'archiviert') io.dateien.delete(args.relativerPfad);
        return { status: io.archivstatus, sicherungspfad: `${args.relativerPfad}.sicherung` };
      }
      if (name === 'gesetz_dateistempel_lesen') {
        if (io.gesetzOrdnerFehler) throw new Error('Ordnerfehler');
        return gesetzDateistempelAttrappe(io.dateien);
      }
      if (name === 'datei_sperre_erwerben') return 'token';
      if (name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        schreibeAttrappenDatei(args);
        return;
      }
      throw new Error(`Unerwarteter Aufruf: ${name}`);
    },
  );
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});
it.each(quellen)(
  '$normgeber importiert ohne unbetroffene beschädigte Dateien anzufassen',
  async ({ importieren }) => {
    io.dateien.set('gesetze/Fremd_de-bund.xml', 'kaputt');
    expect(await importieren('testg', undefined, undefined, undefined, empfangen)).toMatchObject({
      art: 'erfolg',
    });
    expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
    expect(io.banner).not.toHaveBeenCalled();
    expect(schreiben()).toHaveLength(1);
  },
);
it.each(quellen)(
  '$normgeber meldet abgewiesenen Prüfbedarf und schreibt nichts',
  async ({ importieren }) => {
    io.vormerken.mockRejectedValueOnce(new Error('Prüfbedarf'));
    expect(await importieren('testg', undefined, undefined, undefined, empfangen)).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'speichern' },
    });
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler' }),
    );
    expect(schreiben()).toHaveLength(0);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each(quellen)(
  '$normgeber erhält Importerfolg bei offenem Prüfabschluss',
  async ({ importieren }) => {
    io.abschliessen.mockRejectedValueOnce(new Error('Abschluss'));
    expect(await importieren('testg', undefined, undefined, undefined, empfangen)).toMatchObject({
      art: 'erfolg',
    });
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each(quellen)(
  '$normgeber erhält gespeicherten Import bei Titel-Folgefehler ohne weiteren Write',
  async ({ importieren, normgeber }) => {
    titelScheitert(normgeber);
    expect(await importieren('testg', undefined, undefined, undefined, empfangen)).toMatchObject({
      art: 'erfolg',
    });
    expect(meldungen).toContainEqual(
      expect.objectContaining({
        anlass: 'synchronisation',
        art: 'hinweis',
        text: expect.stringContaining('gespeichert'),
      }),
    );
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each(quellen)(
  '$normgeber erhält unveränderte Aktualisierung bei Titel-Folgefehler',
  async (quelle) => {
    const gesetz = await vorhandenes(quelle);
    titelScheitert(quelle.normgeber);
    const fortschritt = vi.fn();
    const ergebnis = await quelle.aktualisieren(gesetz, fortschritt, undefined, empfangen);
    expect(ergebnis).toMatchObject({ art: 'erfolg', kategorie: 'unveraendert' });
    if (ergebnis.art !== 'erfolg') throw new Error('Erfolg erwartet');
    expect(ergebnis.gesetz.elemente).toBe(gesetz.elemente);
    expect(meldungen).toContainEqual(
      expect.objectContaining({
        anlass: 'synchronisation',
        text: expect.stringContaining('Prüfzeitpunkt'),
      }),
    );
    expect(fortschritt).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'fertig' }));
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each(quellen)(
  '$normgeber erhält geänderte Aktualisierung und offenen Prüfabschluss',
  async (quelle) => {
    const gesetz = await vorhandenes(quelle);
    const pfad = `gesetze/TestG_${quelle.normgeber}.xml`;
    io.dateien.set(pfad, io.dateien.get(pfad)!.replace('Weiterer Satz.', 'Alter Satz.'));
    io.abschliessen.mockRejectedValueOnce(new Error('Abschluss'));
    expect(await quelle.aktualisieren(gesetz, undefined, undefined, empfangen)).toMatchObject({
      art: 'erfolg',
      kategorie: 'aktualisiert',
    });
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(io.dateien.get(pfad)).toContain('Weiterer Satz.');
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each(quellen)(
  '$normgeber liefert echte Referenzdiagnosen beim Import an seinen Vorgang',
  async ({ importieren }) => {
    io.euFehler = true;
    expect(await importieren('testg', undefined, undefined, undefined, empfangen)).toMatchObject({
      art: 'erfolg',
    });
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0]!.text).toContain('EU-Verzeichnis');
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each(quellen)(
  '$normgeber erhält bisherigen Hauptfensterstandard',
  async ({ importieren, normgeber }) => {
    titelScheitert(normgeber);
    expect(await importieren('testg')).toMatchObject({ art: 'erfolg' });
    expect(io.banner).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('gespeichert') }),
    );
    expect(schreiben()).toHaveLength(1);
  },
);
it('trennt parallele echte Quellenimporte und deren Referenzdiagnosen', async () => {
  io.euFehler = true;
  io.dateien.delete('importindizes/de-bund.xml');
  // BW findet weiterhin seinen Index, beim Tagging fehlt zusätzlich der Bundesindex.
  const bund: AktionsMeldung[] = [];
  const bw: AktionsMeldung[] = [];
  const ergebnisse = await Promise.all([
    importiereVomInternet('testg', undefined, undefined, undefined, (m) => bund.push(m)),
    importiereGesetzVomInternetBW('testg', undefined, undefined, undefined, (m) => bw.push(m)),
  ]);
  expect(ergebnisse[0]).toMatchObject({ art: 'fehler', fehler: { grund: 'format' } });
  expect(ergebnisse[1]).toMatchObject({ art: 'erfolg' });
  expect(bund).toEqual([]);
  expect(bw).toHaveLength(1);
  expect(bw[0]!.text).toContain('de-bund:');
  expect(bw[0]!.text).toContain('eu:');
  expect(io.banner).not.toHaveBeenCalled();
});

it.each(quellen)(
  '$normgeber erhält Referenzdiagnosen bei unveränderter Aktualisierung',
  async (quelle) => {
    const gesetz = await vorhandenes(quelle);
    io.euFehler = true;
    expect(await quelle.aktualisieren(gesetz, undefined, undefined, empfangen)).toMatchObject({
      art: 'erfolg',
      kategorie: 'unveraendert',
    });
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0]!.text).toContain('EU-Verzeichnis');
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
for (const status of ['archiviert', 'gesichert_aber_nicht_entfernt'] as const) {
  it.each(quellen)(
    `$normgeber berührt fremde Dateien auch bei Sicherungsmodus ${status} nicht`,
    async ({ importieren }) => {
      io.archivstatus = status;
      io.dateien.set('gesetze/Fremd_de-bund.xml', 'kaputt');
      expect(await importieren('testg', undefined, undefined, undefined, empfangen)).toMatchObject({
        art: 'erfolg',
      });
      expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
      expect(io.dateien.has('gesetze/Fremd_de-bund.xml.sicherung')).toBe(false);
      expect(io.dateien.has('gesetze/Fremd_de-bund.xml')).toBe(true);
      expect(schreiben()).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );
}
it('trennt parallele erfolgreiche Quellenimporte mit eigenen Titel-Folgefehlern', async () => {
  for (const quelle of quellen)
    io.dateien.set(
      `resources/nichtamtliche-titel/${quelle.normgeber.toLowerCase()}/TestG.xml`,
      '<nichtamtlicheTitel/>',
    );
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (name: string, args: { relativerPfad: string }) => {
    if (name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('nichtamtliche-titel/'))
      throw new Error(args.relativerPfad);
    return original(name, args);
  });
  const bund: AktionsMeldung[] = [];
  const bw: AktionsMeldung[] = [];
  const ergebnisse = await Promise.all([
    importiereVomInternet('testg', undefined, undefined, undefined, (m) => bund.push(m)),
    importiereGesetzVomInternetBW('testg', undefined, undefined, undefined, (m) => bw.push(m)),
  ]);
  expect(ergebnisse.every((ergebnis) => ergebnis.art === 'erfolg')).toBe(true);
  expect(bund.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
  expect(bw.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
  expect(bund.find((m) => m.anlass === 'synchronisation')!.text).toContain('testg_de-bund');
  expect(bund.find((m) => m.anlass === 'synchronisation')!.text).not.toContain('testg_de-bw');
  expect(bw.find((m) => m.anlass === 'synchronisation')!.text).toContain('testg_de-bw');
  expect(bw.find((m) => m.anlass === 'synchronisation')!.text).not.toContain('testg_de-bund');
  expect(schreiben()).toHaveLength(2);
  expect(io.banner).not.toHaveBeenCalled();
});

describe('Hilfsfensterreichbarer Dispatch mit echtem Quellen-/Speicherabschluss', () => {
  it.each(quellen)(
    '$normgeber lässt unbetroffene Dateien auch beim Dispatch unverändert',
    async (quelle) => {
      io.archivstatus = 'archiviert';
      io.dateien.set('gesetze/Fremd_de-bund.xml', 'kaputt');
      const ergebnis = await importiereGesetze(['testg'], quelle.normgeber, undefined, empfangen);
      expect(ergebnis.erfolgreiche).toHaveLength(1);
      expect(ergebnis.fehlgeschlagene).toEqual([]);
      expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
      expect(io.dateien.has('gesetze/Fremd_de-bund.xml.sicherung')).toBe(false);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );

  it.each(quellen)('$normgeber wahrt Teilimport und offenen Prüfabschluss', async (quelle) => {
    io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
    const ergebnis = await importiereGesetze(
      ['testg', 'FehltG'],
      quelle.normgeber,
      undefined,
      empfangen,
    );
    expect(ergebnis.erfolgreiche.map((g) => g.kurztitel)).toEqual(['TestG']);
    expect(ergebnis.fehlgeschlagene).toMatchObject([
      { kurztitel: 'FehltG', fehler: { grund: 'nichtImIndex' } },
    ]);
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
    expect(io.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', {
      vorgangskennung: 'importvorgang',
    });
  });

  it.each(quellen)('$normgeber schreibt nach abgewiesenem Prüfbedarf nichts', async (quelle) => {
    io.vormerken.mockRejectedValueOnce(new Error('Prüfbedarf'));
    const ergebnis = await importiereGesetze(['testg'], quelle.normgeber, undefined, empfangen);
    expect(ergebnis.erfolgreiche).toEqual([]);
    expect(ergebnis.fehlgeschlagene).toMatchObject([{ fehler: { grund: 'speichern' } }]);
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler' }),
    );
    expect(schreiben()).toHaveLength(0);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it.each(quellen)('$normgeber behält Erfolg bei Titel-Folgefehler', async (quelle) => {
    titelScheitert(quelle.normgeber);
    const ergebnis = await importiereGesetze(['testg'], quelle.normgeber, undefined, empfangen);
    expect(ergebnis.erfolgreiche).toHaveLength(1);
    expect(ergebnis.fehlgeschlagene).toEqual([]);
    expect(meldungen).toContainEqual(
      expect.objectContaining({
        anlass: 'synchronisation',
        text: expect.stringContaining('gespeichert'),
      }),
    );
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it.each(quellen)(
    '$normgeber meldet gemeinsame Referenzdiagnosen des Dispatch',
    async (quelle) => {
      io.euFehler = true;
      const ergebnis = await importiereGesetze(['testg'], quelle.normgeber, undefined, empfangen);
      expect(ergebnis.erfolgreiche).toHaveLength(1);
      expect(meldungen).toHaveLength(1);
      expect(meldungen[0]!.text).toContain('EU-Verzeichnis');
      expect(io.banner).not.toHaveBeenCalled();
    },
  );

  it.each(quellen)(
    '$normgeber bewahrt unveränderten Aktualisierungsstand und Diagnosen',
    async (quelle) => {
      const gesetz = await vorhandenes(quelle);
      titelScheitert(quelle.normgeber);
      io.euFehler = true;
      const ergebnis = await aktualisiereGesetz(gesetz, undefined, empfangen);
      expect(ergebnis).toMatchObject({ art: 'erfolg', kategorie: 'unveraendert' });
      if (ergebnis.art !== 'erfolg') throw new Error('Erfolg erwartet');
      expect(ergebnis.gesetz.elemente).toBe(gesetz.elemente);
      expect(meldungen).toContainEqual(
        expect.objectContaining({
          anlass: 'synchronisation',
          text: expect.stringContaining('Prüfzeitpunkt'),
        }),
      );
      expect(meldungen.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
      expect(schreiben()).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );

  it.each(quellen)(
    '$normgeber erhält geänderten Stand mit offenem Prüfabschluss',
    async (quelle) => {
      const gesetz = await vorhandenes(quelle);
      const pfad = `gesetze/TestG_${quelle.normgeber}.xml`;
      io.dateien.set(pfad, io.dateien.get(pfad)!.replace('Weiterer Satz.', 'Alter Satz.'));
      io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
      expect(await aktualisiereGesetz(gesetz, undefined, empfangen)).toMatchObject({
        art: 'erfolg',
        kategorie: 'aktualisiert',
      });
      expect(meldungen).toContainEqual(
        expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
      );
      expect(io.dateien.get(pfad)).toContain('Weiterer Satz.');
      expect(schreiben()).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );

  it('reicht den Empfänger beim automatischen Bund→BW-Fallback weiter', async () => {
    io.dateien.set(
      'importindizes/de-bund.xml',
      io.dateien
        .get('importindizes/de-bund.xml')!
        .replace('<kurztitel>TestG</kurztitel>', '<kurztitel>AnderesG</kurztitel>'),
    );
    io.euFehler = true;
    io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
    const ergebnis = await importiereGesetze(['testg'], undefined, undefined, empfangen);
    expect(ergebnis.erfolgreiche).toMatchObject([{ normgeber: 'de-bw' }]);
    expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'pruefabschluss' }));
    expect(meldungen.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('trennt parallele Dispatchvorgänge und ihre gespeicherten Titel-Folgefehler', async () => {
    for (const quelle of quellen)
      titelScheitert(quelle.normgeber, `testg_${quelle.normgeber.toLowerCase()}`);
    io.euFehler = true;
    const bund: AktionsMeldung[] = [];
    const bw: AktionsMeldung[] = [];
    const ergebnisse = await Promise.all([
      importiereGesetze(['testg'], 'de-bund', undefined, (m) => bund.push(m)),
      importiereGesetze(['testg'], 'de-bw', undefined, (m) => bw.push(m)),
    ]);
    expect(ergebnisse.every((e) => e.erfolgreiche.length === 1)).toBe(true);
    for (const [befunde, eigener, fremder] of [
      [bund, 'de-bund', 'de-bw'],
      [bw, 'de-bw', 'de-bund'],
    ] as const) {
      const titel = befunde.filter((m) => m.anlass === 'synchronisation');
      expect(titel).toHaveLength(1);
      expect(titel[0]!.text).toContain(`testg_${eigener}`);
      expect(titel[0]!.text).not.toContain(`testg_${fremder}`);
      expect(befunde.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
    }
    expect(schreiben()).toHaveLength(2);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('behält die bisherige Hauptfensteranzeige bei fehlendem Empfänger', async () => {
    io.euFehler = true;
    titelScheitert('de-bund');
    expect((await importiereGesetze(['testg'], 'de-bund')).erfolgreiche).toHaveLength(1);
    expect(io.banner).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('gespeichert') }),
    );
    expect(io.banner).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('EU-Verzeichnis') }),
    );
  });

  it('EU-Bundle erreicht Befunde aus Bestand und gespeichertem Abschluss', async () => {
    io.dateien.set(
      'resources/europa/testg.xml',
      '<gesetz><infos><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><normgeber>eu</normgeber><verarbeitungszeit>2026-10-14T00:00:00Z</verarbeitungszeit></infos><inhalt><norm><bezeichnung>Artikel 1</bezeichnung><absatz>Text</absatz></norm></inhalt></gesetz>',
    );
    io.archivstatus = 'archiviert';
    io.dateien.set('gesetze/Fremd_de-bund.xml', 'kaputt');
    io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
    const ergebnis = await importiereGesetze(
      [{ kurztitel: 'TestG', abrufkennung: 'testg.xml' }],
      'eu',
      undefined,
      empfangen,
    );
    expect(ergebnis.erfolgreiche).toMatchObject([{ normgeber: 'eu' }]);
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('bündelt Referenzdiagnosen paralleler Einzelimporte, ohne Titelbefunde zu verlieren', async () => {
    const index = io.dateien.get('importindizes/de-bund.xml')!;
    const eintrag = index.match(/<gesetz>.*<\/gesetz>/)![0];
    io.dateien.set(
      'importindizes/de-bund.xml',
      index.replace('</inhalt>', `${eintrag.replaceAll('TestG', 'TestH')}</inhalt>`),
    );
    io.fetch.mockImplementation(async (url: string) => ({
      ok: true,
      arrayBuffer: async () =>
        zipSync({
          'gesetz.xml': strToU8(
            url.includes('TestH') ? bundXML.replaceAll('TestG', 'TestH') : bundXML,
          ),
        }).buffer,
    }));
    titelScheitert('de-bund');
    io.dateien.set('resources/nichtamtliche-titel/de-bund/TestH.xml', '<nichtamtlicheTitel/>');
    io.euFehler = true;
    const ergebnis = await importiereGesetze(['testg', 'testh'], 'de-bund', undefined, empfangen);
    expect(ergebnis.erfolgreiche.map((g) => g.kurztitel).sort()).toEqual(['TestG', 'TestH']);
    expect(ergebnis.fehlgeschlagene).toEqual([]);
    expect(meldungen.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
    expect(meldungen.filter((m) => m.anlass === 'synchronisation')).toHaveLength(2);
    expect(schreiben()).toHaveLength(2);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it.each(quellen)(
    '$normgeber meldet echte Schreibfehler weiterhin als Fehlschlag',
    async (quelle) => {
      const original = io.invoke.getMockImplementation()!;
      io.invoke.mockImplementation(async (name: string, args: { relativerPfad: string }) => {
        if (name === 'atomar_datei_schreiben') throw new Error('Schreiben abgewiesen');
        return original(name, args);
      });
      const ergebnis = await importiereGesetze(['testg'], quelle.normgeber, undefined, empfangen);
      expect(ergebnis.erfolgreiche).toEqual([]);
      expect(ergebnis.fehlgeschlagene).toMatchObject([
        {
          fehler: {
            grund: 'speichern',
            meldung: 'Gesetz konnte nicht gespeichert werden: Error: Schreiben abgewiesen',
          },
        },
      ]);
      expect(io.dateien.has(`gesetze/TestG_${quelle.normgeber}.xml`)).toBe(false);
      expect(meldungen.some((m) => m.anlass === 'synchronisation')).toBe(false);
      expect(schreiben()).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );
});

describe('Gesetzesreferenzimport mit echter erster/frischer Bestandsladung und Schreibkette', () => {
  const referenz = { kurztitel: 'testg', normgeber: 'de-bund' };
  it.each(quellen)(
    '$normgeber erhält Titel-Folgefehler und bestätigten Importabschluss',
    async (quelle) => {
      titelScheitert(quelle.normgeber);
      const ergebnis = await importiereGesetzesreferenz(
        { ...referenz, normgeber: quelle.normgeber },
        undefined,
        empfangen,
      );
      expect(ergebnis).toMatchObject({
        art: 'erfolg',
        importergebnis: { erfolgreiche: [{ normgeber: quelle.normgeber }], fehlgeschlagene: [] },
      });
      expect(meldungen).toContainEqual(
        expect.objectContaining({ anlass: 'synchronisation', art: 'hinweis' }),
      );
      expect(schreiben()).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );
  it('meldet ersten unlesbaren Gesetzordner ohne Import oder Speicherung', async () => {
    io.gesetzOrdnerFehler = true;
    const ergebnis = await importiereGesetzesreferenz(referenz, undefined, empfangen);
    expect(ergebnis).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'laden' },
      bestandspruefung: { status: 'nicht-lesbar' },
    });
    expect(ergebnis.importergebnis).toBeUndefined();
    expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'lesen', art: 'fehler' }));
    expect(schreiben()).toHaveLength(0);
    expect(io.fetch).not.toHaveBeenCalled();
    expect(io.banner).not.toHaveBeenCalled();
  });
  it('bewahrt Speicherung bei anschließend unlesbarem Gesetzordner', async () => {
    io.gesetzOrdnerFehlerNachSchreiben = true;
    const ergebnis = await importiereGesetzesreferenz(referenz, undefined, empfangen);
    expect(ergebnis).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'laden' },
      importergebnis: { erfolgreiche: [{ normgeber: 'de-bund' }], fehlgeschlagene: [] },
      ladeabschluss: { status: 'nicht-lesbar' },
    });
    expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'lesen', art: 'fehler' }));
    expect(io.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });
  it.each(['archiviert', 'gesichert_aber_nicht_entfernt'] as const)(
    'bewahrt erste Sicherung (%s) neben echtem Schreibfehler',
    async (status) => {
      io.archivstatus = status;
      io.dateien.set('gesetze/Fremd_de-sn.xml', 'kaputt');
      const original = io.invoke.getMockImplementation()!;
      io.invoke.mockImplementation(async (name: string, args: { relativerPfad: string }) => {
        if (name === 'atomar_datei_schreiben') throw new Error('Schreibfehler');
        return original(name, args);
      });
      const ergebnis = await importiereGesetzesreferenz(referenz, undefined, empfangen);
      expect(ergebnis).toMatchObject({
        art: 'fehler',
        fehler: { grund: 'speichern' },
        importergebnis: { erfolgreiche: [], fehlgeschlagene: [{ fehler: { grund: 'speichern' } }] },
      });
      expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
      expect(io.dateien.has('gesetze/Fremd_de-sn.xml.sicherung')).toBe(false);
      expect(io.dateien.has('gesetze/TestG_de-bund.xml')).toBe(false);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );
  it('beschränkt auch das frische Laden auf die betroffene Datei', async () => {
    io.frischerFremdBefund = true;
    io.archivstatus = 'archiviert';
    const ergebnis = await importiereGesetzesreferenz(referenz, undefined, empfangen);
    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      bestandspruefung: { befunde: [] },
      ladeabschluss: { status: 'geladen', befunde: [] },
    });
    expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
    expect(io.dateien.get('gesetze/Frisch_de-sn.xml')).toBe('kaputt');
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });
  it('kennzeichnet vorhandenes Gesetz unverändert und erhält fremde Dateien', async () => {
    await vorhandenes(quellen[0]);
    io.archivstatus = 'archiviert';
    io.dateien.set('gesetze/Fremd_de-sn.xml', 'kaputt');
    const ergebnis = await importiereGesetzesreferenz(referenz, undefined, empfangen);
    expect(ergebnis).toMatchObject({ art: 'erfolg', unveraendert: true });
    expect(ergebnis.importergebnis).toBeUndefined();
    expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
    expect(schreiben()).toHaveLength(0);
    expect(io.banner).not.toHaveBeenCalled();
  });
  it('bündelt unabhängige Referenzdiagnosen neben offenem Prüfabschluss', async () => {
    io.euFehler = true;
    io.dateien.delete('importindizes/de-bund.xml');
    io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
    const ergebnis = await importiereGesetzesreferenz(
      { ...referenz, normgeber: 'de-bw' },
      undefined,
      empfangen,
    );
    expect(ergebnis.art).toBe('erfolg');
    const diagnosen = meldungen.filter((m) => m.text.includes('Erkennung von Gesetzesverweisen'));
    expect(diagnosen).toHaveLength(1);
    expect(diagnosen[0]!.text).toContain('de-bund:');
    expect(diagnosen[0]!.text).toContain('eu:');
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });
  it('erhält Speichererfolg bei defektem Empfänger ohne Bannerersatz', async () => {
    io.euFehler = true;
    titelScheitert('de-bund');
    const defekt = vi.fn(() => {
      throw new Error('Empfänger');
    });
    const ergebnis = await importiereGesetzesreferenz(referenz, undefined, defekt);
    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      importergebnis: { erfolgreiche: [{ normgeber: 'de-bund' }] },
    });
    expect(defekt).toHaveBeenCalled();
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });
  it('trennt parallele Referenzimporte mit eigenen Titelbefunden', async () => {
    titelScheitert('de-bund');
    const original = io.invoke.getMockImplementation()!;
    io.invoke.mockImplementation(async (name: string, args: { relativerPfad: string }) => {
      if (name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('nichtamtliche-titel/'))
        throw new Error(args.relativerPfad);
      return original(name, args);
    });
    io.dateien.set('resources/nichtamtliche-titel/de-bw/TestG.xml', '<nichtamtlicheTitel/>');
    const bund: AktionsMeldung[] = [];
    const bw: AktionsMeldung[] = [];
    const ergebnisse = await Promise.all([
      importiereGesetzesreferenz(referenz, undefined, (m) => bund.push(m)),
      importiereGesetzesreferenz({ ...referenz, normgeber: 'de-bw' }, undefined, (m) => bw.push(m)),
    ]);
    expect(ergebnisse.every((e) => e.art === 'erfolg')).toBe(true);
    expect(bund.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
    expect(bw.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
    expect(bund.find((m) => m.anlass === 'synchronisation')!.text).toContain('testg_de-bund');
    expect(bw.find((m) => m.anlass === 'synchronisation')!.text).toContain('testg_de-bw');
    expect(schreiben()).toHaveLength(2);
    expect(io.banner).not.toHaveBeenCalled();
  });
  it('bewahrt fehlendes Gesetz und Sicherung ohne Ersatzquelle', async () => {
    io.archivstatus = 'archiviert';
    io.dateien.set('gesetze/Fremd_de-sn.xml', 'kaputt');
    const ergebnis = await importiereGesetzesreferenz(
      { kurztitel: 'FehltG', normgeber: 'de-bund' },
      undefined,
      empfangen,
    );
    expect(ergebnis).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'nichtVerfuegbar' },
      importergebnis: {
        erfolgreiche: [],
        fehlgeschlagene: [{ fehler: { grund: 'nichtImIndex' } }],
      },
    });
    expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
    expect(schreiben()).toHaveLength(0);
    expect(io.fetch).not.toHaveBeenCalled();
    expect(io.banner).not.toHaveBeenCalled();
  });
});

it('Gesetzesreferenzimport erhält beim echten EU-Bündel den Titel-Folgefehler und Importabschluss', async () => {
  io.dateien.set(
    'resources/europa/TestG_vollstaendig.xml',
    '<gesetz version="1"><infos><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><normgeber>eu</normgeber><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><norm id="n"><bezeichnung>Art. 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  titelScheitert('eu');
  const ergebnis = await importiereGesetzesreferenz(
    { kurztitel: 'testg', normgeber: 'eu' },
    undefined,
    empfangen,
  );
  expect(ergebnis).toMatchObject({
    art: 'erfolg',
    importergebnis: { erfolgreiche: [{ normgeber: 'eu' }], fehlgeschlagene: [] },
  });
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'synchronisation', art: 'hinweis' }),
  );
  expect(io.dateien.has('gesetze/TestG_eu.xml')).toBe(true);
  expect(schreiben()).toHaveLength(1);
  expect(io.fetch).not.toHaveBeenCalled();
  expect(io.banner).not.toHaveBeenCalled();
});
it('Gesetzesreferenzimport lehnt nicht entfernte beschädigte Zieldatei nach ihrer Sicherung ab', async () => {
  io.dateien.set('gesetze/TestG_de-bund.xml', 'kaputt');
  io.archivstatus = 'gesichert_aber_nicht_entfernt';
  const ergebnis = await importiereGesetzesreferenz(
    { kurztitel: 'TestG', normgeber: 'de-bund' },
    undefined,
    empfangen,
  );
  expect(ergebnis).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'laden' },
    bestandspruefung: { befunde: [{ status: 'gesichert_aber_nicht_entfernt' }] },
  });
  expect(ergebnis.importergebnis).toBeUndefined();
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'sicherung', aenderungsstand: 'teilweise' }),
  );
  expect(io.dateien.get('gesetze/TestG_de-bund.xml')).toBe('kaputt');
  expect(io.dateien.has('gesetze/TestG_de-bund.xml.sicherung')).toBe(true);
  expect(schreiben()).toHaveLength(0);
  expect(io.fetch).not.toHaveBeenCalled();
  expect(io.banner).not.toHaveBeenCalled();
});

describe('Verweisimport-Aktionskern mit echten Import-/Aktualisierungs- und Speicherwegen', () => {
  const referenz = { kurztitel: 'testg', normgeber: 'de-bund' };
  const versuchen = (ziele = [referenz], empfaenger = empfangen) =>
    versucheFehlendeGesetzeImportieren(ziele, markierungsEinzelzugriffFuerTest, empfaenger);

  it.each(quellen)(
    '$normgeber leitet Meldungen der Importkette an seinen Empfänger',
    async (quelle) => {
      titelScheitert(quelle.normgeber);
      io.euFehler = true;
      io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
      const ergebnis = await versuchen([{ ...referenz, normgeber: quelle.normgeber }]);
      expect(ergebnis).toMatchObject({
        mindestensEinErfolg: true,
        neuFehlgeschlagen: [],
        abschluesse: [
          {
            art: 'import',
            ergebnis: {
              art: 'erfolg',
              importergebnis: { erfolgreiche: [{ normgeber: quelle.normgeber }] },
            },
          },
        ],
      });
      expect(meldungen.some((m) => m.anlass === 'synchronisation')).toBe(true);
      expect(meldungen.some((m) => m.anlass === 'pruefabschluss')).toBe(true);
      expect(meldungen.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
      expect(schreiben()).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );

  it('trennt einen bestätigten Import von fehlgeschlagenem frischen Laden', async () => {
    io.gesetzOrdnerFehlerNachSchreiben = true;
    const ergebnis = await versuchen();
    expect(ergebnis).toMatchObject({
      mindestensEinErfolg: false,
      neuFehlgeschlagen: [
        { gesetz: referenz, fehler: 'Das Gesetz konnte nicht verlässlich geladen werden.' },
      ],
      abschluesse: [
        {
          art: 'import',
          ergebnis: {
            art: 'fehler',
            importergebnis: { erfolgreiche: [{ kurztitel: 'TestG', normgeber: 'de-bund' }] },
            ladeabschluss: { status: 'nicht-lesbar' },
          },
        },
      ],
    });
    expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'lesen', art: 'fehler' }));
    expect(io.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it.each(['archiviert', 'gesichert_aber_nicht_entfernt'] as const)(
    'erhält erste Sicherung (%s) neben fehlendem Ziel und echtem Schreibfehler',
    async (status) => {
      io.archivstatus = status;
      io.dateien.set('gesetze/Fremd_de-sn.xml', 'kaputt');
      const original = io.invoke.getMockImplementation()!;
      io.invoke.mockImplementation(async (name: string, args: { relativerPfad: string }) => {
        if (name === 'atomar_datei_schreiben') throw new Error('Schreibfehler');
        return original(name, args);
      });
      const fehlt = { kurztitel: 'FehltG', normgeber: 'de-bund' };
      const ergebnis = await versuchen([referenz, fehlt]);
      expect(ergebnis.mindestensEinErfolg).toBe(false);
      expect(ergebnis.neuFehlgeschlagen).toHaveLength(2);
      expect(ergebnis.abschluesse).toMatchObject([
        {
          art: 'import',
          ergebnis: {
            importergebnis: {
              erfolgreiche: [],
              fehlgeschlagene: [{ fehler: { grund: 'speichern' } }],
            },
          },
        },
        {
          art: 'import',
          ergebnis: {
            importergebnis: {
              erfolgreiche: [],
              fehlgeschlagene: [{ fehler: { grund: 'nichtImIndex' } }],
            },
          },
        },
      ]);
      expect(meldungen).toContainEqual(
        expect.objectContaining({ anlass: 'sicherung', aenderungsstand: 'teilweise' }),
      );
      expect(io.dateien.has('gesetze/Fremd_de-sn.xml.sicherung')).toBe(true);
      expect(io.dateien.has('gesetze/TestG_de-bund.xml')).toBe(false);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );

  it('startet bei unlesbarem ersten Bestand keinen Import', async () => {
    io.gesetzOrdnerFehler = true;
    const ergebnis = await versuchen();
    expect(ergebnis).toMatchObject({
      mindestensEinErfolg: false,
      bestandspruefung: { ordnerLesbar: false },
      neuFehlgeschlagen: [
        { gesetz: referenz, fehler: 'Das Gesetz konnte nicht verlässlich geladen werden.' },
      ],
      abschluesse: [{ art: 'nichtAbgeschlossen', gesetz: referenz }],
    });
    expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'lesen' }));
    expect(ergebnis.bestandsMeldungen).toEqual(meldungen);
    expect(io.fetch).not.toHaveBeenCalled();
    expect(schreiben()).toHaveLength(0);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('verhindert Import in eine beschädigte nicht entfernbare Zieldatei', async () => {
    io.dateien.set('gesetze/TestG_de-bund.xml', 'kaputt');
    io.archivstatus = 'gesichert_aber_nicht_entfernt';
    const ergebnis = await versuchen();
    expect(ergebnis).toMatchObject({
      mindestensEinErfolg: false,
      bestandspruefung: { befunde: [{ status: 'gesichert_aber_nicht_entfernt' }] },
      abschluesse: [{ art: 'nichtAbgeschlossen' }],
    });
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'sicherung', aenderungsstand: 'teilweise' }),
    );
    expect(schreiben()).toHaveLength(0);
    expect(io.fetch).not.toHaveBeenCalled();
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('berührt auch nach Speicherung entstandene Fremddateien nicht', async () => {
    io.frischerFremdBefund = true;
    io.archivstatus = 'archiviert';
    const ergebnis = await versuchen();
    expect(ergebnis).toMatchObject({
      mindestensEinErfolg: true,
      bestandspruefung: { befunde: [] },
    });
    expect(meldungen.filter((m) => m.anlass === 'sicherung')).toEqual([]);
    expect(io.dateien.get('gesetze/Frisch_de-sn.xml')).toBe('kaputt');
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'erhält Aktualisierungskategorie und Hinweise (neue Inhalte=%s)',
    async (geaendert) => {
      await vorhandenes(quellen[0]);
      titelScheitert('de-bund');
      io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
      if (geaendert)
        io.fetch.mockImplementation(async () => ({
          ok: true,
          arrayBuffer: async () =>
            zipSync({
              'gesetz.xml': strToU8(bundXML.replace('Ein erster Satz.', 'Geänderter Satz.')),
            }).buffer,
        }));
      const ergebnis = await versuchen();
      expect(ergebnis).toMatchObject({
        mindestensEinErfolg: true,
        abschluesse: [
          {
            art: 'aktualisierung',
            ergebnis: { art: 'erfolg', kategorie: geaendert ? 'aktualisiert' : 'unveraendert' },
          },
        ],
      });
      expect(ergebnis.aktualisierungsHinweis).toBe(
        geaendert ? 'Datei aktualisiert: TestG.' : 'Keine Neuerungen.',
      );
      expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'pruefabschluss' }));
      expect(meldungen).toContainEqual(
        expect.objectContaining({
          anlass: 'synchronisation',
          text: expect.stringContaining(geaendert ? 'gespeichert' : 'Prüfzeitpunkt'),
        }),
      );
      expect(schreiben()).toHaveLength(1);
      expect(io.banner).not.toHaveBeenCalled();
    },
  );

  it('erhält Teilimport und dessen Hinweise neben einem fehlenden Gesetz', async () => {
    io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
    const fehlt = { kurztitel: 'FehltG', normgeber: 'de-bw' };
    const ergebnis = await versuchen([referenz, fehlt]);
    expect(ergebnis).toMatchObject({
      mindestensEinErfolg: true,
      neuFehlgeschlagen: [{ gesetz: fehlt }],
      abschluesse: [
        {
          art: 'import',
          ergebnis: {
            importergebnis: { erfolgreiche: [gesetzesreferenz({ kurztitel: 'TestG' })] },
          },
        },
        { art: 'import', ergebnis: { art: 'fehler' } },
      ],
    });
    expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'pruefabschluss' }));
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('liefert gleiche Referenzdiagnosen paralleler Gesetze unverarbeitet mit ihren verschiedenen Titelbefunden', async () => {
    titelScheitert('de-bund');
    titelScheitert('de-bw');
    io.euFehler = true;
    const ergebnis = await versuchen([referenz, { ...referenz, normgeber: 'de-bw' }]);
    expect(ergebnis.mindestensEinErfolg).toBe(true);
    expect(ergebnis.abschluesse).toHaveLength(2);
    for (const abschluss of ergebnis.abschluesse) {
      expect(abschluss.meldungen.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
      expect(abschluss.meldungen.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
    }
    // Die Darstellung dedupliziert erst im Hilfsfenster; der Aktionsvertrag
    // liefert beide zugeordneten Rohbefunde unverändert.
    expect(meldungen.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(2);
    expect(meldungen.filter((m) => m.anlass === 'synchronisation')).toHaveLength(2);
    expect(schreiben()).toHaveLength(2);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('trennt zwei parallele Aktionsvorgänge mit eigenen Meldungsbündeln', async () => {
    titelScheitert('de-bund', 'testg_de-bund');
    titelScheitert('de-bw', 'testg_de-bw');
    io.euFehler = true;
    const bund: AktionsMeldung[] = [];
    const bw: AktionsMeldung[] = [];
    const ergebnisse = await Promise.all([
      versuchen([referenz], (m) => bund.push(m)),
      versuchen([{ ...referenz, normgeber: 'de-bw' }], (m) => bw.push(m)),
    ]);
    expect(ergebnisse.every((e) => e.mindestensEinErfolg)).toBe(true);
    expect(bund.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
    expect(bw.filter((m) => m.text.includes('EU-Verzeichnis'))).toHaveLength(1);
    expect(bund.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
    expect(bw.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
    expect(bund.find((m) => m.anlass === 'synchronisation')!.text).toContain('testg_de-bund');
    expect(bw.find((m) => m.anlass === 'synchronisation')!.text).toContain('testg_de-bw');
    expect(schreiben()).toHaveLength(2);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('behält Import und offenen Prüfabschluss neben anschließender Verweissperrwartefrist', async () => {
    io.abschliessen.mockRejectedValueOnce(new Error('Prüfabschluss'));
    const ergebnis = await versuchen();
    const importMeldungen = [...meldungen];
    const original = io.invoke.getMockImplementation()!;
    io.invoke.mockImplementation(async (name: string, args: { relativerPfad: string }) => {
      if (name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('markierungen/'))
        throw 'wartefrist';
      return original(name, args);
    });
    const speicherMeldungen: AktionsMeldung[] = [];
    await expect(
      speichereVerweismarkierung(
        {
          gesetz: referenz,
          ausgangsstelle: normAusgangsstelle('§ 1'),

          openerLabel: 'main',
        },
        markierungsEinzelzugriffFuerTest,
        '§ 1 TestG',
        false,
        false,
        new Map(),
        undefined,
        undefined,
        (m) => speicherMeldungen.push(m),
      ),
    ).rejects.toBe('wartefrist');
    expect(ergebnis).toMatchObject({
      abschluesse: [
        {
          art: 'import',
          ergebnis: {
            importergebnis: { erfolgreiche: [gesetzesreferenz({ kurztitel: 'TestG' })] },
          },
        },
      ],
    });
    expect(importMeldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(speicherMeldungen).toContainEqual(
      expect.objectContaining({
        anlass: 'dateisperre',
        text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
      }),
    );
    expect(schreiben()).toHaveLength(1);
    expect(io.dateien.has('markierungen/TestG_de-bund-markierungen.xml')).toBe(false);
    expect(io.banner).not.toHaveBeenCalled();
  });

  it('löst bei defektem Meldungsempfänger keine weitere Speicherung aus', async () => {
    titelScheitert('de-bund');
    io.euFehler = true;
    const defekt = vi.fn(() => {
      throw new Error('Empfänger');
    });
    const ergebnis = await versuchen([referenz], defekt);
    expect(ergebnis.mindestensEinErfolg).toBe(true);
    expect(defekt).toHaveBeenCalled();
    expect(schreiben()).toHaveLength(1);
    expect(io.banner).not.toHaveBeenCalled();
  });
  it('unterscheidet zwischenzeitlich vorhandenes Gesetz vom tatsächlichen Neuimport', async () => {
    await vorhandenes(quellen[0]);
    io.fetch.mockClear();
    const fs = await import('@tauri-apps/plugin-fs');
    // Nur der erste Aufruf sieht den alten leeren Ordner. Die echte
    // Referenzimport-Bestandsladung sieht das inzwischen gespeicherte Gesetz.
    const ersterLauf = vi.spyOn(fs, 'readDir').mockResolvedValueOnce([]);
    try {
      const ergebnis = await versuchen();
      expect(ergebnis).toMatchObject({
        mindestensEinErfolg: true,
        abschluesse: [{ art: 'import', ergebnis: { art: 'erfolg', unveraendert: true } }],
      });
      const abschluss = ergebnis.abschluesse[0]!;
      expect(abschluss.art === 'import' && abschluss.ergebnis.importergebnis).toBeUndefined();
      expect(io.fetch).not.toHaveBeenCalled();
      expect(schreiben()).toHaveLength(0);
      expect(io.banner).not.toHaveBeenCalled();
    } finally {
      ersterLauf.mockRestore();
    }
  });

  it('behält ohne ausdrücklichen Empfänger die Hauptfensterbanner', async () => {
    titelScheitert('de-bund');
    io.euFehler = true;
    const ergebnis = await versucheFehlendeGesetzeImportieren(
      [referenz],
      markierungsEinzelzugriffFuerTest,
    );
    expect(ergebnis.mindestensEinErfolg).toBe(true);
    expect(io.banner).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('EU-Verzeichnis') }),
    );
    expect(io.banner).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('nichtamtlichen Titel') }),
    );
    expect(schreiben()).toHaveLength(1);
  });
});

it('parallele echte Einzelimporte erhalten späte Prüfmeldungen im jeweiligen Abschlussbündel', async () => {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  const freigaben: Array<() => void> = [];
  io.vormerken.mockImplementation(async () => `importquelle-${io.vormerken.mock.calls.length}`);
  io.abschliessen.mockImplementation(
    async (vorgang, _ergebnis, empfaenger: AktionsMeldungEmpfaenger) => {
      const schreibaufruf = io.invoke.mock.calls.find(
        ([name, args]) =>
          name === 'atomar_datei_schreiben' &&
          args.vorgang === vorgang &&
          args.relativerPfad.startsWith('gesetze/'),
      );
      expect(schreibaufruf).toBeDefined();
      const pfad: string = schreibaufruf![1].relativerPfad;
      const sperre = new Promise<void>((resolve) => {
        freigaben.push(resolve);
      });
      erfasseAktionsFolgelauf(
        empfaenger,
        sperre.then(() =>
          empfaenger({
            text: `Später Prüfabschluss ${pfad}`,
            typ: 'warnung',
            art: 'hinweis',
            anlass: 'pruefabschluss',
            aenderungsstand: 'vollstaendig',
          }),
        ),
      );
    },
  );
  const ergebnis = await versucheFehlendeGesetzeImportieren(
    [
      { kurztitel: 'TestG', normgeber: 'de-bund' },
      { kurztitel: 'TestG', normgeber: 'de-bw' },
    ],
    markierungsEinzelzugriffFuerTest,
    sammlung.meldungEmpfangen,
  );
  expect(ergebnis.abschluesse).toHaveLength(2);
  expect(freigaben).toHaveLength(2);
  let abgeschlossen = false;
  const ende = sammlung.warteAufAbschluss(1000).then((stand) => {
    abgeschlossen = true;
    return stand;
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(abgeschlossen).toBe(false);
  freigaben[1]!();
  await vi.advanceTimersByTimeAsync(1);
  expect(abgeschlossen).toBe(false);
  freigaben[0]!();
  await vi.advanceTimersByTimeAsync(200);
  await expect(ende).resolves.toBe('abgeschlossen');
  const spaet = ergebnis.abschluesse.map((abschluss) =>
    abschluss.meldungen.filter((meldung) => meldung.text.startsWith('Später Prüfabschluss')),
  );
  expect(spaet.map((meldungen) => meldungen.length)).toEqual([1, 1]);
  ergebnis.abschluesse.forEach((abschluss, index) => {
    expect(spaet[index]![0]!.text).toBe(
      `Später Prüfabschluss gesetze/TestG_${abschluss.gesetz.normgeber}.xml`,
    );
  });
  expect(new Set(spaet.flat().map((meldung) => meldung.text)).size).toBe(2);
  expect(
    sammlung.meldungen().filter((meldung) => meldung.text.startsWith('Später Prüfabschluss')),
  ).toHaveLength(2);
  expect(io.banner).not.toHaveBeenCalled();
});
