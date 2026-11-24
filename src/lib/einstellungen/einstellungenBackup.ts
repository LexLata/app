// Kopiert exportierbare Einstellungen in den Datenordner. Beide Schreibwege
// halten dieselbe prozessweite Dateisperre bis zum vollständigen Abschluss.
import {
  appDatenSchreiben,
  appDatenLesen,
  appDatenExistiert,
  sichereBeiUngueltigemInhalt,
  appDatenLoeschen,
  EINSTELLUNGEN_ORDNER,
  mitDateiSperre,
  meldePersistenzBefund,
} from '@/lib/persistenz/kern/kern.index';
import {
  EXPORTIERBARE_SCHLUESSEL,
  XML_TAG_ZU_SPEICHERSCHLUESSEL,
  uebernehmeEinstellungenXML,
  baueEinstellungenXML,
  keineEinstellungExplizitGesetzt,
} from './einstellungenXML';

import {
  erfasseAktionsFolgelauf,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';

import { SaxesParser, type SaxesTagNS } from 'saxes';
import { escapeXML } from '@/lib/utils/xmlVerarbeitung';

// Erst beim Aufruf aufgelöst: Dieses Modul wird über einstellungen.index mitgeladen,
// und Tests, die den Persistenzkern ohne EINSTELLUNGEN_ORDNER mocken, scheitern sonst beim Laden.
const backupPfad = () => `${EINSTELLUNGEN_ORDNER}/einstellungen-backup.xml`;
const SCHREIBVERZOEGERUNG_MS = 1000;
let schreibTimer: ReturnType<typeof setTimeout> | undefined;
let schreibfehlerGemeldet = false;
// Besitzer nur des bereits vorgesehenen Timerauftrags; keine Ergebnisablage.
type BackupAuftrag = { empfangen: AktionsMeldungEmpfaenger; abschliessen: () => void };
let importAuftraege: BackupAuftrag[] = [];
// Nur der Anzeigeempfänger des aktuellen Fensterbaums; keine gespeicherte Meldung.
let backupMeldungEmpfangen: ((text: string | undefined) => void) | undefined;

/** Fensterlokaler Empfänger: Text bei Fehler, undefined nach erfolgreichem
 * Schreiben. Die Rückgabe meldet diesen Empfänger ab, etwa beim Fensterschließen. */
export function registriereEinstellungenBackupMeldung(
  empfangen: (text: string | undefined) => void,
): () => void {
  backupMeldungEmpfangen = empfangen;
  return () => {
    if (backupMeldungEmpfangen === empfangen) backupMeldungEmpfangen = undefined;
  };
}

function meldeBackupStatus(text: string | undefined): void {
  if (!backupMeldungEmpfangen) return;
  try {
    backupMeldungEmpfangen(text);
  } catch (fehler) {
    // Anzeigeprobleme verändern weder das I/O-Ergebnis noch die Fehlerdrosselung.
    console.error('Backupmeldung konnte nicht übernommen werden:', fehler);
  }
}

async function schreibeBackup(auftraege: BackupAuftrag[]): Promise<void> {
  try {
    await mitDateiSperre(
      backupPfad(),
      async (token) => {
        // Erst nach Erwerb der Sperre lesen: ein vorausgegangenes Zurücksetzen
        // muss auch in anderen Fenstern wartende Schreibvorgänge entkräften.
        if (keineEinstellungExplizitGesetzt()) return;
        await appDatenSchreiben(backupPfad(), baueEinstellungenXML(), token);
        schreibfehlerGemeldet = false;
        meldeBackupStatus(undefined);
      },
      () => {},
    );
  } catch {
    const text =
      'Das Einstellungen-Backup konnte nicht geschrieben werden. Die übernommenen Einstellungen bleiben erhalten. Bitte die Einstellungen erneut ändern, um das Backup neu anzustoßen.';
    if (auftraege.length) {
      for (const { empfangen } of auftraege)
        empfangen({
          typ: 'fehler',
          art: 'hinweis',
          anlass: 'sicherung',
          aenderungsstand: 'keine',
          text,
        });
      return;
    }
    if (schreibfehlerGemeldet) return;
    schreibfehlerGemeldet = true;
    if (backupMeldungEmpfangen) {
      meldeBackupStatus(text);
      return;
    }
    meldePersistenzBefund({
      anlass: 'sicherung',
      art: 'fehler',
      aenderungsstand: 'keine',
      typ: 'fehler',
      text,
    });
  } finally {
    for (const auftrag of auftraege) auftrag.abschliessen();
  }
}

/** Ohne Schlüssel: vollständiger Import; mit Schlüssel: einzelne UI-Änderung. */
export function meldeEinstellungenGeaendert(
  schluessel?: string,
  empfangen?: AktionsMeldungEmpfaenger,
): void {
  if (schluessel !== undefined && !EXPORTIERBARE_SCHLUESSEL.includes(schluessel)) return;
  if (empfangen) {
    const lauf = new Promise<void>((abschliessen) => {
      importAuftraege.push({ empfangen, abschliessen });
    });
    erfasseAktionsFolgelauf(empfangen, lauf);
  }
  clearTimeout(schreibTimer);
  schreibTimer = setTimeout(() => {
    schreibTimer = undefined;
    const auftraege = importAuftraege;
    importAuftraege = [];
    void schreibeBackup(auftraege);
  }, SCHREIBVERZOEGERUNG_MS);
}

/** Native Löschung behandelt fehlende Dateien bereits als erfolgreichen Fall.
 * Die synchrone Aktion läuft unter derselben Sperre, ohne asynchrone Lücke. */
export async function loescheEinstellungenBackup(nachLoeschen: () => void): Promise<void> {
  clearTimeout(schreibTimer);
  schreibTimer = undefined;
  const auftraege = importAuftraege;
  importAuftraege = [];
  try {
    await mitDateiSperre(
      backupPfad(),
      async (token) => {
        await appDatenLoeschen(backupPfad(), token);
        nachLoeschen();
      },
      () => {},
    );
  } finally {
    for (const { empfangen, abschliessen } of auftraege) {
      empfangen({
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'sicherung',
        aenderungsstand: 'keine',
        text: 'Das vorgesehene Einstellungen-Backup wurde durch das Zurücksetzen aufgehoben. Sein Schreibabschluss ist nicht bestätigt.',
      });
      abschliessen();
    }
  }
}

/** XSD dateTime: Kalenderprüfung einschließlich Schaltjahren, 24:00:00,
 * beliebig langen Jahren und optionaler Zeitzone bis einschließlich 14:00. */
function istSchemaDatum(wert: string): boolean {
  const teile =
    /^(-?)([0-9]{4,})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-4]):([0-5][0-9]):([0-5][0-9])(\.[0-9]+)?(Z|[+-](?:0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)?$/.exec(
      wert.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''),
    );
  if (!teile) return false;
  const jahrText = teile[2]!;
  if (jahrText.length > 4 && jahrText.startsWith('0')) return false;
  const jahr = BigInt(jahrText);
  if (jahr === 0n) return false;
  const schaltjahr = jahr % 4n === 0n && (jahr % 100n !== 0n || jahr % 400n === 0n);
  const tage = [31, schaltjahr ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(teile[4]) > tage[Number(teile[3]) - 1]!) return false;
  return (
    teile[5] !== '24' || (teile[6] === '00' && teile[7] === '00' && !/[1-9]/.test(teile[8] ?? ''))
  );
}

