// @vitest-environment jsdom
// Echte Konfliktaktionen, Dateispeicher und Prüfqueue; nur native Grenzen ersetzt.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  bereiteMarkierungsFensterDateienVor,
  bereiteMarkierungsFensterPruefverwaltungVor,
  markierungsFensterBedienung,
  markierungsFensterNativeAttrappe,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import type { Auswahl, KonfliktZeile } from './MarkierungskonfliktFenster.helpers';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsFensterGesetzLader } from '@/test/markierungen/markierungsFensterGesetzLader';

const ladeGesetz = markierungsFensterGesetzLader();
const m = markierungsFensterNativeAttrappe();
const dom = domTestWurzel();
const { knopf, hinweise, warteAufAnzeige } = markierungsFensterBedienung(() => dom.host);
const importErfolg = vi.fn();
const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
let markierungen: typeof import('@/lib/markierungen/markierungen.index');
let Konfliktseitenleiste: typeof import('./Konfliktseitenleiste').Konfliktseitenleiste;
let auswahl: Auswahl;
let gesetze: Awaited<
  ReturnType<typeof markierungen.ladeMarkierungskonflikteFuerAnzeige>
>['gesetze'];

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  dialog.confirm.mockResolvedValue(true);
  m.dateien.clear();
  m.label = 'markierungskonflikte';
  bereiteMarkierungsFensterDateienVor();
  bereiteMarkierungsFensterPruefverwaltungVor();
  m.dateien.set(
    pfad,
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>99</textlaenge></elementstand><kommentartext>Kommentar</kommentartext></kommentar></inhalt></markierungen>',
  );
  m.dateien.set('markierungskonflikte.xml', '<markierungskonflikte pruefstatus="aktuell"/>');
  markierungen = await import('@/lib/markierungen/markierungen.index');
  markierungen.initialisiereMarkierungen();
  await markierungen.pruefeAlleMarkierungen(() => {});
  gesetze = (await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {})).gesetze;
  const eintrag = gesetze[0]!.eintraege[0]!;
  auswahl = {
    art: 'zeile',
    gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    eintrag,
    zeile: {
      schluessel: eintrag.schluessel,
      verweisziele: [],
      symbol: 'fragezeichen',
      zeilenart: 'pauschalerBezugUnpassend',
      vorschau: '',
      vorschauPunkt: '',
      erlaeuterung: 'Geändert',
    },
  };
  Konfliktseitenleiste = (await import('./Konfliktseitenleiste')).Konfliktseitenleiste;
});
async function starten() {
  await act(async () =>
    dom.root.render(
      <Konfliktseitenleiste
        ladeGesetz={ladeGesetz}
        auswahl={auswahl}
        gesetze={gesetze}
        verknuepfungsMoeglichkeit={{ moeglich: true, fehler: null }}
        wirdGeladen={false}
        aktionsAbschlussOffen={false}
        onErfolgreicherImport={importErfolg}
        onAlleGeprueft={async () => {}}
      />,
    ),
  );
}
it('zeigt die Sperrwartefrist einer Reparatur lokal und erhält die gespeicherte Markierung', async () => {
  await starten();
  const vorher = m.dateien.get(pfad);
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'datei_sperre_erwerben' && args.relativerPfad === pfad) throw 'wartefrist';
    return nativ(befehl, args);
  });
  await act(async () => knopf('Mit aktueller Norm verknüpfen').click());
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
    );
  });
  expect(m.dateien.get(pfad)).toBe(vorher);
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});
it('bewahrt die gespeicherte Reparatur bei anschließendem Prüfabschlussfehler und übergibt einen Hinweis', async () => {
  await starten();
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'pruefvorgang_quelle_abschliessen') throw Error('IPC nach Speicherung');
    return nativ(befehl, args);
  });
  await act(async () => knopf('Mit aktueller Norm verknüpfen').click());
  expect(m.dateien.get(pfad)).toContain('<textlaenge>4</textlaenge>');
  expect(hinweise().some((h) => h.hinweis.text.includes('Änderung wurde gespeichert'))).toBe(true);
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});
it('zeigt eine fehlgeschlagene Vollprüfung lokal ohne abgeschlossene Prüfung zu behaupten', async () => {
  await starten();
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'datei_sperre_erwerben' && args.relativerPfad === 'markierungskonflikte.xml')
      throw 'wartefrist';
    return nativ(befehl, args);
  });
  await act(async () => knopf('Alle Markierungen neu prüfen').click());
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
    );
  });
  expect(dom.host.textContent).not.toContain('Prüfung durchgeführt');
  expect(m.banner).not.toHaveBeenCalled();
});

