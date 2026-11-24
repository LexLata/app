// quelldateienLauf.test.ts
// Auswahlgesetze und wiederholbare Fehler über die öffentliche Fassade.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { fuehreQuelldateienLaufAus } from './quelldateien.index';
import { waehleFehlendeQuelldateien, type QuelldateienUmgebung } from './quelldateienLauf';
const eintrag = (kurztitel: string) => ({ kurztitel, langtitel: '', abrufkennung: kurztitel });
it('wählt bei beliebigem Dateistand fehlende Kurztitel, mit neu auch vorhandene, je innerhalb der Nennung', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/)),
      fc.array(fc.boolean()),
      fc.array(fc.boolean()),
      (titel, vorhanden, gezielt) => {
        const quelle = titel.filter((_, i) => vorhanden[i]);
        const genannt = titel.filter((_, i) => gezielt[i]);
        const alle = titel.map(eintrag);
        expect(
          waehleFehlendeQuelldateien(
            alle,
            quelle.map((k) => k.toUpperCase()),
          ),
        ).toEqual(alle.filter((_, i) => !vorhanden[i]));
        expect(
          waehleFehlendeQuelldateien(
            alle,
            quelle,
            genannt.map((k) => k.toUpperCase()),
          ),
        ).toEqual(alle.filter((_, i) => gezielt[i] && !vorhanden[i]));
        expect(
          waehleFehlendeQuelldateien(
            alle,
            quelle,
            genannt.map((k) => k.toUpperCase()),
            true,
          ),
        ).toEqual(genannt.map(eintrag));
        expect(waehleFehlendeQuelldateien(alle, quelle, undefined, true)).toEqual(alle);
      },
    ),
  );
});
function beispiel() {
  const abgerufen: string[] = [];
  let pruefungen = 0;
  const umgebung: QuelldateienUmgebung = {
    leseDateistand: async () => ({ quellen: ['Alt'] }),
    ladeKandidaten: async () => ['Alt', 'Doppelt', 'DOPPELT', 'Fehler', 'A', 'B'].map(eintrag),
    pruefeErreichbarkeit: async () => {
      pruefungen++;
      return null;
    },
    beschaffe: async (e) => {
      abgerufen.push(e.kurztitel);
      return e.kurztitel === 'Fehler'
        ? { fehler: 'Download fehlgeschlagen', netz: true }
        : {
            gesetz: {
              kurztitel: 'GG',
              langtitel: 'Grundgesetz',
              normgeber: 'de-bund',
              hatGliederungsartikel: false,
              elemente: [],
            },
            netz: true,
          };
    },
    ausgabe: () => {},
  };
  return { umgebung, abgerufen, pruefungen: () => pruefungen };
}
it('setzt nach Gesetzfehlern fort, begrenzt Erfolge und schreibt keine uneindeutigen Gesetze', async () => {
  const { umgebung, abgerufen } = beispiel();
  const bericht = await fuehreQuelldateienLaufAus(
    { modus: 'quelldateien', normgeber: 'de-bund', anzahl: 1 },
    umgebung,
  );
  expect(abgerufen).toEqual(['Fehler', 'A']);
  expect(bericht.gespeichert).toBe(1);
  expect(bericht.fehlgeschlagen.map((e) => e.kurztitel)).toEqual(['Doppelt', 'Fehler']);
});
it('versucht nicht ladbare Gesetze in jedem Lauf erneut und verarbeitet alle ohne Erfolgsgrenze', async () => {
  const { umgebung, abgerufen } = beispiel();
  for (let i = 0; i < 2; i++)
    await fuehreQuelldateienLaufAus(
      { modus: 'quelldateien', normgeber: 'de-bund', anzahl: Number.MAX_SAFE_INTEGER },
      umgebung,
    );
  expect(abgerufen.filter((k) => k === 'Fehler')).toHaveLength(2);
  expect(abgerufen.filter((k) => k === 'B')).toHaveLength(2);
});
it('P2-A6: ruft eine benannte vorhandene Quelle nur mit neu erneut ab', async () => {
  const { umgebung, abgerufen, pruefungen } = beispiel();
  const auftrag = { modus: 'quelldateien', normgeber: 'de-bund', anzahl: 2 } as const;
  await fuehreQuelldateienLaufAus({ ...auftrag, kurztitel: ['alt', 'A'] }, umgebung);
  expect(abgerufen).toEqual(['A']);
  await fuehreQuelldateienLaufAus({ ...auftrag, kurztitel: ['Alt'] }, umgebung);
  expect(abgerufen).toEqual(['A']);
  expect(pruefungen()).toBe(1);
  await fuehreQuelldateienLaufAus({ ...auftrag, kurztitel: ['Alt'], neu: true }, umgebung);
  expect(abgerufen).toEqual(['A', 'Alt']);
});
it('prüft die Erreichbarkeit nur bei tatsächlichen Abrufkandidaten', async () => {
  const { umgebung, pruefungen } = beispiel();
  await fuehreQuelldateienLaufAus(
    { modus: 'quelldateien', normgeber: 'de-bund', anzahl: 1, kurztitel: ['unbekannt'] },
    umgebung,
  );
  expect(pruefungen()).toBe(0);
});

it('zählt vorab abgewiesene Kurztitel und Bearbeitungsfehler als abgeschlossene Fehler', async () => {
  const { umgebung } = beispiel();
  const status: string[] = [];
  umgebung.melde = (meldung) => {
    if (meldung.art === 'status') status.push(meldung.text);
  };
  await fuehreQuelldateienLaufAus(
    { modus: 'quelldateien', normgeber: 'de-bund', anzahl: 1 },
    umgebung,
  );
  expect(status[0]).toBe('Abgeschlossen: 1 · erfolgreich: 0 · fehlgeschlagen: 1 · aktiv: 0');
  expect(status.at(-1)).toBe('Abgeschlossen: 3 · erfolgreich: 1 · fehlgeschlagen: 2 · aktiv: 0');
});
it('unterscheidet erfolgreiche Speicherung und Teilerfolg im Fortschritt', async () => {
  const { umgebung } = beispiel();
  umgebung.ladeKandidaten = async () => ['A', 'B'].map(eintrag);
  umgebung.beschaffe = async (e) => ({
    netz: true,
    ...(e.kurztitel === 'A' ? { teilerfolg: 'Original fehlt' } : {}),
  });
  const status: string[] = [];
  umgebung.melde = (meldung) => {
    if (meldung.art === 'status') status.push(meldung.text);
  };
  await fuehreQuelldateienLaufAus({ modus: 'quelldateien', normgeber: 'eu', anzahl: 2 }, umgebung);
  expect(status.at(-1)).toBe(
    'Abgeschlossen: 2 · Erfolge: 1 · Fehler: 0 · aktiv: 0 · Teilerfolge: 1',
  );
});
