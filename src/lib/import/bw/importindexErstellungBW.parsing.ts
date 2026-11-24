// importindexErstellungBW.parsing.ts
// Reines HTML-Parsing für die Landesrecht-BW-Indexerstellung (siehe
// importindexErstellungBW.ts) – IO-frei, bekommt HTML-Strings übergeben und gibt
// ImportindexEintrag[]/einzelne Werte zurück. Ausgelagert, weil
// importindexErstellungBW.ts sonst die 500-Zeilen-Richtgröße deutlich überschreitet
// (Datei-Aufteilung nach Namenskonvention `.parsing.ts`).

import { normalisiereWS } from '@/lib/utils/leerraum';
import { type ImportindexEintrag } from '@/lib/import/importindex/importindex.index';

import { istObjekt, istText, liesJSON } from '@/lib/domain/uebergabePruefung';

export const LANDESRECHT_BW_URL = 'https://www.landesrecht-bw.de/';

/** Struktur des JSON in data-juris-link, soweit hier relevant. */
interface JurisLinkMeta {
  linkMeta: {
    docId: string;
    part: string;
  };
}

/** Nur vollständige, tatsächlich verwendbare Metadaten passieren die Grenze. */
export function liesJurisLinkMeta(json: string): JurisLinkMeta | null {
  return liesJSON(
    json,
    (w): w is JurisLinkMeta =>
      istObjekt(w) &&
      istObjekt(w.linkMeta) &&
      istText(w.linkMeta.docId) &&
      istText(w.linkMeta.part),
  );
}

/**
 * Liest die Gesetzeseinträge einer Übersichtsseite, jeweils mit dem
 * "schlechten" Permalink auf die docId (siehe erstelleLandesrechtBWImportindexNeu()
 * in importindexErstellungBW.ts): juris.de liefert seit der Format-Umstellung nur
 * noch opake docId (z.B. "jlr-NNLBW0000880A" statt vormals
 * "jlr-LVBWrahmen"), aus denen sich kein Permalink-Slug mehr ableiten lässt.
 * Als `abrufkennung` wird stattdessen der "schlechte" Permalink auf die docId selbst
 * verwendet (perma?d=...) – er verweist auf eine konkrete Fassung statt
 * immer auf die neueste, taugt hier aber nur zur manuellen Nachprüfung neuer
 * Gesetze, nicht für den automatischen Import.
 */
export function leseUebersichtsseiteSchlechteLinks(html: string): ImportindexEintrag[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const eintraege: ImportindexEintrag[] = [];

  for (const link of Array.from(doc.querySelectorAll('a[data-juris-link]'))) {
    const metaRoh = link.getAttribute('data-juris-link');
    if (!metaRoh) continue;

    const meta = liesJurisLinkMeta(metaRoh);
    if (!meta) continue;
    const docId = meta.linkMeta?.docId ?? '';
    if (meta.linkMeta?.part !== 'R') continue;
    if (!docId) continue;

    const zeile = leseZeile(link);
    if (!zeile) continue;

    eintraege.push({ ...zeile, abrufkennung: `${LANDESRECHT_BW_URL}perma?d=${docId}` });
  }

  return eintraege;
}

/**
 * Extrahiert den "guten" Permalink (gültige Fassung, perma?j=...) aus dem
 * gerenderten HTML einer einzelnen Dokumentseite (siehe Rust-Kommando
 * lade_landesrecht_dokumentseite). Der Link steht in einem Span mit
 * id-Präfix "permaElgf_" ("gültige Fassung"), verschachtelt in einem
 * weiteren Span der Klasse "break-uri" mit dem eigentlichen Link-Text.
 * Liefert wie beim ursprünglichen (guten) Importindex NUR das Kürzel zurück, den
 * variablen Teil des Links (z. B. "ViehFlGDV" aus
 * "https://www.landesrecht-bw.de/perma?j=ViehFlGDV_BW") – "_BW" wird
 * entfernt, da lade_gesetz_html_bw es beim Import ohnehin wieder anhängt
 * (siehe `perma?j={kuerzel}_BW` dort). Gibt `null` zurück, wenn der Block
 * fehlt oder der Text nicht wie erwartet aussieht (z. B. weil das Rendern
 * nicht rechtzeitig fertig wurde).
 */
export function leseGuterPermalink(html: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const span = doc.querySelector('span[id^="permaElgf_"] .break-uri');
  const text = span?.textContent?.trim();
  const praefix = `${LANDESRECHT_BW_URL}perma?j=`;
  if (!text || !text.startsWith(praefix)) return null;

  return text.slice(praefix.length).replace(/_BW$/, '');
}

/** Extrahiert Kurztitel und Langtitel aus einem einzelnen Gesetzes-Link
 *  samt zugehöriger Tabellenzeile. Genutzt von
 *  leseUebersichtsseiteSchlechteLinks(). */
function leseZeile(link: Element): { kurztitel: string; langtitel: string } | null {
  const titleAttr = link.getAttribute('title') ?? '';
  const kurztitel = leseKurztitel(titleAttr);
  if (!kurztitel) return null;

  // Die beschreibende Langfassung steht nicht im Link selbst, sondern in
  // der Nachbar-Zelle derselben Tabellenzeile.
  const zeile = link.closest('tr');
  const beschreibungZelle = zeile?.querySelector('td[align="left"]');
  const langtitel = leseLangtitel(beschreibungZelle?.textContent ?? '');
  if (!langtitel) return null;

  return { kurztitel, langtitel };
}

/**
 * Extrahiert den Kurztitel aus dem title-Attribut eines Gesetzes-Links, z. B.
 * " KDVMuKV BW, Landesnorm Baden-Württemberg, ..." -> "KDVMuKV", oder
 * " UkZuVO, Landesnorm Baden-Württemberg, ..." -> "UkZuVO" (kein
 * BW-Suffix bei manchen Abkürzungen).
 */
function leseKurztitel(titleAttr: string): string {
  const ersterAbschnitt = entferneJurisPublikationsMarker(titleAttr.split(',')[0] ?? '');
  return ersterAbschnitt.replace(/\s+BW$/, '');
}

/**
 * Extrahiert den Langtitel aus dem Volltext der Beschreibungszelle, indem
 * vor "vom <Zahl>" (Beginn der Datumsangabe/Fundstelle) abgeschnitten wird,
 * z. B. "Verordnung ... Kriegsdienstverweigerung vom 11. Januar 1984 (GBl.
 * ...)" -> "Verordnung ... Kriegsdienstverweigerung".
 */
function leseLangtitel(text: string): string {
  const normalisiert = normalisiereWS(entferneJurisPublikationsMarker(text));
  const match = normalisiert.match(/\s(?:vom\s+\d|in der Fassung)/i);
  if (!match || match.index === undefined) return normalisiert;
  return normalisiert.slice(0, match.index).trim();
}

/**
 * Entfernt interne Publikations-Marker der Website selbst, z. B.
 * "<?Pub Caret1?>" (vermutlich eine Cursor-/Änderungsmarkierung aus juris'
 * eigener Redaktionspipeline, die vereinzelt ungefiltert im HTML landet –
 * bestätigt kein Fehler unsererseits, siehe Bugreport, auch im Gesetzestext
 * selbst als Kurztitel vorhanden). Wird sowohl auf den Kurz- als auch den
 * Langtitel angewandt, da beide aus title-/Zellen-Text stammen, in dem
 * solche Marker prinzipiell auftreten können.
 */
function entferneJurisPublikationsMarker(text: string): string {
  return text.replace(/<\?Pub[^?]*\?>/g, '').trim();
}
