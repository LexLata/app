// satzEintragBausteine.tsx
// Satz- und Eintrag-Ebene der Norminhalt-Render-Bausteine: SaetzeListe,
// SatzZeile, EintragListe und EintragZeile. Beide Ebenen sind bewusst in
// einer Datei zusammengefasst, weil sie sich gegenseitig referenzieren:
// SatzZeile rendert bei satz.eintraege eine EintragListe (Aufzählung
// innerhalb eines Satzes), EintragZeile rendert bei eintrag.saetze eine
// SaetzeListe (Sätze innerhalb eines Aufzählungseintrags). Eine Aufteilung
// auf zwei Dateien würde einen zyklischen Import zwischen ihnen erzeugen.
//
// Nutzt TextBlatt aus textBlatt.tsx als Blatt-Rendering-
// Primitiv; SaetzeListe wird außerdem von der Absatz-Ebene
// (absatzBausteine.tsx: AbsatzBlock, UnterabsatzListe)
// verwendet.
//
// WICHTIG: Ursprüngliche UTF-16-Längen als versatz und wiederholungsIndex
// sind die maßgebliche Referenz für das
// Rückwärts-Gegenstück textpfad.rueckwaerts.ts (textAnTextpfad/
// textAusBlatt, findeMitWiederholung – einzige Verwendung: Markierungskonflikt-
// Prüfung), das dieselbe Zählweise treffen MUSS. Änderungen an der
// Zusammensetzung/Trimm-Logik hier ohne Abgleich dort führen zu falsch
// (nicht) erkannten Markierungskonflikten. (normTextLaenge in gesetzDarstellungAuswertung.ts
// ist NICHT Teil dieser Invarianten-Gruppe – zählt bewusst rohen Text ohne
// Anzeigeschutz, siehe dortiger Kommentar.)

