import { io, ref, xml } from '@/test/suchverzeichnis/suchverzeichnisNativeAttrappe';
// Öffentliche Suchverzeichnisverträge mit echten Fachmodulen und nativer Dateisystemattrappe.
import { expect, it, vi } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { leiteSuchverzeichniseintragAb } from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  type Suchverzeichnis,
  type SuchverzeichnisAbgleichErgebnis,
  type SuchverzeichnisFortschritt,
  type GesetzLeseErgebnis,
  leseSuchverzeichnis,
  istSuchverzeichniseintragAktuell,
  gleicheSuchverzeichnisAb,
  leseGesetz,
  pruefeGesetzExistenz,
  speichereGesetz,
  loescheGesetz,
  warteAufSpeicherBatchAbschluss,
  leseAbgeglichenesSuchverzeichnis,
} from '@/lib/persistenz/gesetz/gesetz.index';

it('leitet vollständige Suchdaten und Kopfangaben unabhängig vom Gesetz ab', () => {
  const gesetz = parseGesetzesXML(xml);
  if (!gesetz) throw Error('Ungültiges Testgesetz');
  const e = leiteSuchverzeichniseintragAb(gesetz, {
    groesse: '9007199254740993',
    aenderungszeit: '-1000000001',
  });
  expect(e).toMatchObject({
    status: 'in-ordnung',
    kurztitel: 'Probe',
    normgeber: 'de-bund',
    langtitel: 'Probegesetz',
    hatNormenOhneTitel: true,
    hatGliederungsartikel: false,
    praefixstruktur: 'paragraph',
    normen: [
      {
        xmlId: 'p1',
        bezeichnung: '§ 1',
        art: 'normal',
        istArtikel: false,
        artikelkennzeichen: null,
        normzahlen: ['1'],
        bereich: null,
        nebennormzahl: null,
      },
    ],
    dateistempel: { groesse: '9007199254740993', aenderungszeit: '-1000000001' },
  });
  expect(e.normen).not.toBe(gesetz.elemente);
});
it('baut fehlende Dateien auf, liest unveränderte Gesetze nicht und entfernt verschwundene Einträge', async () => {
  const leer: Suchverzeichnis = { abgeglichen: false, eintraege: [] };
  expect(await leseSuchverzeichnis()).toEqual(leer);
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  expect((await gleicheSuchverzeichnisAb()).abgeglichen).toBe(true);
  expect((await leseSuchverzeichnis()).eintraege).toHaveLength(1);
  io.lesen.mockClear();
  await gleicheSuchverzeichnisAb();
  expect(
    io.lesen.mock.calls.filter(
      ([p]) => p.startsWith('gesetze/') && p.toLowerCase().endsWith('.xml'),
    ),
  ).toHaveLength(0);
  io.dateien.delete('gesetze/Probe_de-bund.xml');
  expect((await gleicheSuchverzeichnisAb()).eintraege).toEqual([]);
});
it('bestätigt bei Ordnerfehler weder Abgleich noch Abwesenheit', async () => {
  io.ordnerFehler = true;
  expect((await gleicheSuchverzeichnisAb()).abgeglichen).toBe(false);
  expect(await pruefeGesetzExistenz(ref)).toBe('unbekannt');
  const ergebnis: GesetzLeseErgebnis = await leseGesetz(ref);
  expect(ergebnis.status).toBe('nicht-lesbar');
});
it('unterscheidet nachweislich fehlende Dateien und konkurrierende Schreibweisen', async () => {
  expect(await pruefeGesetzExistenz(ref)).toBe('fehlt');
  expect((await leseGesetz(ref)).status).toBe('fehlt');
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  io.dateien.set('gesetze/probe_de-bund.XML', xml);
  expect((await leseGesetz(ref)).status).toBe('nicht-lesbar');
});

