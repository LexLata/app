// gesetzeskurzbefehlSpeicher.ts
// Speichert Gesetzeskurzbefehle und validiert sie
// gegen die aktuell von der App reservierten Tastenkürzel.
//
// PERSISTENZ (gesetzeskurzbefehle.xml, AppData – analog lesezeichenSpeicher.ts):
// Der Laufzeit-Typ Gesetzeskurzbefehl speichert die literal gedrückten Modifier
// (meta/ctrl) der jeweiligen Maschine. Auf der Datei wird davon abweichend
// ein plattformneutrales primaer/sekundaer-Paar abgelegt (primaer = ⌘ auf
// macOS, Strg auf Windows/Linux; sekundaer = jeweils der andere), damit ein
// auf dem Mac gesetztes ⌘E nach dem Kopieren der Datei auf Windows dort
// automatisch als Strg+E funktioniert, statt die dortige Windows-Taste zu
// verlangen. Die Übersetzung passiert ausschließlich beim Lesen/Schreiben
// (zuDateiFormat/ausDateiFormat) – überall sonst im Code wird weiterhin mit
// den literalen meta/ctrl-Feldern gearbeitet. Modifier stehen als Attribute
// an <taste>; nur wahre Werte werden als ="true" geschrieben.

import { erzeugeAktionsMeldungsWeiterleitung } from '@/lib/domain/app/aktionsMeldung';
import { GESETZESKURZBEFEHLE_DATEINAME } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { optionaleXmlAttribut } from '@/lib/utils/xmlVerarbeitung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, liesPflichtNormgeber } from '@/lib/domain/gesetzesreferenz';
import { nutzerdatenAenderungMelden } from './nutzerdatenAenderungMelden';

import {
  escapeXML,
  isoZeitstempel,
  liesXmlWurzel,
  xmlKind,
  xmlKinder,
  xmlText,
} from '@/lib/utils/xmlVerarbeitung';
import { holePlattform } from '@/lib/plattform/tauriHelpers';
import {
  EINSTELLUNGEN_ORDNER,
  sicherstelleOrdner,
  appDatenLesen,
  appDatenLesenGeschuetzt,
  appDatenLesenOderNull,
  mitDateiSperre,
  nutzerdatenSchreiben,
  sichereNutzerdatenVorAenderung,
  appDatenLoeschen,
  meldePersistenzBefund,
} from '@/lib/persistenz/kern/kern.index';

// Die Datei liegt im gemeinsamen Einstellungenordner; alte Root-Level-Dateien
// werden nicht migriert (keine Rückwärtskompatibilität).
import {
  GESETZESKURZBEFEHLE_DATEIPFAD as DATEINAME,
  bereinigeGesetzeskurzbefehlBestand,
} from './gesetzeskurzbefehlBereinigung';
export { bereinigeGesetzeskurzbefehleBeimStart } from './gesetzeskurzbefehlBereinigung';

// Datentyp

export interface Gesetzeskurzbefehl {
  taste: string; // e.key.toLowerCase(), z. B. 'e', '.', 'tab'
  meta: boolean; // ⌘ (macOS)
  ctrl: boolean; // ⌃ / Strg
  shift: boolean; // ⇧
  alt: boolean; // ⌥ / Alt
}

/** Schmaler, rein interner Eintrag für die code-basierte Zusatzprüfung
 *  (siehe Kopfkommentar). Wird NIE persistiert, nur zur Laufzeit gesetzt. */
