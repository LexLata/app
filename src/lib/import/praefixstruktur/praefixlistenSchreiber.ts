// praefixlistenSchreiber.ts
// Gemeinsame serialisierte, atomare Ersetzung der Präfixstruktur-Liste.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import {
  liesPraefixstrukturXml,
  schreibePraefixstrukturXml,
  type PraefixstrukturEintrag,
} from './praefixstrukturXml';

export function erzeugePraefixlistenSchreiber(
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
  bisher: string | null,
  schreiben: (xml: string) => Promise<void>,
) {
  const eintraege = bisher === null ? [] : liesPraefixstrukturXml(bisher, normgeber).eintraege;
  let kette: Promise<void> = Promise.resolve();
  function ersetzen(eintrag: PraefixstrukturEintrag) {
    const position = eintraege.findIndex(
      (e) => e.kurztitel.toLowerCase() === eintrag.kurztitel.toLowerCase(),
    );
    if (position < 0) eintraege.push(eintrag);
    else eintraege[position] = eintrag;
  }
  function speichern(aenderungen: readonly PraefixstrukturEintrag[]) {
    kette = kette.then(async () => {
      for (const eintrag of aenderungen) ersetzen(eintrag);
      const xml = schreibePraefixstrukturXml(normgeber, eintraege, new Date(), bisher ?? undefined);
      await schreiben(xml);
      bisher = xml;
    });
    return kette;
  }
  return { eintraege, speichern };
}