it.each([
  '',
  '{kaputt',
  '{"version":99,"abgeglichen":true,"eintraege":[]}',
  '{"version":1,"abgeglichen":true,"eintraege":[{"status":"in-ordnung"}]}',
])('verwirft ungültiges Cache-JSON %j ohne Gesetzesänderung', async (cache) => {
  io.dateien.set('cache/suchverzeichnis.json', cache);
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(false);
  const fortschritt: number[] = [];
  const ergebnis: SuchverzeichnisAbgleichErgebnis = await gleicheSuchverzeichnisAb({
    fortschritt: (f: SuchverzeichnisFortschritt) => {
      fortschritt.push(f.erledigt);
    },
  });
  expect(ergebnis.abgeglichen).toBe(true);
  expect(fortschritt).toEqual([0, 1]);
  expect(io.dateien.get('gesetze/Probe_de-bund.xml')).toBe(xml);
});
it('stellt Datumsfelder wieder her und liest nur geänderte Gesetze erneut', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  await gleicheSuchverzeichnisAb();
  const [eintrag] = (await leseSuchverzeichnis()).eintraege;
  expect(eintrag?.status === 'in-ordnung' && eintrag.verarbeitungszeit).toEqual(
    new Date('2025-01-02T03:04:05Z'),
  );
  io.dateien.set('gesetze/Probe_de-bund.xml', xml.replace('Probegesetz', 'Neuer Langtitel'));
  io.stempel.set('gesetze/Probe_de-bund.xml', 9);
  io.lesen.mockClear();
  const ergebnis = await gleicheSuchverzeichnisAb();
  expect(ergebnis.eintraege[0]).toMatchObject({ langtitel: 'Neuer Langtitel' });
  expect(io.lesen.mock.calls.filter(([p]) => p === 'gesetze/Probe_de-bund.xml')).toHaveLength(1);
});
it('zieht bevorzugte Referenzen vor und speichert vor Abschluss keinen vollständigen Stand', async () => {
  io.dateien.set('gesetze/Anderes_de-bund.xml', xml.replaceAll('Probe', 'Anderes'));
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  const zustaende: boolean[] = [];
  await gleicheSuchverzeichnisAb({
    bevorzugt: [ref],
    fortschritt: () => {
      const cache = io.dateien.get('cache/suchverzeichnis.json') ?? '';
      zustaende.push(cache.includes('"abgeglichen":true'));
    },
  });
  expect(io.lesen.mock.calls.filter(([p]) => p.startsWith('gesetze/')).map(([p]) => p)).toEqual([
    'gesetze/Probe_de-bund.xml',
    'gesetze/Anderes_de-bund.xml',
  ]);
  expect(zustaende).toEqual([false, false, false]);
});
it('pflegt Speichern und Löschen ohne andere Gesetzesdateien zu lesen und legt keinen Teilbestand an', async () => {
  await speichereGesetz(ref, xml);
  await warteAufSpeicherBatchAbschluss();
  expect(io.dateien.has('cache/suchverzeichnis.json')).toBe(false);
  io.dateien.set('gesetze/Anderes_de-bund.xml', xml.replaceAll('Probe', 'Anderes'));
  await gleicheSuchverzeichnisAb();
  io.lesen.mockClear();
  io.invoke.mockClear();
  let freigeben = () => {};
  // Die unveränderte Markierungsprüfung darf alle Gesetze lesen. Ihr nativer
  // Wartepunkt trennt ihre Zugriffe von der hier geprüften Cache-Pflege.
  io.pruefwarte = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  try {
    await speichereGesetz(ref, xml.replace('Probegesetz', 'Neu'));
    io.pruefungBlockieren = true;
    await vi.waitFor(() =>
      expect(io.dateien.get('cache/suchverzeichnis.json')).toContain('"langtitel":"Neu"'),
    );
    expect(
      (await leseSuchverzeichnis()).eintraege.find((e) => e.kurztitel === 'Probe'),
    ).toMatchObject({ langtitel: 'Neu' });
    expect(io.lesen.mock.calls.filter(([p]) => p.startsWith('gesetze/'))).toEqual([]);
  } finally {
    io.pruefungBlockieren = false;
    freigeben();
    await warteAufSpeicherBatchAbschluss();
  }
  await loescheGesetz(ref);
  await warteAufSpeicherBatchAbschluss();
  expect((await leseSuchverzeichnis()).eintraege.map((e) => e.kurztitel)).toEqual(['Anderes']);
});
it('fasst eine Sammelspeicherung zu genau einem Lesen und Schreiben der Verzeichnisdatei zusammen', async () => {
  await gleicheSuchverzeichnisAb();
  io.lesen.mockClear();
  io.invoke.mockClear();
  await Promise.all(
    ['A', 'B', 'C'].map((kurztitel) =>
      speichereGesetz({ kurztitel, normgeber: 'de-bund' }, xml.replaceAll('Probe', kurztitel)),
    ),
  );
  await warteAufSpeicherBatchAbschluss();
  expect(io.lesen.mock.calls.filter(([p]) => p === 'cache/suchverzeichnis.json')).toHaveLength(1);
  expect(
    io.invoke.mock.calls.filter(
      ([n, a]) =>
        n === 'atomar_datei_schreiben' && a.relativerPfad === 'cache/suchverzeichnis.json',
    ),
  ).toHaveLength(1);
  expect((await leseSuchverzeichnis()).eintraege.map((e) => e.kurztitel).sort()).toEqual([
    'A',
    'B',
    'C',
  ]);
});
it('lässt Speichererfolg bei Pflegesperrfehler unverändert und entwertet den Cache bis zum nächsten Abgleich', async () => {
  await gleicheSuchverzeichnisAb();
  io.sperrfehler = 1;
  await expect(speichereGesetz(ref, xml)).resolves.toEqual(ref);
  await warteAufSpeicherBatchAbschluss();
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(false);
  const ergebnis = await gleicheSuchverzeichnisAb();
  expect(ergebnis.abgeglichen).toBe(true);
  expect(ergebnis.eintraege).toHaveLength(1);
});
it('prüft vorübergehend unlesbare Dateien beim nächsten Abgleich trotz unverändertem Stempel erneut', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  const lesen = io.lesen.getMockImplementation()!;
  io.lesen.mockImplementation(async (pfad) => {
    if (pfad === 'gesetze/Probe_de-bund.xml') throw Error('vorübergehend gesperrt');
    return lesen(pfad);
  });
  expect((await gleicheSuchverzeichnisAb()).eintraege[0]?.status).toBe('nicht-lesbar');
  io.lesen.mockImplementation(lesen);
  const wiederholt = await gleicheSuchverzeichnisAb();
  expect(wiederholt.abgeglichen).toBe(true);
  expect(wiederholt.eintraege[0]).toMatchObject({ status: 'in-ordnung', kurztitel: 'Probe' });
});
it('sichert beschädigte Dateien auf dem bisherigen Weg und entfernt ihren Eintrag sofort', async () => {
  const kaputt = '<kaputt>unbekannt</kaputt>';
  io.dateien.set('gesetze/Probe_de-bund.xml', kaputt);
  const ergebnis = await gleicheSuchverzeichnisAb();
  expect(ergebnis.befunde).toContainEqual({
    status: 'archiviert',
    dateiBasis: 'Probe_de-bund',
    sicherungspfad: 'gesetze/Probe_de-bund.xml.bak',
  });
  expect(io.dateien.get('gesetze/Probe_de-bund.xml.bak')).toBe(kaputt);
  expect(ergebnis.eintraege).toEqual([]);
  // Die Sicherung ist keine Zwischenänderung: Der Abgleich gilt als abgeschlossen.
  expect(ergebnis.abgeglichen).toBe(true);
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(true);
  await warteAufSpeicherBatchAbschluss();
});
it('listet den Gesetzesordner bis zur Sicherung einer beschädigten Datei nur einmal zusätzlich auf', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', '<kaputt>unbekannt</kaputt>');
  let bisZurSicherung: string[] | undefined;
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'archiviere_beschaedigte_datei') bisZurSicherung ??= [...io.auflistungen];
    return nativ?.(name, args);
  });
  await gleicheSuchverzeichnisAb();
  // Eine Auflistung für den Abgleich, eine unter der Referenzsperre der Sicherung.
  expect(bisZurSicherung?.filter((ordner) => ordner === 'gesetze')).toHaveLength(2);
  await warteAufSpeicherBatchAbschluss();
});
it('liest eine zwischen Lesen und Stempelprüfung geänderte Datei gezielt nach und schließt den Abgleich ab', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  io.dateien.set('gesetze/Anderes_de-bund.xml', xml.replaceAll('Probe', 'Anderes'));
  let geaendert = false;
  const lesen = io.lesen.getMockImplementation();
  io.lesen.mockImplementation(async (p) => {
    const inhalt = await lesen?.(p);
    // Genau einmal während des ersten Lesens ändern.
    if (p === 'gesetze/Probe_de-bund.xml' && !geaendert) {
      geaendert = true;
      io.stempel.set(p, 9);
      io.dateien.set(p, xml.replace('Probegesetz', 'Ganz anders'));
    }
    return inhalt;
  });
  const ergebnis = await gleicheSuchverzeichnisAb();
  expect(ergebnis.abgeglichen).toBe(true);
  expect(ergebnis.eintraege.find((e) => e.kurztitel === 'Probe')).toMatchObject({
    langtitel: 'Ganz anders',
  });
  const gelesen = io.lesen.mock.calls.map(([p]) => p).filter((p) => p.startsWith('gesetze/'));
  expect(gelesen.filter((p) => p === 'gesetze/Probe_de-bund.xml')).toHaveLength(2);
  expect(gelesen.filter((p) => p === 'gesetze/Anderes_de-bund.xml')).toHaveLength(1);
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(true);
});
it('verhindert veraltete Einträge, wenn sich eine Datei bei jedem Lesen ändert, und begrenzt das Nachlesen', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  io.lesen.mockImplementation(async (p) => {
    const inhalt = io.dateien.get(p);
    if (inhalt === undefined) throw Error('fehlt');
    if (p === 'gesetze/Probe_de-bund.xml') {
      io.stempel.set(p, (io.stempel.get(p) ?? 1) + 1);
      io.dateien.set(p, xml.replace('Probegesetz', 'Ganz anders'));
    }
    return inhalt;
  });
  expect((await gleicheSuchverzeichnisAb()).abgeglichen).toBe(false);
  expect((await leseSuchverzeichnis()).eintraege).toEqual([]);
  // Erstes Lesen und höchstens drei Nachleserunden.
  expect(io.lesen.mock.calls.filter(([p]) => p === 'gesetze/Probe_de-bund.xml')).toHaveLength(4);
});
it('gibt bei unveränderten Dateien nicht je Datei ab', async () => {
  for (let i = 0; i < 200; i++)
    io.dateien.set(`gesetze/G${i}_de-bund.xml`, xml.replace('Probe', `G${i}`));
  await gleicheSuchverzeichnisAb();
  const timer = vi.spyOn(globalThis, 'setTimeout');
  try {
    const ergebnis = await gleicheSuchverzeichnisAb();
    expect(ergebnis.abgeglichen).toBe(true);
    const abgaben = timer.mock.calls.filter(([, ms]) => !ms).length;
    expect(abgaben).toBeLessThan(20);
  } finally {
    timer.mockRestore();
  }
});
it('startet keinen zweiten parallelen Vollabgleich, sondern wartet auf den laufenden', async () => {
  for (let i = 0; i < 5; i++)
    io.dateien.set(`gesetze/G${i}_de-bund.xml`, xml.replace('Probe', `G${i}`));
  const laeufe = await Promise.all([
    gleicheSuchverzeichnisAb(),
    leseAbgeglichenesSuchverzeichnis(),
    gleicheSuchverzeichnisAb(),
  ]);
  expect(laeufe.every((s) => s.abgeglichen)).toBe(true);
  // Jede Datei genau einmal gelesen: der zweite Vollabgleich liest nach dem ersten nichts mehr.
  const gelesen = io.lesen.mock.calls.map(([p]) => p).filter((p) => p.startsWith('gesetze/'));
  expect(gelesen).toHaveLength(5);
  expect(new Set(gelesen).size).toBe(5);
});
it('erhält Einträge bei zwei verzahnten Fensterabgleichen und parallelem Speichern', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  vi.resetModules();
  const anderesFenster = await import('@/lib/persistenz/gesetz/gesetz.index');
  (await import('@/lib/markierungen/markierungen.index')).initialisiereMarkierungen();
  const zweitesGesetz = { kurztitel: 'Zweites', normgeber: 'de-bund' };
  await Promise.all([
    gleicheSuchverzeichnisAb(),
    anderesFenster.gleicheSuchverzeichnisAb(),
    anderesFenster.speichereGesetz(zweitesGesetz, xml.replaceAll('Probe', 'Zweites')),
  ]);
  await anderesFenster.warteAufSpeicherBatchAbschluss();
  expect((await leseSuchverzeichnis()).eintraege.map((e) => e.kurztitel).sort()).toEqual([
    'Probe',
    'Zweites',
  ]);
  expect((await gleicheSuchverzeichnisAb()).abgeglichen).toBe(true);
});

