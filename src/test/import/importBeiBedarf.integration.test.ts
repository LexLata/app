// Öffentliche Importabnahmen für Einzelzugriffe und abgeglichenes Suchverzeichnis; nur native I/O ersetzt.
import { afterEach, expect, it, vi } from 'vitest';
import { io, ref, xml } from '@/test/suchverzeichnis/suchverzeichnisNativeAttrappe';
import { warteAufSpeicherBatchAbschluss } from '@/lib/persistenz/gesetz/gesetz.index';
afterEach(async () => {
  await warteAufSpeicherBatchAbschluss();
  vi.unstubAllGlobals();
});
it('wartet beim Dateiimport auf den Abgleich und erkennt anschließend installierte Verweisziele', async () => {
  const { mitGesetzDateiImport } = await import('@/lib/import/import.index');
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  let freigeben = () => {};
  const wartet = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const vorher = io.invoke.getMockImplementation();
  if (!vorher) throw new Error('Native Ausgangsattrappe fehlt');
  let begonnen = () => {};
  const start = new Promise<void>((resolve) => {
    begonnen = resolve;
  });
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (name === 'gesetz_dateistempel_lesen') {
      begonnen();
      await wartet;
    }
    return vorher(name, args);
  });
  let fertig = false;
  const lauf = mitGesetzDateiImport((importiereDatei) =>
    importiereDatei(
      'kanonisch-xml',
      xml.replaceAll('Probe', 'Neu').replace('Inhalt', 'Siehe § 1 Probe.'),
      { nachbereitungBeiImport: 'saetze-und-verweise', meldungEmpfangen: () => {} },
    ),
  ).then((r) => {
    fertig = true;
    return r;
  });
  await start;
  expect(fertig).toBe(false);
  freigeben();
  const ergebnis = await lauf;
  expect(ergebnis).toMatchObject({ art: 'neu' });
  expect(io.dateien.get('gesetze/Neu_de-bund.xml')).toContain('gesetz="Probe"');
  await warteAufSpeicherBatchAbschluss();
});

it.each(['fehlend', 'veraltet'] as const)(
  'klassifiziert vorhandene Dateien bei %s Suchverzeichnis als Konflikt und liest nur die betroffene Datei',
  async (stand) => {
    const { mitGesetzDateiImport, importiereGesetzesreferenz } =
      await import('@/lib/import/import.index');
    io.dateien.set('gesetze/Probe_de-bund.xml', xml);
    io.dateien.set('gesetze/Fremd_de-bund.xml', xml.replaceAll('Probe', 'Fremd'));
    if (stand === 'veraltet')
      io.dateien.set(
        'cache/suchverzeichnis.json',
        JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
      );
    const vorher = io.invoke.getMockImplementation();
    if (!vorher) throw new Error('Native Ausgangsattrappe fehlt');
    io.invoke.mockImplementation(async (name, args) =>
      name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? true : vorher(name, args),
    );
    expect(
      await mitGesetzDateiImport((importiereDatei) =>
        importiereDatei('kanonisch-xml', xml.replace('Inhalt', 'Neuer Inhalt')),
      ),
    ).toMatchObject({ art: 'konflikt' });
    expect(await importiereGesetzesreferenz(ref)).toMatchObject({
      art: 'erfolg',
      unveraendert: true,
      gesetz: { kurztitel: 'Probe' },
    });
    expect(io.dateien.get('gesetze/Probe_de-bund.xml')).toBe(xml);
    expect(
      io.lesen.mock.calls
        .filter(([pfad]) => pfad.startsWith('gesetze/'))
        .every(([pfad]) => pfad === 'gesetze/Probe_de-bund.xml'),
    ).toBe(true);
  },
);

