// gesetzesXMLParser.ts
// Schritt 2: Unser GesetzesXML → GesetzDarstellung (View-Modell).
// Strukturpipeline; Inline-Verarbeitung und Kopfangaben liegen in Begleitdateien.
//
// Verwendet den browser-nativen DOMParser (in Tauri WebView verfügbar).

import {
  uebernehmeVerweise,
  verarbeiteInlineKinder,
  type VerweisPfad,
} from './gesetzesXMLParser.inline';
import { parseInfos } from './gesetzesXMLParser.infos';
import type {
  AbsatzDarstellung,
  DarstellungsElement,
  GesetzDarstellung,
  GetaggterVerweis,
  ListenEintragDarstellung,
  NormDarstellung,
  SatzDarstellung,
  UeberschriftDarstellung,
  UnterabsatzDarstellung,
} from '@/lib/domain/gesetzTypes';
import { gliederungsebene, ueberschriftXmlId } from '@/lib/domain/gliederungskennzahl';

function uid(): string {
  return crypto.randomUUID();
}

/**
 * Ebene aus gliederungskennzahl berechnen.
 * Gliederungskennzahl besteht aus Gruppen à 3 Stellen: "010" = Ebene 1, "010010" = Ebene 2 usw.
 *
 * Bewusst hier lokal definiert statt aus gliederungsebenenErmittler.ts (Import-
 * Pipeline) importiert: diese Darstellungs-Pipeline soll unabhängig vom
 * Import-Pipeline-Modul bleiben. Das GesetzesXML enthält ausschließlich
 * die rohe Gliederungskennzahl (kein separat gespeichertes Ebenen-Feld), daher muss
 * diese – triviale, stabile – Dekodierformel hier dupliziert werden, statt
 * sie zu teilen. Bei einer Änderung des Gliederungskennzahl-Schemas (unwahrscheinlich,
 * da es dem Bundesjustizamt-Format entspricht) müsste diese Kopie zusammen
 * mit der in gliederungsebenenErmittler.ts angepasst werden.
 */
function ebeneAusGliederungskennzahl(gliederungskennzahl: string): number {
  const trimmed = gliederungskennzahl.trim();
  // Mutation-Testing-Hinweis: dieser Guard ist für die Korrektheit redundant –
  // Math.max(1, Math.floor(0 / 3)) ergibt für den Leerfall ohnehin 1. Bewusst
  // belassen als früher, lesbarer Ausstieg für den häufigen Leerfall, nicht
  // als Bugfix-Kandidat zu verstehen (kein Test kann/soll diese Zeile "töten").
  if (!trimmed) return 1;
  return Math.max(1, Math.floor(gliederungsebene(trimmed)));
}

// ---------------------------------------------------------------------------
// Listeneintrag (<nummer> / <litera>)
// ---------------------------------------------------------------------------

// Bezeichnung eines <nummer>/<litera>-Elements aus dem passenden Attribut
// (zahl bzw. buchstabe) – eigene Helper-Funktion, da sowohl parseListenEintrag
// (Bau des Eintrags selbst) als auch wiederholungsIndexVonElementen (unten,
// Zählung von Duplikaten VOR dem eigentlichen Parsen) sie brauchen.
function bezeichnungVonListenElement(el: Element): string {
  const istLitera = el.tagName.toLowerCase() === 'litera';
  return el.getAttribute(istLitera ? 'buchstabe' : 'zahl') ?? '';
}

// 0-basierter Index unter Geschwistern gleicher Bezeichnung, wie beim Rendern.
// Die Parser-Pipeline zählt unabhängig von Komponenten, damit getaggte Verweise
// bereits vor dem Rendern den vollständigen Textpfad erhalten.
function wiederholungsIndexVonElementen(elemente: Element[], index: number): number {
  // elemente[index] beweisbar sicher: index stammt an beiden Aufrufstellen
  // aus .map((k, idx) => ...) über dasselbe elemente-Array.
  const bezeichnung = bezeichnungVonListenElement(elemente[index]!);
  let anzahl = 0;
  for (let i = 0; i < index; i++) {
    // elemente[i] beweisbar sicher: i < index <= elemente.length.
    if (bezeichnungVonListenElement(elemente[i]!) === bezeichnung) anzahl++;
  }
  return anzahl;
}