it.runIf(process.env.LEXLATA_MESSUNG === 'voll')(
  'misst den vollständigen Eintragstyp für 500 Gesetze mit realem Dateizugriff und getrennter Validierung',
  async () => {
    const fs = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { erzeugeSuchmessungBestand } = await import('@/test/import/suchmessungBestand');
    const gesetze = erzeugeSuchmessungBestand({ gesetze: 500, bund: 0, bw: 0, eu: 0 }).gesetze;
    const eintraege = gesetze.map((g) =>
      leiteSuchverzeichniseintragAb(g, {
        groesse: '123456',
        aenderungszeit: '1700000000123456789',
      }),
    );
    const stand = { version: 1, abgeglichen: true, eintraege };
    const ordner = await fs.mkdtemp(join(tmpdir(), 'lexlata-suchverzeichnis-'));
    const pfad = join(ordner, 'suchverzeichnis.json');
    const schreiben: number[] = [],
      lesen: number[] = [],
      validierung: number[] = [];
    try {
      let json = '';
      for (let i = 0; i < 11; i++) {
        let start = performance.now();
        json = JSON.stringify(stand);
        await fs.writeFile(pfad + '.tmp', json);
        await fs.rename(pfad + '.tmp', pfad);
        schreiben.push(performance.now() - start);
        start = performance.now();
        const inhalt = await fs.readFile(pfad, 'utf8');
        const gelesen: unknown = JSON.parse(inhalt);
        lesen.push(performance.now() - start);
        expect(gelesen).toHaveProperty('eintraege');
        io.dateien.set('cache/suchverzeichnis.json', inhalt);
        start = performance.now();
        expect((await leseSuchverzeichnis()).eintraege).toHaveLength(500);
        validierung.push(performance.now() - start);
      }
      const reihe = (werte: number[]) => ({
        erster: werte[0],
        min: Math.min(...werte.slice(1)),
        median: [...werte.slice(1)].sort((a, b) => a - b)[5],
        max: Math.max(...werte.slice(1)),
      });
      const messung = {
        gesetze: 500,
        normen: eintraege.reduce((n, e) => n + e.normen.length, 0),
        bytes: Buffer.byteLength(json),
        schreiben: reihe(schreiben),
        lesen: reihe(lesen),
        validierung: reihe(validierung),
      };
      await fs.mkdir('.reports/messungen', { recursive: true });
      await fs.writeFile(
        '.reports/messungen/suchverzeichnis-phase2.json',
        JSON.stringify(messung, null, 2),
      );
    } finally {
      await fs.rm(ordner, { recursive: true, force: true });
    }
  },
);

