// Prüft den Pflicht-Normgeber an der externen XML-Grenze.

import { expect, it } from 'vitest';
import { liesMarkierungskonflikteXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

const gelesen = (gesetz: string) => [
  ...liesMarkierungskonflikteXML(
    `<markierungskonflikte>${gesetz}</markierungskonflikte>`,
  ).gesetzKonflikte.values(),
];

it('verwirft abgeleitete Konflikte ohne Normgeber', () => {
  const eintrag =
    '<kommentar><konflikt typ="pauschaler-bezug-fehlt"/><bezeichnung>§ 1</bezeichnung><kommentartext>x</kommentartext></kommentar>';
  expect(gelesen(`<gesetz kurztitel="BGB">${eintrag}</gesetz>`)).toEqual([]);
  expect(
    gelesen(`<gesetz kurztitel="BGB" normgeber="de-bund">${eintrag}</gesetz>`)[0]?.eintraege,
  ).toHaveLength(1);
  const ziel = eintrag.replace(
    '<konflikt typ="pauschaler-bezug-fehlt"/>',
    '<konflikt typ="ziel-norm-fehlt" gesetz="GG"/>',
  );
  expect(
    gelesen(`<gesetz kurztitel="BGB" normgeber="de-bund">${ziel}</gesetz>`)[0]?.eintraege,
  ).toEqual([]);
});
