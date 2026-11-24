// Prüft echte Markierungsaktionen und Konfliktanzeige mit ausschließlich ersetzten nativen Grenzen.
import { beforeEach, expect, it, vi } from 'vitest';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';

const m = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  lesen: vi.fn(),
  invoke: vi.fn(),
  ereignis: vi.fn(),
  beimKonfliktschreiben: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: m.invoke }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: m.ereignis }));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  return dateiAttrappen(m.dateien, m.lesen);
});

let markierungen: typeof import('@/lib/markierungen/markierungen.index');
const ausgang = gesetzesreferenz();
const ziel = gesetzesreferenz({ kurztitel: 'GG' });
const eintrag = markierungsEintrag({
  typ: 'verweismarkierung',
  verweisinhalt: {
    verweistext: '§ 1 GG',
    verweisziele: [
      verweisziel({
        typ: 'zielnorm',
        gesetz: ziel,
        bezeichnung: '§ 1',

        elementstand: { textlaenge: 999 },
        verweistextZeichenbereich: [0, 6],
      }),
    ],
  },
});
function gesetzXml(kurztitel: string, normgeber = 'de-bund') {
  return `<gesetz><infos><kurztitel>${kurztitel}</kurztitel><langtitel>${kurztitel}</langtitel><normgeber>${normgeber}</normgeber></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)">Text.</absatz></text></norm></inhalt></gesetz>`;
}

function pflichtangabe<T>(wert: T | undefined): T {
  if (wert === undefined) throw new Error('Pflichtangabe im nativen Testaufruf fehlt.');
  return wert;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  m.dateien.clear();
  m.dateien.set('markierungskonflikte.xml', '<markierungskonflikte pruefstatus="aktuell"/>');
  m.dateien.set('gesetze/BGB_de-bund.xml', gesetzXml('BGB'));
  m.dateien.set('gesetze/GG_de-bund.xml', gesetzXml('GG'));
  m.lesen.mockImplementation(async (pfad: string) => {
    const inhalt = m.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw Error('Datei fehlt');
    return inhalt;
  });
  const gehalten = new Set<string>();
  const wartende = new Map<string, (() => void)[]>();
  const quellen = new Set<string>();
  const pruefungen = new Set<string>();
  let nummer = 0;
  let vollbedarf = false;
  // Nativer Änderungszähler: jede Vorgangsänderung und jedes Schreiben der
  // Konfliktdatei; Fortsetzen meldet, ob seit dem Unterbrechen etwas geschah.
  let aenderungen = 0;
  const unterbrochenBei = new Map<string, number>();
  function pruefvorgang(befehl: string, vorgaenge: readonly string[] = []) {
    if (!['pruefvorgang_abfragen', 'pruefvorgang_quellen_abwarten'].includes(befehl)) aenderungen++;
    if (befehl === 'pruefvorgang_registrieren') {
      const vorgang = `v${++nummer}`;
      quellen.add(vorgang);
      pruefungen.add(vorgang);
      return vorgang;
    }
    if (
      [
        'pruefvorgang_quelle_abschliessen',
        'pruefvorgang_fehler',
        'pruefvorgang_abbrechen',
      ].includes(befehl)
    )
      for (const id of vorgaenge ?? []) quellen.delete(id);
    if (befehl === 'pruefvorgang_teilpruefung_abschliessen')
      for (const id of vorgaenge ?? []) pruefungen.delete(id);
    if (befehl === 'pruefvorgang_vollbedarf' || befehl === 'pruefvorgang_fehler') vollbedarf = true;
    if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return false;
    if (befehl === 'pruefvorgang_vollpruefung_abschliessen') {
      vollbedarf = false;
      pruefungen.clear();
    }
    if (befehl.startsWith('pruefvorgang_'))
      return {
        offeneQuellen: quellen.size,
        offenePruefungen: pruefungen.size,
        vollbedarf,
      };
  }
  // Der Token ist hier der Pfad; Unterbrechen gibt frei, Fortsetzen erwirbt
  // in derselben Warteschlange neu.
  async function sperre(befehl: string, args: { relativerPfad?: string; token?: string }) {
    if (befehl === 'datei_sperre_erwerben' || befehl === 'datei_sperre_fortsetzen') {
      const pfad = pflichtangabe(args.relativerPfad ?? args.token);
      if (gehalten.has(pfad))
        await new Promise<void>((weiter) => {
          const queue = wartende.get(pfad) ?? [];
          queue.push(weiter);
          wartende.set(pfad, queue);
        });
      gehalten.add(pfad);
      if (befehl === 'datei_sperre_erwerben') return pfad;
      const unveraendert = unterbrochenBei.get(pfad) === aenderungen;
      unterbrochenBei.delete(pfad);
      return unveraendert;
    }
    const token = pflichtangabe(args.token);
    if (befehl === 'datei_sperre_unterbrechen') unterbrochenBei.set(token, aenderungen);
    const naechster = wartende.get(token)?.shift();
    if (naechster) naechster();
    else gehalten.delete(token);
    return undefined;
  }
  m.invoke.mockImplementation(
    async (
      befehl: string,
      args: {
        relativerPfad?: string;
        token?: string;
        inhalt?: string;
        vorgaenge?: string[];
      },
    ) => {
      if (befehl.startsWith('datei_sperre_')) return sperre(befehl, args);
      if (befehl === 'atomar_datei_schreiben') {
        if (args.relativerPfad === 'markierungskonflikte.xml') {
          aenderungen++;
          m.beimKonfliktschreiben(pflichtangabe(args.inhalt));
        }
        m.dateien.set(pflichtangabe(args.relativerPfad), pflichtangabe(args.inhalt));
        return;
      }
      if (befehl.startsWith('pruefvorgang_')) return pruefvorgang(befehl, args.vorgaenge);
      if (befehl === 'hauptfenster_hinweis_senden') return;
      throw Error(`Unerwarteter nativer Befehl: ${befehl}`);
    },
  );
  markierungen = await import('@/lib/markierungen/markierungen.index');
  markierungen.initialisiereMarkierungen();
  await markierungen.hinzufuegenMarkierung(ausgang, eintrag, () => {});
  await markierungen.pruefeAlleMarkierungen(() => {});
  expect((await markierungen.ladeMarkierungskonflikteFuerAnzeige()).gesetze).toHaveLength(1);
  m.lesen.mockClear();
});

