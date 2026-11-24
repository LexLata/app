// Vergleicht Markierungsinhalte ohne Zeitfelder und übernimmt Zeitstempel bei Bearbeitung.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { isoZeitstempel } from '@/lib/utils/xmlVerarbeitung';
import { baueXML } from './markierungsXML';

function ohneZeitstempel(eintrag: MarkierungsEintrag): MarkierungsEintrag {
  const { erstellt: _erstellt, geaendert: _geaendert, ...inhalt } = eintrag;
  return inhalt;
}

export function eintraegeSindGleich(
  gesetz: Gesetzesreferenz,
  links: readonly MarkierungsEintrag[],
  rechts: readonly MarkierungsEintrag[],
): boolean {
  const verarbeitungszeit = new Date(0);
  return (
    baueXML(gesetz, links.map(ohneZeitstempel), verarbeitungszeit) ===
    baueXML(gesetz, rechts.map(ohneZeitstempel), verarbeitungszeit)
  );
}

/** Ein unveränderter Inhalt behält das alte Objekt und alle Zeitfelder. */
export function uebernehmeZeitstempel(
  gesetz: Gesetzesreferenz,
  vorher: MarkierungsEintrag,
  nachher: MarkierungsEintrag,
  jetzt: Date,
): MarkierungsEintrag {
  if (eintraegeSindGleich(gesetz, [vorher], [nachher])) return vorher;
  const inhalt = ohneZeitstempel(nachher);
  const erstellt = vorher.erstellt === undefined ? {} : { erstellt: vorher.erstellt };
  return inhalt.typ === 'kommentar' || inhalt.typ === 'verweismarkierung'
    ? { ...inhalt, ...erstellt, geaendert: isoZeitstempel(jetzt) }
    : { ...inhalt, ...erstellt };
}
