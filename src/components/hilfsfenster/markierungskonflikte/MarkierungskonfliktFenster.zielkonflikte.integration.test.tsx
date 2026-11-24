import { zeilenVonEintrag } from './MarkierungskonfliktFenster.helpers';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// @vitest-environment jsdom
// Vollständiges Fenster mit echtem Import, Prüfqueue, Speicherung und Auswahl nach Aktionen.

import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as nativeFenster from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const m = nativeFenster.markierungsFensterNativeAttrappe();
const dom = domTestWurzel();
const { knopf } = nativeFenster.markierungsFensterBedienung(() => dom.host);
const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: async () => true }));
const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
let markierungen: typeof import('@/lib/markierungen/markierungen.index');

beforeEach(async () => {
  // Browser-Geometrie als externe Grenze; diese Tests beginnen nach der Erklärung.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.setItem('lexlata.markierungskonfliktErklaerungGelesen', 'true');
  vi.resetModules();
  vi.clearAllMocks();
  m.dateien.clear();
  m.empfang.clear();
  m.label = 'markierungskonflikte';
  // Die native Ereignisgrenze liefert die echten Speicher-Broadcasts an das Fenster.
  vi.doMock('@tauri-apps/api/event', () => ({
    listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
      m.empfang.set(name, callback);
      return () => m.empfang.delete(name);
    },
    emitTo: async (_ziel: unknown, name: string, payload: unknown) => {
      m.empfang.get(name)?.({ payload });
    },
  }));
  nativeFenster.bereiteMarkierungsFensterDateienVor();
  nativeFenster.bereiteMarkierungsFensterPruefverwaltungVor();
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'import_aktualisierung_starten') return 'import';
    if (befehl === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (
      befehl === 'gesetz_import_sperre_freigeben' ||
      befehl === 'import_aktualisierung_beenden' ||
      befehl === 'interne_navigation_senden'
    )
      return;
    return nativ(befehl, args);
  });
  m.dateien.set('markierungskonflikte.xml', '<markierungskonflikte pruefstatus="aktuell"/>');
  markierungen = await import('@/lib/markierungen/markierungen.index');
  markierungen.initialisiereMarkierungen();
  await markierungen.hinzufuegenMarkierung(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),

      verweisinhalt: {
        verweistext: 'Art. 10, 5 und 999 GG',
        verweisziele: ['10', '5', '999'].map((bezeichnung, index) =>
          verweisziel({
            typ: 'zielnorm',
            gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
            bezeichnung: `Art. ${bezeichnung}`,
            elementstand: { titel: 'Alter Titel', textlaenge: 99 },
            verweistextZeichenbereich: [index * 5, index * 5 + 4] as [number, number],
          }),
        ),
      },
    }),
    () => {},
  );
  await markierungen.pruefeAlleMarkierungen(() => {});
});
async function abwarten(pruefen: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {});
    pruefen();
  });
}
function textNormal(text: string | null) {
  return text?.replaceAll('\u00a0', ' ');
}
function zeile(text: string) {
  return [...dom.host.querySelectorAll('span')].find((el) => textNormal(el.textContent) === text)!;
}
function ausgewaehlteZeile() {
  return [...dom.host.querySelectorAll('span')].find((el) => el.style.color === 'var(--akzent)');
}
function gespeicherteZiele() {
  return [
    ...new DOMParser()
      .parseFromString(m.dateien.get(pfad)!, 'application/xml')
      .querySelectorAll('verweisziel'),
  ];
}
it('importiert das fehlende GG, trennt drei Zielbefunde und erhält die übrigen Ziele und die nächste Auswahl', async () => {
  expect(m.dateien.has('gesetze/GG_de-bund.xml')).toBe(false);
  m.dateien.set(
    'importindizes/de-bund.xml',
    '<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>GG</kurztitel><langtitel>Grundgesetz</langtitel><abrufkennung>gg</abrufkennung></gesetz></inhalt></importindex>',
  );
  const { zipSync, strToU8 } = await import('fflate');
  netz.fetch.mockImplementation(async () => {
    const xml = `<dokumente doknr="gg"><norm doknr="gg"><metadaten><jurabk>GG</jurabk><langue>Grundgesetz</langue><ausfertigung-datum>1949-05-23</ausfertigung-datum></metadaten></norm>${['10', '5', '5'].map((nr, i) => `<norm doknr="n${i}"><metadaten><enbez>Art ${nr}</enbez><titel>Aktueller Titel</titel></metadaten><textdaten><text><Content><P>Text.</P></Content></text></textdaten></norm>`).join('')}</dokumente>`;
    return { ok: true, arrayBuffer: async () => zipSync({ 'gg.xml': strToU8(xml) }).buffer };
  });
  const Fenster = (await import('./MarkierungskonfliktFenster')).default;
  await act(async () => dom.root.render(<Fenster />));
  const fehlend = '§ 1: Verweis auf GG: Gesetz nicht auf dem Gerät';
  await abwarten(() => expect(zeile(fehlend)).toBeDefined());
  expect(zeile(fehlend).parentElement!.querySelector('svg')).not.toBeNull();
  await act(async () => zeile(fehlend).click());
  await act(async () => knopf('Import aus dem Internet').click());
  await abwarten(() => expect(dom.host.querySelectorAll('li')).toHaveLength(3));
  expect(m.dateien.has('gesetze/GG_de-bund.xml')).toBe(true);
  expect(textNormal(ausgewaehlteZeile()?.textContent ?? '')).toBe('Art. 10 GG: Zielnorm verändert');
  await abwarten(() => expect(knopf('Mit aktueller Norm verknüpfen')?.disabled).toBe(false));
  const vorher = gespeicherteZiele().map((z) => z.outerHTML);
  await act(async () => zeile('Art. 999 GG: Zielnorm fehlt').click());
  await act(async () => knopf('Verknüpfung entfernen').click());
  await abwarten(() => expect(dom.host.querySelectorAll('li')).toHaveLength(2));
  const nachEntfernen = gespeicherteZiele();
  expect(nachEntfernen.slice(0, 2).map((z) => z.outerHTML)).toEqual(vorher.slice(0, 2));
  expect(nachEntfernen[2]!.querySelector('elementstand')).toBeNull();
  await act(async () => zeile('Art. 10 GG: Zielnorm verändert').click());
  await abwarten(() => expect(knopf('Mit aktueller Norm verknüpfen')?.disabled).toBe(false));
  await act(async () => knopf('Mit aktueller Norm verknüpfen').click());
  await abwarten(() =>
    expect(textNormal(ausgewaehlteZeile()?.textContent ?? '')).toContain(
      'Zielnorm nicht eindeutig',
    ),
  );
  const nachVerknuepfen = gespeicherteZiele();
  expect(nachVerknuepfen[0]!.outerHTML).not.toBe(vorher[0]);
  expect(nachVerknuepfen.slice(1).map((z) => z.outerHTML)).toEqual(
    nachEntfernen.slice(1).map((z) => z.outerHTML),
  );
  expect(dom.host.textContent).not.toContain('Zielnorm verändert');
  expect(dom.host.textContent).not.toContain('Zielnorm fehlt');
}, 10000);