export interface ReservierterTastenkuerzelCode {
  code: string; // e.code, z. B. 'KeyS', 'Digit3' – physische Taste, layoutunabhängig
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

// Dynamisch gesetzte Reservierungsliste (wird von App.tsx auf Mount gesetzt)

// Stryker disable next-line ArrayDeclaration: geprüft äquivalent - ein
// mutiertes Element wäre ein bloßer String statt eines Gesetzeskurzbefehl-Objekts;
// jeder Feldvergleich in gesetzeskurzbefehlGleich()/istTastenkuerzelReserviert() (z.B. r.taste) liefert
// darauf `undefined`, `.some()` kann also nie zu einem Match kommen -
// beobachtbar identisch zum leeren Array (siehe Analyse im Chatverlauf).
let _reservierteTastenkuerzel: ReadonlyArray<Gesetzeskurzbefehl> = [];
// Stryker disable next-line ArrayDeclaration: s. Begründung an _reservierteTastenkuerzel oben.
let _reservierteTastenkuerzelCodes: ReadonlyArray<ReservierterTastenkuerzelCode> = [];

/**
 * Setzt die Liste der von der App reservierten Tastenkürzel.
 * Wird von useTastenkuerzel.ts einmalig beim Start aufgerufen – automatisch
 * aus dem gemeinsamen Tastenkürzel-Katalog abgeleitet (einschließlich Menü-
 * und Systemtasten); eine zusätzliche manuelle Liste ist nicht erforderlich.
 */
export function setzeReservierteTastenkuerzel(liste: ReadonlyArray<Gesetzeskurzbefehl>) {
  _reservierteTastenkuerzel = liste;
}

/**
 * Setzt die zweite, code-basierte Reservierungsliste (siehe Kopfkommentar).
 * Nur für die paar ⌥-Tastenkürzel mit Buchstabe/Ziffer nötig.
 */
export function setzeReservierteTastenkuerzelCodes(
  liste: ReadonlyArray<ReservierterTastenkuerzelCode>,
) {
  _reservierteTastenkuerzelCodes = liste;
}

// Hilfsfunktionen

function gesetzeskurzbefehlGleich(a: Gesetzeskurzbefehl, b: Gesetzeskurzbefehl): boolean {
  return (
    a.taste === b.taste &&
    a.meta === b.meta &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    a.alt === b.alt
  );
}

/** Erzeugt einen Gesetzeskurzbefehl aus einem KeyboardEvent (nativ oder React-nativ).
 *  Gibt null zurück wenn kein Modifier oder nur Modifier gedrückt wurde.
 *
 *  Auf macOS ersetzt die ⌥-Taste e.key durch ein Sonderzeichen (z. B. ⌥E → '€',
 *  ⌥S → 'ß'). Deshalb wird bei altKey=true der physische Tastencode (e.code)
 *  verwendet, um die tatsächliche Taste zu ermitteln – analog zur Behandlung in
 *  istTastenkuerzelReserviert(). */
export function gesetzeskurzbefehlVonEvent(e: {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): Gesetzeskurzbefehl | null {
  const taste = e.key.toLowerCase();
  if (['meta', 'control', 'shift', 'alt', 'os', 'super'].includes(taste)) return null;
  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) return null;

  // Bei ⌥-Kombinationen physische Taste aus e.code ableiten (KeyE → 'e', Digit3 → '3'),
  // da e.key auf macOS ein layoutabhängiges Sonderzeichen enthält.
  let normalisiert = taste;
  if (e.altKey && e.code) {
    const buchstabe = e.code.match(/^Key([A-Z])$/);
    const ziffer = e.code.match(/^Digit([0-9])$/);
    // buchstabe[1]/ziffer[1] beweisbar sicher: nicht-optionale Capture-
    // Gruppe, durch die if/else-if-Guards direkt davor abgesichert.
    if (buchstabe) normalisiert = buchstabe[1]!.toLowerCase();
    else if (ziffer) normalisiert = ziffer[1]!;
  }

  return {
    taste: normalisiert,
    meta: e.metaKey,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
}

/** Wandelt einen Gesetzeskurzbefehl in einen lesbaren String um, z. B. „⌘⇧E". */
export function gesetzeskurzbefehlAlsText(k: Gesetzeskurzbefehl): string {
  let s = '';
  if (k.meta) s += '⌘';
  if (k.ctrl) s += '⌃';
  if (k.alt) s += '⌥';
  if (k.shift) s += '⇧';
  const t = k.taste;
  if (t === ' ' || t === '\u00a0') return s + 'Space';
  if (t === 'tab') return s + 'Tab';
  if (t === 'escape') return s + 'Esc';
  if (t === 'enter') return s + '↵';
  if (t === 'backspace') return s + '⌫';
  if (t === 'delete') return s + '⌦';
  if (t === 'arrowup') return s + '↑';
  if (t === 'arrowdown') return s + '↓';
  if (t === 'arrowleft') return s + '←';
  if (t === 'arrowright') return s + '→';
  return s + t.toUpperCase();
}

/** Prüft, ob der Gesetzeskurzbefehl von der App reserviert ist.
 *  `code` (e.code) ist optional und wird zusätzlich gegen die schmale,
 *  code-basierte Liste geprüft (siehe Kopfkommentar) – nur dort erfasst,
 *  wo ⌥ den von e.key gelieferten Buchstaben/Ziffer layoutabhängig verändert. */
function istTastenkuerzelReserviert(k: Gesetzeskurzbefehl, code?: string): boolean {
  if (_reservierteTastenkuerzel.some((r) => gesetzeskurzbefehlGleich(r, k))) return true;
  if (code) {
    return _reservierteTastenkuerzelCodes.some(
      (r) =>
        r.code === code &&
        r.meta === k.meta &&
        r.ctrl === k.ctrl &&
        r.shift === k.shift &&
        r.alt === k.alt,
    );
  }
  return false;
}

// Plattform-Übersetzung (siehe Kopfkommentar)

interface GesetzeskurzbefehlDateiEintrag {
  gesetz: Gesetzesreferenz;
  taste: string;
  primaer: boolean;
  sekundaer: boolean;
  shift: boolean;
  alt: boolean;
}

function zuDateiFormat(
  k: Gesetzeskurzbefehl,
  istMac: boolean,
  gesetz: Gesetzesreferenz,
): GesetzeskurzbefehlDateiEintrag {
  return {
    gesetz,
    taste: k.taste,
    primaer: istMac ? k.meta : k.ctrl,
    sekundaer: istMac ? k.ctrl : k.meta,
    shift: k.shift,
    alt: k.alt,
  };
}

function ausDateiFormat(e: GesetzeskurzbefehlDateiEintrag, istMac: boolean): Gesetzeskurzbefehl {
  return {
    taste: e.taste,
    meta: istMac ? e.primaer : e.sekundaer,
    ctrl: istMac ? e.sekundaer : e.primaer,
    shift: e.shift,
    alt: e.alt,
  };
}

// Lesen / Schreiben (gesetzeskurzbefehle.xml, AppData)

function baueXML(alle: Record<string, GesetzeskurzbefehlDateiEintrag>): string {
  const zeilen = Object.entries(alle)
    .map(([, e]) =>
      [
        '        <gesetzeskurzbefehl>',
        `            <gesetz${optionaleXmlAttribut('normgeber', e.gesetz.normgeber)}>${escapeXML(e.gesetz.kurztitel)}</gesetz>`,
        `            <taste${optionaleXmlAttribut('primaer', e.primaer ? 'true' : undefined)}${optionaleXmlAttribut('sekundaer', e.sekundaer ? 'true' : undefined)}${optionaleXmlAttribut('shift', e.shift ? 'true' : undefined)}${optionaleXmlAttribut('alt', e.alt ? 'true' : undefined)}>${escapeXML(e.taste)}</taste>`,
        '        </gesetzeskurzbefehl>',
      ].join('\n'),
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gesetzeskurzbefehle version="1">',
    '    <infos>',
    `        <verarbeitungszeit>${isoZeitstempel(new Date())}</verarbeitungszeit>`,
    '    </infos>',
    '    <inhalt>',
    zeilen,
    '    </inhalt>',
    '</gesetzeskurzbefehle>',
  ].join('\n');
}

/** @param xmlOverride Wenn gesetzt, wird dieser Text statt der AppData-Datei
 *  geparst – für den Datei-Import (siehe zusammenfuehrenGesetzeskurzbefehle unten),
 *  der eine noch nicht gespeicherte, importierte gesetzeskurzbefehle.xml mit
 *  derselben Parse-Logik lesen muss, ohne sie zu duplizieren. */
async function ladeDateiEintraege(
  xmlOverride?: string,
  token?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Record<string, GesetzeskurzbefehlDateiEintrag>> {
  const empfangen = meldungEmpfangen;
  if (xmlOverride === undefined)
    meldungEmpfangen =
      empfangen &&
      erzeugeAktionsMeldungsWeiterleitung(empfangen, (meldung) =>
        empfangen({ ...meldung, text: `Bestandsdatei ‚${DATEINAME}': ${meldung.text}` }),
      );
  let xml =
    xmlOverride ??
    (meldungEmpfangen
      ? await appDatenLesenGeschuetzt(
          DATEINAME,
          'gesetzeskurzbefehle',
          token,
          undefined,
          meldungEmpfangen,
        )
      : await appDatenLesenGeschuetzt(DATEINAME, 'gesetzeskurzbefehle', token));
  if (xmlOverride === undefined && xml !== null)
    xml = await bereinigeGesetzeskurzbefehlBestand(xml, token, meldungEmpfangen);
  if (xml === null) return {};

  const alle: Record<string, GesetzeskurzbefehlDateiEintrag> = {};
  const inhalt = xmlKind(liesXmlWurzel(xml, 'gesetzeskurzbefehle'), 'inhalt');
  let normgeberFehlt = false;
  for (const el of xmlKinder(inhalt, 'gesetzeskurzbefehl')) {
    if (!xmlKind(el, 'gesetz')?.hasAttribute('normgeber')) {
      normgeberFehlt = true;
      continue;
    }
    const gesetz = xmlText(el, 'gesetz')?.trim();
    const referenz = {
      kurztitel: gesetz ?? '',
      normgeber: liesPflichtNormgeber(
        xmlKind(el, 'gesetz')?.getAttribute('normgeber') ?? undefined,
      ),
    };
    const tasteElement = xmlKind(el, 'taste');
    const taste = tasteElement?.textContent ?? undefined;
    if (gesetz && taste !== undefined) {
      alle[gesetzesreferenzSchluessel(referenz)] = {
        gesetz: referenz,
        taste,
        primaer: tasteElement?.getAttribute('primaer') === 'true',
        sekundaer: tasteElement?.getAttribute('sekundaer') === 'true',
        shift: tasteElement?.getAttribute('shift') === 'true',
        alt: tasteElement?.getAttribute('alt') === 'true',
      };
    }
  }
  if (normgeberFehlt)
    meldePersistenzBefund(
      {
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'lesen',
        aenderungsstand: 'keine',
        text: 'Einträge ohne Normgeber wurden nicht geladen.',
      },
      ...(meldungEmpfangen ? [meldungEmpfangen] : []),
    );
  return alle;
}

async function schreibeDateiEintraege(
  alle: Record<string, GesetzeskurzbefehlDateiEintrag>,
  token?: string,
): Promise<void> {
  if (Object.keys(alle).length === 0) {
    await sichereNutzerdatenVorAenderung(DATEINAME, token);
    await appDatenLoeschen(DATEINAME, token);
    return;
  }
  await sicherstelleOrdner(EINSTELLUNGEN_ORDNER);
  await nutzerdatenSchreiben(DATEINAME, baueXML(alle), token);
}

export async function ladeAlleGesetzeskurzbefehle(
  token?: string,
): Promise<Record<string, Gesetzeskurzbefehl>> {
  const istMac = (await holePlattform()) === 'macos';
  const dateiEintraege = await ladeDateiEintraege(undefined, token);
  const alle: Record<string, Gesetzeskurzbefehl> = {};
  for (const [schluessel, e] of Object.entries(dateiEintraege)) {
    alle[schluessel] = ausDateiFormat(e, istMac);
  }
  return alle;
}

export type SpeicherErgebnis = 'ok' | 'reserviert' | 'doppelt';

export async function speichereGesetzeskurzbefehl(
  gesetz: Gesetzesreferenz,
  kurzbefehl: Gesetzeskurzbefehl,
  code?: string,
): Promise<SpeicherErgebnis> {
  if (istTastenkuerzelReserviert(kurzbefehl, code)) return 'reserviert';
  const schluessel = gesetzesreferenzSchluessel(gesetz);

  const ergebnis = await mitDateiSperre(DATEINAME, async (token) => {
    const dateiEintraege = await ladeDateiEintraege(undefined, token);
    const istMac = (await holePlattform()) === 'macos';
    for (const [id, eintrag] of Object.entries(dateiEintraege)) {
      if (
        id !== schluessel &&
        gesetzeskurzbefehlGleich(ausDateiFormat(eintrag, istMac), kurzbefehl)
      ) {
        return 'doppelt' as const;
      }
    }
    dateiEintraege[schluessel] = zuDateiFormat(kurzbefehl, istMac, gesetz);
    await schreibeDateiEintraege(dateiEintraege, token);
    return 'ok' as const;
  });
  if (ergebnis === 'ok') await nutzerdatenAenderungMelden('gesetzeskurzbefehle-geaendert');
  return ergebnis;
}

export async function loescheGesetzeskurzbefehl(gesetz: Gesetzesreferenz): Promise<void> {
  const schluessel = gesetzesreferenzSchluessel(gesetz);
  const ergebnis = await mitDateiSperre(DATEINAME, async (token) => {
    const dateiEintraege = await ladeDateiEintraege(undefined, token);
    if (!(schluessel in dateiEintraege)) return false;
    delete dateiEintraege[schluessel];
    await schreibeDateiEintraege(dateiEintraege, token);
    return true;
  });
  if (ergebnis) await nutzerdatenAenderungMelden('gesetzeskurzbefehle-geaendert');
}

/** Führt importierte Gesetzeskurzbefehle mit dem Bestand zusammen. Fehlende
 * Gesetze werden übernommen; bei vorhandenen entscheidet behalteBestehendeBeiKonflikt
 * (Standard true: Bestand bleibt, false: Import ersetzt ihn; Checkbox im Overlay).
 * Der Dateiimport übernimmt die Kurzbefehle ohne Kollisions-/Reserviert-Prüfung.
 * Schreibt nur bei Änderung: true nach Speicherung, false bei unverändertem Bestand. */
export async function zusammenfuehrenGesetzeskurzbefehle(
  importiertesXML: string,
  behalteBestehendeBeiKonflikt = true,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  const ergebnis = await mitDateiSperre(
    DATEINAME,
    async (token) => {
      const bestehende = await ladeDateiEintraege(undefined, token, meldungEmpfangen);
      const importiert = await ladeDateiEintraege(importiertesXML, undefined, meldungEmpfangen);
      const ergebnis = { ...bestehende };
      let veraendert = false;

      for (const [schluessel, eintrag] of Object.entries(importiert)) {
        if (!(schluessel in ergebnis) || !behalteBestehendeBeiKonflikt) {
          ergebnis[schluessel] = eintrag;
          veraendert = true;
        }
      }

      if (veraendert) await schreibeDateiEintraege(ergebnis, token);
      return veraendert;
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
  if (ergebnis) await nutzerdatenAenderungMelden('gesetzeskurzbefehle-geaendert', meldungEmpfangen);
  return ergebnis;
}

/**
 * Liest den rohen Gesetzeskurzbefehle-XML-Text, oder null wenn keine Datei
 * existiert. Für den Datei-Import-Inhaltsvergleich (siehe
 * dateiImport.ts).
 */
export async function leseGesetzeskurzbefehleRohtext(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  return appDatenLesenOderNull(DATEINAME, meldungEmpfangen);
}

/**
 * Ersetzt die Gesetzeskurzbefehle-Datei vollständig durch importiertesXML
 * (Datei-Import „Ersetzen", siehe dateiImport.ts/DateiImportOverlay.tsx).
 */
export async function ersetzeGesetzeskurzbefehleDatei(
  importiertesXML: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  await mitDateiSperre(
    DATEINAME,
    async (token) => {
      await sicherstelleOrdner(EINSTELLUNGEN_ORDNER);
      await nutzerdatenSchreiben(DATEINAME, importiertesXML, token);
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
  await nutzerdatenAenderungMelden('gesetzeskurzbefehle-geaendert', meldungEmpfangen);
}

/** Prüft, ob ein KeyboardEvent einem gespeicherten Gesetzeskurzbefehl entspricht. */
export function findeGesetzFuerEvent(
  e: KeyboardEvent,
  alle: Record<string, Gesetzeskurzbefehl>,
): string | null {
  const taste = e.key.toLowerCase();
  for (const [schluessel, k] of Object.entries(alle)) {
    if (
      k.taste === taste &&
      k.meta === e.metaKey &&
      k.ctrl === e.ctrlKey &&
      k.shift === e.shiftKey &&
      k.alt === e.altKey
    )
      return schluessel;
  }
  return null;
}

/** Liest die Exportdatei roh und ohne Archivierungs-/Schreibnebenwirkungen. */
export async function leseGesetzeskurzbefehleFuerExport(): Promise<
  Array<{ name: string; inhalt: string }>
> {
  try {
    return [{ name: GESETZESKURZBEFEHLE_DATEINAME, inhalt: await appDatenLesen(DATEINAME) }];
  } catch {
    return [];
  }
}

/** Schreibfreie Eingangsdiagnose für Vergleich und Ersetzen beim Dateiimport. */
export async function pruefeGesetzeskurzbefehleImport(
  xml: string,
  meldungEmpfangen: AktionsMeldungEmpfaenger,
): Promise<number> {
  return Object.keys(await ladeDateiEintraege(xml, undefined, meldungEmpfangen)).length;
}