it.each(['de-bund', 'de-bw', 'eu'])(
  'prüft den Quellenimport %s ausschließlich an seiner betroffenen Datei',
  async (normgeber) => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const { importiereGesetze } = await import('@/lib/import/import.index');
    io.dateien.set(`gesetze/Probe_${normgeber}.xml`, xml.replaceAll('de-bund', normgeber));
    io.dateien.set('gesetze/Fremd_de-bund.xml', xml.replaceAll('Probe', 'Fremd'));
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    io.dateien.set(
      `importindizes/${normgeber === 'eu' ? 'eu' : normgeber}.xml`,
      `<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>${normgeber}</normgeber><datenquelle name="Quelle"/></infos><inhalt><gesetz><kurztitel>Probe</kurztitel><langtitel>Probegesetz</langtitel><abrufkennung>probe</abrufkennung></gesetz></inhalt></importindex>`,
    );
    if (normgeber === 'eu')
      io.dateien.set('resources/europa/Probe.xml', xml.replaceAll('de-bund', 'eu'));
    const vorher = io.invoke.getMockImplementation();
    if (!vorher) throw new Error('Native Ausgangsattrappe fehlt');
    io.invoke.mockImplementation(async (name, args) =>
      name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? true : vorher(name, args),
    );
    const result = await importiereGesetze(
      [normgeber === 'eu' ? { kurztitel: 'Probe', abrufkennung: 'Probe.xml' } : 'Probe'],
      normgeber,
    );
    expect(result.fehlgeschlagene[0]?.fehler.grund).toBe('bereitsVorhanden');
    expect(
      io.lesen.mock.calls.filter(([pfad]) => pfad.startsWith('gesetze/')).map(([pfad]) => pfad),
    ).toEqual([`gesetze/Probe_${normgeber}.xml`]);
  },
);

// Die 1000-Dateien-Messung läuft exklusiv mit LEXLATA_IMPORT_MESSUNG=1; die Suite prüft denselben Vertrag mit zehn Dateien.
const messdateien = process.env.LEXLATA_IMPORT_MESSUNG === '1' ? 1000 : 10;
it.each(['aus', 'saetze-und-verweise'] as const)(
  `pflegt das Suchverzeichnis beim Import von ${messdateien} Dateien mit Nachbereitung %s je Speicher-Batch`,
  async (nachbereitungBeiImport) => {
    const { mitGesetzDateiImport } = await import('@/lib/import/import.index');
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const vorher = io.invoke.getMockImplementation();
    if (!vorher) throw new Error('Native Ausgangsattrappe fehlt');
    io.invoke.mockImplementation(async (name, args) =>
      name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? true : vorher(name, args),
    );
    const anfang = performance.now();
    await mitGesetzDateiImport(async (importiereDatei) => {
      for (let nr = 0; nr < messdateien; nr++) {
        const ergebnis = await importiereDatei(
          'kanonisch-xml',
          xml.replaceAll('Probe', `Probe${nr}`),
          { nachbereitungBeiImport },
        );
        expect(ergebnis.art).toBe('neu');
      }
    });
    await warteAufSpeicherBatchAbschluss();
    const dauerMs = performance.now() - anfang;
    const lesen = io.lesen.mock.calls.filter(
      ([pfad]) => pfad === 'cache/suchverzeichnis.json',
    ).length;
    const schreiben = io.invoke.mock.calls.filter(
      ([name, args]) =>
        name === 'atomar_datei_schreiben' && args.relativerPfad === 'cache/suchverzeichnis.json',
    );
    expect(lesen).toBe(nachbereitungBeiImport === 'aus' ? 1 : 2);
    expect(schreiben).toHaveLength(1);
    const cacheSchreiben = schreiben[0];
    if (!cacheSchreiben) throw new Error('Cache wurde nicht geschrieben');
    expect(JSON.parse(cacheSchreiben[1].inhalt).eintraege).toHaveLength(messdateien);
    const cacheBytes = new TextEncoder().encode(cacheSchreiben[1].inhalt).byteLength;
    const gesetzBytes = io.invoke.mock.calls
      .filter(
        ([name, args]) =>
          name === 'atomar_datei_schreiben' && args.relativerPfad.startsWith('gesetze/'),
      )
      .reduce((summe, [, args]) => summe + new TextEncoder().encode(args.inhalt).byteLength, 0);
    process.stdout.write(
      'P16-A2 ' +
        JSON.stringify({
          dateien: messdateien,
          nachbereitungBeiImport,
          cacheLesen: lesen,
          cacheSchreiben: schreiben.length,
          dauerMs,
          cacheBytes,
          gesetzBytes,
        }) +
        '\n',
    );
  },
);