function parseListenEintrag(
  el: Element,
  pfadBasis: VerweisPfad,
  sammler: GetaggterVerweis[],
  wiederholung: number,
): ListenEintragDarstellung {
  // Ebene wird ausschließlich aus dem ECHTEN XML-Tag gelesen, nicht (wie
  // früher) von der Rekursionstiefe vorgegeben – dadurch bleibt jede
  // tatsächlich im Gesetz vorkommende Verschachtelungsreihenfolge korrekt
  // (nummer→litera→litera, aber auch litera direkt unter einem Satz ohne
  // umgebende nummer, oder umgekehrt), statt tiefere Ebenen pauschal als
  // "litera" zu behandeln.
  const istLitera = el.tagName.toLowerCase() === 'litera';
  const ebene: 'nummer' | 'litera' = istLitera ? 'litera' : 'nummer';
  const bezeichnung = bezeichnungVonListenElement(el);

  // Pfad dieses Eintrags für getaggte Verweise in seinem EIGENEN Text (nicht
  // in eintrag.saetze – siehe satzPfad unten): satz wird aus pfadBasis
  // durchgereicht (siehe EintragZeile in satzEintragBausteine.tsx,
  // dort ebenso satzZahl auf allen Ebenen mitgeführt), eintraege um den
  // eigenen Schritt (ebene + bezeichnung + wiederholung) verlängert –
  // wiederholung analog zum Rendering-Pfad nur gesetzt, wenn > 0 (0/undefined
  // = einziges Vorkommen dieser bezeichnung an dieser Stelle der Kette).
  const eigenerPfad: VerweisPfad = {
    ...pfadBasis,
    eintraege: [
      ...(pfadBasis.eintraege ?? []),
      { ebene, bezeichnung, wiederholung: wiederholung > 0 ? wiederholung : undefined },
    ],
  };

  // Neues Importformat: ausschließlich <satz>-Kinder (kein Rohtext, keine Unterliste)?
  // Dann direkt auslesen – kein Tokenisieren nötig.
  const alleKinder = Array.from(el.children).filter((kind) =>
    ['satz', 'nummer', 'litera', 'verweis', 'zeilenumbruch'].includes(kind.tagName.toLowerCase()),
  );
  const nurSatzKinder =
    alleKinder.length > 0 && alleKinder.every((c) => c.tagName.toLowerCase() === 'satz');

  if (nurSatzKinder) {
    const saetze: SatzDarstellung[] = alleKinder.map((satzEl, i) => {
      const zahlAttr = satzEl.getAttribute('zahl');
      const zahl = zahlAttr !== null ? parseInt(zahlAttr, 10) : i + 1;
      const roh = verarbeiteInlineKinder(satzEl);
      // eintrag.saetze = Satz INNERHALB eines Aufzählungseintrags: satzInEintrag
      // ergänzt den erhaltenen äußeren satz (siehe Textpfad.satzInEintrag).
      const satzPfad: VerweisPfad = { ...eigenerPfad, satzInEintrag: zahl };
      uebernehmeVerweise(roh, satzPfad, sammler);
      return {
        id: uid(),
        zahl,
        text: roh.text,
        eintraege: [],
      };
    });
    return {
      id: uid(),
      bezeichnung,
      ebene,
      text: saetze.map((s) => s.text).join(' '),
      saetze,
      untereintraege: [],
      fortsetzung: undefined,
    };
  }

  // Einzelsatz (Rohtext) oder Eintrag mit Unterlisten
  const roh = verarbeiteInlineKinder(el);
  uebernehmeVerweise(roh, eigenerPfad, sammler);
  const untereintraege = roh.listenKinder.map((k, idx) =>
    parseListenEintrag(
      k,
      eigenerPfad,
      sammler,
      wiederholungsIndexVonElementen(roh.listenKinder, idx),
    ),
  );

  return {
    id: uid(),
    bezeichnung,
    ebene,
    text: roh.text,
    saetze: undefined, // Direkter Eintragstext ohne ausdrücklich vorhandene Satzkinder
    untereintraege,
    fortsetzung: roh.fortsetzung || undefined,
  };
}

// ---------------------------------------------------------------------------
// Satz
// ---------------------------------------------------------------------------

/**
 * Parst ein <satz>-Element oder einen beliebigen Inline-Container
 * (z.B. <absatz> oder <text> ohne explizite Satz-Wrapper).
 */
