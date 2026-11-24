import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenMessung.test.ts
// Reproduzierbare Offline-Messung über die öffentlichen Such- und Ladeverträge.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { OeffnenOverlay } from '@/components/overlays/overlays.index';
import { baueSuchIndexFuerGesetz } from '@/components/overlays/suche/VolltextSucheOverlay.helpers';
import { hatNormenOhneTitel } from '@/lib/persistenz/gesetz/gesetz.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir, cpus, platform, arch, totalmem } from 'node:os';
import { join, basename } from 'node:path';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { importindexFixture, emrkFixture } from '@/test/import/europaImportFixtures';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  lesen: vi.fn(),
  bundleLesen: vi.fn(),
  schreiben: vi.fn(),
  ordner: vi.fn(),
  sichern: vi.fn(),
  sperre: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenOrdnerLesen: io.ordner,
  mitDateiSperre: io.sperre,
  mitGesetzDateiSperre: io.sperre,
  appDatenLesen: io.lesen,
  appDatenSchreiben: io.schreiben,
  sicherstelleOrdner: io.sichern,
}));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (pfad: string) => pfad }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string) =>
    befehl === 'gesetz_dateistempel_lesen' ? gesetzDateistempelAttrappe(io.dateien) : undefined,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {}, emitTo: async () => {} }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: io.bundleLesen,
  exists: async () => true,
  readDir: async () => [{ name: 'EMRK_europarat.xml', isFile: true }],
}));
import { erzeugeSuchmessungBestand } from '@/test/import/suchmessungBestand';
import { ermittlePraefixstruktur } from '@/lib/domain/praefixstruktur';

it('erzeugt denselben vielfältigen Bestand bei gleichen Parametern', () => {
  const bestand = erzeugeSuchmessungBestand({ gesetze: 30, bund: 30, bw: 30, eu: 30 });
  expect(bestand).toEqual(erzeugeSuchmessungBestand({ gesetze: 30, bund: 30, bw: 30, eu: 30 }));
  expect(bestand.gesetze).toHaveLength(30);
  expect(new Set(bestand.gesetze.map((g) => ermittlePraefixstruktur(g).praefixstruktur))).toEqual(
    new Set(['paragraph', 'artikel', 'gliederungsartikel', 'ohne-praefix']),
  );
  expect(
    berechneTreffer('e25', alsSuchverzeichniseintraege(bestand.gesetze), null, bestand.importindex),
  ).toHaveLength(6);
  expect(bestand.importindex.eu.some((e) => e.typ === 'durchfuehrungsverordnung')).toBe(true);
  const ohne = bestand.gesetze.find((g) => g.kurztitel === 'PKHB 2012');
  expect(ohne).toBeDefined();
  expect(
    JSON.stringify(ohne?.elemente.map((el) => (el.typ === 'norm' ? el.data.absaetze : []))),
  ).not.toMatch(/\d/);
});

function verteilung(werte: number[]) {
  const sortiert = [...werte].sort((a, b) => a - b);
  return {
    medianMs: sortiert[Math.floor(sortiert.length / 2)],
    p95Ms: sortiert[Math.ceil(sortiert.length * 0.95) - 1],
  };
}