it('erkennt neu konkurrierende Dateien auch bei identischen unveränderten Stempeln', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  await gleicheSuchverzeichnisAb();
  io.dateien.set('gesetze/probe_de-bund.XML', xml);
  const ergebnis = await gleicheSuchverzeichnisAb();
  expect(ergebnis.eintraege).toHaveLength(1);
  expect(ergebnis.eintraege[0]?.status).toBe('nicht-lesbar');
  expect(
    ergebnis.befunde.some((b) => b.status === 'unlesbar' && b.fehler.includes('Mehrere Dateien')),
  ).toBe(true);
});
it('pflegt auch den reinen Prüfzeitpunkt ohne inhaltliche Gesetzesänderung', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  await gleicheSuchverzeichnisAb();
  await speichereGesetz(ref, xml.replace('2025-01-02T03:04:05Z', '2026-02-03T04:05:06Z'), {
    inhaltGeaendert: false,
  });
  await warteAufSpeicherBatchAbschluss();
  const [e] = (await leseSuchverzeichnis()).eintraege;
  expect(e?.status === 'in-ordnung' && e.verarbeitungszeit).toEqual(
    new Date('2026-02-03T04:05:06Z'),
  );
});
it('behandelt unvollständige native Stempelantworten als unbekannt und sendet keinen Pfad', async () => {
  io.invoke.mockResolvedValueOnce([
    { name: 'Probe_de-bund.xml', dateistempel: { groesse: '10', aenderungszeit: null } },
  ]);
  expect(await pruefeGesetzExistenz(ref)).toBe('unbekannt');
  expect(io.invoke).toHaveBeenCalledWith('gesetz_dateistempel_lesen');
});