function parseSatz(
  el: Element,
  zahl: number | undefined,
  pfadBasis: VerweisPfad,
  sammler: GetaggterVerweis[],
): SatzDarstellung {
  const eigenerPfad: VerweisPfad = { ...pfadBasis, satz: zahl };
  const roh = verarbeiteInlineKinder(el);
  uebernehmeVerweise(roh, eigenerPfad, sammler);
  const eintraege = roh.listenKinder.map((k, idx) =>
    parseListenEintrag(
      k,
      eigenerPfad,
      sammler,
      wiederholungsIndexVonElementen(roh.listenKinder, idx),
    ),
  );

  return {
    id: uid(),
    zahl,
    text: roh.text,
    eintraege,
    fortsetzung: roh.fortsetzung || undefined,
  };
}

// Absatz einschließlich seiner Adresse für getaggte Verweise.

function parseAbsatz(
  el: Element,
  sammler: GetaggterVerweis[],
  absatzWiederholung?: number,
): AbsatzDarstellung {
  const bezeichnung = el.getAttribute('zahl') ?? undefined;
  const pfadBasis: VerweisPfad = {
    absatz: bezeichnung,
    ...(absatzWiederholung ? { absatzWiederholung } : {}),
  };
  if (el.getAttribute('typ') === 'zwischenueberschrift') {
    return {
      id: uid(),
      zwischenueberschrift: true,
      saetze: [parseSatz(el, undefined, pfadBasis, sammler)],
    };
  }

  // <unterabsatz>-Kinder? (siehe xmlSerialisierung.ts: baueSaetzeEinesAbsatzes)
  // – dann KEINE flache saetze-Liste, sondern eine Liste von
  // UnterabsatzDarstellung, da die Satz-Zählung pro Unterabsatz neu beginnt.
  const unterabsatzEls = Array.from(el.children).filter(
    (c) => c.tagName.toLowerCase() === 'unterabsatz',
  );

  if (unterabsatzEls.length > 0) {
    const unterabsaetze: UnterabsatzDarstellung[] = unterabsatzEls.map((uaEl) => {
      // XML-Attribut zahl → Modellfeld bezeichnung (Text).
      const bezeichnung = uaEl.getAttribute('zahl') ?? '';
      const uaPfadBasis: VerweisPfad = { ...pfadBasis, unterabsatz: bezeichnung };
      const satzEls = Array.from(uaEl.children).filter((c) => c.tagName.toLowerCase() === 'satz');
      const saetze: SatzDarstellung[] =
        satzEls.length > 0
          ? satzEls.map((satzEl) => {
              // XML-Attribut zahl → Modellfeld zahl (Position).
              const satzZahlAttr = satzEl.getAttribute('zahl');
              const satzZahl = satzZahlAttr !== null ? parseInt(satzZahlAttr, 10) : undefined;
              return parseSatz(satzEl, satzZahl, uaPfadBasis, sammler);
            })
          : // Kein <satz>-Wrapper (Einzelsatz): <unterabsatz> selbst als Satz behandeln
            // (siehe baueSatzInline in xmlSerialisierung.ts).
            [parseSatz(uaEl, undefined, uaPfadBasis, sammler)];
      return { id: uid(), bezeichnung, saetze };
    });
    return { id: uid(), bezeichnung, saetze: [], unterabsaetze };
  }

  const saetze: SatzDarstellung[] = [];

  // Explizite <satz>-Kinder?
  const satzEls = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'satz');

  if (satzEls.length > 0) {
    for (const satzEl of satzEls) {
      // XML-Attribut zahl → Modellfeld zahl (Position).
      const zahlAttr = satzEl.getAttribute('zahl');
      const zahl = zahlAttr !== null ? parseInt(zahlAttr, 10) : undefined;
      saetze.push(parseSatz(satzEl, zahl, pfadBasis, sammler));
    }
  } else {
    // Inline-Text (kein <satz>-Wrapper) – Element direkt als Satz behandeln
    saetze.push(parseSatz(el, undefined, pfadBasis, sammler));
  }

  return { id: uid(), bezeichnung, saetze };
}

// Normtext.

function parseText(textEl: Element, sammler: GetaggterVerweis[]) {
  const absaetze: AbsatzDarstellung[] = [];
  const zusatztexte: NonNullable<NormDarstellung['zusatztexte']> = [];
  const kinder = Array.from(textEl.children);
  if (kinder.some((el) => el.tagName.toLowerCase() === 'absatz')) {
    const absatzEls: Element[] = [];
    for (const el of kinder) {
      if (el.tagName.toLowerCase() === 'absatz') {
        const wiederholung = absatzEls.filter(
          (a) => a.getAttribute('zahl') === el.getAttribute('zahl'),
        ).length;
        absaetze.push(parseAbsatz(el, sammler, wiederholung));
        absatzEls.push(el);
      } else {
        zusatztexte.push({
          nachAbsatz: absaetze.length,
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        });
      }
    }
  } else {
    // Ohne Absatzkinder bleibt <text> selbst der Absatz samt Inline-Hüllen.
    absaetze.push(parseAbsatz(textEl, sammler));
  }
  return { absaetze, zusatztexte };
}