const NORMALISIERTER_TEXT = (text: string) =>
  text.replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '');

function istAuswahlwertGueltig(tag: string | undefined, text: string): boolean {
  const auswahl: Record<string, readonly string[]> = {
    nachbereitungBeiImport: ['aus', 'verweise', 'saetze', 'saetze-und-verweise'],
    euFassung: ['original', 'konsolidiert'],
    euDurchfuehrungsaktSuche: ['true', 'false'],
    seitenleistenTastenkuerzel: ['true', 'false'],
  };
  return tag === undefined || !auswahl[tag] || auswahl[tag].includes(NORMALISIERTER_TEXT(text));
}

function hatUnerlaubteAuswahlattribute(tag: SaxesTagNS): boolean {
  return (
    ['nachbereitungBeiImport', 'euFassung', 'euDurchfuehrungsaktSuche'].includes(tag.local) &&
    Object.values(tag.attributes).some((attr) => attr.uri !== 'http://www.w3.org/2000/xmlns/')
  );
}

function istBekanntesEinstellungselement(tag: SaxesTagNS): boolean {
  return (
    tag.uri === '' &&
    (tag.local === 'verarbeitungszeit' || Object.hasOwn(XML_TAG_ZU_SPEICHERSCHLUESSEL, tag.local))
  );
}

