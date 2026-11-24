// normBlock.tsx
// Rendert sowohl §-Normen als auch Gliederungsartikel (z.B. Art. 1 EGBGB) –
// beide sind typ: 'norm' (siehe types.ts), strukturell identisch. Die
// Der ausdrückliche Weggefallen-Status gilt dadurch auch für Artikel ohne Text.
// Ausgelagert aus Gesetzestextansicht.bausteine.tsx.
//
// NormBlock selbst bündelt nur Context-Zugriff + abgeleitete Werte; die
// beiden sich gegenseitig ausschließenden Render-Zweige (Kurzzeile/normal)
// stecken in eigenen Unterkomponenten, damit deren JSX-Verzweigungen nicht
// zur Cognitive Complexity von NormBlock beitragen. Die Farb-Logik selbst
// steckt als reine Funktion in Gesetzestextansicht.helpers.ts (dort auch getestet).

import type { Textauszeichnung } from '@/lib/darstellung/darstellung.index';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useContext, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import type { AbsatzDarstellung, NormDarstellung } from '@/lib/domain/gesetzTypes';
import { normKurzzeilenTitel } from '@/lib/domain/gesetzDarstellungAuswertung';
import { EinklappCtx } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import {
  MarkierungCtx,
  VerweisSuperscript,
  KommentarSuperscript,
  getaggteVerweiseAlsTextauszeichnungen,
} from '@/components/gesetzestextansicht/markierung/markierung.index';
import {
  klappKlick,
  normTextKlick,
  ermittleNormFarbe,
  ermittleNormFarbeWeggefallen,
} from '@/components/gesetzestextansicht/baum/Gesetzestextansicht.helpers';
import {
  berechneTitelEinzug,
  berechneZeigerMasse,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import { TextBlatt } from '@/components/gesetzestextansicht/baum/textBlatt';
import { AbsatzListe } from '@/components/gesetzestextansicht/baum/absatzBausteine';
import { gesetzTextAbsatzAbstand } from './textStile';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import { KlappChevron } from './klappChevron';
import { AktivZeiger } from '@/components/gesetzestextansicht/baum/aktivZeiger';
import { useZeigerHoehe } from '@/components/gesetzestextansicht/baum/useZeigerHoehe';

// Von beiden Zeilen-Varianten (Kurzzeile/normal) benötigte Werte.
interface NormZeileGemeinsam {
  norm: NormDarstellung;
  schrift: number;
  titelEinzug: number;
  zeigeTrennerNorm: boolean;
  normPadUnten: number;
  istEingeklappt: boolean;
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  onKlick: () => void;
  zeigeZeiger: boolean;
  zeigerTop: number;
  zeigerFarbe: string;
}

function NormBlockKurzzeile({
  gemeinsam,
  kurzzeilenTitel,
  istFaltbar,
  minimalistischerModus,
  farbe,
  zeigerHoehe,
  zeileRef,
}: {
  gemeinsam: NormZeileGemeinsam;
  kurzzeilenTitel: string;
  istFaltbar: boolean;
  minimalistischerModus: boolean;
  farbe: string;
  zeigerHoehe: number;
  zeileRef: RefObject<HTMLDivElement | null>;
}) {
  const {
    norm,
    schrift,
    titelEinzug,
    zeigeTrennerNorm,
    normPadUnten,
    istEingeklappt,
    markierungen,
    getaggteVerweise,
    onKlick,
    zeigeZeiger,
    zeigerTop,
    zeigerFarbe,
  }: NormZeileGemeinsam = gemeinsam;
  return (
    <div
      ref={zeileRef}
      className="gt-klapp-zeile"
      onClick={istFaltbar ? onKlick : undefined}
      style={
        {
          position: 'relative',
          paddingLeft: titelEinzug,
          paddingTop: zeigeTrennerNorm ? normPadUnten : 16,
          lineHeight: 1.3,
          color: farbe,
          cursor: istFaltbar ? 'pointer' : undefined,
          userSelect: 'text',
          // Siehe Kommentar in ueberschriftZeile.tsx: lässt
          // Markierungen im Titeltext bei zugeklapptem Zustand die blasse
          // Variante bekommen.
          ['--markierungsfarbe-aktuell' as string]: istEingeklappt
            ? 'var(--markierungsfarbe-blass)'
            : 'var(--markierungsfarbe)',
        } as CSSProperties
      }
    >
      {zeigeZeiger && (
        <AktivZeiger
          top={zeigerTop}
          hoehe={zeigerHoehe}
          farbe={zeigerFarbe}
          schriftgroesse={schrift}
        />
      )}
      {!minimalistischerModus && istFaltbar && <KlappChevron eingeklappt={istEingeklappt} />}
      <TextBlatt
        text={norm.bezeichnung}
        pfad={{ typ: 'bereich', bereich: 'bezeichnung' }}
        markierungen={markierungen}
        getaggteVerweise={getaggteVerweise}
        ausgangsXmlId={norm.xmlId}
        // Gesetzestext-Feinabstand (Wortlücke zwischen Bezeichnung und
        // Titel), analog zu den übrigen gap/margin-Feinwerten in diesem
        // Ordner – siehe Kopfkommentar von absatzBausteine.tsx.
        // eslint-disable-next-line lexlata/keine-unskalierten-px -- Feste 6-Pixel-Wortlücke trennt Normbezeichnung und Titel innerhalb des Gesetzestextes.
        style={{ fontSize: schrift, fontWeight: 700, whiteSpace: 'nowrap', marginRight: 6 }}
      />
      {/* Ein vom Quelltitel abweichender Kurzzeilentitel (kein Text veröffentlicht)
          ist kein Normtext und daher nicht markierbar. */}
      {kurzzeilenTitel === (norm.titel ?? '') ? (
        <TextBlatt
          text={kurzzeilenTitel}
          pfad={{ typ: 'bereich', bereich: 'amtlicherTitel' }}
          markierungen={markierungen}
          getaggteVerweise={getaggteVerweise}
          ausgangsXmlId={norm.xmlId}
          style={{ fontSize: schrift, fontStyle: 'italic' }}
        />
      ) : (
        <TextAnzeige text={kurzzeilenTitel} style={{ fontSize: schrift, fontStyle: 'italic' }} />
      )}
      <VerweisSuperscript markierungen={markierungen} ausgangsXmlId={norm.xmlId} />
      <KommentarSuperscript markierungen={markierungen} ausgangsXmlId={norm.xmlId} />
    </div>
  );
}

function NormBlockNormaleZeile({
  gemeinsam,
  minimalistischerModus,
  farbe,
  zeigerHoehe,
  zeileRef,
  satzNeuZeile,
  onTextKlick,
  absaetze,
}: {
  gemeinsam: NormZeileGemeinsam;
  minimalistischerModus: boolean;
  farbe: string | undefined;
  zeigerHoehe: number;
  zeileRef: RefObject<HTMLDivElement | null>;
  satzNeuZeile: boolean;
  onTextKlick: () => void;
  absaetze: AbsatzDarstellung[];
}) {
  const {
    norm,
    schrift,
    titelEinzug,
    zeigeTrennerNorm,
    normPadUnten,
    istEingeklappt,
    markierungen,
    getaggteVerweise,
    onKlick,
    zeigeZeiger,
    zeigerTop,
    zeigerFarbe,
  }: NormZeileGemeinsam = gemeinsam;
  return (
    <>
      <div
        ref={zeileRef}
        className="gt-klapp-zeile"
        onClick={onKlick}
        style={
          {
            position: 'relative',
            paddingLeft: titelEinzug,
            paddingTop: zeigeTrennerNorm ? normPadUnten : 16,
            fontSize: schrift,
            lineHeight: 1.3,
            fontWeight: 700,
            cursor: 'pointer',
            color: farbe,
            userSelect: 'text',
            // Siehe Kommentar in ueberschriftZeile.tsx: lässt
            // Markierungen im Titeltext bei zugeklapptem Zustand die blasse
            // Variante bekommen.
            ['--markierungsfarbe-aktuell' as string]: istEingeklappt
              ? 'var(--markierungsfarbe-blass)'
              : 'var(--markierungsfarbe)',
          } as CSSProperties
        }
      >
        {/* istFaltbar ist hier immer true (nur der Kurzzeilen-Zweig
            kann istFaltbar=false haben, s. NormBlockKurzzeile). */}
        {zeigeZeiger && (
          <AktivZeiger
            top={zeigerTop}
            hoehe={zeigerHoehe}
            farbe={zeigerFarbe}
            schriftgroesse={schrift}
          />
        )}
        {!minimalistischerModus && <KlappChevron eingeklappt={istEingeklappt} />}
        {/* whiteSpace:nowrap: Die Normzahl (bezeichnung) darf niemals
            umbrechen – sie bleibt immer einzeilig. Der Titel bricht
            dahinter um und beginnt jede Folgezeile bündig mit dem Anfang
            des Titels (paddingLeft am Zeilen-Div), nicht mit dem
            Zeilenanfang. */}
        <TextBlatt
          text={norm.bezeichnung}
          pfad={{ typ: 'bereich', bereich: 'bezeichnung' }}
          markierungen={markierungen}
          getaggteVerweise={getaggteVerweise}
          ausgangsXmlId={norm.xmlId}
          // Siehe Kommentar bei der analogen Stelle oben (Wortlücke
          // Bezeichnung/Titel) – gleicher Gesetzestext-Feinabstand.
          // eslint-disable-next-line lexlata/keine-unskalierten-px -- Feste 6-Pixel-Wortlücke trennt Normbezeichnung und Titel innerhalb des Gesetzestextes.
          style={{ whiteSpace: 'nowrap', marginRight: 6 }}
        />
        {!!norm.titel && (
          <span>
            {!!norm.titelIstNichtamtlich && <TextAnzeige text="[" />}
            <TextBlatt
              text={norm.titel}
              pfad={{
                typ: 'bereich',
                bereich: norm.titelIstNichtamtlich ? 'nichtamtlicherTitel' : 'amtlicherTitel',
              }}
              markierungen={markierungen}
              getaggteVerweise={getaggteVerweise}
              ausgangsXmlId={norm.xmlId}
              style={{}}
            />
            {!!norm.titelIstNichtamtlich && <TextAnzeige text="]" />}
          </span>
        )}
        <VerweisSuperscript markierungen={markierungen} ausgangsXmlId={norm.xmlId} />
        <KommentarSuperscript markierungen={markierungen} ausgangsXmlId={norm.xmlId} />
      </div>
      {!istEingeklappt && (
        <div
          data-scroll-koerper
          onClick={onTextKlick}
          style={{
            paddingLeft: titelEinzug,
            paddingBlockStart: absaetze.length > 0 ? gesetzTextAbsatzAbstand(schrift) : undefined,
          }}
        >
          <AbsatzListe
            absaetze={absaetze}
            zusatztexte={norm.zusatztexte}
            schrift={schrift}
            satzNeuZeile={satzNeuZeile}
            markierungen={markierungen}
            getaggteVerweise={getaggteVerweise}
            ausgangsXmlId={norm.xmlId}
          />
        </div>
      )}
    </>
  );
}

// Exportiert für VerlaufOverlay.tsx: dort wird derselbe Baustein zum
// Aufklappen einzelner Verlaufseinträge wiederverwendet, mit einem lokalen,
// isolierten EinklappCtx-Provider (eigenes, kleines Einklapp-Set statt des
// App-weiten Einklappzustands).
export function NormBlock({
  norm,
  schrift,
  satzNeuZeile,
}: {
  norm: NormDarstellung;
  schrift: number;
  satzNeuZeile: boolean;
}) {
  const {
    eingeklappteNormen,
    aktivesElementId,
    onNormKlick,
    onNormTextKlick,
    trennerVorIds,
    minimalistischerModus,
  } = useContext(EinklappCtx);
  const { markierungenNachXmlId } = useContext(MarkierungCtx);
  const istEingeklappt = eingeklappteNormen.has(norm.id);
  const istAktiv = aktivesElementId === norm.id;
  const zeigeZeiger: boolean = istAktiv;
  const kurzzeileRef = useRef<HTMLDivElement>(null);
  const normalZeileRef = useRef<HTMLDivElement>(null);
  const kurzzeileHoehe = useZeigerHoehe(kurzzeileRef, zeigeZeiger);
  const normalZeileHoehe = useZeigerHoehe(normalZeileRef, zeigeZeiger);
  const markierungen = markierungenNachXmlId.get(norm.xmlId) ?? [];
  const getaggteVerweise = useMemo(() => getaggteVerweiseAlsTextauszeichnungen(norm), [norm]);

  const kurzzeilenTitel = normKurzzeilenTitel(norm);

  // istFaltbar: nur für die Klickbarkeit (Einklappen). Ein Gliederungsartikel
  // ist immer faltbar, sobald gliederungsEbene gesetzt ist – unabhängig davon,
  // ob §§ darunter stehen.
  const istFaltbar = norm.art === 'gliederungsartikel';

  // Der Parser legt fest, welche Gliederungsartikel §§ unter sich haben.
  const ueberschriftartig = norm.art === 'gliederungsartikel' && norm.ueberschriftartig;

  // Trennstrich: nur für überschriftsartige Normen (Gliederungsartikel mit §§).
  // paddingTop der Norm beträgt 16 → Strich bei 8px darüber, 7px darunter.
  const zeigeTrennerNorm: boolean = ueberschriftartig && trennerVorIds.has(norm.id);
  const normPadOben = 8;
  const normPadUnten = 7; // 16 - 8 - 1 (border)

  // Farb-Logik: siehe ermittleNormFarbe/-Weggefallen in Gesetzestextansicht.helpers.ts
  const farbParams = { ueberschriftartig, istEingeklappt };
  const farbe = ermittleNormFarbe(farbParams);
  const farbeWeggefallen = ermittleNormFarbeWeggefallen(farbParams);

  // Zeiger-Farbe ist für beide Zeilen-Varianten identisch.
  const zeigerFarbe = istEingeklappt ? 'var(--aktiv-element-blass)' : 'var(--aktiv-element)';

  // Zeiger-Position/-Höhe: siehe berechneZeigerMasse (schrumpft die volle
  // gemessene Zeilenhöhe auf reine Schriftbild-Höhe, siehe dortiger Kommentar).
  const normZeigerTopPad = zeigeTrennerNorm ? normPadUnten : 16;
  const { top: zeigerTop, hoehe: kurzzeileZeigerHoehe } = berechneZeigerMasse(
    kurzzeileHoehe,
    normZeigerTopPad,
    0,
    schrift,
    1.3,
  );
  const { hoehe: normalZeigerHoehe } = berechneZeigerMasse(
    normalZeileHoehe,
    normZeigerTopPad,
    0,
    schrift,
    1.3,
  );

  const titelEinzug = berechneTitelEinzug(minimalistischerModus, schrift);

  const gemeinsam: NormZeileGemeinsam = {
    norm,
    schrift,
    titelEinzug,
    zeigeTrennerNorm,
    normPadUnten,
    istEingeklappt,
    markierungen,
    getaggteVerweise,
    onKlick: () => klappKlick(norm.id, onNormKlick),
    zeigeZeiger,
    zeigerTop,
    zeigerFarbe,
  };

  return (
    // Fixer Zeilenabstand zwischen Normen (analog zu den TOP_PAD-Werten in
    // Gesetzestextansicht.helpers.ts) – bewusst unabhängig von schrift/uiFaktor.
    // eslint-disable-next-line lexlata/keine-unskalierten-px -- Fester 4-Pixel-Abstand trennt aufeinanderfolgende Normblöcke unabhängig von der UI-Skalierung.
    <div data-xml-id={norm.xmlId} style={{ paddingBottom: 4 }}>
      {zeigeTrennerNorm && (
        <div
          style={{
            borderTop: '1px solid var(--trenner-ebene)',
            marginTop: normPadOben,
            marginLeft: titelEinzug,
          }}
        />
      )}
      {kurzzeilenTitel !== undefined ? (
        <NormBlockKurzzeile
          gemeinsam={gemeinsam}
          kurzzeilenTitel={kurzzeilenTitel}
          istFaltbar={istFaltbar}
          minimalistischerModus={minimalistischerModus}
          farbe={farbeWeggefallen}
          zeigerHoehe={kurzzeileZeigerHoehe}
          zeileRef={kurzzeileRef}
        />
      ) : (
        <NormBlockNormaleZeile
          gemeinsam={gemeinsam}
          minimalistischerModus={minimalistischerModus}
          farbe={farbe}
          zeigerHoehe={normalZeigerHoehe}
          zeileRef={normalZeileRef}
          satzNeuZeile={satzNeuZeile}
          onTextKlick={() => normTextKlick(norm.id, onNormTextKlick)}
          absaetze={norm.absaetze}
        />
      )}
    </div>
  );
}