// ---------------------------------------------------------------------------
// Norm (<norm id="..." [gliederungskennzahl="..."]>)
// ---------------------------------------------------------------------------

// Deckt sowohl gewöhnliche §-Normen als auch Gliederungsartikel (z.B. Art. 229
// EGBGB) ab – Format v2 serialisiert beide identisch als <norm>, Artikel
// tragen zusätzlich das gliederungskennzahl-Attribut. Vorher gab es hierfür
// zwei getrennte Code-Pfade (parseNorm + Artikel-Zweig in parseGliederung),
// die dieselbe Titel-/Inhalt-/Fußnoten-Logik dupliziert haben.
function parseNorm(normEl: Element): NormDarstellung {
  const xmlId = normEl.getAttribute('id') ?? '';
  const bezeichnung = normEl.querySelector(':scope > bezeichnung')?.textContent?.trim() ?? '';
  const titel = normEl.querySelector(':scope > titel')?.textContent?.trim();

  const textEl = normEl.querySelector(':scope > text');
  const status: NormDarstellung['status'] =
    normEl.getAttribute('status') === 'weggefallen' ? 'weggefallen' : undefined;
  const sammler: GetaggterVerweis[] = [];
  const { absaetze, zusatztexte } = textEl
    ? parseText(textEl, sammler)
    : { absaetze: [], zusatztexte: [] };

  const fussnotenText = normEl.querySelector(':scope > fussnoten')?.textContent?.trim();
  const fussnoten = fussnotenText || undefined;

  // gliederungsEbene wird nur gesetzt, wenn das gliederungskennzahl-Attribut
  // vorhanden ist (= Gliederungsartikel). Damit können beim Einklappen des
  // Artikels die nachfolgenden §§ ausgeblendet werden (siehe Gesetzestextansicht.tsx).
  const gliederungskennzahlAttr = normEl.getAttribute('gliederungskennzahl');
  const gliederungsEbene = gliederungskennzahlAttr
    ? ebeneAusGliederungskennzahl(gliederungskennzahlAttr)
    : undefined;

  const basis = {
    id: uid(),
    xmlId,
    bezeichnung,
    titel,
    status,
    absaetze,
    ...(zusatztexte.length > 0 ? { zusatztexte } : {}),
    fussnoten,
    vorgaenger: normEl.getAttribute('vorgaenger') ?? undefined,
    getaggteVerweise: sammler.length > 0 ? sammler : undefined,
  };
  if (normEl.getAttribute('typ') === 'erwaegungsgrund') {
    return { ...basis, art: 'erwaegungsgrund' };
  }
  if (gliederungsEbene !== undefined) {
    return { ...basis, art: 'gliederungsartikel', gliederungsEbene, ueberschriftartig: false };
  }
  return { ...basis, art: 'normal' };
}

// ---------------------------------------------------------------------------
// Gliederung (<gliederung gliederungskennzahl="...">) – Überschriften mit optionalem Text
// ---------------------------------------------------------------------------

function parseGliederung(glEl: Element): DarstellungsElement {
  const gliederungskennzahl = glEl.getAttribute('gliederungskennzahl') ?? '';
  const xmlId = ueberschriftXmlId(gliederungskennzahl);
  const bezeichnung = glEl.querySelector(':scope > bezeichnung')?.textContent?.trim() ?? '';
  const titelText = glEl.querySelector(':scope > titel')?.textContent?.trim();
  const ebene = ebeneAusGliederungskennzahl(gliederungskennzahl);

  const textEl = glEl.querySelector(':scope > text');
  const sammler: GetaggterVerweis[] = [];
  const text = textEl?.textContent?.trim()
    ? { ...parseText(textEl, sammler), getaggteVerweise: sammler.length ? sammler : undefined }
    : undefined;

  const ueberschrift: UeberschriftDarstellung = {
    id: uid(),
    xmlId,
    bezeichnung,
    titel: titelText || undefined,
    ebene,
    gliederungskennzahl,
    ...(text ? { text } : {}),
  };
  return { typ: 'ueberschrift', data: ueberschrift };
}

