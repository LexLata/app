// Lädt Markierungskonflikte für die Anzeige und baut die Anzeigeeinträge auf.

import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import type {
  EigenerKonflikt,
  MarkierungsEintrag,
  ZielKonflikt,
  ZielnormBefund,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  berechneZielKonflikte,
  identitaetsSchluessel,
  loeseAusgangsstelleAuf,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { normAmtlicherTitel } from '@/lib/domain/gesetzDarstellungAuswertung';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { vollstaendigeBezeichnung } from '@/lib/domain/norm/norm.index';
import { ladePruefstand } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import { istVollpruefungErforderlich } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefdurchlauf';
import { reiheInPruefungsKetteEin } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette';
import { pruefeErforderlicheVollpruefung } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefsteuerung';
import type {
  GeparsterKonfliktEintrag,
  GespeicherteGesetzKonflikte,
  MarkierungskonfliktPruefstatus,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { verifiziereStand } from './markierungskonflikteAnzeige.verifizieren';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';

/** Zielkonflikt mit vollen Bezeichnungen aus den frisch geladenen Markierungen.
 * Ohne verlässliche Quelle bleibt die Liste leer. Die Oberfläche gruppiert
 * die Bezeichnungen auch bei fehlendem Zielgesetz allein aus diesen Angaben. */
export interface AnzeigeZielKonflikt extends ZielKonflikt {
  bezeichnungenAnzeige: {
    bezeichnung: string;
    befund?: Exclude<ZielnormBefund, 'passt'>;
  }[];
}

/** EIN Konfliktdatensatz zur Anzeige im Markierungskonflikte-Fenster.
 *  Bezeichnung, Markierungstyp und Identität sind auch im Konfliktblock
 *  gespeichert. Der optionale Bezugstext kommt ausschließlich live aus der
 *  Markierungs-XML und fehlt beim gespeicherten Rückfallbestand. */
export interface AnzeigeKonfliktEintrag {
  /** Rohe Kennung wie im Markierungs-XML gespeichert (z.B. "1", "229 2") –
   *  wird zum Öffnen der Norm gebraucht (siehe oeffneInternesZiel in
   *  useInterneNavigation.ts), NICHT zur Anzeige. */
  ausgangsstelle: Ausgangsstelle;
  /** Lesbarer Anzeigename: präfigierte Norm oder Überschriftentitel; nie Gliederungskennzahl. */
  bezeichnungAnzeige: string;
  markierungstyp: MarkierungsEintrag['typ'];
  bezugstext?: string;
  /** true = eigener Bezugskonflikt. */
  eigenerKonflikt?: EigenerKonflikt;
  /** Frisch berechnete Anzahl bei mehrdeutiger Ausgangsstelle; niemals gespeichert. */
  ausgangsTrefferzahl?: number;
  bereich?: 'amtlicherTitel' | 'nichtamtlicherTitel' | 'bezeichnung';
  textpfad?: Textpfad;
  verweistext?: string;
  nichtamtlicherTitelGrund?: 'normWeggefallen' | 'normHatAmtlichenTitel' | 'normNichtImGesetz';
  /** Zielkonflikte, je Zielgesetz und gespeichertem Typ höchstens ein Eintrag. */
  zielKonflikte: AnzeigeZielKonflikt[];
  /**
   * identitaetsSchluessel() der zugrundeliegenden Markierung (siehe
   * markierungskonfliktPruefung.ts) – NICHT die volle MarkierungsEintrag, um das
   * Fenster schnell zu halten. Wird von den Konfliktaktionen im
   * Markierungskonflikte-Fenster genutzt, um die volle Markierung erst bei
   * tatsächlicher Aktionsausführung über ladeEintraegeFuerPruefung() + Abgleich
   * nachzuladen (siehe konfliktaktionen.ts).
   */
  schluessel: string;
}

export interface AnzeigeGesetzKonflikte {
  gesetz: Gesetzesreferenz;
  /** true = gesetzFehlt (ganzes Gesetz fehlt) – eintraege dann leer. */
  fehlendesGesetz?: true;
  /** true = nichtamtlicheTitelXmlFehlt (siehe markierungskonfliktPruefung.ts) – NICHT
   *  exklusiv, eintraege kann trotzdem befüllt sein. Wird im Fenster als
   *  eigene, aufklappbare Zeile "Fehlende nichtamtliche Titel" dargestellt,
   *  wie ein normaler Konflikt (siehe Absprache), NICHT wie fehlendesGesetz
   *  als separate Überschrift. */
  nichtamtlicheTitelXmlFehlt?: true;
  eintraege: AnzeigeKonfliktEintrag[];
}

/** Status und Befunde stammen aus demselben geschützten Anzeigeauftrag. */
export interface MarkierungskonfliktAnzeigeErgebnis {
  pruefstatus: MarkierungskonfliktPruefstatus;
  gesetze: AnzeigeGesetzKonflikte[];
}

/**
 * Lädt markierungskonflikte.xml für die Anzeige im Markierungskonflikte-Fenster.
 * Prüft im selben geschützten Auftrag, ob die bekannten
 * Konflikte noch bestehen (siehe dort), damit nicht bereits aufgelöste
 * Konflikte angezeigt werden. Bei ungelöstem Quellfehler wird ausschließlich
 * ein frisch geschützter gespeicherter Fehlerstand angezeigt, ohne Live-Texte.
 * Ein solcher Ladeerfolg bestätigt keine erfolgreiche Prüfung.
 */
export async function ladeMarkierungskonflikteFuerAnzeige(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungskonfliktAnzeigeErgebnis> {
  async function ladeStand(): Promise<MarkierungskonfliktAnzeigeErgebnis | undefined> {
    return reiheInPruefungsKetteEin(
      async (token, empfangen) => {
        const stand = await ladePruefstand(token, empfangen);
        // Fehlende, alte und unterbrochene Stände sowie nativer Vollbedarf
        // benötigen einen Neuaufbau. Regulär offene und fehlgeschlagene
        // Prüfungen werden sichtbar erhalten.
        if (await istVollpruefungErforderlich(token, stand)) return undefined;
        if (stand.pruefstatus === null) return undefined;
        const quellen = await verifiziereStand(stand, token, empfangen);
        const gesetze: AnzeigeGesetzKonflikte[] = [];
        for (const gespeichert of stand.gesetzKonflikte.values()) {
          const block = baueAnzeigeGesetzBlock(
            gespeichert,
            quellen.gesetze,
            quellen.eintraegeJeGesetz,
          );
          if (block) gesetze.push(block);
        }
        return { pruefstatus: stand.pruefstatus, gesetze };
      },
      true,
      'bei-vollbedarf',
      'automatisch',
      true,
      meldungEmpfangen,
    );
  }
  try {
    const stand = await ladeStand();
    if (stand) return stand;
    // Außerhalb des Anzeigeauftrags einreihen, sonst wartet die Kette auf sich selbst.
    await pruefeErforderlicheVollpruefung(meldungEmpfangen);
    const neu = await ladeStand();
    if (!neu) throw new Error('Der Prüfstand konnte nicht vollständig aufgebaut werden.');
    return neu;
  } catch (fehler) {
    // Fehlerabschluss und Heilung können die Sperre freigeben und den Bestand
    // ändern. Ausschließlich den jetzt dauerhaft gespeicherten Fehlerstand
    // erneut geschützt lesen, niemals die teilweise verifizierte Map verwenden.
    const gespeichert = await reiheInPruefungsKetteEin(
      async (token) => {
        const stand = await ladePruefstand(token, meldungEmpfangen);
        if (stand.pruefstatus !== 'fehlgeschlagen') throw fehler;
        return {
          pruefstatus: stand.pruefstatus,
          gesetze: [...stand.gesetzKonflikte.values()].map(baueGespeichertenAnzeigeBlock),
        };
      },
      true,
      false,
      'automatisch',
      false,
      meldungEmpfangen,
    );
    if (!gespeichert) throw fehler;
    return gespeichert;
  }
}

/** Volle Ausgangsbezeichnungen bleiben auch ohne eindeutig auflösbare Norm lesbar. */
function gespeicherterAnzeigename(e: { ausgangsstelle: Ausgangsstelle }): string {
  const stelle = e.ausgangsstelle;
  if (stelle.typ === 'ueberschrift') return 'Überschrift';
  return stelle.bezeichnung;
}

/** Ein lesbarer Fehlerstand benötigt keine erfolgreich geladenen Quellen.
 * Bezugstext und Zielnormdetails werden nicht persistiert und bleiben leer. */
function baueGespeichertenAnzeigeBlock(
  gespeichert: GespeicherteGesetzKonflikte,
): AnzeigeGesetzKonflikte {
  return {
    gesetz: gespeichert.gesetz,
    fehlendesGesetz: gespeichert.fehlendesGesetz || undefined,
    nichtamtlicheTitelXmlFehlt: gespeichert.nichtamtlicheTitelXmlFehlt || undefined,
    eintraege: gespeichert.eintraege.map((e) => {
      const typ = e.markierungstyp;
      if (
        typ !== 'unterstreichung' &&
        typ !== 'hervorhebung' &&
        typ !== 'kommentar' &&
        typ !== 'verweismarkierung'
      )
        throw new Error(`Unbekannter Markierungstyp: ${typ}`);
      const bezeichnungAnzeige = gespeicherterAnzeigename(e);
      return {
        ausgangsstelle: e.ausgangsstelle,

        bezeichnungAnzeige,
        markierungstyp: typ,
        bereich: e.bereich,
        eigenerKonflikt: e.eigenerKonflikt || undefined,
        zielKonflikte: e.zielKonflikte.map((z) => ({
          ...z,
          bezeichnungenAnzeige: [],
        })),
        schluessel: e.schluessel,
      };
    }),
  };
}

/**
 * Baut den Anzeige-Block EINES Gesetzes (Kern der for-Schleife in
 * ladeMarkierungskonflikteFuerAnzeige oben) aus den bereits für die Verifikation
 * geladenen Quellen, ohne erneute Dateizugriffe. Gibt
 * undefined zurück, wenn für dieses Gesetz nichts anzuzeigen ist (weder
 * Konflikteinträge noch fehlender nichtamtlicher Titel).
 */
function baueAnzeigeGesetzBlock(
  gespeichert: GespeicherteGesetzKonflikte,
  alleGesetze: GesetzDarstellung[],
  eintraegeJeGesetz: ReadonlyMap<string, MarkierungsEintrag[]>,
): AnzeigeGesetzKonflikte | undefined {
  const gesetzesreferenz = gespeichert.gesetz;
  if (gespeichert.fehlendesGesetz) {
    return { gesetz: gesetzesreferenz, fehlendesGesetz: true, eintraege: [] };
  }

  const nichtamtlicheTitelXmlFehlt = gespeichert.nichtamtlicheTitelXmlFehlt || undefined;
  const geparst = gespeichert.eintraege;
  if (geparst.length === 0 && !nichtamtlicheTitelXmlFehlt) return undefined;
  const liveEintraege = eintraegeJeGesetz.get(gesetzesreferenzSchluessel(gesetzesreferenz)) ?? [];
  const liveNachSchluessel = new Map(liveEintraege.map((e) => [identitaetsSchluessel(e), e]));
  const gesetz = alleGesetze.find((g) => istGleichesGesetz(g, gesetzesreferenz));

  const eintraege: AnzeigeKonfliktEintrag[] = [];
  for (const e of geparst) {
    const eintrag = baueAnzeigeEintrag(e, liveNachSchluessel, gesetz, alleGesetze);
    if (eintrag) eintraege.push(eintrag);
  }
  if (eintraege.length === 0 && !nichtamtlicheTitelXmlFehlt) return undefined;
  return { gesetz: gesetzesreferenz, nichtamtlicheTitelXmlFehlt, eintraege };
}

/** Fachlicher Grund für einen nicht mehr angezeigten nichtamtlichen Titel. */
function titelGrund(
  live: MarkierungsEintrag,
  element: ReturnType<typeof loeseAusgangsstelleAuf>['element'],
  trefferzahl = 0,
): AnzeigeKonfliktEintrag['nichtamtlicherTitelGrund'] {
  if (live.bezug.textstelle?.pfad.bereich !== 'nichtamtlicherTitel' || trefferzahl > 1)
    return undefined;
  if (!element) return 'normNichtImGesetz';
  if (!('absaetze' in element)) return undefined;
  if (element.status === 'weggefallen') return 'normWeggefallen';
  if (normAmtlicherTitel(element) !== undefined) return 'normHatAmtlichenTitel';
  return undefined;
}

/**
 * Baut EINEN Anzeige-Eintrag (Kernlogik der for-Schleife in
 * ladeMarkierungskonflikteFuerAnzeige oben) – reine Funktion ohne jeden
 * Datei-/AppData-Zugriff (macht sie ohne vi.mock direkt testbar, siehe
 * Testkonvention). `liveNachSchluessel` muss bereits geladen sein (Aufrufer
 * bleibt für ladeEintraegeFuerPruefung zuständig). Gibt undefined zurück, wenn die
 * zugrundeliegende Markierung nicht mehr live existiert (siehe
 * Funktionskommentar dort zum best-effort-Überspringen).
 */
export function baueAnzeigeEintrag(
  e: GeparsterKonfliktEintrag,
  liveNachSchluessel: Map<string, MarkierungsEintrag>,
  gesetz: GesetzDarstellung | undefined,
  alleGesetze: GesetzDarstellung[],
): AnzeigeKonfliktEintrag | undefined {
  // Sollte nach dem Auflösungs-Check (verifiziereBekannteKonflikte) oben
  // eigentlich immer gefunden werden (nicht mehr live vorhandene Einträge
  // wurden dort bereits entfernt) – best-effort trotzdem übersprungen statt
  // eines Absturzes, falls sich zwischen Check und Lesen doch noch etwas
  // geändert hat.
  const live = liveNachSchluessel.get(e.schluessel);
  if (!live) return undefined;
  // Anzeigename live auflösen; ohne eindeutige Stelle gespeicherte Normpräfixe nutzen.
  const aufloesung = gesetz ? loeseAusgangsstelleAuf(gesetz, live.ausgangsstelle) : undefined;
  const aktuellesElement = aufloesung?.element;
  const anzeigeBezeichnung = aktuellesElement
    ? live.ausgangsstelle.typ === 'ueberschrift'
      ? ('titel' in aktuellesElement && aktuellesElement.titel) || aktuellesElement.bezeichnung
      : vollstaendigeBezeichnung(gesetz!, aktuellesElement.xmlId) ||
        bezeichnungAusgangsstelle(live.ausgangsstelle)
    : gespeicherterAnzeigename(live);
  // Die konkret betroffenen Zielnormen je Zielgesetz werden NICHT aus
  // markierungskonflikte.xml gelesen (dort steckt nur der Konflikttyp), sondern
  // hier live neu berechnet – siehe ZielKonfliktBerechnet-Kommentar
  // (markierungskonfliktPruefung.ts). berechneZielKonflikte wird dabei bewusst
  // auf GENAU dieses eine Zielgesetz eingeschränkt (nurGesetze), analog zum
  // bereits bestehenden Aufruf-Muster in markierungskonflikteXML.ts (gezielte
  // Nachprüfung nach Aktualisierung eines einzelnen Gesetzes). Der
  // persistierte Konflikttyp (e.zielKonflikte) bleibt dabei maßgeblich – nur
  // die Bezeichnungsliste kommt frisch dazu.
  const zielKonflikte: AnzeigeZielKonflikt[] = e.zielKonflikte.map((z) => {
    if (!gesetz) return { ...z, bezeichnungenAnzeige: [] };
    const frisch = berechneZielKonflikte(
      live,
      gesetz,
      alleGesetze,
      new Set([gesetzesreferenzSchluessel(z.gesetz)]),
    );
    return {
      ...z,
      bezeichnungenAnzeige:
        frisch.find((f) => istGleichesGesetz(f.gesetz, z.gesetz) && f.typ === z.typ)
          ?.bezeichnungen ?? [],
    };
  });
  return {
    ausgangsstelle: live.ausgangsstelle,
    bezeichnungAnzeige: anzeigeBezeichnung,
    ...(aufloesung && aufloesung.anzahlTreffer > 1
      ? { ausgangsTrefferzahl: aufloesung.anzahlTreffer }
      : {}),
    markierungstyp: live.typ,
    bezugstext: live.bezug.bezugstext,
    eigenerKonflikt: e.eigenerKonflikt || undefined,
    bereich: live.bezug.textstelle?.pfad.bereich,
    textpfad: live.bezug.textstelle?.pfad,
    verweistext: live.verweisinhalt?.verweistext,
    nichtamtlicherTitelGrund: titelGrund(live, aktuellesElement, aufloesung?.anzahlTreffer),
    zielKonflikte,
    schluessel: e.schluessel,
  };
}

export { verifiziereBekannteKonflikte } from './markierungskonflikteAnzeige.verifizieren';