it.each(['unlesbar', 'archiviert', 'sicherung_fehlgeschlagen', 'reparierbar'] as const)(
  'erhält den Befund der betroffenen Datei (%s) und startet keinen ersetzenden Import',
  async (fall) => {
    const { importiereGesetzesreferenz } = await import('@/lib/import/import.index');
    const pfad = 'gesetze/Probe_de-bund.xml';
    io.dateien.set(
      pfad,
      fall === 'reparierbar'
        ? '<gesetz><infos><kurztitel>Probe</kurztitel><normgeber>de-bund</normgeber></infos>'
        : '<defekt',
    );
    const vorher = io.invoke.getMockImplementation();
    if (!vorher) throw new Error('Native Ausgangsattrappe fehlt');
    io.invoke.mockImplementation(async (name, args) => {
      if (name === 'archiviere_beschaedigte_datei' && fall === 'sicherung_fehlgeschlagen')
        throw Error('Sicherung verweigert');
      return vorher(name, args);
    });
    if (fall === 'unlesbar') io.lesen.mockRejectedValue(Error('Datei gesperrt'));
    const meldungen: unknown[] = [];
    const ergebnis = await importiereGesetzesreferenz(ref, undefined, (meldung) =>
      meldungen.push(meldung),
    );
    expect(ergebnis).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'laden' },
      bestandspruefung: {
        status: 'nicht-lesbar',
        befunde: [{ status: fall, dateiBasis: 'Probe_de-bund' }],
      },
    });
    expect(ergebnis.ladeabschluss).toEqual(ergebnis.bestandspruefung);
    expect(meldungen.length).toBeGreaterThan(0);
    expect(
      io.invoke.mock.calls.some(([name]) => name === 'gesetz_import_sperre_versuchen_zu_erhalten'),
    ).toBe(false);
    if (fall === 'archiviert') expect(io.dateien.get(pfad + '.bak')).toBe('<defekt');
    else expect(io.dateien.has(pfad)).toBe(true);
  },
);

it('erhält optionale Titelbefunde beim Einzelimport trotz erfolgreich geladenem Gesetz', async () => {
  const { importiereGesetzesreferenz } = await import('@/lib/import/import.index');
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  io.dateien.set('nichtamtliche-titel/Probe_de-bund-nichtamtliche-titel.xml', '<defekt');
  const meldungen: unknown[] = [];
  const ergebnis = await importiereGesetzesreferenz(ref, undefined, (m) => meldungen.push(m));
  expect(ergebnis).toMatchObject({
    art: 'erfolg',
    unveraendert: true,
    bestandspruefung: { status: 'geladen' },
  });
  expect(meldungen.length).toBeGreaterThan(0);
});

it('ergänzt bestätigte eigene Kurztitel im offenen Importbatch und liest das Verzeichnis zweimal', async () => {
  const { mitGesetzDateiImport } = await import('@/lib/import/import.index');
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  const vorher = io.invoke.getMockImplementation();
  if (!vorher) throw Error('Native Ausgangsattrappe fehlt');
  io.invoke.mockImplementation(async (name, args) =>
    name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? true : vorher(name, args),
  );
  await mitGesetzDateiImport(async (importieren) => {
    expect(
      await importieren('kanonisch-xml', xml, {
        nachbereitungBeiImport: 'saetze-und-verweise',
        meldungEmpfangen: () => {},
      }),
    ).toMatchObject({ art: 'neu' });
    expect(
      await importieren(
        'kanonisch-xml',
        xml.replaceAll('Probe', 'Neu').replace('Inhalt', 'Siehe § 1 Probe.'),
        { nachbereitungBeiImport: 'saetze-und-verweise', meldungEmpfangen: () => {} },
      ),
    ).toMatchObject({ art: 'neu' });
  });
  await warteAufSpeicherBatchAbschluss();
  expect(io.dateien.get('gesetze/Neu_de-bund.xml')).toContain('gesetz="Probe"');
  expect(
    io.lesen.mock.calls.filter(([pfad]) => pfad === 'cache/suchverzeichnis.json'),
  ).toHaveLength(2);
});

