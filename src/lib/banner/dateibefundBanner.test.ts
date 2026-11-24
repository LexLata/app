// Prüft das sich erweiternde Dateibefund-Banner über den Bannerspeicher.
import { beforeEach, expect, it, vi } from 'vitest';
import {
  alleBannerSchliessen,
  bannerSchliessen,
  getSnapshot,
  meldeDateibefund,
  type Vorgangsmeldung,
} from './banner.index';
import { sicherungenImDatenordnerSatz } from '@/lib/domain/app/meldungsgruppen';

type AktionsMeldung = Vorgangsmeldung;

const SICHERUNGSPFAD = '/Nutzer/daten/LexLata/sicherungen/2026/';

function gesichert(n: number): AktionsMeldung {
  return {
    typ: 'warnung',
    grund: 'imDatenordnerGesichert',
    betroffen: `Datei${n}.xml`,
    text: `Die Datei ‚Datei${n}.xml' wurde wegen Beschädigung gesichert.`,
  };
}

function unlesbar(n: number): AktionsMeldung {
  return {
    typ: 'fehler',
    grund: 'nichtLesbar',
    betroffen: `Fremd${n}.xml`,
    text: `Die Datei ‚Fremd${n}.xml' konnte nicht gelesen werden.`,
  };
}

beforeEach(() => {
  alleBannerSchliessen();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

it('fasst zehn Dateibefunde in genau einem nach Grund gegliederten Banner ohne Pfad zusammen', () => {
  for (let i = 0; i < 7; i += 1) meldeDateibefund(gesichert(i));
  for (let i = 0; i < 3; i += 1) meldeDateibefund(unlesbar(i));
  const banner = getSnapshot();
  expect(banner).toHaveLength(1);
  expect(banner[0]).toMatchObject({ art: 'dateibefunde', typ: 'fehler' });
  const gruppen = (banner[0]?.gliederung?.kategorien ?? []).flatMap((k) => k.gruppen);
  expect(gruppen.map((g) => [g.schluessel, g.anzahl])).toEqual(
    expect.arrayContaining([
      ['imDatenordnerGesichert', 7],
      ['nichtLesbar', 3],
    ]),
  );
  expect(gruppen.find((g) => g.schluessel === 'nichtLesbar')?.namen.map((n) => n.name)).toEqual([
    'Fremd0.xml',
    'Fremd1.xml',
    'Fremd2.xml',
  ]);
  expect(banner[0]?.text).not.toContain('\n');
  expect(JSON.stringify(banner)).not.toContain(SICHERUNGSPFAD);
  expect(JSON.stringify(banner)).not.toContain('/');
});

it('beginnt nach dem Schließen mit dem nächsten Befund ein neues Banner', () => {
  meldeDateibefund(gesichert(1));
  meldeDateibefund(gesichert(2));
  const erstes = getSnapshot()[0]?.id ?? '';
  bannerSchliessen(erstes);
  meldeDateibefund(unlesbar(1));
  const banner = getSnapshot();
  expect(banner).toHaveLength(1);
  expect(banner[0]?.id).not.toBe(erstes);
  const gruppen = (banner[0]?.gliederung?.kategorien ?? []).flatMap((k) => k.gruppen);
  expect(gruppen.map((g) => [g.schluessel, g.namen.map((n) => n.name)])).toEqual([
    ['nichtLesbar', ['Fremd1.xml']],
  ]);
});

it('führt einen gleichen Befund (Grund und Datei) nur einmal', () => {
  meldeDateibefund(gesichert(1));
  meldeDateibefund(unlesbar(1));
  meldeDateibefund(gesichert(1));
  meldeDateibefund(unlesbar(1));
  const banner = getSnapshot();
  expect(banner).toHaveLength(1);
  const kategorien = banner[0]?.gliederung?.kategorien ?? [];
  expect(
    kategorien.flatMap((k) => k.gruppen).map((g) => [g.schluessel, g.namen.map((n) => n.name)]),
  ).toEqual([
    ['imDatenordnerGesichert', ['Datei1.xml']],
    ['nichtLesbar', ['Fremd1.xml']],
  ]);
  // Hinweis auf die Sicherungen genau einmal.
  expect(kategorien.flatMap((k) => k.saetze)).toHaveLength(1);
});

it('führt einen Befund ohne Betroffenen bei gleichem Grund und Wortlaut nur einmal', () => {
  const ohneDatei = (text: string): AktionsMeldung => ({
    typ: 'warnung',
    grund: 'nichtLesbar',
    text,
  });
  meldeDateibefund(ohneDatei('Ein Ordner konnte nicht gelesen werden.'));
  meldeDateibefund(ohneDatei('Ein Ordner konnte nicht gelesen werden.'));
  meldeDateibefund(ohneDatei('Ein anderer Ordner konnte nicht gelesen werden.'));
  const banner = getSnapshot();
  expect(banner).toHaveLength(1);
  expect(banner[0]?.text.split('Ein Ordner konnte nicht gelesen werden.')).toHaveLength(2);
  expect(banner[0]?.text).toContain('Ein anderer Ordner konnte nicht gelesen werden.');
});

it('nennt den Ort der Sicherungen einmal am Ende, in Singular und Plural', () => {
  meldeDateibefund({ ...gesichert(1), sicherung: 'sicherungen/Datei1.xml' });
  expect(getSnapshot()[0]?.text.endsWith(sicherungenImDatenordnerSatz(1))).toBe(true);
  meldeDateibefund({ ...gesichert(2), sicherung: 'sicherungen/Datei2.xml' });
  meldeDateibefund(unlesbar(1));
  const text = getSnapshot()[0]?.text ?? '';
  expect(text.split(sicherungenImDatenordnerSatz(2))).toHaveLength(2);
  expect(text).not.toContain(sicherungenImDatenordnerSatz(1));
});