it('berechnet eine alte gemischte Konfliktdatei neu und speichert schemafähige getrennte Zielkonflikte', async () => {
  m.dateien.set(
    'gesetze/GG_de-bund.xml',
    '<gesetz><infos><kurztitel>GG</kurztitel><langtitel>Grundgesetz</langtitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="art10"><bezeichnung>Art. 10</bezeichnung><titel>Neu</titel></norm></inhalt></gesetz>',
  );
  // Im bisherigen Format verdrängte „fehlt“ die veränderten Ziele desselben Gesetzes.
  const alt = m.dateien
    .get('markierungskonflikte.xml')!
    .replaceAll('ziel-gesetz-fehlt', 'ziel-norm-fehlt');
  expect(alt).toContain('ziel-norm-fehlt');
  expect(alt).not.toContain('ziel-norm-unpassend');
  m.dateien.set('markierungskonflikte.xml', alt);
  await markierungen.pruefeAlleMarkierungen(() => {});
  const neu = m.dateien.get('markierungskonflikte.xml')!;
  expect(neu).not.toBe(alt);
  const dokument = new DOMParser().parseFromString(neu, 'application/xml');
  expect([...dokument.querySelectorAll('konflikt')].map((k) => k.getAttribute('typ'))).toEqual([
    'ziel-norm-unpassend',
    'ziel-norm-fehlt',
  ]);
  const { readFileSync } = await import('node:fs');
  const { validateXML } = await import('xmllint-wasm');
  expect(
    (
      await validateXML({
        xml: neu,
        schema: readFileSync('docs/schema/markierungskonflikte.rng', 'utf8'),
        extension: 'relaxng',
      })
    ).valid,
  ).toBe(true);
});