it('lädt für bekannte Konflikte nur Ausgangsgesetze und die tatsächlich verknüpften Zielgesetze', async () => {
  m.dateien.set('gesetze/Unbeteiligt_de-bund.xml', 'beschädigt');
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige.pruefstatus).toBe('aktuell');
  expect(anzeige.gesetze[0]?.eintraege[0]?.zielKonflikte).toEqual([
    expect.objectContaining({ gesetz: ziel, typ: 'zielNormUnpassend' }),
  ]);
  expect(m.lesen.mock.calls.map(([pfad]) => pfad)).not.toContain(
    '/daten/LexLata/gesetze/Unbeteiligt_de-bund.xml',
  );
});

it('entfernt eine Markierung und schließt deren Prüfung ab, ohne unbeteiligte Gesetze einzulesen', async () => {
  m.dateien.set('gesetze/Unbeteiligt_de-bund.xml', 'beschädigt');
  await markierungen.entferneMarkierung(ausgang, eintrag);
  // Der Anzeigeauftrag wartet in derselben Queue auf die nachgelagerte Einzelprüfung.
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige).toEqual({ pruefstatus: 'aktuell', gesetze: [] });
  expect(m.lesen.mock.calls.map(([pfad]) => pfad)).not.toContain(
    '/daten/LexLata/gesetze/Unbeteiligt_de-bund.xml',
  );
});

it('prüft auch mehrere geänderte Markierungen eines Gesetzes ohne unbeteiligte Gesetzquellen', async () => {
  m.dateien.set('gesetze/Unbeteiligt_de-bund.xml', 'beschädigt');
  await (
    await import('./markierungskonflikte.index')
  ).pruefeMarkierungenSelektiv([ausgang], { nurEigeneMarkierungen: true });
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige.pruefstatus).toBe('aktuell');
  expect(anzeige.gesetze[0]?.eintraege[0]?.zielKonflikte).toEqual([
    expect.objectContaining({ gesetz: ziel, typ: 'zielNormUnpassend' }),
  ]);
  expect(m.lesen.mock.calls.map(([pfad]) => pfad)).not.toContain(
    '/daten/LexLata/gesetze/Unbeteiligt_de-bund.xml',
  );
});

it('verarbeitet Hinzufügen und erneutes Anklicken zum Entfernen ohne unbeteiligte Gesetzquellen', async () => {
  const unterstreichung = markierungsEintrag({ typ: 'unterstreichung' });
  m.dateien.set('gesetze/Unbeteiligt_de-bund.xml', 'beschädigt');
  expect(await markierungen.hinzufuegenMarkierung(ausgang, unterstreichung)).toMatchObject({
    erfolgreich: true,
    aktion: { art: 'hinzufuegen' },
  });
  expect(await markierungen.hinzufuegenMarkierung(ausgang, unterstreichung)).toMatchObject({
    erfolgreich: true,
    aktion: { art: 'ersetzen', rest: [] },
  });
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige.pruefstatus).toBe('aktuell');
  expect((await markierungen.ladeMarkierungen(ausgang)).map((e) => e.typ)).toEqual([
    'verweismarkierung',
  ]);
  expect(m.lesen.mock.calls.map(([pfad]) => pfad)).not.toContain(
    '/daten/LexLata/gesetze/Unbeteiligt_de-bund.xml',
  );
});

