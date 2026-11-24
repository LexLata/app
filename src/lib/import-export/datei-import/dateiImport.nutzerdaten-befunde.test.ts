// Dateiimport mit echten Speichern, geschützten Ladern und Sperren.
// Nur Dateisystem und native Befehle werden an der Plattformgrenze nachgebildet.
import { beforeEach, expect, it, vi } from 'vitest';
import { verarbeiteDateien } from './dateiImport';
import { loeseImportKonflikt } from './dateiImport.aktionen';
import { gliedereImportbericht } from './dateiImport.types';

function gegliederteGruppe(bericht: Parameters<typeof gliedereImportbericht>[0][number]) {
  const gruppen = gliedereImportbericht([bericht], []).kategorien.flatMap((k) => k.gruppen);
  return vorhanden(gruppen[0]);
}

const zustand = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  sperren: new Set<string>(),
  archiv: 'archiviert',
  lesefehler: false,
  schreibfehler: false,
  sperrfehler: false,
  ereignisfehler: false,
  schreibzahl: 0,
}));
const banner = vi.hoisted(() => vi.fn());
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: banner,
}));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: async () => {
    expect(zustand.sperren.size).toBe(0);
    if (zustand.ereignisfehler) throw Error('Fensterereignis abgelehnt');
  },
}));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  leseNachbereitungBeiImport: () => false,
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  pruefeSchemaversion: async () => undefined,
}));
vi.mock('@/lib/import/import.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/import.index')>()),
  mitGesetzDateiImport: async (aktion: (importiere: unknown) => Promise<unknown>) =>
    aktion(vi.fn()),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  sicherstelleOrdner: async () => undefined,
  appDatenLesen: async (pfad: string) => {
    if (zustand.lesefehler || !zustand.dateien.has(pfad)) throw Error('Lesefehler');
    return vorhanden(zustand.dateien.get(pfad));
  },
  appDatenLesenOhneHinweis: async (pfad: string) => {
    if (zustand.lesefehler || !zustand.dateien.has(pfad)) throw Error('Lesefehler');
    return vorhanden(zustand.dateien.get(pfad));
  },
  appDatenLesenOderNull: async (pfad: string) => zustand.dateien.get(pfad) ?? null,
  appDatenExistiert: async (pfad: string) => zustand.dateien.has(pfad),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...zustand.dateien.keys()]
      .filter((p) => p.startsWith(ordner + '/'))
      .map((p) => ({ name: p.slice(ordner.length + 1), isDirectory: false })),
  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    if (zustand.schreibfehler) throw Error('Schreibfehler');
    zustand.schreibzahl++;
    zustand.dateien.set(pfad, inhalt);
  },
  appDatenLoeschen: async (pfad: string) => {
    zustand.dateien.delete(pfad);
  },
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string, args: Record<string, string>) => {
    if (befehl === 'datei_sperre_erwerben') {
      if (zustand.sperrfehler) throw 'wartefrist';
      zustand.sperren.add(vorhanden(args.relativerPfad));
      return args.relativerPfad;
    }
    if (befehl === 'datei_sperre_freigeben') {
      zustand.sperren.delete(vorhanden(args.token));
      return;
    }
    if (befehl === 'archiviere_beschaedigte_datei') {
      if (zustand.archiv === 'fehler') throw Error('Sicherungsfehler');
      const pfad = vorhanden(args.relativerPfad);
      expect(zustand.dateien.get(pfad)).toBe(args.erwarteterInhalt);
      zustand.dateien.set(pfad + '.sicherung', vorhanden(args.erwarteterInhalt));
      if (zustand.archiv === 'archiviert') zustand.dateien.delete(pfad);
      return { status: zustand.archiv, sicherungspfad: pfad + '.sicherung' };
    }
    throw Error('Unerwarteter Befehl ' + befehl);
  },
}));

