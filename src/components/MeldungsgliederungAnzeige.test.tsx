// @vitest-environment jsdom
// Zeilenaufbau, Einzug und Farbe der gemeinsamen Meldungsgliederung (Banner, Importbericht).
import { act } from 'react';
import { expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { MeldungsgliederungAnzeige } from '@/components/MeldungsgliederungAnzeige';
import {
  gliedereMeldungen,
  type Gliederungseintrag,
  type Gliederungskategorie,
} from '@/lib/domain/app/meldungsgliederung';
import { textRollen } from '@/lib/stil/textRollen';

const dom = domTestWurzel();
const gruppe = (schluessel: string) => ({ schluessel, ueberschrift: () => schluessel });
const KATEGORIEN: Gliederungskategorie[] = [
  { schluessel: 'gesetz', ueberschrift: 'Gesetze', gruppen: [gruppe('neu'), gruppe('ersetzt')] },
  {
    schluessel: 'fehler',
    ueberschrift: 'Fehler',
    gruppen: [gruppe('lesefehler'), gruppe('format')],
  },
];
const name = (kategorie: string, g: string, n: string): Gliederungseintrag => ({
  kategorie,
  gruppe: g,
  name: n,
});

async function zeige(eintraege: Gliederungseintrag[], schwelle = 0) {
  const gliederung = gliedereMeldungen(eintraege, { schwelle, kategorien: KATEGORIEN });
  await act(async () => dom.root.render(<MeldungsgliederungAnzeige gliederung={gliederung} />));
}
function zeilen() {
  return Array.from(dom.host.querySelectorAll<HTMLElement>('[data-zeile]'));
}
/** Zeilenart, Einzug und ob ein betonter Kategoriename am Zeilenanfang steht. */
function aufbau() {
  return zeilen().map((z) => {
    const anfang = z.firstElementChild;
    const betont =
      z.style.fontWeight === String(textRollen.standardtextBetont.fontWeight) ||
      (anfang?.tagName === 'STRONG' && z.textContent?.startsWith(anfang.textContent ?? '-'));
    return `${z.dataset.zeile}:${z.dataset.einzug}${betont ? ':betont' : ''}`;
  });
}

it('rückt bei einer Kategorie mit einer Gruppe nichts ein und nennt die Kategorie nicht', async () => {
  await zeige([name('gesetz', 'neu', 'BGB'), name('gesetz', 'neu', 'StGB')]);
  expect(aufbau()).toEqual(['gruppe:0', 'namen:0']);
  expect(dom.host.textContent).not.toContain('Gesetze');
});

it('rückt bei einer Kategorie mit mehreren Gruppen nur die Namen einmal ein', async () => {
  await zeige([name('gesetz', 'neu', 'BGB'), name('gesetz', 'ersetzt', 'StGB')]);
  expect(aufbau()).toEqual(['gruppe:0', 'namen:1', 'gruppe:0', 'namen:1']);
  expect(dom.host.textContent).not.toContain('Gesetze');
});

it('setzt bei mehreren Kategorien die einzige Gruppe neben die Kategorie und gliedert mehrere Gruppen zweistufig', async () => {
  await zeige([
    name('gesetz', 'neu', 'BGB'),
    name('fehler', 'lesefehler', 'a.xml'),
    name('fehler', 'format', 'b.xml'),
    { kategorie: 'fehler', satz: 'Kategoriesatz.' },
  ]);
  expect(aufbau()).toEqual([
    'gruppe:0:betont',
    'namen:1',
    'kategorie:0:betont',
    'gruppe:1',
    'namen:2',
    'gruppe:1',
    'namen:2',
    'satz:1',
  ]);
});

it('rückt nach Einzug mit der Rolle berichtGruppe ein, zweite Ebene doppelt', async () => {
  await zeige([
    name('gesetz', 'neu', 'BGB'),
    name('fehler', 'lesefehler', 'a.xml'),
    name('fehler', 'format', 'b.xml'),
  ]);
  const stufe = String(textRollen.berichtGruppe.paddingLeft);
  const normiert = (wert: string) => {
    const probe = document.createElement('div');
    probe.style.paddingLeft = wert;
    return probe.style.paddingLeft;
  };
  const erwartet: Record<string, string> = {
    '0': '',
    '1': stufe,
    '2': normiert(`calc(2 * ${stufe})`),
  };
  expect(zeilen().map((z) => z.dataset.einzug)).toEqual(['0', '1', '0', '1', '2', '1', '2']);
  for (const z of zeilen()) expect(z.style.paddingLeft).toBe(erwartet[z.dataset.einzug ?? '']);
});

it('nennt in Satzform die Kategorie nur bei mehreren Kategorien; allgemeine Sätze zählen nicht', async () => {
  await zeige([{ satz: 'Allgemein.' }, name('fehler', 'lesefehler', 'a.xml')], 5);
  expect(aufbau()).toEqual(['satz:0', 'satz:0']);
  expect(dom.host.textContent).not.toContain('Fehler');
  await zeige([name('gesetz', 'neu', 'BGB'), name('fehler', 'lesefehler', 'a.xml')], 5);
  expect(aufbau()).toEqual(['satz:0:betont', 'satz:0:betont']);
});

it('zeigt auch Fehlerkategorien in normaler Textfarbe', async () => {
  for (const schwelle of [0, 5]) {
    await zeige(
      [{ satz: 'Allgemein.' }, name('gesetz', 'neu', 'BGB'), name('fehler', 'lesefehler', 'a.xml')],
      schwelle,
    );
    expect(zeilen().length).toBeGreaterThan(0);
    for (const z of zeilen()) {
      expect(z.style.color).toBe(textRollen.standardtext.color);
      expect(z.style.color).not.toBe(textRollen.fehlertext.color);
    }
  }
});
