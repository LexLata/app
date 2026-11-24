// vorgangsergebnis.test.ts
// Gliederung des Vorgangsergebnisses (P2-A1, P2-A4) über das öffentliche
// Interface; geprüft wird die Struktur, nicht der Wortlaut.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  alleBannerSchliessen,
  bannerDauerMs,
  getSnapshot,
  zeigeAktionsMeldungsBanner,
} from './banner.index';
import { gliedereVorgangsergebnis } from './aktionsMeldungsBanner';

type Meldung = Parameters<typeof gliedereVorgangsergebnis>[0][number];

const fehler = (name: string, grund: Meldung['grund']): Meldung => ({
  text: `${name} fehlgeschlagen.`,
  typ: 'fehler',
  grund,
  betroffen: name,
});
const importiert = (namen: string[]) => ({ namen, ueberschrift: () => 'Importiert' });

beforeEach(() => alleBannerSchliessen());

describe('gliedereVorgangsergebnis', () => {
  it('zeigt bis zur Schwelle Sätze, darüber eine nach Grund gegliederte Liste', () => {
    const zwei = gliedereVorgangsergebnis([
      fehler('AAG', 'keineVerbindung'),
      fehler('BGB', 'downloadFehlgeschlagen'),
    ]);
    expect(zwei?.gliederung?.form).toBe('saetze');

    const vier = gliedereVorgangsergebnis([
      fehler('AAG', 'keineVerbindung'),
      fehler('BGB', 'keineVerbindung'),
      fehler('StGB', 'downloadFehlgeschlagen'),
      fehler('ZPO', 'beschaeftigt'),
    ]);
    expect(vier?.gliederung?.form).toBe('gliederung');
    expect(vier?.typ).toBe('fehler');
    const gruppen = vier?.gliederung?.kategorien.flatMap((k) => k.gruppen) ?? [];
    const nachGruppe = Object.fromEntries(
      gruppen.map((g) => [g.schluessel, g.namen.map((n) => n.name)]),
    );
    expect(nachGruppe).toEqual({
      keineVerbindung: ['AAG', 'BGB'],
      beschaeftigt: ['ZPO'],
      downloadFehlgeschlagen: ['StGB'],
    });
  });

  it('hängt Folgemeldungen als Hinweis an das übernommene Gesetz', () => {
    const ergebnis = gliedereVorgangsergebnis(
      [
        {
          text: 'Titel nicht ergänzt.',
          typ: 'warnung',
          grund: 'titelNichtErgaenzt',
          betroffen: 'BGB',
        },
      ],
      importiert(['AAG', 'BGB']),
    );
    const namen =
      ergebnis?.gliederung?.kategorien.flatMap((k) => k.gruppen.flatMap((g) => g.namen)) ?? [];
    expect(namen.find((n) => n.name === 'BGB')?.hinweise).toHaveLength(1);
    expect(namen.find((n) => n.name === 'AAG')?.hinweise).toHaveLength(0);
    expect(ergebnis?.gliederung?.allgemein).toEqual([]);
  });

  it('nennt Meldungen ohne Grund oder Betroffenes und die offene Konfliktprüfung als allgemeinen Satz', () => {
    const ergebnis = gliedereVorgangsergebnis(
      [
        { text: 'Allgemeiner Befund.', typ: 'warnung' },
        { text: 'Konflikt A', typ: 'warnung', grund: 'konfliktpruefungOffen', betroffen: 'AAG' },
        { text: 'Konflikt B', typ: 'warnung', grund: 'konfliktpruefungOffen', betroffen: 'BGB' },
        { text: 'Ohne Betroffenes.', typ: 'fehler', grund: 'keineVerbindung' },
      ],
      importiert(['AAG', 'BGB']),
    );
    const allgemein = ergebnis?.gliederung?.allgemein;
    // Konfliktprüfung einmal als fester Satz, nicht je Gesetz.
    expect(allgemein).toHaveLength(3);
    expect(allgemein).toContain('Allgemeiner Befund.');
    expect(allgemein).toContain('Ohne Betroffenes.');
  });

  it('zeigt eine einzelne Meldung ohne Grund als ihren Rohtext', () => {
    const einzeln = gliedereVorgangsergebnis([{ text: 'Allgemein.', typ: 'fehler' }]);
    expect(einzeln?.text).toBe('Allgemein.');
    expect(einzeln?.gliederung).toBeUndefined();
    expect(gliedereVorgangsergebnis([])).toBeUndefined();
  });

  it('bildet auch für eine einzelne Meldung mit Grund den Satz ihrer Gruppe statt des Rohtexts', () => {
    const einzeln = gliedereVorgangsergebnis([fehler('AAG', 'keineVerbindung')]);
    const gliederung = einzeln?.gliederung;
    expect(gliederung?.form).toBe('saetze');
    expect(gliederung?.allgemein).toEqual([]);
    const [gruppe] = gliederung?.kategorien.flatMap((k) => k.gruppen) ?? [];
    expect(gruppe).toMatchObject({ schluessel: 'keineVerbindung', anzahl: 1 });
    expect(einzeln?.text).not.toContain('fehlgeschlagen.');
    expect(einzeln?.text).toBe(gruppe?.satz);
  });

  it('bildet je Gruppe einen eigenen Satz in Singular bzw. Plural und verweist einmal auf Sicherungen', () => {
    const datei = (name: string, grund: Meldung['grund']): Meldung => ({
      text: `${name}: Rohtext. Sicherungen liegen im LexLata-Datenordner.`,
      typ: 'warnung',
      grund,
      betroffen: name,
      sicherung: `gesetze/${name}.sicherung`,
    });
    const eins = gliedereVorgangsergebnis([datei('A.xml', 'imDatenordnerGesichert')]);
    const zwei = gliedereVorgangsergebnis([
      datei('A.xml', 'imDatenordnerGesichert'),
      datei('B.xml', 'imDatenordnerGesichert'),
    ]);
    const satz = (e: typeof eins) => e?.gliederung?.kategorien[0]?.gruppen[0]?.satz ?? '';
    // Gleicher Grund, andere Anzahl → andere Verbform, beide Namen im Satz.
    expect(satz(eins)).not.toBe(satz(zwei).replace('A.xml und B.xml', 'A.xml'));
    expect(satz(zwei)).toContain('A.xml und B.xml');
    for (const e of [eins, zwei]) {
      expect(e?.text).not.toContain('Rohtext');
      expect(e?.text.split('LexLata-Datenordner').length).toBe(2);
      expect(e?.gliederung?.kategorien[0]?.saetze).toHaveLength(1);
    }
  });
});

