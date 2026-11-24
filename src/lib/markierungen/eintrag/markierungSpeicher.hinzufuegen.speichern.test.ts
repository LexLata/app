import type { BearbeitungsStaende } from './markierungSpeicher.aktionen';
import type { MarkierungsAktion } from './markierungSpeicher.undo';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// @vitest-environment jsdom
// Prüft konkurrierende Neuanlagen und Wiederherstellung ohne verlorene Änderungen.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  erzeugeSperreAttrappe,
  erzeugeMehrfachSperreAttrappe,
} from '@/test/plattform/dateiSperreAttrappe';
import { sichereBeiUngueltigemInhalt } from '@/lib/persistenz/kern/kern.index';
import { hinzufuegenMarkierung } from './markierungSpeicher.hinzufuegen';
import { ladeEintraege } from './markierungSpeicher.lesen';
import type { MarkierungsEintrag } from './markierungSpeicher';
import { ermittleMarkierungsDateipfad } from './markierungSpeicher';
import { aktualisiereKommentar } from './markierungSpeicher.aktionen';
import { baueXML, parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { zusammenfuehrenMarkierungen } from '@/lib/markierungen/dateiimport/dateiimport.index';
import { fuehreRueckgaengigAus, fuehreWiederholenAus } from './markierungSpeicher.undo';
import { ermittleAuswahl } from '@/lib/domain/textpfad/textpfad.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  identitaetsSchluessel,
  pruefeEigenenKonflikt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const dateien = new Map<string, string>();
let sperre = erzeugeSperreAttrappe();
const lesen = vi.fn(async (pfad: string, _wurzel: string, _token?: string) => {
  const stand = dateien.get(pfad) ?? null;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return stand;
});
const schreiben = vi.fn(async (pfad: string, xml: string, _token?: string) => {
  dateien.set(pfad, xml);
});
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: vi.fn(async () => 'markierungs-vorgang'),
  schliessePruefpflichtigeQuelleAb: vi.fn(async () => true),
  sicherstelleOrdner: vi.fn(async () => {}),
  appDatenLesen: (pfad: string) => lesen(pfad, 'markierungen'),
  sichereBeiUngueltigemInhalt: vi.fn(async (_pfad: string, inhalt: string | null) =>
    inhalt === null ? { status: 'fehlt' } : { status: 'gueltig', inhalt },
  ),
  nutzerdatenSchreiben: (...args: Parameters<typeof schreiben>) => schreiben(...args),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mitDateiSperre: (...args: Parameters<typeof sperre>) => sperre(...args),
  mitDateiSperren: (...args: Parameters<ReturnType<typeof erzeugeMehrfachSperreAttrappe>>) =>
    erzeugeMehrfachSperreAttrappe(sperre)(...args),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenExistiert: async (pfad: string) => dateien.has(pfad),
}));
vi.mock('@/lib/markierungen/eintrag/markierungSpeicher.ereignisse', () => ({
  meldeMarkierungGeaendert: vi.fn(),
  meldeMarkierungenBulkGeaendert: vi.fn(),
}));
function gesetzesXML(text: string, kurztitel = 'BGB') {
  return `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>${kurztitel}</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz>${text}</absatz></text></norm></inhalt></gesetz>`;
}
function eintrag(werte: Parameters<typeof markierungsEintrag>[0] = {}): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
      bezugstext: 'Text',
    },

    ...werte,
  });
}
beforeEach(() => {
  dateien.clear();
  dateien.set('gesetze/BGB_de-bund.xml', gesetzesXML('Text'));
  sperre = erzeugeSperreAttrappe();
  vi.clearAllMocks();
});
describe('gleichzeitiges Speichern von Markierungen', () => {
  it('erhält beide unabhängigen Unterstreichungen und reicht den Sperrtoken weiter', async () => {
    const erste = eintrag();
    const zweite = eintrag({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 10, zeichenbereichEnde: 15 },
        bezugstext: '',
      },
    });
    await Promise.all([
      hinzufuegenMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), erste),
      hinzufuegenMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), zweite),
    ]);
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([
      { ...erste, erstellt: expect.any(String) },
      { ...zweite, erstellt: expect.any(String) },
    ]);
    expect(sichereBeiUngueltigemInhalt).toHaveBeenCalledWith(
      expect.any(String),
      null,
      expect.any(Function),
      expect.objectContaining({ token: schreiben.mock.calls[0]?.[2] }),
    );
    expect(schreiben.mock.calls[0]?.[2]).toMatch(/^test-token-/);
    expect(sichereBeiUngueltigemInhalt).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ token: schreiben.mock.calls[1]?.[2] }),
    );
    expect(schreiben.mock.calls[1]?.[2]).not.toBe(schreiben.mock.calls[0]?.[2]);
  });
  it('weist den zweiten Kommentar an derselben Stelle als Überlappung ab', async () => {
    const ergebnisse = await Promise.all([
      hinzufuegenMarkierung(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        eintrag({ typ: 'kommentar', kommentarText: 'Erster' }),
      ),
      hinzufuegenMarkierung(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        eintrag({ typ: 'kommentar', kommentarText: 'Zweiter' }),
      ),
    ]);
    expect(ergebnisse.filter((e) => e.erfolgreich)).toHaveLength(1);
    expect(ergebnisse).toContainEqual({ erfolgreich: false, ablehnungsgrund: 'ueberlappung' });
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toHaveLength(1);
  });
  it('weist identische allgemeine Kommentare als Duplikat ab', async () => {
    const kommentar = eintrag({
      typ: 'kommentar',
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },

      kommentarText: 'Identisch',
    });
    const ergebnisse = await Promise.all([
      hinzufuegenMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), kommentar),
      hinzufuegenMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), kommentar),
    ]);
    expect(ergebnisse.filter((e) => e.erfolgreich)).toHaveLength(1);
    expect(ergebnisse).toContainEqual({ erfolgreich: false, ablehnungsgrund: 'duplikat' });
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toHaveLength(1);
  });
  it('erhält Wiederherstellung und gleichzeitiges Hinzufügen', async () => {
    const alt = eintrag();
    const neu = eintrag({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 10, zeichenbereichEnde: 15 },
        bezugstext: '',
      },
    });
    await Promise.all([
      fuehreRueckgaengigAus({
        art: 'entfernen',
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        eintrag: alt,
      }),
      hinzufuegenMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), neu),
    ]);
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([
      alt,
      { ...neu, erstellt: expect.any(String) },
    ]);
  });
});

