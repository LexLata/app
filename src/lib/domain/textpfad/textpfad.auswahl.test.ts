// @vitest-environment jsdom
// textpfad.auswahl.test.ts
// Echte DOM-Ranges unterscheiden leere Elementhüllen von ausgewählten Zeichen.
import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { beforeEach, describe, expect, it } from 'vitest';
import { ermittleAuswahl } from './textpfad';
import { ermittleMehrfachAuswahl } from './textpfad.vergleich';

const titelText = 'Keine Strafe ohne Gesetz';
let bezeichnung: HTMLElement;
let titel: HTMLElement;

beforeEach(() => {
  // Verschachtelung wie in NormBlock: Die Bezeichnung ist ein Blatt; der
  // Titel liegt in einem zusätzlichen span, der selbst kein Blatt ist.
  document.body.innerHTML =
    '<div data-xml-id="1"><div><span data-leaf data-bereich="bezeichnung">§ 1</span><span><span data-leaf data-bereich="amtlicherTitel">Keine Strafe ohne Gesetz</span></span></div><span data-leaf>Eine Tat kann nur bestraft werden, wenn die Strafbarkeit gesetzlich bestimmt war, bevor die Tat begangen wurde.</span></div>';
  bezeichnung = document.querySelector('[data-bereich="bezeichnung"]')!;
  titel = document.querySelector('[data-bereich="amtlicherTitel"]')!;
  window.getSelection()!.removeAllRanges();
});