async function importiereOriginalbeispiele() {
  const { konfliktBeispielReihenfolge, leseKonfliktBeispiel, leseKonfliktMatrix } =
    await import('@/test/markierungen/markierungskonfliktBeispiele');
  const { loeseImportKonflikt } = await import('@/lib/import-export/import-export.index');
  const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
  const { anzahlMarkierungskonflikte } = await import('./MarkierungskonfliktFenster.helpers');
  m.dateien.delete(pfad);
  m.dateien.delete('gesetze/BGB_de-bund.xml');
  const meldungen: unknown[] = [];
  for (const name of konfliktBeispielReihenfolge) {
    const importpfad = `/beispiele/${name}`;
    m.dateien.set(importpfad, leseKonfliktBeispiel(name));
    const ergebnis = await importierePfade([importpfad]);
    expect(ergebnis.fehler, name).toEqual([]);
    expect(ergebnis.konflikte, name).toEqual([]);
    expect(ergebnis.berichtEintraege, name).toHaveLength(1);
  }
  await pruefeGespeicherteBeispiele();
  // Ersetzen statt Zusammenführen: eine abweichende gespeicherte Testmarkierung verschwindet.
  const mkhPfad = 'markierungen/MKH_de-bund-markierungen.xml';
  const vorher = m.dateien.get(mkhPfad);
  if (!vorher) throw new Error('MKH wurde nicht importiert');
  m.dateien.set(mkhPfad, vorher.replace('Prüfung pauschal 229 2', 'Testrest'));
  const wiederholung = await importierePfade(['/beispiele/mkh-markierungen.xml']);
  expect(wiederholung.konflikte).toHaveLength(1);
  const konflikt = wiederholung.konflikte[0];
  if (!konflikt) throw new Error('Ersetzen wurde nicht angeboten');
  await loeseImportKonflikt(konflikt, 'ersetzen');
  expect(m.dateien.get(mkhPfad)).not.toContain('Testrest');
  await markierungen.pruefeAlleMarkierungen((meldung) => meldungen.push(meldung));
  expect(meldungen).toEqual([]);
  const geladen = await markierungen.ladeMarkierungskonflikteFuerAnzeige((meldung) =>
    meldungen.push(meldung),
  );
  expect(meldungen).toEqual([]);
  pruefeMatrixSignatur(geladen.gesetze, leseKonfliktMatrix());
  expect(anzahlMarkierungskonflikte(geladen.gesetze)).toBe(70);
  return geladen;
}

