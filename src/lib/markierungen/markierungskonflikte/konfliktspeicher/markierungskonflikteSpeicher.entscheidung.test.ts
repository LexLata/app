import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonflikteSpeicher.entscheidung.test.ts
//
// Unit-Tests für die reinen Funktionen aus
// markierungskonflikteSpeicher.entscheidung.ts (extrahiert aus
// fuehrePruefungAus() in markierungskonflikteSpeicher.ts, siehe dortiger
// Kopfkommentar). Fixture-Stil bewusst analog zu
// markierungskonflikteXML.test.ts / markierungskonfliktPruefung.test.ts gehalten.
//
// entscheideEigenerBlock/entscheidePatchBlock sind dünne Wrapper um bereits
// separat getestete Funktionen (pruefeMarkierungenEinesGesetzes,
// aktualisiereZielkonflikte) – hier wird daher NUR die zusätzliche
// Wrapper-Logik geprüft (Set/Delete-Entscheidung, Kurzschluss bei leeren
// Einträgen), nicht die Konflikt-Erkennung selbst erneut. signaturenGespeicherterKonflikte
// und berechneNeueKonflikte sind dagegen komplett neue eigenständige Logik
// und werden vollständig getestet.

import { bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { describe, expect, it } from 'vitest';
import {
  berechneNeueKonflikte,
  entscheideEigenerBlock,
  entscheidePatchBlock,
  signaturenGespeicherterKonflikte,
} from './markierungskonflikteSpeicher.entscheidung';
import type { GespeicherteGesetzKonflikte } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  baueMarkierungskonflikteXML,
  liesMarkierungskonflikteXML,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import type { GesetzDarstellung, NormDarstellung } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

/** Gespeicherte Konflikte aus einem einzelnen Gesetzesblock der Konfliktdatei. */
function gespeichert(roh: string): GespeicherteGesetzKonflikte {
  const [konflikte] = liesMarkierungskonflikteXML(
    `<markierungskonflikte>${roh}</markierungskonflikte>`,
  ).gesetzKonflikte.values();
  if (!konflikte) throw new Error('Gesetzesblock ohne gültige Gesetzesangabe.');
  return konflikte;
}

function bestand(gesetzKonflikte: [string, string][]): Map<string, GespeicherteGesetzKonflikte> {
  return new Map(gesetzKonflikte.map(([schluessel, roh]) => [schluessel, gespeichert(roh)]));
}

/** Konfliktdatei, in der nur die übergebenen Konflikte gespeichert sind. */
function datei(konflikte: GespeicherteGesetzKonflikte | undefined): string {
  return baueMarkierungskonflikteXML({
    gesetzKonflikte: new Map(konflikte ? [['x', konflikte]] : []),
    pruefstatus: 'aktuell',
  });
}

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function norm(xmlId: string, bezeichnung: string): NormDarstellung {
  return normaleNorm({ id: naechsteId(), xmlId, bezeichnung, absaetze: [] });
}

function gesetz(kurztitel: string, normen: NormDarstellung[] = []): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: normen.map((n) => ({ typ: 'norm' as const, data: n })),
  });
}

function pauschalerKommentarEintrag(bezeichnung: string): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
  }) as MarkierungsEintrag;
}

function zielnorm(overrides: Parameters<typeof zielnormTestdaten>[0]): Verweisziel {
  return zielnormTestdaten(overrides);
}

function verweisEintrag(bezeichnung: string, verweisziele: Verweisziel[]): MarkierungsEintrag {
  return markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
    verweisinhalt: { verweistext: 'x', verweisziele },
  });
}

// ---------------------------------------------------------------------------
// entscheideEigenerBlock
// ---------------------------------------------------------------------------