const dialog = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: dialog.confirm }));
it('meldet nach einer teilweise gelungenen Sammellöschung gespeicherte Löschungen im Hauptfenster und den Restfehler lokal', async () => {
  const zweiterPfad = 'markierungen/GG_de-bund-markierungen.xml';
  m.dateien.set(
    zweiterPfad,
    m.dateien
      .get(pfad)!
      .replace(
        '<gesetz normgeber="de-bund">BGB</gesetz>',
        '<gesetz normgeber="de-bund">GG</gesetz>',
      ),
  );
  gesetze = [...gesetze, { ...gesetze[0]!, gesetz: gesetzesreferenz({ kurztitel: 'GG' }) }];
  await starten();
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'atomar_datei_schreiben' && args.relativerPfad === zweiterPfad)
      throw Error('Schreiben GG verweigert');
    return nativ(befehl, args);
  });
  await act(async () => knopf('Alle betroffenen Markierungen löschen').click());
  expect(m.dateien.get(pfad)).not.toContain('<kommentar>');
  expect(m.dateien.get(zweiterPfad)).toContain('<kommentar>');
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Die Aktion konnte nicht vollständig gespeichert werden.',
    );
  });
  expect(
    hinweise().some((h) => h.hinweis.text.includes('Ein Teil der Markierungen wurde gelöscht')),
  ).toBe(true);
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));
async function bereiteKonfliktImportVor() {
  auswahl = { art: 'datensatz', gesetz: { kurztitel: 'TestG', normgeber: 'de-bund' } };
  gesetze = [{ gesetz: auswahl.gesetz, fehlendesGesetz: true, eintraege: [] }];
  m.dateien.set(
    'importindizes/de-bund.xml',
    '<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>TestG</abrufkennung></gesetz></inhalt></importindex>',
  );
  const { zipSync, strToU8 } = await import('fflate');
  netz.fetch.mockImplementation(async () => {
    const xml =
      '<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Text.</P></Content></text></textdaten></norm></dokumente>';
    return { ok: true, arrayBuffer: async () => zipSync({ 'gesetz.xml': strToU8(xml) }).buffer };
  });
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'import_aktualisierung_starten') return 'import';
    if (befehl === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (befehl === 'gesetz_import_sperre_freigeben' || befehl === 'import_aktualisierung_beenden')
      return;
    return nativ(befehl, args);
  });
  await starten();
}
async function importieren() {
  await act(async () => knopf('Import des Gesetzes aus dem Internet').click());
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(knopf('Import des Gesetzes aus dem Internet').disabled).toBe(false);
  });
}
it('behält einen fehlgeschlagenen echten Import lokal ohne Speicherung oder lokale Banner', async () => {
  await bereiteKonfliktImportVor();
  netz.fetch.mockRejectedValue(Error('Offline'));
  await importieren();
  expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(false);
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Verbindung');
  });
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});
it('meldet nach erfolgreichem echtem Import einen Prüfungsfehler als Folge der gespeicherten Änderung', async () => {
  await bereiteKonfliktImportVor();
  const nativ = m.invoke.getMockImplementation()!;
  let gespeichert = false;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'atomar_datei_schreiben' && args.relativerPfad === 'gesetze/TestG_de-bund.xml')
      gespeichert = true;
    if (
      gespeichert &&
      befehl === 'datei_sperre_erwerben' &&
      args.relativerPfad === 'markierungskonflikte.xml'
    )
      throw 'wartefrist';
    return nativ(befehl, args);
  });
  await importieren();
  expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
  expect(importErfolg).toHaveBeenCalledOnce();
  expect(dom.host.textContent).not.toContain(
    'Die Aktion konnte nicht vollständig gespeichert werden.',
  );
  expect(hinweise().some((h) => /(?:importiert|gespeichert)/.test(h.hinweis.text))).toBe(true);
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