it('Hinzufügen und Rückgängig verwenden dieselbe vorhandene Datei bei anderer Schreibweise', async () => {
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  const andersGeschrieben = { kurztitel: 'bgb', normgeber: 'de-bund' };
  await hinzufuegenMarkierung(gesetz, eintrag());
  const neu = eintrag({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 10, zeichenbereichEnde: 15 },
      bezugstext: '',
    },
  });
  const ergebnis = await hinzufuegenMarkierung(andersGeschrieben, neu);
  expect(ergebnis.erfolgreich).toBe(true);
  await fuehreRueckgaengigAus(ergebnis.aktion!);
  expect(await ladeEintraege(andersGeschrieben)).toEqual([
    { ...eintrag(), erstellt: expect.any(String) },
  ]);
  expect([...dateien.keys()]).toEqual([
    'gesetze/BGB_de-bund.xml',
    'markierungen/BGB_de-bund-markierungen.xml',
  ]);
});

it('erhält gleichzeitige Neuanlagen unterschiedlich kodierter Schreibweisen derselben Referenz', async () => {
  const erste = eintrag();
  const zweite = eintrag({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 10, zeichenbereichEnde: 15 },
      bezugstext: '',
    },
  });
  const { dateiBasis } = await import('@/lib/persistenz/kern/kern.index');
  dateien.set(
    `gesetze/${dateiBasis({ kurztitel: 'CON.x', normgeber: 'de-bund' })}.xml`,
    gesetzesXML('Text', 'CON.x'),
  );
  await Promise.all([
    hinzufuegenMarkierung({ kurztitel: 'CON.x', normgeber: 'de-bund' }, erste),
    hinzufuegenMarkierung({ kurztitel: 'con.x', normgeber: 'de-bund' }, zweite),
  ]);
  expect([...dateien.keys()].filter((pfad) => pfad.startsWith('markierungen/'))).toHaveLength(1);
  expect(await ladeEintraege({ kurztitel: 'con.x', normgeber: 'de-bund' })).toEqual([
    { ...erste, erstellt: expect.any(String) },
    { ...zweite, erstellt: expect.any(String) },
  ]);
});

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'Toggle-Aus von %s bereinigt Räume und lässt sich vollständig rückgängig machen',
  async (typ) => {
    const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
    dateien.set('gesetze/BGB_de-bund.xml', gesetzesXML('Der nette Verkäufer'));
    const alt = eintrag({
      typ,
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 19 },
        bezugstext: 'Der nette Verkäufer',
      },
    });
    await hinzufuegenMarkierung(gesetz, alt);
    const ergebnis = await hinzufuegenMarkierung(
      gesetz,
      eintrag({
        typ,
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 4, zeichenbereichEnde: 9 },
          bezugstext: 'nette',
        },
      }),
    );
    expect(ergebnis.erfolgreich).toBe(true);
    expect(
      (await ladeEintraege(gesetz)).map((e) => [
        e.bezug.textstelle?.zeichenbereichStart,
        e.bezug.textstelle?.zeichenbereichEnde,
        e.bezug.bezugstext,
      ]),
    ).toEqual([
      [0, 3, 'Der'],
      [10, 19, 'Verkäufer'],
    ]);
    await fuehreRueckgaengigAus(ergebnis.aktion!);
    expect(await ladeEintraege(gesetz)).toEqual([{ ...alt, erstellt: expect.any(String) }]);
  },
);