it('schließt eine unmittelbar folgende Markierungsänderung ohne Freigabe einer unbeteiligten langsamen Quelle ab', async () => {
  const pfad = '/daten/LexLata/gesetze/Langsam_de-bund.xml';
  m.dateien.set('gesetze/Langsam_de-bund.xml', gesetzXml('Langsam'));
  let freigeben!: () => void;
  const wartet = new Promise<string>((weiter) => {
    freigeben = () => weiter(gesetzXml('Langsam'));
  });
  const lesen = pflichtangabe(m.lesen.getMockImplementation());
  m.lesen.mockImplementation((quelle: string) => (quelle === pfad ? wartet : lesen(quelle)));
  let abgeschlossen = false;
  const anzeige = markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  const entfernen = markierungen.entferneMarkierung(ausgang, eintrag);
  const folge = Promise.all([anzeige, entfernen]).then(() => {
    abgeschlossen = true;
  });
  try {
    await vi.waitFor(() => expect(abgeschlossen).toBe(true));
    expect(m.lesen.mock.calls.map(([quelle]) => quelle)).not.toContain(pfad);
  } finally {
    freigeben();
    await folge;
  }
  expect(await markierungen.ladeMarkierungskonflikteFuerAnzeige()).toEqual({
    pruefstatus: 'aktuell',
    gesetze: [],
  });
});

it('erkennt ein inzwischen fehlendes benötigtes Zielgesetz weiterhin als Zielkonflikt', async () => {
  m.dateien.delete('gesetze/GG_de-bund.xml');
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige.pruefstatus).toBe('aktuell');
  expect(anzeige.gesetze[0]?.eintraege[0]?.zielKonflikte).toEqual([
    expect.objectContaining({ gesetz: ziel, typ: 'zielGesetzFehlt' }),
  ]);
});

it('meldet beschädigte benötigte Zielquellen weiterhin als fehlgeschlagene Prüfung', async () => {
  m.dateien.set('gesetze/GG_de-bund.xml', '<defekt>');
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige.pruefstatus).toBe('fehlgeschlagen');
  expect(anzeige.gesetze[0]?.eintraege[0]?.zielKonflikte[0]?.bezeichnungenAnzeige).toEqual([]);
});

it('verwechselt gleichnamige Gesetze verschiedener Normgeber nicht', async () => {
  m.dateien.set('gesetze/GG_de-by.xml', '<defekt>');
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige.pruefstatus).toBe('aktuell');
  expect(anzeige.gesetze[0]?.eintraege[0]?.zielKonflikte[0]?.gesetz).toEqual(ziel);
  expect(m.lesen.mock.calls.map(([pfad]) => pfad)).not.toContain(
    '/daten/LexLata/gesetze/GG_de-by.xml',
  );
});

it('weist konkurrierende Schreibweisen einer benötigten Gesetzesreferenz weiter zurück', async () => {
  m.dateien.set('gesetze/gg_de-bund.xml', gesetzXml('GG'));
  const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
  expect(anzeige.pruefstatus).toBe('fehlgeschlagen');
});