/** Ausschließlich der bestehende Einstellungen-Vertrag, kein allgemeiner
 * Schema-Validator. saxes prüft Wohlgeformtheit und Namensräume strikt;
 * unbekannte Erweiterungselemente dürfen beliebigen gemischten Inhalt haben.
 * Der Backup-Vertrag erlaubt XML ausschließlich ohne DTD. */
function pruefeEinstellungenBackup(xml: string, werte?: Map<string, string>): boolean {
  let tiefe = 0;
  let gueltig = true;
  let bekanntesKind: string | undefined;
  let text = '';
  const gesehen = new Set<string>();
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => {
    gueltig = false;
  });
  parser.on('opentag', (tag) => {
    if (tiefe === 0) {
      if (
        tag.local !== 'einstellungen' ||
        tag.uri !== '' ||
        NORMALISIERTER_TEXT(tag.attributes.version?.value ?? '') !== '1'
      )
        gueltig = false;
    } else if (tiefe === 1) {
      bekanntesKind = istBekanntesEinstellungselement(tag) ? tag.local : undefined;
      text = '';
      if (bekanntesKind) {
        if (gesehen.has(bekanntesKind)) gueltig = false;
        gesehen.add(bekanntesKind);
        if (hatUnerlaubteAuswahlattribute(tag)) gueltig = false;
      }
    } else if (bekanntesKind) gueltig = false;
    tiefe += 1;
  });
  const leseText = (inhalt: string) => {
    if (tiefe === 1 && /[^ \t\r\n]/.test(inhalt)) gueltig = false;
    if (tiefe === 2) text += inhalt;
  };
  parser.on('text', leseText);
  parser.on('cdata', leseText);
  parser.on('closetag', () => {
    if (tiefe === 2) {
      if (bekanntesKind && bekanntesKind !== 'verarbeitungszeit') werte?.set(bekanntesKind, text);
      if (bekanntesKind === 'verarbeitungszeit' && !istSchemaDatum(text)) gueltig = false;
      if (!istAuswahlwertGueltig(bekanntesKind, text)) gueltig = false;
      bekanntesKind = undefined;
    }
    tiefe -= 1;
  });
  try {
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: SaxesParser liest das Backup zur Schema-Prüfung; einstellungenBackup.schemaAbgleich.test.ts vergleicht dieselben Fälle mit RelaxNG.
    parser.write(xml).close();
    return gueltig && gesehen.has('verarbeitungszeit');
  } catch {
    return false;
  }
}

export function istEinstellungenBackupGueltig(xml: string): boolean {
  return pruefeEinstellungenBackup(xml);
}

/** Unter derselben Sperre wie Schreiben und Reset: niemals einen vor dem
 * Reset gelesenen Inhalt nachträglich wieder in den localStorage übernehmen. */
export async function stelleEinstellungenAusBackupWiederHer(): Promise<
  'wiederhergestellt' | 'nichts-zu-tun' | 'fehler'
> {
  if (!keineEinstellungExplizitGesetzt()) return 'nichts-zu-tun';
  try {
    return await mitDateiSperre(
      backupPfad(),
      async (token) => {
        if (!keineEinstellungExplizitGesetzt()) return 'nichts-zu-tun' as const;
        let inhalt: string | null;
        try {
          inhalt = await appDatenLesen(backupPfad());
        } catch (fehler) {
          if (await appDatenExistiert(backupPfad())) throw fehler;
          inhalt = null;
        }
        const ergebnis = await sichereBeiUngueltigemInhalt(
          backupPfad(),
          inhalt,
          istEinstellungenBackupGueltig,
          { token, leerenInhaltPruefen: true },
        );
        if (ergebnis.status !== 'gueltig' || !keineEinstellungExplizitGesetzt())
          return 'nichts-zu-tun' as const;
        // Nur bekannte Elemente ohne Namensraum sind Einstellungen. Gültige
        // Erweiterungen dürfen denselben lokalen Namen im fremden Namensraum tragen.
        const werte = new Map<string, string>();
        if (!pruefeEinstellungenBackup(ergebnis.inhalt, werte)) return 'nichts-zu-tun' as const;
        const einstellungen = [...werte]
          .map(([tag, wert]) => `<${tag}>${escapeXML(wert)}</${tag}>`)
          .join('');
        uebernehmeEinstellungenXML(`<einstellungen>${einstellungen}</einstellungen>`);
        return 'wiederhergestellt' as const;
      },
      () => {},
    );
  } catch {
    return 'fehler';
  }
}