it.each(['kommentar', 'verweismarkierung'] as const)(
  '%s mit defektem Textbezug wird beim Datei-Zusammenführen nicht übernommen',
  async (typ) => {
    const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
    const pauschal: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 1'),
      ...(typ === 'kommentar'
        ? { kommentarText: 'Notiz' }
        : {
            verweisinhalt: {
              verweistext: '§ 2',
              verweisziele: [
                verweisziel({
                  typ: 'zielnormOhneElementstand',
                  bezeichnung: '2',
                  verweistextZeichenbereich: [0, 3],
                }),
              ],
            },
          }),
    });
    const gueltigesXML = baueXML(gesetz, [pauschal]);
    const unvollstaendigesXML = gueltigesXML.replace(
      '</bezeichnung>',
      '</bezeichnung><textstelle><absatz>(1)</absatz><satz>2</satz><nummer wiederholung="1">1.</nummer><zeichenbereich start="0"/></textstelle>',
    );
    const pfad = await ermittleMarkierungsDateipfad(gesetz);
    expect(parseEintraege(unvollstaendigesXML).befunde).toMatchObject([
      { fall: 'textbezugUngueltig' },
    ]);
    // Auch ein importierter unvollständiger Textbezug wird gegen pauschalen Bestand geprüft.
    dateien.set(pfad, gueltigesXML);
    await zusammenfuehrenMarkierungen(gesetz, parseEintraege(unvollstaendigesXML).eintraege);
    expect(schreiben).not.toHaveBeenCalled();
    expect(dateien.get(pfad)).toBe(gueltigesXML);
  },
);

it('erhält eine echte UTF-16-Auswahl über Speicherung, Bearbeitung, Undo/Redo und Konfliktprüfung', async () => {
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  const quelle = '😀 Wort danach';
  const quellXML = `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt>
    <norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)"><satz zahl="1">${quelle}</satz></absatz></text></norm>
    </inhalt></gesetz>`;
  dateien.set('gesetze/BGB_de-bund.xml', quellXML);
  const darstellung = parseGesetzesXML(quellXML)!;
  const host = document.createElement('div');
  host.setAttribute('data-xml-id', 'n1');
  const blatt = document.createElement('span');
  blatt.setAttribute('data-leaf', '');
  blatt.setAttribute('data-absatz', '(1)');
  blatt.setAttribute('data-satz', '1');
  blatt.textContent = quelle;
  host.append(blatt);
  document.body.append(host);
  const auswahl = window.getSelection()!;
  try {
    const range = document.createRange();
    range.setStart(blatt.firstChild!, 3);
    range.setEnd(blatt.firstChild!, 7);
    auswahl.addRange(range);
    const ermittelt = ermittleAuswahl(auswahl);
    if (!ermittelt || 'fehler' in ermittelt) throw new Error('Auswahl fehlgeschlagen');
    expect(ermittelt.bezugstext).toBe('Wort');
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),

      kommentarText: 'Vorher',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: ermittelt.textstelle,
        bezugstext: ermittelt.bezugstext,
      },
    });
    expect((await hinzufuegenMarkierung(gesetz, original)).erfolgreich).toBe(true);
    const [geladen] = await ladeEintraege(gesetz);
    expect(geladen).toEqual({ ...original, erstellt: expect.any(String) });
    expect(pruefeEigenenKonflikt(geladen!, darstellung)).toBeUndefined();
    let staende: BearbeitungsStaende | undefined;
    expect(
      await aktualisiereKommentar(gesetz, geladen!, 'Nachher', original.bezug, undefined, (s) => {
        staende = s;
      }),
    ).toBe('geaendert');
    const aktion = {
      art: 'kommentarBearbeiten' as const,
      gesetz,
      ziel: original,
      vorher: {
        ...original.bezug,
        kommentarText: 'Vorher',
        erstellt: staende?.vorher.erstellt,
        geaendert: staende?.vorher.geaendert,
      },
      nachher: {
        ...original.bezug,
        kommentarText: 'Nachher',
        erstellt: staende?.nachher.erstellt,
        geaendert: staende?.nachher.geaendert,
      },
    };
    await fuehreRueckgaengigAus(aktion);
    expect(await ladeEintraege(gesetz)).toEqual([geladen]);
    await fuehreWiederholenAus(aktion);
    const [wiederholt] = await ladeEintraege(gesetz);
    expect(wiederholt).toEqual({
      ...geladen,
      geaendert: expect.any(String),
      kommentarText: 'Nachher',
    });
    expect(identitaetsSchluessel(wiederholt!)).toBe(identitaetsSchluessel(original));
    expect(pruefeEigenenKonflikt(wiederholt!, darstellung)).toBeUndefined();
    const ohneBlatt =
      parseGesetzesXML(`<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt>
      <norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(2)"><satz zahl="1">${quelle}</satz></absatz></text></norm>
      </inhalt></gesetz>`)!;
    expect(pruefeEigenenKonflikt(wiederholt!, ohneBlatt)).toBe('bezugstextFehltOderUnpassend');
  } finally {
    auswahl.removeAllRanges();
    host.remove();
  }
});

