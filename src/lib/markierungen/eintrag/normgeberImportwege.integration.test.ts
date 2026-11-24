// @vitest-environment jsdom
// Dateiimport und mitgelieferte EMRK über echten Dispatch, Prüfvorgang und Speicherabschluss.
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { readFileSync } from 'node:fs';
import { assert, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { importiereGesetze } from '@/lib/import/import.index';
import {
  initialisiereMarkierungen,
  pruefeAlleMarkierungen,
} from '@/lib/markierungen/markierungen.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { pruefeEigenenKonflikt } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { hinzufuegenMarkierung, ladeMarkierungen } from './eintrag.index';
import { ladeEintraege } from '@/lib/markierungen/eintrag/eintrag.index';
import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

const gesetz = (normgeber: string) =>
  `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>${normgeber}</normgeber></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung><text>Text</text></norm></inhalt></gesetz>`;
beforeEach(() => {
  vorbereiten();
  initialisiereMarkierungen();
});
afterEach(async () => {
  await pruefeAlleMarkierungen();
});
it('importiert at-bund aus einer Datei und lädt das tatsächlich gespeicherte Gesetz', async () => {
  io.dateien.set('/import/TestG.xml', gesetz('at-bund'));
  const ergebnis = await importierePfade(['/import/TestG.xml']);
  expect(ergebnis.fehler).toEqual([]);
  expect(io.dateien.get('gesetze/TestG_at-bund.xml')).toContain('<normgeber>at-bund</normgeber>');
  expect((await ladeGesetzBestand()).liste).toEqual(
    expect.arrayContaining([expect.objectContaining({ kurztitel: 'TestG', normgeber: 'at-bund' })]),
  );
});

it.each([
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'Österreich',
])('lehnt %s beim Dateiimport mit dem Musterhinweis ohne Gesetzesdatei ab', async (normgeber) => {
  io.dateien.set('/import/TestG.xml', gesetz(normgeber));
  const ergebnis = await importierePfade(['/import/TestG.xml']);
  expect(ergebnis.berichtEintraege).toEqual([
    expect.objectContaining({
      aktion: 'nichtUebernommen',
      meldungen: expect.arrayContaining([
        expect.objectContaining({ art: 'fehler', text: expect.stringContaining('de-bund') }),
      ]),
    }),
  ]);
  expect([...io.dateien.keys()].some((p) => p.startsWith('gesetze/'))).toBe(false);
});
it('importiert die mitgelieferte EMRK aus dem GesetzesXML-Bundle (derzeit EMRK, Normgeber Europarat) und öffnet ihren gespeicherten Bestand', async () => {
  const xml = readFileSync('src-tauri/resources/europa/EMRK_europarat.xml', 'utf8');
  io.dateien.set('resources/europa/EMRK_europarat.xml', xml);
  const ergebnis = await importiereGesetze(
    [{ kurztitel: 'EMRK', abrufkennung: 'EMRK_europarat.xml' }],
    'europarat',
  );
  expect(ergebnis.fehlgeschlagene).toEqual([]);
  expect(ergebnis.erfolgreiche).toEqual([
    expect.objectContaining({ kurztitel: 'EMRK', normgeber: 'europarat' }),
  ]);
  expect((await ladeGesetzBestand()).liste).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kurztitel: 'EMRK', normgeber: 'europarat' }),
    ]),
  );
  const gespeichert = io.dateien.get('gesetze/EMRK_europarat.xml');
  assert(gespeichert);
  const eingelesen = parseGesetzesXML(gespeichert);
  assert(eingelesen);
  const original = parseGesetzesXML(xml);
  assert(original);
  expect(eingelesen.elemente.map((e) => e.data.xmlId)).toEqual(
    original.elemente.map((e) => e.data.xmlId),
  );
  const eintrag = markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: { typ: 'norm', bezeichnung: 'Präambel P4' },
    bezug: {
      typ: 'bezugstext',
      textstelle: {
        pfad: { typ: 'normtext', absatzWiederholung: 2 },
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
      },
      bezugstext: 'entsc',
    },
  });
  const referenz = { kurztitel: 'EMRK', normgeber: 'europarat' };
  expect((await hinzufuegenMarkierung(referenz, eintrag)).erfolgreich).toBe(true);
  const [geladen] = await ladeMarkierungen(referenz);
  assert(geladen);
  expect(pruefeEigenenKonflikt(geladen, eingelesen)).toBeUndefined();
  expect(io.dateien.get('gesetze/EMRK_europarat.xml')).toContain(
    '<normgeber>europarat</normgeber>',
  );
});

it.each([
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'BW' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  ' de-bund ',
  '&#10;de-bund&#10;',
])(
  'archiviert eine ungültige Markierungsdatei mit %s beim regulären Lesen ohne dauerhaften Folgefehler',
  async (code) => {
    const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
    const xml = `<markierungen><infos><gesetz normgeber="${code}">BGB</gesetz></infos><inhalt/></markierungen>`; // normgeber-negativ: alte Bestandsdatei über den regulären Leseweg.
    io.dateien.set(pfad, xml);
    const original = io.invoke.getMockImplementation();
    assert(original);
    io.invoke.mockImplementation(async (name, args) => {
      if (name === 'archiviere_beschaedigte_datei') {
        expect(args.erwarteterInhalt).toBe(xml);
        const inhalt = io.dateien.get(pfad);
        assert(inhalt !== undefined);
        io.dateien.set(pfad + '.bak', inhalt);
        io.dateien.delete(pfad);
        return { status: 'archiviert', sicherungspfad: pfad + '.bak' };
      }
      return original(name, args);
    });
    const empfangen = vi.fn();
    await expect(
      ladeEintraege({ kurztitel: 'BGB', normgeber: 'de-bund' }, empfangen),
    ).resolves.toEqual([]);
    expect(io.dateien.get(pfad + '.bak')).toBe(xml);
    expect(empfangen).toHaveBeenCalledWith(
      expect.objectContaining({
        anlass: 'sicherung',
        art: 'hinweis',
        grund: 'imDatenordnerGesichert',
        betroffen: 'BGB_de-bund-markierungen.xml',
      }),
    );
    expect(
      JSON.stringify(empfangen.mock.calls, (k, v) => (k === 'sicherung' ? undefined : v)),
    ).not.toContain('.bak');
  },
);