it.each([false, true])(
  'bewahrt fremde Cacheänderungen beim frischen Merge und verwirft veraltete eigene Befunde (eigene Datei fremd geändert: %s)',
  async (geaendert) => {
    const { gleicheSuchverzeichnisAb } = await import('@/lib/persistenz/gesetz/gesetz.index');
    const { mitGesetzDateiImport } = await import('@/lib/import/import.index');
    const fremd = xml.replaceAll('Probe', 'Fremd');
    io.dateien.set('gesetze/Fremd_de-bund.xml', fremd);
    await gleicheSuchverzeichnisAb();
    const fremderStand = io.dateien.get('cache/suchverzeichnis.json');
    if (!fremderStand) throw Error('Fremder Verzeichnisstand fehlt');
    io.dateien.delete('gesetze/Fremd_de-bund.xml');
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    io.lesen.mockClear();
    io.invoke.mockClear();
    const vorher = io.invoke.getMockImplementation();
    if (!vorher) throw Error('Native Ausgangsattrappe fehlt');
    io.invoke.mockImplementation(async (name, args) =>
      name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? true : vorher(name, args),
    );
    let eigeneDatei: string | undefined;
    await mitGesetzDateiImport(async (importieren) => {
      expect(
        await importieren('kanonisch-xml', xml, { nachbereitungBeiImport: 'saetze-und-verweise' }),
      ).toMatchObject({ art: 'neu' });
      eigeneDatei = io.dateien.get('gesetze/Probe_de-bund.xml');
      // Das andere Fenster veröffentlicht unter seiner eigenen Sperre einen fremden Eintrag.
      io.dateien.set('gesetze/Fremd_de-bund.xml', fremd);
      io.dateien.set('cache/suchverzeichnis.json', fremderStand);
      if (geaendert) {
        io.dateien.set('gesetze/Probe_de-bund.xml', xml.replace('Inhalt', 'Fremd geändert'));
        io.stempel.set('gesetze/Probe_de-bund.xml', ++io.zeit);
      }
      expect(
        await importieren('kanonisch-xml', xml.replaceAll('Probe', 'Neu'), {
          nachbereitungBeiImport: 'saetze-und-verweise',
        }),
      ).toMatchObject({ art: 'neu' });
    });
    await warteAufSpeicherBatchAbschluss();
    const gespeichert = io.dateien.get('cache/suchverzeichnis.json');
    if (!gespeichert) throw Error('Verzeichnisabschluss fehlt');
    const stand = JSON.parse(gespeichert);
    expect(stand.eintraege.map((e: { kurztitel: string }) => e.kurztitel).sort()).toEqual(
      geaendert ? ['Fremd', 'Neu'] : ['Fremd', 'Neu', 'Probe'],
    );
    expect(stand.abgeglichen).toBe(!geaendert);
    expect(io.dateien.get('gesetze/Probe_de-bund.xml')).toBe(
      geaendert ? xml.replace('Inhalt', 'Fremd geändert') : eigeneDatei,
    );
    expect(
      io.lesen.mock.calls.filter(([pfad]) => pfad === 'cache/suchverzeichnis.json'),
    ).toHaveLength(2);
    expect(
      io.invoke.mock.calls.filter(
        ([name, args]) =>
          name === 'atomar_datei_schreiben' && args.relativerPfad === 'cache/suchverzeichnis.json',
      ),
    ).toHaveLength(1);
  },
);