// Zeitlimit nur als Abbruchgrenze; sechs echte Importe dauern unter Volllast länger.
it(
  'importiert die sechs Originaldateien in dokumentierter Reihenfolge und zeigt die vollständige Matrix',
  { timeout: 15_000 },
  async () => {
    const geladen = await importiereOriginalbeispiele();
    const Fenster = (await import('./MarkierungskonfliktFenster')).default;
    await act(async () => dom.root.render(<Fenster />));
    await abwarten(() => expect(zeile('MKH')).toBeDefined());
    pruefeFensterzeilen(geladen.gesetze);
    expect(textNormal(dom.host.textContent)).toContain('MKF: Gesetz nicht auf dem Gerät');
    await act(async () => zeile('MKN').click());
    expect(textNormal(dom.host.textContent)).toContain('Nichtamtliche Titel nicht auf dem Gerät');
  },
);

describe('Einzelaktionen des vollständig importierten Originalbestands', () => {
  let geladen: Awaited<ReturnType<typeof importiereOriginalbeispiele>>;
  beforeEach(async () => {
    // Frische native Dateien und echte Import-/Prüfabschlüsse je Aktionsfall.
    // Der eigenständige Importtest oben prüft weiterhin den vollständigen Ablauf;
    // hier ist der importierte Bestand die gemeinsame Eingabe der UI-Abnahmen.
    geladen = await importiereOriginalbeispiele();
  });
  it.each([
    { kurztitel: 'MKH', markierungstyp: 'unterstreichung', anzahl: 13 },
    { kurztitel: 'MKH', markierungstyp: 'hervorhebung', anzahl: 10 },
    { kurztitel: 'MKH', markierungstyp: 'kommentar', anzahl: 17 },
    { kurztitel: 'MKH', markierungstyp: 'verweismarkierung', anzahl: 28 },
    { kurztitel: 'MKN', markierungstyp: undefined, anzahl: 1 },
    { kurztitel: 'MKF', markierungstyp: undefined, anzahl: 1 },
  ] as const)(
    'zeigt alle Einzelaktionen für $kurztitel / $markierungstyp ($anzahl Konfliktzeilen)',
    async ({ kurztitel, markierungstyp, anzahl }) => {
      const Konfliktseitenleiste = (await import('./Konfliktseitenleiste')).Konfliktseitenleiste;
      async function auswahlRendern(
        auswahl: import('./MarkierungskonfliktFenster.helpers').Auswahl,
      ) {
        await act(async () =>
          dom.root.render(
            <Konfliktseitenleiste
              ladeGesetz={undefined}
              auswahl={auswahl}
              gesetze={geladen.gesetze}
              verknuepfungsMoeglichkeit={{ moeglich: true, fehler: null }}
              wirdGeladen={false}
              aktionsAbschlussOffen={false}
              onErfolgreicherImport={() => {}}
              onAlleGeprueft={async () => {}}
            />,
          ),
        );
      }
      const gruppe = geladen.gesetze.find((eintrag) => eintrag.gesetz.kurztitel === kurztitel);
      if (!gruppe) throw new Error(`Die importierte Gesetzgruppe ${kurztitel} fehlt`);
      if (!markierungstyp) {
        expect(anzahl).toBe(1);
        if (kurztitel === 'MKF') {
          expect(gruppe.fehlendesGesetz).toBe(true);
          await auswahlRendern({ art: 'datensatz', gesetz: gruppe.gesetz });
          expect(knopf('Markierungen löschen')).toBeDefined();
        } else {
          expect(gruppe.nichtamtlicheTitelXmlFehlt).toBe(true);
          await auswahlRendern({ art: 'nichtamtlicheTitelXmlFehlt', gesetz: gruppe.gesetz });
          expect(knopf('Markierungen nichtamtlicher Titel löschen')).toBeDefined();
        }
        return;
      }
      // Unabhängig anhand der dokumentierten Originalmatrix gezählte Zeilen:
      // keine Stichprobe; jede ursprüngliche Einzelaktionsprüfung bleibt erhalten.
      const eintraege = gruppe.eintraege.filter(
        (eintrag) => eintrag.markierungstyp === markierungstyp,
      );
      expect(eintraege.flatMap(zeilenVonEintrag)).toHaveLength(anzahl);
      for (const eintrag of eintraege) {
        for (const zeile of zeilenVonEintrag(eintrag)) {
          await auswahlRendern({ art: 'zeile', gesetz: gruppe.gesetz, eintrag, zeile });
          await pruefeEinzelaktionen(zeile);
        }
      }
    },
  );
});

