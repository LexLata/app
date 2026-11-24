// Eingangskontrolle der vollständigen Start- und Bearbeitungsdaten beider Hilfsfenster.
import type {
  KommentarKontext,
  VerweismarkierungKontext,
} from './markierungen.hilfsfensterKontext';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import type {
  Elementstand,
  VerweisInhalt,
  Verweisziel,
} from '@/lib/markierungen/gemeinsam/markierungSpeicher.types';
import {
  istObjekt,
  istText,
  istGanzzahl,
  istListe,
  optional,
} from '@/lib/domain/uebergabePruefung';
import { istGesetzesreferenz } from '@/lib/domain/appUebertragungPruefung';
import { istUebertragenesElement } from '@/lib/domain/elementPruefung';
import { istTextstelle } from '@/lib/domain/textstellePruefung';
import { istGueltigeGliederungskennzahl } from '@/lib/domain/gliederungskennzahl';
import { istErwaegungsgrundBezeichnung } from '@/lib/domain/norm/norm.index';
function istAusgangsstelle(w: unknown): w is Ausgangsstelle {
  if (!istObjekt(w)) return false;
  if (w.typ === 'ueberschrift')
    return (
      istText(w.gliederungskennzahl) &&
      istGueltigeGliederungskennzahl(w.gliederungskennzahl) &&
      w.bezeichnung === undefined &&
      w.praefix === undefined
    );
  if (!istText(w.bezeichnung) || w.gliederungskennzahl !== undefined) return false;
  if (w.typ === 'erwaegungsgrund')
    return istErwaegungsgrundBezeichnung(w.bezeichnung) && w.praefix === undefined;
  return w.typ === 'norm' && w.bezeichnung.trim().length > 0 && w.praefix === undefined;
}
function istElementstand(w: unknown): w is Elementstand {
  return istObjekt(w) && optional(w.titel, istText) && istGanzzahl(w.textlaenge);
}
function istVerweisziel(w: unknown): w is Verweisziel {
  if (
    !istObjekt(w) ||
    !Array.isArray(w.verweistextZeichenbereich) ||
    w.verweistextZeichenbereich.length !== 2 ||
    !w.verweistextZeichenbereich.every(istGanzzahl) ||
    (w.verweistextZeichenbereich[0] ?? 0) > (w.verweistextZeichenbereich[1] ?? 0)
  )
    return false;
  if (w.typ === 'ganzesGesetz')
    return (
      istGesetzesreferenz(w.gesetz) &&
      w.bezeichnung === undefined &&
      w.praefix === undefined &&
      w.elementstand === undefined
    );
  if (
    !istText(w.bezeichnung) ||
    !w.bezeichnung.trim() ||
    w.praefix !== undefined ||
    !optional(w.gesetz, istGesetzesreferenz)
  )
    return false;
  if (w.typ === 'zielnorm') return istElementstand(w.elementstand);
  return w.typ === 'zielnormOhneElementstand' && w.elementstand === undefined;
}
function istVerweisinhalt(w: unknown): w is VerweisInhalt {
  return istObjekt(w) && istText(w.verweistext) && istListe(w.verweisziele, istVerweisziel);
}
function istTextbezug(
  w: unknown,
): w is { textstelle: import('@/lib/domain/textpfadTypes').Textstelle; bezugstext?: string } {
  return istObjekt(w) && istTextstelle(w.textstelle) && optional(w.bezugstext, istText);
}
function istBasis(w: Record<string, unknown>): boolean {
  return (
    istText(w.openerLabel) &&
    istGesetzesreferenz(w.gesetz) &&
    istAusgangsstelle(w.ausgangsstelle) &&
    optional(w.ausgangsBezeichnung, istText) &&
    optional(w.aktuellesElement, istUebertragenesElement) &&
    (w.auswahl === undefined ||
      (istObjekt(w.auswahl) &&
        istTextstelle(w.auswahl.textstelle) &&
        istText(w.auswahl.bezugstext)))
  );
}
export function istKommentarKontext(w: unknown): w is KommentarKontext {
  if (!istObjekt(w) || !istBasis(w)) return false;
  if (w.bearbeiten === undefined) return true;
  const b = w.bearbeiten;
  return (
    istObjekt(b) &&
    optional(b.textbezug, istTextbezug) &&
    istText(b.kommentarText) &&
    istObjekt(b.vorher) &&
    istText(b.vorher.kommentarText) &&
    optional(b.vorher.elementstand, istElementstand)
  );
}
export function istVerweismarkierungKontext(w: unknown): w is VerweismarkierungKontext {
  if (!istObjekt(w) || !istBasis(w)) return false;
  if (w.bearbeiten === undefined) return true;
  const b = w.bearbeiten;
  return (
    istObjekt(b) &&
    optional(b.textbezug, istTextbezug) &&
    istText(b.zitatText) &&
    istObjekt(b.vorher) &&
    istVerweisinhalt(b.vorher.verweisinhalt) &&
    optional(b.vorher.elementstand, istElementstand)
  );
}