it.each([
  { quelle: 'Gesetz', sperrfehler: false },
  { quelle: 'Titel', sperrfehler: false },
  { quelle: 'Gesetz', sperrfehler: true },
])(
  'führt Konfliktseitenleiste → Verweis bearbeiten durch den echten $quelle-Ladeweg (Sperrfehler: $sperrfehler)',
  async ({ quelle, sperrfehler }) => {
    await markierungen.hinzufuegenMarkierung(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
        typ: 'verweismarkierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),

        verweisinhalt: {
          verweistext: '§ 9 BGB',
          verweisziele: [
            verweisziel({
              typ: 'zielnorm',
              gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
              bezeichnung: '§ 9',
              verweistextZeichenbereich: [0, 7],

              elementstand: { textlaenge: 10 },
            }),
          ],
        },
      }),
      () => {},
    );
    auswahl = await ladeVerweisAuswahl((z) => !!z.zielgesetz);
    await starten();
    expect(knopf('Verweis bearbeiten')?.disabled).toBe(false);
    const quellePfad =
      quelle === 'Gesetz'
        ? 'gesetze/BGB_de-bund.xml'
        : 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
    m.dateien.set(quellePfad, '<defekt>');
    if (sperrfehler) {
      const nativ = m.invoke.getMockImplementation()!;
      m.invoke.mockImplementation(async (befehl, args) => {
        if (befehl === 'datei_sperre_erwerben' && args.relativerPfad === quellePfad)
          throw 'wartefrist';
        return nativ(befehl, args);
      });
    }
    const vorher = m.dateien.get(pfad);
    m.invoke.mockClear();
    await act(async () => knopf('Verweis bearbeiten').click());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(knopf('Verweis bearbeiten').disabled).toBe(false);
    });
    expect(m.dateien.has(quellePfad)).toBe(sperrfehler);
    expect(hinweise()).toHaveLength(sperrfehler ? 0 : 1);
    if (sperrfehler)
      await warteAufAnzeige(() => {
        expect(dom.host.textContent).toContain(
          'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
        );
      });
    expect(
      m.invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
    ).toHaveLength(sperrfehler ? 0 : 1);
    const kontext = m.invoke.mock.calls.find(
      ([befehl]) => befehl === 'verweismarkierung_kontext_ablegen',
    )?.[1];
    expect(kontext).toBeDefined();
    expect(JSON.parse(kontext.payload)).toMatchObject({
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bearbeiten: { zitatText: '§ 9 BGB' },
    });
    expect(m.dateien.get(pfad)).toBe(vorher);
    expect(m.banner).not.toHaveBeenCalled();
  },
);

async function ladeVerweisAuswahl(istGewuenschteZeile: (zeile: KonfliktZeile) => boolean) {
  await markierungen.pruefeAlleMarkierungen(() => {});
  gesetze = (await markierungen.ladeMarkierungskonflikteFuerAnzeige(() => {})).gesetze;
  const eintrag = gesetze[0]!.eintraege.find((e) => e.markierungstyp === 'verweismarkierung')!;
  const { zeilenVonEintrag } = await import('./MarkierungskonfliktFenster.helpers');
  return {
    art: 'zeile' as const,
    gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    eintrag,
    zeile: zeilenVonEintrag(eintrag).find(istGewuenschteZeile)!,
  };
}