function pruefeMatrixSignatur(
  gruppen: import('@/lib/markierungen/markierungen.index').AnzeigeGesetzKonflikte[],
  matrix: string[][],
) {
  for (const gruppe of gruppen) {
    const erwartet = matrix
      .filter((row) => row[1]?.startsWith(gruppe.gesetz.kurztitel + '-'))
      .flatMap((row) => row[6]?.split('; ') ?? [])
      .filter((art) => art !== 'keine Zeile');
    const vorhanden: string[] = gruppe.eintraege.flatMap(zeilenVonEintrag).map((z) => z.zeilenart);
    if (gruppe.fehlendesGesetz) vorhanden.push('gesetzFehlt');
    if (gruppe.nichtamtlicheTitelXmlFehlt) vorhanden.push('nichtamtlicheTitelXmlFehlt');
    expect(vorhanden.sort(), gruppe.gesetz.kurztitel).toEqual(erwartet.sort());
  }
  expect(
    new Set(gruppen.flatMap((g) => g.eintraege.flatMap(zeilenVonEintrag).map((z) => z.zeilenart))),
  ).toEqual(new Set(Object.keys(beispielZeilenarten)));
}
const beispielZeilenarten: Record<
  import('./MarkierungskonfliktFenster.helpers').KonfliktZeile['zeilenart'],
  true
> = {
  bezugstextFehltOderUnpassend: true,
  pauschalerBezugFehlt: true,
  pauschalerBezugUnpassend: true,
  ausgangsstelleNichtEindeutig: true,
  zielGesetzFehlt: true,
  zielNormFehlt: true,
  zielNormUnpassend: true,
  zielNormNichtEindeutig: true,
};

async function pruefeEinzelaktionen(
  zeile: import('./MarkierungskonfliktFenster.helpers').KonfliktZeile,
) {
  expect(knopf('Markierung löschen'), zeile.schluessel).toBeDefined();
  if (zeile.zeilenart === 'pauschalerBezugUnpassend')
    await vi.waitFor(() => expect(knopf('Mit aktueller Norm verknüpfen')).toBeDefined());
  if (zeile.zeilenart === 'zielGesetzFehlt') expect(knopf('Import aus dem Internet')).toBeDefined();
  const zielnorm = ['zielNormUnpassend', 'zielNormNichtEindeutig', 'zielNormFehlt'].includes(
    zeile.zeilenart,
  );
  if (zielnorm) {
    expect(knopf('Verweis bearbeiten')).toBeDefined();
    expect(
      knopf(zeile.verweisziele.length === 1 ? 'Verknüpfung entfernen' : 'Verknüpfungen entfernen'),
    ).toBeDefined();
    expect(!!knopf('Zielnorm öffnen')).toBe(
      zeile.zeilenart === 'zielNormUnpassend' && zeile.verweisziele.length === 1,
    );
  }
  if (
    [
      'zielNormFehlt',
      'zielNormNichtEindeutig',
      'ausgangsstelleNichtEindeutig',
      'pauschalerBezugFehlt',
      'bezugstextFehltOderUnpassend',
    ].includes(zeile.zeilenart)
  )
    expect(knopf('Mit aktueller Norm verknüpfen')).toBeUndefined();
}

function pruefeFensterzeilen(
  gruppen: import('@/lib/markierungen/markierungen.index').AnzeigeGesetzKonflikte[],
) {
  for (const gruppe of gruppen)
    for (const eintrag of gruppe.eintraege)
      for (const z of zeilenVonEintrag(eintrag))
        expect(
          zeile(zeilenVonEintrag(eintrag).length > 1 ? z.vorschauPunkt : z.vorschau),
          z.schluessel,
        ).toBeDefined();
}