describe('Überschriften der Dateibefundgruppen', () => {
  it.each(['nichtBereinigt', 'nichtSpeicherbar', 'dateiFehlt', 'dateiLeer'] as const)(
    '%s: Überschrift bei einer Datei anders als bei mehreren',
    (grund) => {
      const datei = (name: string): Meldung => ({
        text: name,
        typ: 'warnung',
        grund,
        betroffen: name,
      });
      const ueberschrift = (meldungen: Meldung[]) =>
        gliedereVorgangsergebnis(meldungen)
          ?.gliederung?.kategorien.flatMap((k) => k.gruppen)
          .find((g) => g.schluessel === grund)?.ueberschrift;
      const eine = ueberschrift([datei('a.xml')]);
      const mehrere = ueberschrift([datei('a.xml'), datei('b.xml')]);
      expect(eine).toBeTruthy();
      expect(mehrere).toBeTruthy();
      expect(eine).not.toBe(mehrere);
    },
  );
});

describe('zeigeAktionsMeldungsBanner', () => {
  it('zeigt ein Ergebnis mit Befund dauerhaft, eines ohne Befund als Erfolg für 5 s', () => {
    zeigeAktionsMeldungsBanner([fehler('AAG', 'keineVerbindung'), fehler('BGB', 'beschaeftigt')]);
    zeigeAktionsMeldungsBanner([], importiert(['AAG']));
    const banner = getSnapshot();
    expect(banner).toHaveLength(2);
    expect(banner.map((b) => b.art)).toEqual(['vorgangsergebnis', 'erfolg']);
    expect(banner.map((b) => bannerDauerMs(b))).toEqual([undefined, 5000]);
  });
});
