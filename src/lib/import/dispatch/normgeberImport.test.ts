// Prüft den Pflicht-Normgeber an der externen XML-Grenze.
import { expect, it } from 'vitest';
import { verarbeiteGesetzDatei } from './gesetzDateiVerarbeitung';
const kontext = {
  meldeEinschraenkung: () => {},
  merkeGespeichertesGesetz: () => {},
  mitMeldungsempfaenger: async () => {
    throw Error('Kein Teilvorgang');
  },
  referenzenFuer: async () => [],
};
const xml = (angabe: string) =>
  `<gesetz><infos><kurztitel>BGB</kurztitel>${angabe}</infos><inhalt/></gesetz>`;
it.each(['unbekannt', 'at-bund'])(
  'importiert einen gültigen eigenen Code %s',
  async (normgeber) => {
    expect(
      await verarbeiteGesetzDatei(
        'kanonisch-xml',
        xml(`<normgeber>${normgeber}</normgeber>`),
        undefined,
        kontext,
      ),
    ).toMatchObject({ gesetz: { normgeber } });
  },
);
it.each([
  '',
  '<normgeber>A_B</normgeber>',
  '<normgeber></normgeber>',
  '<normgeber>Österreich</normgeber>',
])('weist fehlende oder ungültige Normgeber %s mit dem Musterhinweis zurück', async (angabe) => {
  const ergebnis = await verarbeiteGesetzDatei('kanonisch-xml', xml(angabe), undefined, kontext);
  expect(ergebnis).toEqual({ fehler: expect.stringContaining('Normgeber') });
  if ('fehler' in ergebnis && (angabe.includes('A_B') || angabe.includes('Österreich')))
    expect(ergebnis.fehler).toContain('de-bund');
});