async function messeOeffnen(gesetzeAnzahl: number) {
  // Jeder Größenvergleich braucht einen eigenen echten Importindex-Zwischenspeicher.
  vi.resetModules();
  const { sucheKandidatenAlleQuellen, leseImportindexZwischenspeicher } =
    await import('@/lib/import/import.index');
  const voll = process.env.LEXLATA_MESSUNG === 'voll';
  const groessen = voll
    ? { gesetze: gesetzeAnzahl, bund: 7000, bw: 1200, eu: 1500 }
    : { gesetze: 30, bund: 300, bw: 300, eu: 300 };
  const anzeigezeitpunkte = new Map(
    Array.from({ length: 100 }, (_, i) => [
      gesetzesreferenzSchluessel({ normgeber: 'de-bund', kurztitel: `Messgesetz${i}` }),
      i + 1,
    ]),
  );
  const gc: (() => void) | undefined = Reflect.get(globalThis, 'gc');
  gc?.();
  const heapVorher = process.memoryUsage().heapUsed;
  const bestand = erzeugeSuchmessungBestand({ ...groessen, bund: 0, bw: 0, eu: 0 });
  gc?.();
  const speicher = gc
    ? {
        heapDifferenzBytes: process.memoryUsage().heapUsed - heapVorher,
        hinweis: 'Größenordnung der Gesetzesliste in Node; WebView kann abweichen.',
      }
    : {
        status: 'nicht messbar',
        grund: 'global.gc nicht verfügbar; Vitest-Worker mit --execArgv=--expose-gc starten.',
      };
  bestand.gesetze.slice(0, 100).forEach((g, i) => {
    const alterSchluessel = [...anzeigezeitpunkte.keys()][i];
    if (alterSchluessel) anzeigezeitpunkte.delete(alterSchluessel);
    anzeigezeitpunkte.set(gesetzesreferenzSchluessel(g), 101 + i);
  });
  expect(anzeigezeitpunkte.size).toBe(100);
  bestand.importindex = erzeugeSuchmessungBestand({ ...groessen, gesetze: 0 }).importindex;
  const ordner = await mkdtemp(join(tmpdir(), 'lexlata-messung-'));
  try {
    const kuratiert = bestand.importindex.eu.map((e) => ({
      celex: e.abrufkennung,
      kurztitel: e.kurztitel,
      langtitel: e.langtitel,
      alternativen: e.alternativen,
    }));
    await writeFile(join(ordner, 'europaKuratiert.json'), JSON.stringify(kuratiert));
    await writeFile(join(ordner, 'EMRK_europarat.xml'), emrkFixture);
    for (const [kategorie, eintraege] of Object.entries(bestand.importindex)) {
      const quelle = kategorie === 'eu' ? 'eu' : kategorie === 'de-bund' ? 'de-bund' : 'de-bw';
      await writeFile(
        join(ordner, `${kategorie}.xml`),
        importindexFixture(
          quelle,
          eintraege
            .map(
              (e) =>
                `<gesetz${e.typ ? ` typ="${e.typ}"` : ''}><kurztitel>${e.kurztitel}</kurztitel><langtitel>${e.langtitel}</langtitel><abrufkennung>${e.abrufkennung}</abrufkennung></gesetz>`,
            )
            .join(''),
        ),
      );
      if (kategorie !== 'eu')
        await writeFile(
          join(ordner, `praefix-${kategorie}.xml`),
          `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>${kategorie}</normgeber></infos><inhalt>${eintraege.map((e) => `<gesetz>${e.kurztitel}</gesetz>`).join('')}</inhalt></praefixstrukturen>`,
        );
    }
    io.lesen
      .mockReset()
      .mockImplementation((pfad: string) => readFile(join(ordner, basename(pfad)), 'utf8'));
    io.bundleLesen
      .mockReset()
      .mockImplementation((pfad: string) =>
        readFile(
          join(ordner, `${pfad.includes('praefixstrukturen') ? 'praefix-' : ''}${basename(pfad)}`),
          'utf8',
        ),
      );
    io.schreiben.mockReset().mockImplementation(() => {
      throw new Error('Messung darf Appdaten nicht schreiben');
    });
    const ladeMessung = async (warm = false) => {
      const startLesen = io.lesen.mock.calls.length;
      const startBundle = io.bundleLesen.mock.calls.length;
      const start = performance.now();
      const kandidaten = await sucheKandidatenAlleQuellen();
      const ms = performance.now() - start;
      const dateilesungen = io.lesen.mock.calls.slice(startLesen).map(([pfad]) => String(pfad));
      for (const kategorie of ['de-bund', 'de-bw', 'eu'])
        expect(dateilesungen.filter((p) => p === `importindizes/${kategorie}.xml`)).toHaveLength(
          warm ? 0 : 3,
        );
      expect(kandidaten['de-bund']).toHaveLength(groessen.bund);
      expect(kandidaten['de-bw']).toHaveLength(groessen.bw);
      expect(kandidaten.eu).toHaveLength(groessen.eu + 1);
      expect(kandidaten.eu[0]?.alternativen).toEqual(kuratiert[0]?.alternativen);
      return {
        ms,
        lokaleDateilesungen: dateilesungen.length,
        ressourcenDateilesungen: io.bundleLesen.mock.calls.length - startBundle,
      };
    };
    const erstladen = await ladeMessung();
    const wiederholt = await ladeMessung(true);
    expect(wiederholt.lokaleDateilesungen).toBe(0);
    expect(wiederholt.ressourcenDateilesungen).toBe(0);
    expect(io.schreiben).not.toHaveBeenCalled();
    const lesungen = io.lesen.mock.calls.length + io.bundleLesen.mock.calls.length;
    const erstaufbauStart = performance.now();
    const suchverzeichniseintraege = alsSuchverzeichniseintraege(bestand.gesetze);
    const erstaufbauTreffer = berechneTreffer(
      '23',
      suchverzeichniseintraege,
      null,
      bestand.importindex,
      false,
      anzeigezeitpunkte,
    ).length;
    const suchverzeichnisErstaufbau = {
      ms: performance.now() - erstaufbauStart,
      eingabe: '23',
      treffer: erstaufbauTreffer,
    };
    const messe = (
      eingaben: string[],
      aktivesGesetz: (typeof bestand.gesetze)[number] | null = null,
    ) => {
      const lauf = () => {
        const start = performance.now();
        const treffer = eingaben.map(
          (eingabe) =>
            berechneTreffer(
              eingabe,
              suchverzeichniseintraege,
              aktivesGesetz,
              bestand.importindex,
              false,
              anzeigezeitpunkte,
            ).length,
        );
        return { ms: performance.now() - start, treffer };
      };
      for (let i = 0; i < 3; i++) lauf();
      const messungen = Array.from({ length: 20 }, lauf);
      return {
        eingaben,
        aktivesGesetz: aktivesGesetz?.kurztitel ?? null,
        ...verteilung(messungen.map((m) => m.ms)),
        treffer: messungen[0]?.treffer,
      };
    };
    const trefferberechnung = [
      '1',
      '1 g',
      '§ 1',
      '2',
      '23',
      '2301',
      '§ 433',
      '229 3',
      'e25',
      'g',
      'bgb',
      'datenschutz',
      '2301 pkhb',
    ].map((e) => messe([e]));
    trefferberechnung.push(messe(['1', '23'], bestand.gesetze[0]));
    trefferberechnung.push(
      messe(
        ['1', '23'],
        bestand.gesetze.find((gesetz) => gesetz.kurztitel === 'BGB'),
      ),
    );
    const tippfolgen = [messe(['2', '23', '230', '2301']), messe(['d', 'da', 'dat', 'date'])];
    for (const messung of [...trefferberechnung, ...tippfolgen]) {
      expect(Number.isFinite(messung.medianMs)).toBe(true);
      expect(Number.isFinite(messung.p95Ms)).toBe(true);
      expect(messung.treffer).toHaveLength(messung.eingaben.length);
    }
    expect(io.lesen.mock.calls.length + io.bundleLesen.mock.calls.length).toBe(lesungen);
    const volltextStart = performance.now();
    const volltext = bestand.gesetze.flatMap(baueSuchIndexFuerGesetz);
    const volltextIndexaufbau = {
      ms: performance.now() - volltextStart,
      eintraege: volltext.length,
    };
    expect(volltext.length).toBe(
      bestand.gesetze.reduce((n, g) => n + g.elemente.filter((e) => e.typ === 'norm').length, 0),
    );
    const renderStart = performance.now();
    const html = renderToString(
      createElement(OeffnenOverlay, {
        onInstalliertOeffnen: () => {},
        gesetze: bestand.gesetze,
        aktivesGesetz: null,
        onSchliessen: () => {},
        onGesetzOeffnen: () => {},
        onNeuenTabOeffnen: () => {},
      }),
    );
    const erstesRendernLeereListe = {
      ms: performance.now() - renderStart,
      gesetze: bestand.gesetze.length,
      htmlZeichen: html.length,
      hinweis:
        'Erstes HTML-Rendern der echten Oberfläche in Node, ohne Layout/Paint. Echtes Zeichnen im Entwicklungsbuild über zwei Animationsframes.',
    };
    expect(html).toContain('Gesetzesliste wird vorbereitet');
    const xmlDateien = bestand.gesetze.map((g, i) => ({
      name: `M${i}_de-bund.xml`,
      xml: `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>M${i}</kurztitel><langtitel>Messgesetz</langtitel></infos><inhalt>${g.elemente
        .filter((e) => e.typ === 'norm')
        .map(
          (_, n) =>
            `<norm id="${n + 1}"><bezeichnung>§ ${n + 1}</bezeichnung><titel>Messnorm</titel><text><absatz><satz>Reproduzierbarer Gesetzestext.</satz></absatz></text></norm>`,
        )
        .join('')}</inhalt></gesetz>`,
    }));
    io.dateien = new Map(xmlDateien.map(({ name, xml }) => [`gesetze/${name}`, xml]));
    const parseStart = performance.now();
    const geparst = xmlDateien.map(({ xml }) => parseGesetzesXML(xml));
    const parsen = { ms: performance.now() - parseStart, gesetze: geparst.length };
    expect(geparst.every(Boolean)).toBe(true);
    const titelStart = performance.now();
    const ohneTitel = geparst.filter((g) => g && hatNormenOhneTitel(g)).length;
    const titelpruefung = { ms: performance.now() - titelStart, ohneTitel };
    expect(ohneTitel).toBe(0);
    io.lesen.mockReset().mockImplementation(async (pfad: string) => {
      const datei = xmlDateien.find((d) => `gesetze/${d.name}` === pfad);
      if (!datei) throw new Error(`Unerwartete Lesung: ${pfad}`);
      return datei.xml;
    });
    io.ordner
      .mockReset()
      .mockResolvedValue(xmlDateien.map(({ name }) => ({ name, isDirectory: false })));
    io.sichern.mockClear();
    io.sperre.mockReset().mockImplementation(async (_pfad, aktion) => aktion());
    const ladenStart = performance.now();
    const geladen = await ladeAlleGesetze();
    const startBausteine = {
      ladenMs: performance.now() - ladenStart,
      gesetze: geladen.length,
      dateilesungen: io.lesen.mock.calls.length,
      ordnerlesungen: io.ordner.mock.calls.length,
      ordnerVorbereitung: io.sichern.mock.calls.length,
      sperraufrufe: io.sperre.mock.calls.length,
      dateilesungenJeGesetz: io.lesen.mock.calls.length / groessen.gesetze,
      parsen,
      titelpruefung,
      hinweis:
        'Synthetisches gültiges GesetzesXML mit amtlichen Titeln; keine Titeldateien, Fehler- oder Reparaturpfade. Gemockte Kern-Dateizugriffe zählen Aufrufe, keine Tauri-Latenz.',
    };
    expect(geladen).toHaveLength(groessen.gesetze);
    expect(io.lesen).toHaveBeenCalledTimes(groessen.gesetze);
    expect(io.sperre).not.toHaveBeenCalled();
    await mkdir('.reports', { recursive: true });
    await writeFile(
      voll ? `.reports/oeffnen-messung-${gesetzeAnzahl}.json` : '.reports/oeffnen-messung.json',
      JSON.stringify(
        {
          messstand: 'zuletzt angezeigt Phase 2',
          anzeigeeintraege: anzeigezeitpunkte.size,
          modus: voll ? 'voll' : 'rauchtest',
          zeitpunkt: new Date().toISOString(),
          rechner: {
            system: platform(),
            architektur: arch(),
            cpu: cpus()[0]?.model,
            logischeKerne: cpus().length,
            arbeitsspeicherBytes: totalmem(),
            node: process.version,
          },
          annahmen:
            'Synthetischer Bestand; Indexgrößen nicht an Quellen verifiziert. Offline ohne WebView/Tauri; temporäre Dateien auf demselben Dateisystem. 3 Aufwärmläufe, 20 Messläufe je Eingabe/Tippfolge; Tippfolge als Gesamtdauer.',
          groessen,
          normen: bestand.gesetze.reduce(
            (summe, g) => summe + g.elemente.filter((e) => e.typ === 'norm').length,
            0,
          ),
          suchverzeichnisErstaufbau,
          trefferberechnung,
          tippfolgen,
          importindexLaden: { erstladen, wiederholt },
          importindexWarmlaufen: {
            dauerMs: erstladen.ms,
            strukturierteNutzdatenBytes: Buffer.byteLength(
              JSON.stringify(leseImportindexZwischenspeicher()),
            ),
            hinweis:
              'Gleicher Ladezugriff wie Warmlaufen; reine Ladedauer ohne 250-ms-Zeitgeber. UTF-8-JSON-Größe als messbare Nutzdatengrößenordnung; tatsächlicher JS-Heap einschließlich Objektkosten und geteilten Zeichenketten ohne isolierten GC nicht belastbar messbar.',
          },
          volltextIndexaufbau,
          startBausteine,
          speicher,
          erstesRendernLeereListe,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}

it.each(process.env.LEXLATA_MESSUNG === 'voll' ? [28, 500] : [30])(
  'misst Treffer und vollständiges wiederholtes Indexladen mit %i Gesetzen ohne Zeitgrenzwerte',
  messeOeffnen,
  120000,
);