function zielgesetzXML(normen: string[], veraenderte: string[] = []) {
  return `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>ZielG</kurztitel><langtitel>Zielgesetz</langtitel></infos><inhalt>${normen.map((n) => `<norm><bezeichnung>§ ${n}</bezeichnung><titel>${veraenderte.includes(n) ? 'Alt' : 'Aktuell'}</titel></norm>`).join('')}</inhalt></gesetz>`;
}
async function bereiteZielzeileVor(
  zeilenart: 'zielNormUnpassend' | 'zielNormNichtEindeutig' | 'zielNormFehlt',
) {
  const normen =
    zeilenart === 'zielNormFehlt'
      ? ['3', '4']
      : zeilenart === 'zielNormNichtEindeutig'
        ? ['1', '1', '2', '2', '3', '4']
        : ['1', '2', '3', '4'];
  m.dateien.set(
    'gesetze/ZielG_de-bund.xml',
    zielgesetzXML(normen, zeilenart === 'zielNormUnpassend' ? ['1', '2'] : []),
  );
  await markierungen.hinzufuegenMarkierung(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),

      verweisinhalt: {
        verweistext: 'Ziele',
        verweisziele: ['1', '2', '3', '4'].map((bezeichnung, index) =>
          verweisziel({
            typ: 'zielnorm',
            gesetz: gesetzesreferenz({ kurztitel: 'ZielG' }),
            bezeichnung: `§ ${bezeichnung}`,
            elementstand: { titel: 'Aktuell', textlaenge: 0 },
            verweistextZeichenbereich: [index, index + 1] as [number, number],
          }),
        ),
      },
    }),
    () => {},
  );
  auswahl = await ladeVerweisAuswahl((z) => z.zeilenart === zeilenart);
  expect(auswahl.zeile.verweisziele).toHaveLength(2);
  await starten();
}
function gespeicherteZiele() {
  return [
    ...new DOMParser()
      .parseFromString(m.dateien.get(pfad)!, 'application/xml')
      .querySelectorAll('verweisziel'),
  ];
}
it.each(['zielNormUnpassend', 'zielNormNichtEindeutig', 'zielNormFehlt'] as const)(
  'bearbeitet nach verzögerter Bestätigung nur die weiterhin betroffenen angezeigten Ziele (%s)',
  async (zeilenart) => {
    await bereiteZielzeileVor(zeilenart);
    const vorher = gespeicherteZiele().map((z) => z.outerHTML);
    let bestaetigen!: (ja: boolean) => void;
    dialog.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          bestaetigen = resolve;
        }),
    );
    m.invoke.mockClear();
    await act(async () => knopf('Verknüpfungen entfernen').click());
    expect(m.invoke.mock.calls.some(([befehl]) => befehl === 'atomar_datei_schreiben')).toBe(false);
    // Ziel 2 passt jetzt; Ziel 3 wird neu zum Konflikt. Die angezeigte Zeile bleibt unverändert.
    const normen =
      zeilenart === 'zielNormFehlt'
        ? ['2', '4']
        : zeilenart === 'zielNormNichtEindeutig'
          ? ['1', '1', '2', '3', '3', '4']
          : ['1', '2', '3', '4'];
    m.dateien.set(
      'gesetze/ZielG_de-bund.xml',
      zielgesetzXML(normen, zeilenart === 'zielNormUnpassend' ? ['1', '3'] : []),
    );
    await act(async () => {
      bestaetigen(true);
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(dom.host.textContent).toContain('Verknüpfung zu 1 Zielnorm in 1 Markierung entfernt.');
    });
    const nachher = gespeicherteZiele();
    expect(nachher[0]!.querySelector('elementstand')).toBeNull();
    expect(nachher.slice(1).map((z) => z.outerHTML)).toEqual(vorher.slice(1));
  },
);
it.each([1, 0])(
  'meldet von zwei angezeigten veränderten Zielnormen nur %s tatsächliche Änderungen',
  async (anzahl) => {
    await bereiteZielzeileVor('zielNormUnpassend');
    const vorher = m.dateien.get(pfad);
    m.dateien.set(
      'gesetze/ZielG_de-bund.xml',
      zielgesetzXML(['1', '2', '3', '4'], anzahl === 1 ? ['1', '3'] : ['3']),
    );
    await act(async () => knopf('Mit aktuellen Normen verknüpfen').click());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(dom.host.textContent).toContain(
        anzahl === 1 ? '1 Zielnorm in 1 Markierung neu verknüpft.' : 'Keine Verknüpfung geändert',
      );
    });
    expect(gespeicherteZiele()[2]!.querySelector('titel')?.textContent).toBe('Aktuell');
    if (anzahl === 0) expect(m.dateien.get(pfad)).toBe(vorher);
  },
);
