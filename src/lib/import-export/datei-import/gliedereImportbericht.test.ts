// gliedereImportbericht.test.ts
// P1-A2, P1-A4, P1-A6: Zuordnung zu Aktionsgruppen, Hinweise, Fehlergruppen.
import { describe, expect, it } from 'vitest';
import {
  gliedereImportbericht,
  meldungAlsImportFehler,
  type BerichtEintrag,
} from './dateiImport.types';
import { sicherungenImDatenordnerSatz } from '@/lib/domain/app/meldungsgruppen';

function gesetz(
  name: string,
  aktion: BerichtEintrag['aktion'],
  mehr: Partial<BerichtEintrag> = {},
): BerichtEintrag {
  return { kategorie: 'gesetz', aktion, name, quelle: `${name}.xml`, ...mehr };
}

function gruppenUebersicht(g: ReturnType<typeof gliedereImportbericht>, fehler = false) {
  return g.kategorien
    .filter((k) => (k.schluessel === 'fehler') === fehler)
    .flatMap((k) => k.gruppen)
    .map((x) => [x.schluessel, x.namen.map((n) => n.name)]);
}

describe('gliedereImportbericht', () => {
  it('P1-A2: 3 neue und 2 unveränderte Gesetze -> Satzform, richtige Gruppen, kein Dateiname', () => {
    const g = gliedereImportbericht(
      [
        gesetz('AAG', 'neu'),
        gesetz('BGB', 'neu'),
        gesetz('StGB', 'neu'),
        gesetz('ZPO', 'unveraendert'),
        gesetz('GG', 'unveraendert'),
      ],
      [],
    );
    expect(g.form).toBe('saetze');
    expect(gruppenUebersicht(g)).toEqual([
      ['neu', ['AAG', 'BGB', 'StGB']],
      ['unveraendert', ['ZPO', 'GG']],
    ]);
    expect(JSON.stringify(g)).not.toContain('.xml');
  });

  it('P1-A4: Hinweise stehen am Eintrag in seiner Aktionsgruppe, übrige bleiben dort', () => {
    const g = gliedereImportbericht(
      [
        gesetz('A', 'neu', { ausgeschlosseneMarkierungen: 2 }),
        gesetz('B', 'neu', { eingangUnvollstaendig: true }),
        gesetz('C', 'neu', {
          meldungen: [
            {
              text: 'x',
              grund: 'verweiserkennungEingeschraenkt',
              typ: 'warnung',
              art: 'hinweis',
              anlass: 'import',
              aenderungsstand: 'vollstaendig',
            },
          ],
        }),
        gesetz('D', 'neu'),
      ],
      [],
    );
    const gruppen = g.kategorien.flatMap((k) => k.gruppen);
    expect(gruppen.map((x) => x.namen.map((n) => [n.name, n.hinweise.length]))).toEqual([
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
        ['D', 0],
      ],
    ]);
  });

  it('P1-A6: Fehler werden auch unter der Schwelle nach Grund gruppiert, Dateiname dekodiert', () => {
    const g = gliedereImportbericht(
      [],
      [
        { grund: 'formatUnbekannt', datei: '/x/Gesetz%20A.xml' },
        { grund: 'formatUnbekannt', datei: 'b.xml' },
        { grund: 'lesefehler', datei: 'c.xml', detail: 'weg' },
      ],
    );
    expect(g.form).toBe('saetze');
    expect(gruppenUebersicht(g, true)).toEqual([
      ['formatUnbekannt', ['Gesetz A.xml', 'b.xml']],
      ['lesefehler', ['c.xml']],
    ]);
    const details = g.kategorien.flatMap((k) =>
      k.gruppen.flatMap((x) => x.namen.map((n) => n.detail)),
    );
    expect(details).toEqual([undefined, undefined, 'weg']);
  });

  it('nennt den Ort der Sicherungen aus Einträgen und Fehlern genau einmal', () => {
    const bereinigt = (datei: string) => ({
      text: `${datei} bereinigt.`,
      grund: 'bereinigt' as const,
      betroffen: datei,
      sicherung: `sicherungen/${datei}`,
      typ: 'warnung' as const,
      art: 'hinweis' as const,
      anlass: 'sicherung' as const,
      aenderungsstand: 'vollstaendig' as const,
    });
    const text = (g: ReturnType<typeof gliedereImportbericht>) =>
      JSON.stringify([g.allgemein, g.kategorien.map((k) => k.saetze)]);
    const eine = gliedereImportbericht(
      [gesetz('A', 'neu', { meldungen: [bereinigt('a.xml')] })],
      [],
    );
    expect(text(eine).split(sicherungenImDatenordnerSatz(1))).toHaveLength(2);
    const mehrere = gliedereImportbericht(
      [gesetz('A', 'neu', { meldungen: [bereinigt('a.xml')] })],
      [{ ...meldungAlsImportFehler(bereinigt('b.xml'), 'b.xml') }],
    );
    expect(text(mehrere).split(sicherungenImDatenordnerSatz(2))).toHaveLength(2);
    expect(text(mehrere)).not.toContain(sicherungenImDatenordnerSatz(1));
    expect(text(gliedereImportbericht([gesetz('A', 'neu')], []))).not.toContain(
      sicherungenImDatenordnerSatz(1),
    );
  });

  it('P1-A6: Abbruch erscheint als allgemeiner Satz ohne Datei', () => {
    const g = gliedereImportbericht([], [{ grund: 'importAbgebrochen', detail: 'kaputt' }]);
    expect(g.allgemein).toEqual([expect.stringContaining('kaputt')]);
    expect(g.kategorien).toEqual([]);
  });
});
