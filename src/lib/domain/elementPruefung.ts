// Prüft übertragene Elemente einschließlich rekursiver Satz- und Listenstrukturen.
import type {
  AbsatzDarstellung,
  GetaggterVerweis,
  ListenEintragDarstellung,
  NormDarstellung,
  SatzDarstellung,
  UeberschriftDarstellung,
  UnterabsatzDarstellung,
} from './gesetzTypes';
import { istTextstelle } from './textstellePruefung';
import { istGesetzesreferenz } from './appUebertragungPruefung';
import {
  istObjekt,
  istText,
  istGanzzahl,
  istBoolean,
  istListe,
  optional,
} from './uebergabePruefung';
function istSatz(w: unknown): w is SatzDarstellung {
  return (
    istObjekt(w) &&
    istText(w.id) &&
    optional(w.zahl, istGanzzahl) &&
    istText(w.text) &&
    istListe(w.eintraege, istListeneintrag) &&
    optional(w.fortsetzung, istText)
  );
}
function istListeneintrag(w: unknown): w is ListenEintragDarstellung {
  return (
    istObjekt(w) &&
    istText(w.id) &&
    istText(w.bezeichnung) &&
    (w.ebene === 'nummer' || w.ebene === 'litera') &&
    istText(w.text) &&
    optional(w.saetze, (s): s is SatzDarstellung[] => istListe(s, istSatz)) &&
    istListe(w.untereintraege, istListeneintrag) &&
    optional(w.fortsetzung, istText)
  );
}
function istUnterabsatz(w: unknown): w is UnterabsatzDarstellung {
  return istObjekt(w) && istText(w.id) && istText(w.bezeichnung) && istListe(w.saetze, istSatz);
}
function istAbsatz(w: unknown): w is AbsatzDarstellung {
  return (
    istObjekt(w) &&
    istText(w.id) &&
    optional(w.bezeichnung, istText) &&
    optional(w.zwischenueberschrift, istBoolean) &&
    istListe(w.saetze, istSatz) &&
    optional(w.unterabsaetze, (u): u is UnterabsatzDarstellung[] => istListe(u, istUnterabsatz))
  );
}
function istGetaggterVerweis(w: unknown): w is GetaggterVerweis {
  return (
    istObjekt(w) &&
    istTextstelle(w.textstelle) &&
    istText(w.bezugstext) &&
    istText(w.zielBezeichnung) &&
    optional(w.zielgesetz, istGesetzesreferenz)
  );
}
function istNorm(w: Record<string, unknown>): w is Record<string, unknown> & NormDarstellung {
  return (
    (w.art === 'normal' || w.art === 'erwaegungsgrund'
      ? w.gliederungsEbene === undefined && w.ueberschriftartig === undefined
      : w.art === 'gliederungsartikel' &&
        istGanzzahl(w.gliederungsEbene) &&
        istBoolean(w.ueberschriftartig)) &&
    istText(w.id) &&
    istText(w.xmlId) &&
    istText(w.bezeichnung) &&
    optional(w.titel, istText) &&
    optional(w.vorgaenger, istText) &&
    (w.status === undefined || w.status === 'weggefallen') &&
    istListe(w.absaetze, istAbsatz) &&
    optional(w.zusatztexte, (liste): liste is NonNullable<NormDarstellung['zusatztexte']> =>
      istListe(
        liste,
        (z): z is NonNullable<NormDarstellung['zusatztexte']>[number] =>
          istObjekt(z) &&
          istText(z.text) &&
          istGanzzahl(z.nachAbsatz) &&
          z.nachAbsatz >= 0 &&
          Array.isArray(w.absaetze) &&
          z.nachAbsatz <= w.absaetze.length,
      ),
    ) &&
    optional(w.fussnoten, istText) &&
    (w.titelIstNichtamtlich === undefined || w.titelIstNichtamtlich === true) &&
    optional(w.getaggteVerweise, (v): v is GetaggterVerweis[] => istListe(v, istGetaggterVerweis))
  );
}
export function istUebertragenesElement(
  w: unknown,
): w is NormDarstellung | UeberschriftDarstellung {
  if (!istObjekt(w)) return false;
  if (w.art !== undefined) return istNorm(w);
  return (
    istText(w.id) &&
    istText(w.xmlId) &&
    istText(w.bezeichnung) &&
    optional(w.titel, istText) &&
    istGanzzahl(w.ebene) &&
    istText(w.gliederungskennzahl)
  );
}