describe('Zeitstempel beim Speichern', () => {
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  const alt = '2026-11-05T10:00:00Z';
  const jetzt = '2026-11-05T11:00:00Z';
  const bestand = () => ladeEintraege(gesetz);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(alt));
    dateien.set('gesetze/BGB_de-bund.xml', gesetzesXML('abcdefghij'));
  });
  afterEach(() => vi.useRealTimers());
  const bereich = (
    start: number,
    ende: number,
    typ: 'unterstreichung' | 'hervorhebung' = 'unterstreichung',
  ) =>
    eintrag({
      typ,
      bezug: {
        typ: 'bezugstext',
        textstelle: {
          pfad: normtextPfad({}),
          zeichenbereichStart: start,
          zeichenbereichEnde: ende,
        },
        bezugstext: 'abcdefghij'.slice(start, ende),
      },
    });
  it.each(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'] as const)(
    'legt %s mit erstellt und ohne geaendert an',
    async (typ) => {
      await hinzufuegenMarkierung(gesetz, eintrag({ typ }));
      expect(await bestand()).toEqual([expect.objectContaining({ typ, erstellt: alt })]);
      expect((await bestand())[0]).not.toHaveProperty('geaendert');
    },
  );
  it('verschmilzt angrenzende Bereiche mit der Zeit der neuen Aktion', async () => {
    await hinzufuegenMarkierung(gesetz, bereich(0, 5));
    vi.setSystemTime(new Date(jetzt));
    await hinzufuegenMarkierung(gesetz, bereich(5, 10));
    expect(await bestand()).toEqual([{ ...bereich(0, 10), erstellt: jetzt }]);
  });
  it.each(['unterstreichung', 'hervorhebung'] as const)(
    'stempelt beide Reststücke beim Herausschneiden durch %s neu',
    async (typ) => {
      await hinzufuegenMarkierung(gesetz, bereich(0, 10));
      vi.setSystemTime(new Date(jetzt));
      await hinzufuegenMarkierung(gesetz, bereich(3, 7, typ));
      const reste = (await bestand()).filter((e) => e.typ === 'unterstreichung');
      expect(reste).toEqual([
        { ...bereich(0, 3), erstellt: jetzt },
        { ...bereich(7, 10), erstellt: jetzt },
      ]);
    },
  );
  it.each([undefined, '2026-11-05T09:00:00Z'])(
    'bewahrt alte Zeitstände einschließlich geaendert=%s bei Undo und Redo und schreibt unveränderten Kommentar nicht',
    async (geaendert) => {
      await zusammenfuehrenMarkierungen(gesetz, [
        {
          ...markierungsEintrag({
            typ: 'kommentar',
            kommentarText: 'Alt',
            bezug: bereich(0, 3).bezug,
          }),
          erstellt: alt,
          geaendert,
        },
      ]);
      const vorher = (await bestand())[0];
      if (!vorher) throw new Error('Kommentar fehlt');
      vi.setSystemTime(new Date(jetzt));
      expect(
        await aktualisiereKommentar(gesetz, vorher, 'Neu', {
          textstelle: vorher.bezug.textstelle,
          bezugstext: vorher.bezug.bezugstext,
        }),
      ).toBe('geaendert');
      const nachher = (await bestand())[0];
      if (!nachher) throw new Error('Bearbeiteter Kommentar fehlt');
      expect(nachher).toMatchObject({ erstellt: alt, geaendert: jetzt });
      schreiben.mockClear();
      expect(
        await aktualisiereKommentar(gesetz, nachher, 'Neu', {
          textstelle: nachher.bezug.textstelle,
          bezugstext: nachher.bezug.bezugstext,
        }),
      ).toBe('unveraendert');
      expect(schreiben).not.toHaveBeenCalled();
      const aktion: MarkierungsAktion = {
        art: 'kommentarBearbeiten',
        gesetz,
        ziel: { ausgangsstelle: vorher.ausgangsstelle },
        vorher: {
          ...vorher.bezug,
          kommentarText: 'Alt',
          erstellt: vorher.erstellt,
          geaendert: vorher.geaendert,
        },
        nachher: {
          ...nachher.bezug,
          kommentarText: 'Neu',
          erstellt: nachher.erstellt,
          geaendert: nachher.geaendert,
        },
      };
      await fuehreRueckgaengigAus(aktion);
      expect(await bestand()).toEqual([vorher]);
      await fuehreWiederholenAus(aktion);
      expect(await bestand()).toEqual([nachher]);
    },
  );
  it('übernimmt Importzeiten unverändert und behält bestehende Zeiten bei gleichen Inhalten', async () => {
    const original = { ...bereich(0, 3), erstellt: alt };
    expect(await zusammenfuehrenMarkierungen(gesetz, [original])).toBe(true);
    schreiben.mockClear();
    expect(
      await zusammenfuehrenMarkierungen(gesetz, [{ ...original, erstellt: jetzt }], false),
    ).toBe(false);
    expect(schreiben).not.toHaveBeenCalled();
    const neu = { ...bereich(7, 10), erstellt: jetzt };
    expect(
      await zusammenfuehrenMarkierungen(gesetz, [{ ...original, erstellt: jetzt }, neu], false),
    ).toBe(true);
    expect(await bestand()).toEqual([original, neu]);
  });
  it('meldet identische pauschale Importe auch neben anderen Kommentaren unverändert', async () => {
    const erster = {
      ...markierungsEintrag({
        typ: 'kommentar',
        bezug: { typ: 'pauschal', elementstand: { textlaenge: 10 } },
        kommentarText: 'A',
      }),
      erstellt: alt,
    };
    const zweiter = { ...erster, kommentarText: 'B' };
    await zusammenfuehrenMarkierungen(gesetz, [erster, zweiter]);
    schreiben.mockClear();
    expect(await zusammenfuehrenMarkierungen(gesetz, [{ ...erster, erstellt: jetzt }], false)).toBe(
      false,
    );
    expect(schreiben).not.toHaveBeenCalled();
    expect(await bestand()).toEqual([erster, zweiter]);
  });
});

it('verschmilzt eine neue Unterstreichung auf Satz 1 mit überlappendem Bestand ohne Satz-Schritt', async () => {
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  dateien.set('gesetze/BGB_de-bund.xml', gesetzesXML('abcdefghij'));
  const bereich = (start: number, ende: number, satz?: number) =>
    eintrag({
      bezug: {
        typ: 'bezugstext',
        textstelle: {
          pfad: normtextPfad({ satz }),
          zeichenbereichStart: start,
          zeichenbereichEnde: ende,
        },
        bezugstext: 'abcdefghij'.slice(start, ende),
      },
    });
  expect((await hinzufuegenMarkierung(gesetz, bereich(0, 5))).erfolgreich).toBe(true);
  expect((await hinzufuegenMarkierung(gesetz, bereich(3, 8, 1))).erfolgreich).toBe(true);
  const bestand = await ladeEintraege(gesetz);
  expect(bestand).toHaveLength(1);
  expect(bestand[0]?.bezug).toMatchObject({
    textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 8 },
    bezugstext: 'abcdefgh',
  });
});