import type { Textauszeichnung } from '@/lib/darstellung/darstellung.index';
import type { ReactElement } from 'react';
import {
  gliedereFortlaufendeSaetze,
  type FortlaufenderBlock,
} from '@/lib/domain/gesetzDarstellungAuswertung';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import {
  useSatzNummerStil,
  useTextMessung,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import {
  ZEIGER_FONT_METRIK_FAKTOR,
  ZEIGER_OBEN_ZUSATZ_EM,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import { TextBlatt } from '@/components/gesetzestextansicht/baum/textBlatt';
import {
  FliesstextBlock,
  type FortlaufendProps,
} from '@/components/gesetzestextansicht/baum/fliesstextBlock';
import {
  gesetzTextInhaltStil,
  gesetzTextListenStil,
} from '@/components/gesetzestextansicht/baum/textStile';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import type {
  SatzDarstellung,
  ListenEintragDarstellung,
  TextpfadEintrag,
} from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';

// ---------------------------------------------------------------------------
// Wiederholungs-Index
// ---------------------------------------------------------------------------

// 0-basierter Index von eintraege[index] unter allen Geschwistern mit
// IDENTISCHER bezeichnung (siehe TextpfadEintrag.wiederholung in
// textpfad.ts) – nötig für unnummerierte Listen (buchstabe="-"),
// bei denen sonst kein Geschwister von einem anderen unterscheidbar wäre.
// Rückwärts-Gegenstück (gesuchte Wiederholung -> Eintrag statt Index ->
// Wiederholung): findeMitWiederholung in textpfad.rueckwaerts.ts –
// MUSS dieselbe Zählweise verwenden (siehe dortiger Kommentar).
function wiederholungsIndex(eintraege: { bezeichnung: string }[], index: number): number {
  // Aufrufer-Vertrag: index kommt an beiden Aufrufstellen unten aus
  // eintraege.map((_, idx) => ...), ist also stets < eintraege.length.
  const bezeichnung = eintraege[index]!.bezeichnung;
  let anzahl = 0;
  for (let i = 0; i < index; i++) {
    // i < index < eintraege.length (s.o.) – Zugriff daher sicher.
    if (eintraege[i]!.bezeichnung === bezeichnung) anzahl++;
  }
  return anzahl;
}

// ---------------------------------------------------------------------------
// Sätze-Liste
// ---------------------------------------------------------------------------

export function SaetzeListe({
  saetze,
  satzNrBreite,
  schrift,
  satzNeuZeile,
  basisPfad,
  satzFeld,
  markierungen,
  getaggteVerweise,
  ausgangsXmlId,
}: {
  saetze: SatzDarstellung[];
  satzNrBreite: number;
  schrift: number;
  satzNeuZeile: boolean;
  /** Feste Pfad-Anteile (absatz, ggf. nummer/litera wenn innerhalb eines
   *  Aufzählungseintrags) – der jeweilige satz.zahl wird darüber hinaus in
   *  satzFeld eingetragen. */
  basisPfad: Extract<Textpfad, { typ: 'normtext' }>;
  /** 'satz' = äußerer Satz (Standardfall), 'satzInEintrag' = Satz innerhalb
   *  eines Aufzählungseintrags (eintrag.saetze) – siehe Textpfad. */
  satzFeld: 'satz' | 'satzInEintrag';
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  ausgangsXmlId?: string;
}) {
  const zeigeNummern: boolean = saetze.length > 1;

  if (!satzNeuZeile)
    return (
      <FortlaufendeSaetze
        saetze={saetze}
        zeigeNummern={zeigeNummern}
        schrift={schrift}
        basisPfad={basisPfad}
        satzFeld={satzFeld}
        markierungen={markierungen}
        getaggteVerweise={getaggteVerweise}
        ausgangsXmlId={ausgangsXmlId}
      />
    );

  return (
    <div style={gesetzTextListenStil}>
      {saetze.map((satz, idx) => (
        <SatzZeile
          key={satz.id}
          satz={satz}
          nummer={idx + 1}
          zeigeNummer={zeigeNummern}
          satzNrBreite={satzNrBreite}
          schrift={schrift}
          basisPfad={basisPfad}
          satzFeld={satzFeld}
          markierungen={markierungen}
          getaggteVerweise={getaggteVerweise}
          ausgangsXmlId={ausgangsXmlId}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Satz-Zeile
// ---------------------------------------------------------------------------

function SatzZeile({
  satz,
  nummer,
  zeigeNummer,
  satzNrBreite,
  schrift,
  basisPfad,
  satzFeld,
  markierungen,
  getaggteVerweise,
  ausgangsXmlId,
}: {
  satz: SatzDarstellung;
  nummer: number;
  zeigeNummer: boolean;
  satzNrBreite: number;
  schrift: number;
  basisPfad: Extract<Textpfad, { typ: 'normtext' }>;
  satzFeld: 'satz' | 'satzInEintrag';
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  ausgangsXmlId?: string;
}) {
  const eigenerPfad: Extract<Textpfad, { typ: 'normtext' }> = {
    ...basisPfad,
    [satzFeld]: satz.zahl,
  };
  // Verschachtelte Aufzählung (satz.eintraege) nur auf der obersten Ebene
  // (satzFeld === 'satz') unterstreichbar: eine weitere Verschachtelungsebene
  // (Satz innerhalb eines Eintrags, der selbst wieder eine Aufzählung enthält)
  // ist in der textstelle nicht vorgesehen – siehe Einschränkung in der
  // Datei-Kopfzeile von textBlatt.tsx.
  const eintragUnterstreichungen = satzFeld === 'satz' ? markierungen : [];
  const satzNummerStil = useSatzNummerStil();

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      {zeigeNummer && (
        <sup
          style={{
            ...satzNummerStil(schrift),
            minWidth: satzNrBreite,
            flexShrink: 0,
            // Ersetzt die ursprünglich feste "schrift * 0.35" (kalibriert
            // ausschließlich für den damals einzigen Zeilenabstand 1.6).
            // Wiederverwendet dieselbe Formel wie berechneZeigerMasse()
            // (virtualizer.ts) für den blauen AktivZeiger:
            // halbesLeading = Leerraum, den line-height oberhalb der reinen
            // Schriftbild-Höhe erzeugt, plus ZEIGER_OBEN_ZUSATZ_EM als
            // kleine, empirisch justierte Zusatzkorrektur. Bei
            // zeilenabstand=1.6 ergibt das ≈0.36 × schrift – nahezu identisch
            // zum alten fixen Wert 0.35, bestätigt also die Formel. Der
            // vorherige Versuch (linear mit --zeilen-abstand skaliert) war
            // falsch: bei zeilenabstand=1 lieferte er noch ~0.22 × schrift
            // statt der hier korrekten ~0.06 × schrift, daher stand die
            // Satznummer zu tief statt wie ein stabiles Superscript.
            marginTop: `calc((var(--zeilen-abstand) - ${ZEIGER_FONT_METRIK_FAKTOR}) * ${schrift / 2}px + ${schrift * ZEIGER_OBEN_ZUSATZ_EM}px)`,
            lineHeight: 1,
          }}
        >
          <TextAnzeige text={nummer} />
        </sup>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {satz.text && (
          <TextBlatt
            text={satz.text}
            pfad={eigenerPfad}
            markierungen={markierungen}
            getaggteVerweise={getaggteVerweise}
            ausgangsXmlId={ausgangsXmlId}
            style={gesetzTextInhaltStil(schrift)}
          />
        )}
        {satz.eintraege.length > 0 && (
          <EintragListe
            eintraege={satz.eintraege}
            schrift={schrift}
            einzug={0}
            satzNeuZeile={true}
            basisPfad={eigenerPfad}
            markierungen={eintragUnterstreichungen}
            getaggteVerweise={getaggteVerweise}
            ausgangsXmlId={ausgangsXmlId}
          />
        )}
        {satz.fortsetzung && (
          <TextBlatt
            text={satz.fortsetzung}
            pfad={eigenerPfad}
            markierungen={markierungen}
            getaggteVerweise={getaggteVerweise}
            // versatz = ursprüngliche UTF-16-Länge des Haupttexts. Der Anzeigeschutz
            // ersetzt Zeichen ausschließlich 1:1; Haupttext
            // und Fortsetzung werden zu EINEM durchgehenden Zeichen-Bereich
            // zusammengesetzt. MUSS exakt dieselbe Zusammensetzung sein wie
            // in textAusBlatt() (textpfad.rueckwaerts.ts) – sonst
            // zählt textAnTextpfad() an anderen Positionen als hier gerendert
            // wird (siehe dortiger Kommentar zur Markierungskonflikt-Prüfung).
            versatz={(satz.text ?? '').length}
            ausgangsXmlId={ausgangsXmlId}
            style={gesetzTextInhaltStil(schrift)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eintrag-Liste
// ---------------------------------------------------------------------------

function EintragListe({
  eintraege,
  schrift,
  einzug,
  satzNeuZeile,
  basisPfad,
  markierungen,
  getaggteVerweise,
  ausgangsXmlId,
}: {
  eintraege: ListenEintragDarstellung[];
  schrift: number;
  einzug: number;
  /** Satzanordnung für Sätze innerhalb der Einträge (eintrag.saetze). */
  satzNeuZeile: boolean;
  /** Vollständiger Pfad des umgebenden Satzes oder Listeneintrags. */
  basisPfad: Extract<Textpfad, { typ: 'normtext' }>;
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  ausgangsXmlId?: string;
}) {
  const { breiteSpalteFuerBezeichnungen } = useTextMessung();
  const nrBreite = breiteSpalteFuerBezeichnungen(
    eintraege.map((e) => e.bezeichnung),
    schrift,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {eintraege.map((eintrag, idx) => (
        <EintragZeile
          key={eintrag.id}
          eintrag={eintrag}
          schrift={schrift}
          einzug={einzug}
          satzNeuZeile={satzNeuZeile}
          nrBreite={nrBreite}
          basisPfad={basisPfad}
          wiederholung={wiederholungsIndex(eintraege, idx)}
          markierungen={markierungen}
          getaggteVerweise={getaggteVerweise}
          ausgangsXmlId={ausgangsXmlId}
        />
      ))}
    </div>
  );
}

function EintragZeile({
  eintrag,
  schrift,
  einzug,
  satzNeuZeile,
  nrBreite,
  basisPfad,
  wiederholung,
  markierungen,
  getaggteVerweise,
  ausgangsXmlId,
}: {
  eintrag: ListenEintragDarstellung;
  schrift: number;
  einzug: number;
  satzNeuZeile: boolean;
  nrBreite: number;
  basisPfad: Extract<Textpfad, { typ: 'normtext' }>;
  /** Siehe wiederholungsIndex oben – 0 = einziges/erstes Vorkommen dieser
   *  bezeichnung unter den Geschwistern dieses Eintrags. */
  wiederholung: number;
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  ausgangsXmlId?: string;
}) {
  const { breiteSpalteFuerBezeichnungen, satzNummerBreite } = useTextMessung();
  const subBreite = breiteSpalteFuerBezeichnungen(
    eintrag.untereintraege.map((e) => e.bezeichnung),
    schrift,
  );

  // Eigener Schritt: eintrag.ebene kommt vom Parser aus dem ECHTEN XML-Tag
  // (<nummer>/<litera>), nicht aus der Verschachtelungstiefe geraten (siehe
  // gesetzesXMLParser.ts::parseListenEintrag) – dadurch bleibt jede
  // tatsächliche Verschachtelungsreihenfolge (auch litera→nummer→nummer o.ä.)
  // korrekt. An die bereits akkumulierte Kette angehängt (nicht ersetzt) –
  // das ist der eigentliche Fix: frühere Ebenen gehen nicht mehr verloren.
  const eigenerSchritt: TextpfadEintrag = {
    ebene: eintrag.ebene,
    bezeichnung: eintrag.bezeichnung,
    wiederholung: wiederholung > 0 ? wiederholung : undefined,
  };
  const eigeneEintraege: [TextpfadEintrag, ...TextpfadEintrag[]] = basisPfad.eintraege
    ? [basisPfad.eintraege[0], ...basisPfad.eintraege.slice(1), eigenerSchritt]
    : [eigenerSchritt];
  const eigenerPfad: Extract<Textpfad, { typ: 'normtext' }> = {
    ...basisPfad,
    eintraege: eigeneEintraege,
  };

  const untereintraege: ReactElement[] = eintrag.untereintraege.map((sub, subIdx) => (
    <EintragZeile
      key={sub.id}
      eintrag={sub}
      schrift={schrift}
      einzug={einzug + nrBreite}
      satzNeuZeile={satzNeuZeile}
      nrBreite={subBreite}
      basisPfad={eigenerPfad}
      wiederholung={wiederholungsIndex(eintrag.untereintraege, subIdx)}
      markierungen={markierungen}
      getaggteVerweise={getaggteVerweise}
      ausgangsXmlId={ausgangsXmlId}
    />
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {einzug > 0 && <span style={{ minWidth: einzug, flexShrink: 0 }} />}
        <span
          style={{
            fontSize: schrift,
            minWidth: nrBreite,
            flexShrink: 0,
            lineHeight: 'var(--zeilen-abstand)',
          }}
        >
          <TextAnzeige text={eintrag.bezeichnung} />
        </span>
        {eintrag.saetze && eintrag.saetze.length > 0 ? (
          // Sätze innerhalb dieses Aufzählungseintrags: satzFeld
          // 'satzInEintrag' statt 'satz', damit z.B. "Nr. 1 Satz 2" von einem
          // äußeren Satz, der Nr. 1 enthält, unterscheidbar bleibt (siehe
          // Textpfad.satzInEintrag).
          <SaetzeListe
            saetze={eintrag.saetze}
            satzNrBreite={satzNummerBreite(eintrag.saetze.length, schrift)}
            schrift={schrift}
            satzNeuZeile={satzNeuZeile}
            basisPfad={eigenerPfad}
            satzFeld="satzInEintrag"
            markierungen={markierungen}
            getaggteVerweise={getaggteVerweise}
            ausgangsXmlId={ausgangsXmlId}
          />
        ) : eintrag.text ? (
          <TextBlatt
            text={eintrag.text}
            pfad={eigenerPfad}
            markierungen={markierungen}
            getaggteVerweise={getaggteVerweise}
            ausgangsXmlId={ausgangsXmlId}
            style={gesetzTextInhaltStil(schrift)}
          />
        ) : null}
      </div>
      {untereintraege}
      {eintrag.fortsetzung && (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {einzug > 0 && <span style={{ minWidth: einzug, flexShrink: 0 }} />}
          <span style={{ minWidth: nrBreite, flexShrink: 0 }} />
          <TextBlatt
            text={eintrag.fortsetzung}
            pfad={eigenerPfad}
            markierungen={markierungen}
            getaggteVerweise={getaggteVerweise}
            // Gleiche Versatz-Formel wie bei SatzZeile oben – siehe dortiger
            // Kommentar zum Gegenstück textAusBlatt() in
            // textpfad.rueckwaerts.ts.
            versatz={(eintrag.text ?? '').length}
            ausgangsXmlId={ausgangsXmlId}
            style={gesetzTextInhaltStil(schrift)}
          />
        </div>
      )}
    </div>
  );
}

/** „Neue Zeile für jeden Satz“ aus: Satznummer hochgestellt im Fließtext, Aufzählungen
 *  eingerückt; Gegenstück zeilenFuerSaetze in virtualizer.ts. */
function FortlaufendeSaetze({
  saetze,
  ...props
}: FortlaufendProps & { saetze: SatzDarstellung[] }) {
  const bloecke: FortlaufenderBlock[] = gliedereFortlaufendeSaetze(saetze);
  return (
    <div style={gesetzTextListenStil}>
      {bloecke.map((block, idx) =>
        block.art === 'aufzaehlung' ? (
          <EintragListe
            key={`${block.satz.id}-eintraege`}
            eintraege={block.satz.eintraege}
            schrift={props.schrift}
            einzug={0}
            satzNeuZeile={false}
            basisPfad={{ ...props.basisPfad, [props.satzFeld]: block.satz.zahl }}
            // Wie SatzZeile: Unterstreichung der Aufzählung nur auf oberster Ebene.
            markierungen={props.satzFeld === 'satz' ? props.markierungen : []}
            getaggteVerweise={props.getaggteVerweise}
            ausgangsXmlId={props.ausgangsXmlId}
          />
        ) : (
          <FliesstextBlock key={`text-${idx}`} teile={block.teile} kontext={props} />
        ),
      )}
    </div>
  );
}
