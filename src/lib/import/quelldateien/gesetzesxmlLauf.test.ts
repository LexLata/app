// gesetzesxmlLauf.test.ts
// Offline-Auswahl und Laufverhalten über die öffentliche Fassade.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { fuehreGesetzesXMLLaufAus } from './quelldateien.index';
import { waehleGesetzesXML, type GesetzesXMLUmgebung } from './gesetzesxmlLauf';
const eintrag = (kurztitel: string) => ({ kurztitel, langtitel: '', abrufkennung: kurztitel });
it('wählt nur vorhandene Quellen nach Dateistand, Neuerzeugung und genannten Kurztiteln', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/)),
      fc.array(fc.boolean()),
      fc.array(fc.boolean()),
      fc.array(fc.boolean()),
      (titel, quelle, xml, genannt) => {
        const alle = titel.map(eintrag);
        const stand = {
          quellen: titel.filter((_, i) => quelle[i]).map((k) => k.toUpperCase()),
          gesetzesxml: titel.filter((_, i) => xml[i]).map((k) => k.toUpperCase()),
        };
        expect(waehleGesetzesXML(alle, stand, {}).kandidaten).toEqual(
          alle.filter((_, i) => quelle[i] && !xml[i]),
        );
        expect(waehleGesetzesXML(alle, stand, { neu: true }).kandidaten).toEqual(
          alle.filter((_, i) => quelle[i]),
        );
        for (const optionen of [{}, { neu: true }])
          expect(waehleGesetzesXML(alle, stand, optionen).fehlendeQuellen).toEqual(
            alle.filter((_, i) => !quelle[i]),
          );
        const auswahl = waehleGesetzesXML(alle, stand, {
          kurztitel: titel.filter((_, i) => genannt[i]).map((k) => k.toUpperCase()),
        });
        expect(auswahl.kandidaten).toEqual(alle.filter((_, i) => quelle[i] && genannt[i]));
        expect(auswahl.fehlendeQuellen).toEqual(alle.filter((_, i) => !quelle[i] && genannt[i]));
      },
    ),
  );
});
it('meldet fehlende Quellen gesondert, setzt nach Gesetzfehler fort und benötigt keine Netzmethoden', async () => {
  const verarbeitet: string[] = [];
  const umgebung: GesetzesXMLUmgebung = {
    ladeKandidaten: async () => ['Fehlt', 'Kaputt', 'GG'].map(eintrag),
    leseDateistand: async () => ({ quellen: ['Kaputt', 'GG'], gesetzesxml: ['GG'] }),
    erzeuge: async (e) => {
      verarbeitet.push(e.kurztitel);
      return e.kurztitel === 'Kaputt'
        ? { fehler: 'GesetzesXML gelöscht.' }
        : {
            gesetz: {
              kurztitel: 'GG',
              langtitel: '',
              normgeber: 'de-bund',
              hatGliederungsartikel: false,
              elemente: [],
            },
          };
    },
    ausgabe: () => {},
  };
  const bericht = await fuehreGesetzesXMLLaufAus(
    { modus: 'gesetzesxml', normgeber: 'de-bund', anzahl: 1, neu: true },
    umgebung,
  );
  expect(verarbeitet).toEqual(['Kaputt', 'GG']);
  expect(bericht.gespeichert).toBe(1);
  expect(bericht.fehlgeschlagen).toEqual([
    { kurztitel: 'Kaputt', meldung: 'GesetzesXML gelöscht.' },
  ]);
  expect(bericht.zusatzzeilen).toContain('Quelldatei fehlt: 1');
  expect(bericht.zusatzzeilen).toContain('Fehlt: Quelldatei fehlt');
  umgebung.erzeuge = async () => {
    throw new Error('Lesefehler');
  };
  await expect(
    fuehreGesetzesXMLLaufAus(
      { modus: 'gesetzesxml', normgeber: 'de-bw', anzahl: 1, neu: true },
      umgebung,
    ),
  ).rejects.toThrow('Lesefehler');
});
it('wählt EU ausschließlich nach Herkunftsangabe, unabhängig von bloßen Archiven (fast-check)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/), { maxLength: 15 }),
      fc.array(fc.boolean()),
      fc.array(fc.boolean()),
      fc.boolean(),
      fc.option(fc.array(fc.boolean()), { nil: undefined }),
      async (titel, herkunft, xml, neu, benannt) => {
        const verarbeitet: string[] = [];
        const kurztitel = benannt?.flatMap((wert, i) =>
          wert && titel[i] ? [titel[i].toUpperCase()] : [],
        );
        const bericht = await fuehreGesetzesXMLLaufAus(
          {
            modus: 'gesetzesxml',
            normgeber: 'eu',
            anzahl: Number.MAX_SAFE_INTEGER,
            ...(neu ? { neu } : {}),
            ...(kurztitel ? { kurztitel } : {}),
          },
          {
            ladeKandidaten: async () => titel.map(eintrag),
            leseDateistand: async () => ({
              quellen: titel.filter((_, i) => herkunft[i]).map((k) => k.toUpperCase()),
              gesetzesxml: titel.filter((_, i) => xml[i]),
              konsolidiert: titel,
              original: titel,
            }),
            erzeuge: async (e) => {
              verarbeitet.push(e.kurztitel);
              return {};
            },
            ausgabe: () => {},
          },
        );
        const erwartet = titel.filter(
          (_, i) => herkunft[i] && (!benannt || benannt[i]) && (!!benannt || neu || !xml[i]),
        );
        expect(verarbeitet.sort()).toEqual(erwartet.sort());
        expect(bericht.gespeichert).toBe(erwartet.length);
        for (let i = 0; i < titel.length; i++)
          if (!herkunft[i] && (!benannt || benannt[i]))
            expect(bericht.zusatzzeilen?.join(' ')).toContain(
              `${titel[i]}: Archive ohne Herkunftsangabe`,
            );
      },
    ),
  );
});

it('weist Teilerfolge getrennt von erfolgreichen und fehlgeschlagenen Gesetzen aus', async () => {
  const status: string[] = [];
  await fuehreGesetzesXMLLaufAus(
    { modus: 'gesetzesxml', normgeber: 'eu', anzahl: 3 },
    {
      ladeKandidaten: async () => ['A', 'B', 'C'].map(eintrag),
      leseDateistand: async () => ({ quellen: ['A', 'B', 'C'], gesetzesxml: [] }),
      erzeuge: async (e) =>
        e.kurztitel === 'A'
          ? { teilerfolg: 'Original fehlt' }
          : e.kurztitel === 'B'
            ? { fehler: 'Formatfehler' }
            : {},
      ausgabe: () => {},
      melde: (meldung) => {
        if (meldung.art === 'status') status.push(meldung.text);
      },
    },
  );
  expect(status.at(-1)).toBe(
    'Abgeschlossen: 3 · Erfolge: 1 · Fehler: 1 · aktiv: 0 · Teilerfolge: 1',
  );
});