it.each(['einzeln', 'sammeln'] as const)(
  'setzt geaendert beim Verknüpfungsabgleich (%s) und schreibt ohne Inhaltsänderung nichts',
  async (modus) => {
    const { aktualisiereVerknuepfungMitErgebnis, verknuepfeMitAktuellenNormen } =
      await import('./konfliktaktionen/konfliktaktionen.verknuepfen');
    const { parseEintraege } =
      await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
    const { zusammenfuehrenMarkierungen } =
      await import('@/lib/markierungen/dateiimport/dateiimport.index');
    const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
    const unbetroffen = {
      ...markierungsEintrag({
        typ: 'kommentar',
        kommentarText: 'Unverändert',
        elementstand: { textlaenge: 5 },
      }),
      erstellt: '2026-11-05T08:00:00Z',
      geaendert: '2026-11-05T09:00:00Z',
    };
    await zusammenfuehrenMarkierungen(ausgang, [unbetroffen]);
    const vorher = parseEintraege(pflichtangabe(m.dateien.get(pfad))).eintraege;
    const anzeige = await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {});
    const schluessel = pflichtangabe(pflichtangabe(anzeige.gesetze[0]).eintraege[0]).schluessel;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    try {
      const ausfuehren = () =>
        modus === 'sammeln'
          ? verknuepfeMitAktuellenNormen(anzeige.gesetze, () => {})
          : aktualisiereVerknuepfungMitErgebnis(
              ausgang,
              schluessel,
              ziel,
              'verknuepfen',
              { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
              () => {},
            );
      await ausfuehren();
      const nachher = parseEintraege(pflichtangabe(m.dateien.get(pfad))).eintraege;
      expect(nachher.find((e) => e.typ === 'verweismarkierung')).toMatchObject({
        erstellt: pflichtangabe(vorher.find((e) => e.typ === 'verweismarkierung')).erstellt,
        geaendert: '2026-11-05T12:00:00Z',
      });
      expect(nachher).toContainEqual(unbetroffen);
      m.invoke.mockClear();
      await ausfuehren();
      expect(
        m.invoke.mock.calls.filter(
          ([befehl, args]) => befehl === 'atomar_datei_schreiben' && args.relativerPfad === pfad,
        ),
      ).toEqual([]);
      expect(parseEintraege(pflichtangabe(m.dateien.get(pfad))).eintraege).toEqual(nachher);
    } finally {
      vi.useRealTimers();
    }
  },
);

function halteQuelleAn(datei: string) {
  const pfad = `/daten/LexLata/${datei}`;
  const lesen = pflichtangabe(m.lesen.getMockImplementation());
  let freigeben!: () => void;
  const tor = new Promise<void>((weiter) => {
    freigeben = weiter;
  });
  let erreicht!: () => void;
  const angehalten = new Promise<void>((weiter) => {
    erreicht = weiter;
  });
  let einmal = true;
  m.lesen.mockImplementation(async (quelle: string) => {
    if (quelle === pfad && einmal) {
      einmal = false;
      // Der Lesestand entsteht vor dem Anhalten und ist danach womöglich veraltet.
      const gelesen = lesen(quelle);
      erreicht();
      await tor;
      return gelesen;
    }
    return lesen(quelle);
  });
  return { angehalten, freigeben };
}

it('beendet ein zweites Speichern, während die Prüfung des ersten an einer Quelle hängt', async () => {
  const quelle = halteQuelleAn('markierungen/BGB_de-bund-markierungen.xml');
  const pruefung = markierungen.pruefeAlleMarkierungen(() => {});
  let gespeichert = false;
  try {
    await quelle.angehalten;
    const zweites = markierungen
      .hinzufuegenMarkierung(ausgang, markierungsEintrag({ typ: 'unterstreichung' }))
      .then((ergebnis) => {
        gespeichert = true;
        return ergebnis;
      });
    await vi.waitFor(() => expect(gespeichert).toBe(true));
    expect(await zweites).toMatchObject({ erfolgreich: true });
  } finally {
    quelle.freigeben();
    await pruefung;
  }
  expect((await markierungen.ladeMarkierungen(ausgang)).map((e) => e.typ).sort()).toEqual([
    'unterstreichung',
    'verweismarkierung',
  ]);
  expect((await markierungen.ladeMarkierungskonflikteFuerAnzeige()).pruefstatus).toBe('aktuell');
});

it('schreibt nach einer Markierungsänderung während der Prüfung keinen veralteten geprüften Stand', async () => {
  const markierungsdatei = 'markierungen/BGB_de-bund-markierungen.xml';
  const quelle = halteQuelleAn(markierungsdatei);
  const geprueft: { konflikte: string; markierungen: string }[] = [];
  m.beimKonfliktschreiben.mockImplementation((konflikte: string) => {
    if (konflikte.includes('pruefstatus="aktuell"'))
      geprueft.push({ konflikte, markierungen: m.dateien.get(markierungsdatei) ?? '' });
  });
  const pruefung = markierungen.pruefeAlleMarkierungen(() => {});
  try {
    await quelle.angehalten;
    // Entfernt die einzige Konfliktursache, nachdem die Prüfung den alten Stand gelesen hat.
    await markierungen.entferneMarkierung(ausgang, eintrag);
  } finally {
    quelle.freigeben();
    await pruefung;
  }
  expect(geprueft.length).toBeGreaterThan(0);
  for (const stand of geprueft)
    expect(stand.konflikte.includes('BGB')).toBe(stand.markierungen.includes('verweismarkierung'));
  expect(await markierungen.ladeMarkierungskonflikteFuerAnzeige()).toEqual({
    pruefstatus: 'aktuell',
    gesetze: [],
  });
});
