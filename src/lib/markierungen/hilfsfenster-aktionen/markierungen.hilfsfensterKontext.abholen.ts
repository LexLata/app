// Holt den Kontext des Kommentar- und Verweismarkierungsfensters ab und prüft ihn
// vor der Übernahme; native Fehler behalten den bisherigen Null-Fallback.
import { holeFensterUebergabe } from '@/lib/plattform/fensterUebergabe';
import { liesJSON } from '@/lib/domain/uebergabePruefung';
import {
  istKommentarKontext,
  istVerweismarkierungKontext,
} from './markierungen.hilfsfensterKontext.pruefung';

export function liesVerweismarkierungKontext(json: string) {
  return liesJSON(json, istVerweismarkierungKontext);
}
export function liesKommentarKontext(json: string) {
  return liesJSON(json, istKommentarKontext);
}
export function verweismarkierungKontextAbholen() {
  return holeFensterUebergabe('verweismarkierung_kontext_abholen', liesVerweismarkierungKontext);
}
export function kommentarKontextAbholen() {
  return holeFensterUebergabe('kommentar_kontext_abholen', liesKommentarKontext);
}