it('verwechselt einen Cache-Sperrfehler nicht mit einem unlesbaren Gesetzesordner', async () => {
  await gleicheSuchverzeichnisAb();
  io.sperrfehler = 1;
  const ergebnis = await gleicheSuchverzeichnisAb();
  expect(ergebnis.abgeglichen).toBe(false);
  expect(ergebnis.befunde).toEqual([]);
  expect(ergebnis.fehler).toBeDefined();
});

it('bestätigt die Frische eines einzelnen Eintrags anhand der Metadaten ohne erneutes XML-Lesen und verwirft Änderungen oder konkurrierende Dateien', async () => {
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  const eintrag = (await gleicheSuchverzeichnisAb()).eintraege[0];
  if (!eintrag) throw new Error('Erwarteter Eintrag fehlt');
  io.lesen.mockClear();
  expect(await istSuchverzeichniseintragAktuell(eintrag)).toBe(true);
  io.dateien.set('gesetze/Probe_de-bund.xml', xml + ' ');
  expect(await istSuchverzeichniseintragAktuell(eintrag)).toBe(false);
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  io.stempel.set('gesetze/Probe_de-bund.xml', 2);
  expect(await istSuchverzeichniseintragAktuell(eintrag)).toBe(false);
  io.stempel.set('gesetze/Probe_de-bund.xml', 1);
  io.dateien.set('gesetze/probe_de-bund.xml', xml);
  expect(await istSuchverzeichniseintragAktuell(eintrag)).toBe(false);
  io.ordnerFehler = true;
  expect(await istSuchverzeichniseintragAktuell(eintrag)).toBe(false);
  expect(io.lesen.mock.calls).toEqual([]);
});

it('veröffentlicht den Neuaufbau in wachsenden Paketen statt je Gesetz die ganze Datei zu schreiben', async () => {
  for (let i = 0; i < 127; i++)
    io.dateien.set(`gesetze/G${i}_de-bund.xml`, xml.replace('Probe', `G${i}`));
  const ergebnis = await gleicheSuchverzeichnisAb();
  expect(ergebnis.abgeglichen).toBe(true);
  expect(ergebnis.eintraege).toHaveLength(127);
  const cacheSchreiben = io.invoke.mock.calls.filter(
    ([name, args]) =>
      name === 'atomar_datei_schreiben' && args.relativerPfad === 'cache/suchverzeichnis.json',
  );
  expect(cacheSchreiben.length).toBeLessThanOrEqual(9);
});