describe('entscheideEigenerBlock', () => {
  it('leere eintraege -> undefined, unabhängig davon ob das Gesetz existiert (letzte Markierung gerade gelöscht)', () => {
    const result = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [],
      [gesetz('BGB')],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).toBeUndefined();
  });

  it('eigenesGesetz existiert nicht mehr (gesetzFehlt) -> Roh-Block mit <konflikt typ="gesetz-fehlt"/>', () => {
    const result = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [pauschalerKommentarEintrag('433')],
      [],
      new Set(),
    );
    expect(datei(result)).toContain(
      [
        '>\n    <gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <konflikt typ="gesetz-fehlt"/>',
        '    </gesetz>\n',
      ].join('\n'),
    );
  });

  it('Gesetz existiert, Markierung passt weiterhin (Altbestand ohne textstelle/elementstand) und nichtamtlicher Titel vorhanden -> kein Konflikt -> undefined', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const result = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [pauschalerKommentarEintrag('433')],
      [g],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).toBeUndefined();
  });

  it('Gesetz existiert, aber nichtamtlicher Titel fehlt (nichtamtlicheTitelXmlFehlt) -> Roh-Block wird trotz sonst passender Markierung gebaut', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const eintrag = markierungsEintrag({
      ...pauschalerKommentarEintrag('433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('nichtamtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 'Kauf'.length,
        },
        bezugstext: 'Kauf',
      },
    }) as MarkierungsEintrag;
    const result = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [eintrag],
      [g],
      new Set(),
    );
    expect(datei(result)).toContain('<konflikt typ="nichtamtliche-titel-xml-fehlt"/>');
  });

  it('leere eintraege UND Gesetz existiert nicht mehr -> trotzdem undefined (kein Konflikt-Block bei bereits leerem Bestand, s. Docstring "unabhängig davon ob das Gesetz existiert")', () => {
    const result = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [],
      [],
      new Set(),
    );
    expect(result).toBeUndefined();
  });

  it('wählt aus mehreren Gesetzen das per kurztitel passende, nicht einfach das erste Element', () => {
    const andere = gesetz('ZPO', [norm('1', '§ 1')]);
    const eigenes = gesetz('BGB', [norm('433', '§ 433')]);
    const result = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [pauschalerKommentarEintrag('433')],
      [andere, eigenes],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    // Markierung passt zu § 433 im tatsächlich per kurztitel
    // gefundenen (zweiten) Gesetz -> kein Konflikt. Würde find()
    // stattdessen (Mutant) immer das erste Element ('ZPO', ohne § 433)
    // liefern, gäbe es fälschlich einen Konflikt.
    expect(result).toBeUndefined();
  });

  it('Gesetz existiert, Titel vorhanden, aber eine Markierung passt nicht mehr (direkter Eigenkonflikt ohne fehlendes Gesetz/Titel) -> Roh-Block wird gebaut', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const result = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [pauschalerKommentarEintrag('nicht-vorhandene-norm')],
      [g],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// entscheidePatchBlock
// ---------------------------------------------------------------------------

describe('entscheidePatchBlock', () => {
  it('kein referenzierender Eintrag mehr und kein vorherRoh -> undefined', () => {
    const result = entscheidePatchBlock(
      undefined,
      [],
      gesetz('BGB'),
      [gesetz('BGB')],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result).toBeUndefined();
  });

  it('neuer Zielkonflikt (zielGesetzFehlt, Zielgesetz fehlt) -> gebauter Roh-Block enthält Zielgesetz und Konflikttyp', () => {
    const eigen = gesetz('BGB');
    const e = verweisEintrag('1', [
      zielnorm({
        bezeichnung: '1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    const result = entscheidePatchBlock(
      undefined,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(datei(result)).toContain(
      '<konflikt typ="ziel-gesetz-fehlt" gesetz="StGB" normgeber="de-bund"/>',
    );
  });

  it('bestehender Zielkonflikt jetzt vollständig gelöst -> undefined (Block wird entfernt)', () => {
    const zielG = gesetz('StGB', [norm('1', '§ 1')]);
    const eigen = gesetz('BGB');
    const e = verweisEintrag('1', [
      zielnorm({
        bezeichnung: '1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: testElementstand(),
      }),
    ]);
    // vorherRoh mit demselben Zielkonflikt, der jetzt (Zielgesetz+Norm mit
    // passender Länge vorhanden) nicht mehr auftritt:
    const vorherRoh = entscheidePatchBlock(
      undefined,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    const result = entscheidePatchBlock(
      vorherRoh,
      [e],
      eigen,
      [zielG],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// signaturenGespeicherterKonflikte
// ---------------------------------------------------------------------------

describe('signaturenGespeicherterKonflikte', () => {
  it('undefined -> leeres Set', () => {
    expect(signaturenGespeicherterKonflikte(undefined)).toEqual(new Set());
  });

  it('gesetzFehlt (<konflikt typ="gesetz-fehlt"/>) -> ausschließlich die gesetzFehlt-Pseudo-Signatur, auch bei zusätzlichem Inhalt', () => {
    const roh =
      '<gesetz kurztitel="BGB" normgeber="de-bund">\n<konflikt typ="gesetz-fehlt"/>\n</gesetz>';
    expect(signaturenGespeicherterKonflikte(gespeichert(roh))).toEqual(
      new Set(['__gesetz-fehlt__']),
    );
  });

  it('nichtamtlicheTitelXmlFehlt (<konflikt typ="nichtamtliche-titel-xml-fehlt"/>) -> nichtamtlicheTitelXmlFehlt-Pseudo-Signatur, kein Kurzschluss wie bei gesetzFehlt', () => {
    const roh =
      '<gesetz kurztitel="BGB" normgeber="de-bund">\n<konflikt typ="nichtamtliche-titel-xml-fehlt"/>\n</gesetz>';
    expect(signaturenGespeicherterKonflikte(gespeichert(roh))).toEqual(
      new Set(['__nichtamtliche-titel-fehlen__']),
    );
  });

  it('Zielkonflikt (zielGesetzFehlt) im Block -> passende :ziel:-Signatur enthalten, aber KEINE :eigen-Signatur', () => {
    const eigen = gesetz('BGB');
    const e = verweisEintrag('1', [
      zielnorm({
        bezeichnung: '1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    const roh = entscheidePatchBlock(
      undefined,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    )!;
    const signaturen = signaturenGespeicherterKonflikte(roh);
    expect(
      [...signaturen].some((s) =>
        s.includes(
          `:ziel:${gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))}:zielGesetzFehlt`,
        ),
      ),
    ).toBe(true);
    expect([...signaturen].some((s) => s.endsWith(':eigen:bezugstextFehltOderUnpassend'))).toBe(
      false,
    );
  });

  it('reiner Eigenkonflikt (kein Zielkonflikt, Titel vorhanden) -> :eigen-Signatur enthalten, aber KEINE nichtamtlicheTitelXmlFehlt-Signatur', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const roh = entscheideEigenerBlock(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [
        markierungsEintrag({
          bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
          typ: 'kommentar',
          ausgangsstelle: normAusgangsstelle('§ nicht-vorhandene-norm'),
          kommentarText: 'Notiz',
        }),
      ],
      [g],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    )!;
    const signaturen = signaturenGespeicherterKonflikte(roh);
    expect([...signaturen].some((s) => s.endsWith(':eigen:pauschalerBezugFehlt'))).toBe(true);
    expect(signaturen.has('__nichtamtliche-titel-fehlen__')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// berechneNeueKonflikte
// ---------------------------------------------------------------------------

describe('berechneNeueKonflikte', () => {
  it('identische Blöcke vorher/nachher -> false', () => {
    const vorher = bestand([
      [
        'BGB',
        '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ],
    ]);
    const nachher = bestand([
      [
        'BGB',
        '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ],
    ]);
    expect(berechneNeueKonflikte(new Set(['BGB']), vorher, nachher)).toBe(false);
  });

  it('vorher kein Block, nachher ein neuer Konflikt -> true', () => {
    const vorher = new Map<string, GespeicherteGesetzKonflikte>();
    const nachher = bestand([
      [
        'BGB',
        '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ],
    ]);
    expect(berechneNeueKonflikte(new Set(['BGB']), vorher, nachher)).toBe(true);
  });

  it('bestehender Konflikt vollständig aufgelöst (Block verschwindet) -> false, KEIN erneutes Öffnen bei reiner Auflösung', () => {
    const vorher = bestand([
      [
        'BGB',
        '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ],
    ]);
    const nachher = new Map<string, GespeicherteGesetzKonflikte>();
    expect(berechneNeueKonflikte(new Set(['BGB']), vorher, nachher)).toBe(false);
  });

  it('Verschiebung zielGesetzFehlt -> zielNormUnpassend bei sonst unveränderter Signatur zählt als neue Signatur (typ ist Teil der Signatur) -> true', () => {
    const vorher = bestand([
      [
        'BGB',
        '<gesetz kurztitel="BGB" normgeber="de-bund"><verweismarkierung><bezeichnung>§ 1</bezeichnung><verweistext>§ 1</verweistext><konflikt typ="ziel-gesetz-fehlt" gesetz="StGB" normgeber="de-bund"/></verweismarkierung></gesetz>',
      ],
    ]);
    // (nur zur Illustration der Signaturform – der eigentliche Verschiebungsfall
    // wird bereits über entscheidePatchBlock/pruefeMarkierungenEinesGesetzes
    // erzeugt; hier wird nur der reine Vergleich auf Set-Ebene geprüft)
    const nachher = bestand([
      [
        'BGB',
        '<gesetz kurztitel="BGB" normgeber="de-bund"><verweismarkierung><bezeichnung>§ 1</bezeichnung><verweistext>§ 1</verweistext><konflikt typ="ziel-norm-unpassend" gesetz="StGB" normgeber="de-bund"/></verweismarkierung></gesetz>',
      ],
    ]);
    expect(berechneNeueKonflikte(new Set(['BGB']), vorher, nachher)).toBe(true);
  });

  it('nur Kurztitel aus der übergebenen Menge werden verglichen (unveränderte, nicht übergebene Blöcke bleiben irrelevant)', () => {
    const vorher = bestand([
      [
        'HGB',
        '<gesetz kurztitel="HGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ],
    ]);
    const nachher = new Map<string, GespeicherteGesetzKonflikte>();
    // HGB ist NICHT in kurztitel enthalten -> Änderung wird ignoriert:
    expect(berechneNeueKonflikte(new Set(['BGB']), vorher, nachher)).toBe(false);
  });
});