function waehle(start: Node, startOffset: number, ende: Node, endOffset: number): Selection {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(ende, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function erwarteTitel(selection: Selection, text: string) {
  expect(selection.toString()).toBe(text);
  expect(ermittleAuswahl(selection)).toEqual({
    textstelle: {
      pfad: bereichPfad('amtlicherTitel'),
      zeichenbereichStart: 0,
      zeichenbereichEnde: text.length,
    },
    xmlId: '1',
    bezugstext: text,
  });
}

describe('Auswahl am Anfang des Normtitels', () => {
  it.each(['K', 'Keine', titelText])(
    'erlaubt %j, wenn der Browser am Ende des Bezeichnungstextes beginnt',
    (text) => {
      const selection = waehle(bezeichnung.firstChild!, 3, titel.firstChild!, text.length);
      const range = selection.getRangeAt(0);
      // Die leere Resthülle wird strukturell berührt, enthält aber kein
      // ausgewähltes Zeichen. Genau das ging im alten Range-Adapter verloren.
      expect(range.intersectsNode(bezeichnung)).toBe(true);
      erwarteTitel(selection, text);
    },
  );

  it.each(['text', 'titelblatt', 'titelwrapper', 'nach-bezeichnung'] as const)(
    'erlaubt Keine mit Startgrenze %s',
    (grenze) => {
      const start = {
        text: [titel.firstChild!, 0],
        titelblatt: [titel, 0],
        titelwrapper: [titel.parentElement!, 0],
        'nach-bezeichnung': [bezeichnung.parentElement!, 1],
      }[grenze] as [Node, number];
      erwarteTitel(waehle(start[0], start[1], titel.firstChild!, 5), 'Keine');
    },
  );

  it('lehnt echte Zeichen aus Bezeichnung und Titel weiterhin ab', () => {
    const selection = waehle(bezeichnung.firstChild!, 2, titel.firstChild!, 5);
    expect(selection.toString()).toBe('1Keine');
    expect(ermittleAuswahl(selection)).toEqual({ fehler: 'ueberspannt-mehrere' });
  });

  it('zählt die leere Anfangshülle des Titels nicht als zweiten Normteil', () => {
    const selection = waehle(bezeichnung.firstChild!, 2, titel.firstChild!, 0);
    expect(ermittleAuswahl(selection)).toEqual({
      textstelle: {
        pfad: bereichPfad('bezeichnung'),
        zeichenbereichStart: 2,
        zeichenbereichEnde: 3,
      },
      xmlId: '1',
      bezugstext: '1',
    });
  });
});

it('bündelt Unterabsatz, äußeren und inneren Satz und wiederholte Einträge mit UTF-16-Grenzen', () => {
  const eintraege: import('@/lib/domain/gesetzTypes').TextpfadEintrag[] = [
    { ebene: 'nummer', bezeichnung: '1' },
    { ebene: 'litera', bezeichnung: 'a', wiederholung: 2 },
  ];
  titel.removeAttribute('data-bereich');
  titel.setAttribute('data-absatz', '(1)');
  titel.setAttribute('data-unterabsatz', '[2]');
  titel.setAttribute('data-satz', '3');
  titel.setAttribute('data-satz-in-eintrag', '4');
  titel.setAttribute('data-eintraege', JSON.stringify(eintraege));
  titel.textContent = '😀 A\u00a0B';
  const selection = waehle(titel.firstChild!, 2, titel.firstChild!, 6);
  expect(ermittleAuswahl(selection)).toEqual({
    xmlId: '1',
    textstelle: {
      pfad: normtextPfad({
        absatz: '(1)',
        unterabsatz: '[2]',
        satz: 3,
        satzInEintrag: 4,
        eintraege,
      }),
      zeichenbereichStart: 2,
      zeichenbereichEnde: 6,
    },
    bezugstext: ' A\u00a0B',
  });
});

it('behält Leer- und Mehrnormfehler bei', () => {
  expect(ermittleAuswahl(null)).toEqual({ fehler: 'leer' });
  expect(ermittleAuswahl(window.getSelection())).toEqual({ fehler: 'leer' });
  const zweiteNorm = document.createElement('div');
  zweiteNorm.setAttribute('data-xml-id', '2');
  zweiteNorm.innerHTML = '<span data-leaf>Text</span>';
  document.body.append(zweiteNorm);
  expect(
    ermittleAuswahl(waehle(titel.firstChild!, 0, zweiteNorm.firstChild!.firstChild!, 2)),
  ).toEqual({ fehler: 'ueberspannt-mehrere' });
});

it.each(['satz', 'satz-in-eintrag'])(
  'erhält den gemeinsamen Eintragspfad bei fehlendem %s gegenüber Satz 1 in beiden Auswahlrichtungen',
  (feld) => {
    document.body.innerHTML = `<div data-xml-id="n1"><span data-leaf data-absatz="(1)" data-eintraege='[{"ebene":"nummer","bezeichnung":"1"}]'>A</span><span data-leaf data-absatz="(1)" data-${feld}="1" data-eintraege='[{"ebene":"nummer","bezeichnung":"1"}]'>B</span></div>`;
    const [a, b] = document.querySelectorAll('[data-leaf]');
    const aText = a?.firstChild;
    const bText = b?.firstChild;
    if (!a || !b || !aText || !bText) throw new Error('Zwei Textblätter erwartet');
    const selection = waehle(aText, 0, bText, 1);
    const erwartet = normtextPfad({
      absatz: '(1)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '1' }],
    });
    expect(ermittleMehrfachAuswahl(selection)).toEqual({ xmlId: 'n1', pfad: erwartet });
    a.setAttribute(`data-${feld}`, '1');
    b.removeAttribute(`data-${feld}`);
    expect(ermittleMehrfachAuswahl(selection)).toEqual({
      xmlId: 'n1',
      pfad: normtextPfad({ ...erwartet, [feld === 'satz' ? 'satz' : 'satzInEintrag']: 1 }),
    });
  },
);

describe('Nicht markierbarer Überschrifttext', () => {
  it.each(['vorwaerts', 'rueckwaerts'])(
    'lehnt Körper und gemischte Auswahlen ab (%s)',
    (richtung) => {
      document.body.innerHTML =
        '<div data-xml-id="u"><span data-leaf data-bereich="amtlicherTitel">Titel</span><div data-nicht-markierbar><span data-leaf>Körper</span></div></div><div data-xml-id="n"><span data-leaf>Norm</span></div>';
      const [titel, koerper, norm] = Array.from(document.querySelectorAll('[data-leaf]')).map(
        (el) => el.firstChild,
      );
      if (!titel || !koerper || !norm) throw new Error('Testtext fehlt');
      for (const [start, ende] of [
        [koerper, koerper],
        [titel, koerper],
        [koerper, norm],
      ]) {
        if (!start || !ende) throw new Error('Testtext fehlt');
        const selection = waehle(start, 0, ende, 3);
        if (richtung === 'rueckwaerts') selection.setBaseAndExtent(ende, 3, start, 0);
        expect(ermittleAuswahl(selection)).toEqual({ fehler: 'ueberspannt-mehrere' });
        expect(ermittleMehrfachAuswahl(selection)).toEqual({ fehler: 'ueberspannt-mehrere' });
      }
      const selection = waehle(titel, 0, koerper, 0);
      expect(ermittleAuswahl(selection)).not.toHaveProperty('fehler');
      expect(ermittleMehrfachAuswahl(selection)).not.toHaveProperty('fehler');
      const normAuswahl = waehle(koerper, 6, norm, 3);
      expect(ermittleAuswahl(normAuswahl)).toMatchObject({ xmlId: 'n', bezugstext: 'Nor' });
      expect(ermittleMehrfachAuswahl(normAuswahl)).toMatchObject({ xmlId: 'n' });
    },
  );
});