// ---------------------------------------------------------------------------
// <inhalt> auf Gesetz-Ebene – aus parseGesetzesXML ausgelagert, um dessen
// Cognitive Complexity zu senken (reine Orchestrierung bleibt dort).
// ---------------------------------------------------------------------------

function parseInhaltElemente(inhaltEl: Element, kurztitel: string): DarstellungsElement[] {
  const elemente: DarstellungsElement[] = [];
  for (const child of Array.from(inhaltEl.children)) {
    const tag = child.tagName.toLowerCase();

    if (tag === 'norm') {
      const norm = parseNorm(child);
      // Inhaltsübersicht-Normen überspringen (identisch zur Swift-Logik)
      if (norm.bezeichnung.trim().toLowerCase() === 'inhaltsübersicht') continue;
      elemente.push({ typ: 'norm', data: norm });
    } else if (tag === 'gliederung') {
      elemente.push(parseGliederung(child));
    } else {
      console.warn(`Unbekanntes Rumpfelement in ${kurztitel}:`, child.tagName);
    }
  }
  return elemente;
}

// Zweiter Pass: ueberschriftartig vorberechnen (mutiert elemente in place).
// Läuft nur für Gesetze mit Normen mit gliederungskennzahl (z.B. EGBGB) – nur
// dort gibt es Normen mit gliederungsEbene. Ein Gliederungsartikel ist
// "überschriftsartig", wenn das unmittelbar nachfolgende Element tiefer in
// der Hierarchie liegt (er also tatsächlich §§ unter sich hat).
// Gliederungsartikel ohne Unterelemente (z.B. Art. 223a EGBGB) bleiben nicht überschriftartig.
function ueberschriftartigMarkieren(elemente: DarstellungsElement[]): void {
  for (let i = 0; i < elemente.length; i++) {
    const el = elemente[i];
    // el beweisbar sicher durch die Schleifen-Invariante (i < elemente.length).
    if (el === undefined) continue;
    if (el.typ !== 'norm' || el.data.art !== 'gliederungsartikel') continue;
    const naechstes = elemente[i + 1];
    if (!naechstes) continue;
    const naechsteEbene =
      naechstes.typ === 'ueberschrift'
        ? naechstes.data.ebene
        : naechstes.data.art === 'gliederungsartikel'
          ? naechstes.data.gliederungsEbene
          : Number.POSITIVE_INFINITY;
    if (naechsteEbene > el.data.gliederungsEbene) {
      el.data.ueberschriftartig = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/**
 * Liest unser GesetzesXML zurück in ein GesetzDarstellung-Objekt.
 * Gibt null zurück bei XML-Fehlern oder fehlenden Pflichtfeldern.
 */
export function parseGesetzesXML(xmlString: string): GesetzDarstellung | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString.normalize('NFC'), 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('XML-Parsefehler:', parseError.textContent);
    return null;
  }

  const gesetzEl = doc.documentElement;
  if (!gesetzEl) {
    console.error('Kein Wurzelelement im XML gefunden');
    return null;
  }
  if (gesetzEl.tagName !== 'gesetz') {
    console.error('Wurzelelement ist nicht <gesetz>');
    return null;
  }

  const infosEl = gesetzEl.querySelector(':scope > infos');
  if (!infosEl) return null;

  let infos: ReturnType<typeof parseInfos>;
  try {
    infos = parseInfos(infosEl);
  } catch {
    return null;
  }
  if (!infos.kurztitel) return null;

  const inhaltEl = gesetzEl.querySelector(':scope > inhalt');
  const elemente = inhaltEl ? parseInhaltElemente(inhaltEl, infos.kurztitel) : [];
  const hatGliederungsartikel = Array.from(inhaltEl?.children ?? []).some(
    (kind) => kind.tagName.toLowerCase() === 'norm' && kind.hasAttribute('gliederungskennzahl'),
  );

  if (hatGliederungsartikel) ueberschriftartigMarkieren(elemente);

  return {
    kurztitel: infos.kurztitel,
    langtitel: infos.langtitel,
    fundstelle: infos.fundstelle,
    ausfertigung: infos.ausfertigung,
    aenderungsvermerk: infos.aenderungsvermerk,
    neugefasst: infos.neugefasst,
    datenquelle: infos.datenquelle,
    fassung: infos.fassung,
    normgeber: infos.normgeber,
    sprache: infos.sprache,
    normpraefix: infos.normpraefix,
    verarbeitungszeit: infos.verarbeitungszeit,
    letzteNeuerung: infos.letzteNeuerung,
    hatGliederungsartikel,
    elemente,
  };
}