async function pruefeGespeicherteBeispiele() {
  const { leseKonfliktBeispiel } = await import('@/test/markierungen/markierungskonfliktBeispiele');
  const { ladeMarkierungen, beurteileMarkierungsImport } =
    await import('@/lib/markierungen/markierungen.index');
  for (const kurztitel of ['MKH', 'MKN', 'MKF']) {
    const referenz = { kurztitel, normgeber: 'de-bund' };
    const gespeichert = m.dateien.get(`markierungen/${kurztitel}_de-bund-markierungen.xml`);
    if (!gespeichert) throw new Error(`Importierte Markierungsdatei ${kurztitel} fehlt`);
    const gelesen = await ladeMarkierungen(referenz);
    const beurteilt = beurteileMarkierungsImport(
      leseKonfliktBeispiel(`${kurztitel.toLowerCase()}-markierungen.xml`),
      referenz,
    );
    expect(beurteilt.ausgeschlossen).toBe(0);
    const original = beurteilt.eintraege;
    expect(gelesen).toHaveLength(original.length);
    expect(gelesen).toEqual(expect.arrayContaining(original));
  }
}

it('hält Aktionen vom ausstehenden Prüfstand bis zur fertigen Anzeige gesperrt und liest Zwischenstände nicht aufwendig neu', async () => {
  const Fenster = (await import('./MarkierungskonfliktFenster')).default;
  await act(async () => dom.root.render(<Fenster />));
  await abwarten(() => expect(knopf('Alle Markierungen neu prüfen')?.disabled).toBe(false));
  m.lesen.mockClear();
  await act(async () =>
    m.empfang.get('markierungskonflikte-geaendert')?.({ payload: { pruefstatus: 'ausstehend' } }),
  );
  expect(knopf('Alle Markierungen neu prüfen').disabled).toBe(true);
  expect(m.lesen).not.toHaveBeenCalled();
  await act(async () => {});
  expect(knopf('Alle Markierungen neu prüfen').disabled).toBe(true);
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const lesen = m.lesen.getMockImplementation();
  if (!lesen) throw new Error('Dateilesen fehlt in der nativen Attrappe.');
  m.lesen.mockImplementation(async (pfad: string) => {
    await warten;
    return lesen(pfad);
  });
  await act(async () =>
    m.empfang.get('markierungskonflikte-geaendert')?.({ payload: { pruefstatus: 'aktuell' } }),
  );
  expect(knopf('Alle Markierungen neu prüfen').disabled).toBe(true);
  await act(async () => freigeben());
  await abwarten(() => expect(knopf('Alle Markierungen neu prüfen').disabled).toBe(false));
});

it('sperrt auch nach einem Ladefehler sofort beim ausstehenden Prüfstand und erhält den Fehlerhinweis', async () => {
  const Fenster = (await import('./MarkierungskonfliktFenster')).default;
  await act(async () => dom.root.render(<Fenster />));
  await abwarten(() => expect(knopf('Alle Markierungen neu prüfen')?.disabled).toBe(false));
  m.lesen.mockRejectedValue(new Error('Datei nicht lesbar'));
  await act(async () =>
    m.empfang.get('markierungskonflikte-geaendert')?.({ payload: { pruefstatus: 'aktuell' } }),
  );
  await abwarten(() => expect(dom.host.textContent).toContain('Datei nicht lesbar'));
  await act(async () =>
    m.empfang.get('markierungskonflikte-geaendert')?.({ payload: { pruefstatus: 'ausstehend' } }),
  );
  expect(knopf('Alle Markierungen neu prüfen').disabled).toBe(true);
  expect(dom.host.textContent).toContain('Datei nicht lesbar');
});