const faelle = [
  {
    art: 'favoriten',
    pfad: 'favoriten/BGB_de-bund-favoriten.xml',
    xml: '<favoriten version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>',
  },
  {
    art: 'lesezeichen',
    pfad: 'lesezeichen/lesezeichen.xml',
    xml: '<lesezeichen version="1"><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>',
  },
  {
    art: 'gesetzeskurzbefehle',
    pfad: 'einstellungen/gesetzeskurzbefehle.xml',
    xml: '<gesetzeskurzbefehle version="1"><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste primaer="true">e</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>',
  },
] as const;
const quelle = 'Sicherung.zip → Ordner/Eingang.xml';
async function importiere(xml: string) {
  return verarbeiteDateien([{ name: 'Eingang.xml', quelle, inhalt: xml }]);
}
beforeEach(() => {
  zustand.dateien.clear();
  zustand.sperren.clear();
  banner.mockClear();
  zustand.archiv = 'archiviert';
  zustand.lesefehler = false;
  zustand.schreibfehler = false;
  zustand.sperrfehler = false;
  zustand.ereignisfehler = false;
  zustand.schreibzahl = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

it.each(faelle)(
  '$art: Eingang, Übernahme und unveränderte Wiederholung behalten Herkunft',
  async ({ pfad, xml }) => {
    const ergebnis = await importiere(xml);
    expect(ergebnis.berichtEintraege).toMatchObject([{ quelle, aktion: 'neu' }]);
    const gespeichert = vorhanden(zustand.dateien.get(pfad));
    expect(gespeichert).toContain('BGB');
    const wiederholung = await importiere(gespeichert);
    expect(wiederholung.berichtEintraege).toMatchObject([{ quelle, aktion: 'unveraendert' }]);
    expect(zustand.schreibzahl).toBe(1);
    expect(xml).toContain('version="1"');
    expect(banner).not.toHaveBeenCalled();
  },
);

it.each(
  faelle.flatMap((fall) =>
    ['archiviert', 'gesichert_aber_nicht_entfernt', 'fehler', 'lesen'].map((status) => ({
      ...fall,
      status,
    })),
  ),
)('$art: Bestand $status', async ({ pfad, xml, status }) => {
  zustand.dateien.set(pfad, 'defekter Bestand');
  const ergebnis = await importiere(xml);
  const konflikt = vorhanden(ergebnis.konflikte[0]);
  expect(konflikt).toMatchObject({ quelle });
  zustand.archiv = status;
  zustand.lesefehler = status === 'lesen';
  if (status === 'fehler' || status === 'lesen' || status === 'gesichert_aber_nicht_entfernt') {
    await expect(loeseImportKonflikt(konflikt, 'zusammenfuehren')).rejects.toThrow(pfad);
    expect(zustand.dateien.get(pfad)).toBe('defekter Bestand');
    expect(zustand.dateien.has(pfad + '.sicherung')).toBe(
      status === 'gesichert_aber_nicht_entfernt',
    );
    expect(zustand.schreibzahl).toBe(0);
  } else {
    const bericht = await loeseImportKonflikt(konflikt, 'zusammenfuehren');
    expect(bericht).toMatchObject({
      quelle,
      aktion: 'zusammengefuehrt',
      meldungen: [
        expect.objectContaining({
          anlass: 'sicherung',
          aenderungsstand: 'teilweise',
          text: expect.stringContaining(pfad),
        }),
      ],
    });
    expect(zustand.dateien.get(pfad + '.sicherung')).toBe('defekter Bestand');
    expect(zustand.dateien.get(pfad)).toContain('BGB');
    // Im Bericht steht der Name, nicht die Herkunftsdatei.
    expect(gegliederteGruppe(bericht).namen[0]?.name).toBe(bericht.name);
  }
  expect(zustand.sperren.size).toBe(0);
  expect(banner).not.toHaveBeenCalled();
});

it.each(faelle)(
  '$art: Speicherung mit Folgeproblem bleibt erfolgreich und wird nicht wiederholt',
  async ({ pfad, xml }) => {
    zustand.ereignisfehler = true;
    const ergebnis = await importiere(xml);
    expect(ergebnis.berichtEintraege).toMatchObject([
      {
        quelle,
        aktion: 'neu',
        meldungen: [
          expect.objectContaining({ anlass: 'synchronisation', aenderungsstand: 'vollstaendig' }),
        ],
      },
    ]);
    expect(ergebnis.fehler).toEqual([]);
    expect(zustand.dateien.get(pfad)).toContain('BGB');
    expect(zustand.schreibzahl).toBe(1);
    expect(banner).not.toHaveBeenCalled();
  },
);
it.each(faelle)('$art: Schreibfehler erzeugt keinen Erfolg', async ({ xml }) => {
  zustand.schreibfehler = true;
  const ergebnis = await importiere(xml);
  expect(ergebnis.berichtEintraege).toEqual([]);
  expect(ergebnis.fehler).toEqual([expect.objectContaining({ datei: quelle })]);
  expect(zustand.schreibzahl).toBe(0);
  expect(banner).not.toHaveBeenCalled();
});
it.each(faelle)('$art: Sperrfehler steht bei der Importquelle statt im Banner', async ({ xml }) => {
  zustand.sperrfehler = true;
  const ergebnis = await importiere(xml);
  expect(ergebnis.berichtEintraege).toEqual([]);
  expect(ergebnis.fehler).toEqual([
    expect.objectContaining({ datei: quelle, detail: expect.stringContaining('noch bearbeitet') }),
  ]);
  expect(banner).not.toHaveBeenCalled();
});

it.each(
  faelle
    .filter((f) => f.art !== 'favoriten')
    .flatMap((fall) =>
      ['neu', 'zusammenfuehren', 'ersetzen', 'unveraendert'].map((aktion) => ({ ...fall, aktion })),
    ),
)(
  '$art: ausgelassene Eingänge bei $aktion mit gültigem Nachbareintrag',
  async ({ pfad, xml, aktion }) => {
    const ohneNormgeber = xml.replace('normgeber="de-bund"', '').replace('BGB', 'UNGUELTIG');
    const tag = xml.startsWith('<lesezeichen') ? 'eintrag' : 'gesetzeskurzbefehl';
    const ungueltigerEintrag = vorhanden(
      ohneNormgeber.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`)),
    )[0];
    const eingang = xml.replace('</inhalt>', ungueltigerEintrag + '</inhalt>');
    if (aktion !== 'neu')
      zustand.dateien.set(pfad, aktion === 'unveraendert' ? eingang : xml.replace('BGB', 'ZPO'));
    const ergebnis = await importiere(eingang);
    const bericht =
      aktion === 'ersetzen' || aktion === 'zusammenfuehren'
        ? await loeseImportKonflikt(vorhanden(ergebnis.konflikte[0]), aktion)
        : vorhanden(ergebnis.berichtEintraege[0]);
    expect(bericht).toMatchObject({
      quelle,
      eingangUnvollstaendig: true,
      meldungen: [expect.objectContaining({ text: expect.stringContaining('ohne Normgeber') })],
    });
    const gruppe = gegliederteGruppe(bericht);
    expect(gruppe.namen[0]?.name).toBe(bericht.name);
    if (aktion === 'unveraendert') expect(gruppe.schluessel).toBe('unveraendert');
    else expect(gruppe.namen[0]?.hinweise.length).toBeGreaterThan(0);
    expect(eingang).toContain(ungueltigerEintrag);
    expect(zustand.dateien.get(pfad)).toContain('BGB');
    if (aktion === 'neu' || aktion === 'zusammenfuehren')
      expect(zustand.dateien.get(pfad)).not.toContain('UNGUELTIG');
    if (aktion === 'ersetzen') expect(zustand.dateien.get(pfad)).toBe(eingang); // Rohtextvertrag bleibt erhalten.
    if (aktion === 'unveraendert') expect(zustand.schreibzahl).toBe(0);
    expect(banner).not.toHaveBeenCalled();
  },
);
it('Favoriten ohne Normgeber werden mit Quelle abgelehnt, ohne Gesetzeszuordnung zu erraten', async () => {
  const xml = faelle[0].xml.replace('normgeber="de-bund"', '');
  const ergebnis = await importiere(xml);
  expect(ergebnis.berichtEintraege).toMatchObject([
    {
      quelle,
      aktion: 'nichtUebernommen',
      eingangUnvollstaendig: true,
      meldungen: [expect.objectContaining({ text: expect.stringContaining('ohne Normgeber') })],
    },
  ]);
  expect(zustand.dateien.size).toBe(0);
  expect(banner).not.toHaveBeenCalled();
});
it.each(faelle.filter((f) => f.art !== 'favoriten'))(
  '$art: ausschließlich ausgeschlossene Eingänge erzeugen keine leere Ersatzdatei',
  async ({ pfad, xml }) => {
    const eingang = xml.replace('normgeber="de-bund"', '');
    const ergebnis = await importiere(eingang);
    expect(ergebnis.berichtEintraege).toMatchObject([{ aktion: 'nichtUebernommen', quelle }]);
    expect(zustand.dateien.has(pfad)).toBe(false);
    expect(zustand.schreibzahl).toBe(0);
  },
);
it.each(faelle)('$art: ungültiger Pflichtwert behält die Ablehnung', async ({ xml }) => {
  const ergebnis = await importiere(xml.replace('normgeber="de-bund"', 'normgeber=""'));
  expect(ergebnis.berichtEintraege).toEqual([]);
  expect(ergebnis.fehler[0]).toMatchObject({ datei: quelle });
  expect(zustand.schreibzahl).toBe(0);
});
it.each(faelle.filter((f) => f.art !== 'favoriten'))(
  '$art: Bestandsbereinigung bleibt von der Eingangsdiagnose unterscheidbar',
  async ({ pfad, xml }) => {
    zustand.dateien.set(pfad, xml.replace('normgeber="de-bund"', '').replace('BGB', 'ALT'));
    const ergebnis = await importiere(xml);
    const bericht = await loeseImportKonflikt(vorhanden(ergebnis.konflikte[0]), 'zusammenfuehren');
    expect(bericht.meldungen).toEqual([
      expect.objectContaining({
        grund: 'bereinigt',
        betroffen: pfad.split('/').at(-1),
        sicherung: expect.any(String),
      }),
    ]);
    expect(bericht.eingangUnvollstaendig).toBe(false);
    expect(zustand.dateien.get(pfad)).toContain('BGB');
    expect(banner).not.toHaveBeenCalled();
  },
);

/** Fehlende Testdaten sofort verständlich zurückweisen. */
function vorhanden<T>(wert: T | undefined | null): T {
  if (wert === undefined || wert === null) throw Error('Erwartete Testdaten fehlen');
  return wert;
}

it.each(faelle)(
  '$art: bestätigte Sicherung mit anschließendem Schreibfehler bleibt als Teiländerung sichtbar',
  async ({ pfad, xml }) => {
    zustand.dateien.set(pfad, 'defekter Bestand');
    const ergebnis = await importiere(xml);
    zustand.schreibfehler = true;
    await expect(
      loeseImportKonflikt(vorhanden(ergebnis.konflikte[0]), 'zusammenfuehren'),
    ).rejects.toThrow('Schreibfehler');
    expect(zustand.dateien.get(pfad + '.sicherung')).toBe('defekter Bestand');
    expect(zustand.dateien.has(pfad)).toBe(false);
    expect(zustand.schreibzahl).toBe(0);
    expect(banner).not.toHaveBeenCalled();
  },
);
it.each(
  faelle.flatMap((fall) => ['ersetzen', 'zusammenfuehren'].map((aktion) => ({ ...fall, aktion }))),
)(
  '$art/$aktion: spätere Entscheidung behält den erfolgreichen Speicherstand bei Ereignisfehler',
  async ({ art, pfad, xml, aktion }) => {
    zustand.dateien.set(
      pfad,
      art === 'favoriten' ? xml.replace('>1<', '>2<') : xml.replace('BGB', 'ZPO'),
    );
    const ergebnis = await importiere(xml);
    zustand.ereignisfehler = true;
    const bericht = await loeseImportKonflikt(
      vorhanden(ergebnis.konflikte[0]),
      aktion === 'ersetzen' ? 'ersetzen' : 'zusammenfuehren',
    );
    expect(bericht).toMatchObject({
      quelle,
      aktion: aktion === 'ersetzen' ? 'ersetzt' : 'zusammengefuehrt',
      meldungen: [
        expect.objectContaining({ anlass: 'synchronisation', aenderungsstand: 'vollstaendig' }),
      ],
    });
    expect(zustand.dateien.get(pfad)).toContain('BGB');
    expect(zustand.schreibzahl).toBe(1);
    expect(banner).not.toHaveBeenCalled();
  },
);
