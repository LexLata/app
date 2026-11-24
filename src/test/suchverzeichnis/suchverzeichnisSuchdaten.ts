// Native Cachedatei als Eingabe bestehender Suchoberflächentests.
import { io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { leiteSuchverzeichniseintragAb } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { dateiBasis } from '@/lib/persistenz/kern/kern.index';
import { escapeXML } from '@/lib/utils/xmlVerarbeitung';
import { alsSuchverzeichniseintraege } from './suchverzeichnisFabriken';

export function setzeSuchverzeichnisTestdaten(gesetze: readonly GesetzDarstellung[]) {
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({
      version: 1,
      abgeglichen: true,
      eintraege: alsSuchverzeichniseintraege(gesetze),
    }),
  );
}
export function erfolgreicherSuchTestImport(gesetz: GesetzDarstellung) {
  // Der gemockte Import hinterlässt auch eine native Datei samt passendem Cache-Stempel.
  const normen = gesetz.elemente
    .filter((element) => element.typ === 'norm')
    .map(
      ({ data }) =>
        `<norm id="${escapeXML(data.xmlId)}"><bezeichnung>${escapeXML(data.bezeichnung)}</bezeichnung><text><absatz>Testinhalt</absatz></text></norm>`,
    )
    .join('');
  const xml = `<gesetz><infos><kurztitel>${escapeXML(gesetz.kurztitel)}</kurztitel><normgeber>${escapeXML(gesetz.normgeber)}</normgeber><langtitel>${escapeXML(gesetz.langtitel)}</langtitel></infos><inhalt>${normen}</inhalt></gesetz>`;
  io.dateien.set(`gesetze/${dateiBasis(gesetz)}.xml`, xml);
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({
      version: 1,
      abgeglichen: true,
      eintraege: [
        leiteSuchverzeichniseintragAb(gesetz, { groesse: String(xml.length), aenderungszeit: '1' }),
      ],
    }),
  );
  return { erfolgreiche: [gesetz], fehlgeschlagene: [] };
}
