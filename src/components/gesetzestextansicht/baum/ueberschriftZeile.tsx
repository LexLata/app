// ueberschriftZeile.tsx
// Überschriften nutzen die Gesetzestext-Akzentfarbe, eingeklappt deren blasse Variante.
// Der Zeiger kennzeichnet das aktive Element in beiden Darstellungsmodi.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useContext, useRef, type CSSProperties } from 'react';
import type { UeberschriftDarstellung } from '@/lib/domain/gesetzTypes';
import { EinklappCtx } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import {
  MarkierungCtx,
  VerweisSuperscript,
  KommentarSuperscript,
  getaggteVerweiseAlsTextauszeichnungen,
} from '@/components/gesetzestextansicht/markierung/markierung.index';
import {
  klappKlick,
  ermittleUeberschriftFarbe,
} from '@/components/gesetzestextansicht/baum/Gesetzestextansicht.helpers';
import { SCHRIFTGROESSE_DEFAULT } from '@/lib/stil/gesetzTextDarstellung';
import {
  ermittleUeberschriftTopPad,
  ermittleUeberschriftPaddingBottom,
  berechneTitelEinzug,
  berechneZeigerMasse,
  ueberschriftTrenner,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import { TextBlatt } from '@/components/gesetzestextansicht/baum/textBlatt';
import { AbsatzListe } from './absatzBausteine';
import { gesetzTextAbsatzAbstand } from './textStile';
import { KlappChevron } from './klappChevron';
import { AktivZeiger } from '@/components/gesetzestextansicht/baum/aktivZeiger';
import { useZeigerHoehe } from '@/components/gesetzestextansicht/baum/useZeigerHoehe';

export function UeberschriftZeile({
  u,
  schrift,
  satzNeuZeile = true,
}: {
  u: UeberschriftDarstellung;
  schrift: number;
  satzNeuZeile?: boolean;
}) {
  const {
    eingeklappteUeberschriften,
    aktivesElementId,
    onUeberschriftKlick,
    trennerVorIds,
    unterArtikelIds,
    minimalistischerModus,
  } = useContext(EinklappCtx);
  const { markierungenNachXmlId } = useContext(MarkierungCtx);
  const istAktiv = aktivesElementId === u.id;
  const istEingeklappt = eingeklappteUeberschriften.has(u.id);
  const zeileRef = useRef<HTMLDivElement>(null);
  const zeigeZeiger: boolean = istAktiv;
  const zeileHoehe = useZeigerHoehe(zeileRef, zeigeZeiger);

  // Untergeordnete Überschriften (hierarchisch unter einem überschriftsartigen
  // Gliederungsartikel, z. B. Unterabschnitte in Art. 229 EGBGB) verhalten sich
  // wie Normzeilen: festes paddingTop 16, kleinere Schrift (schrift statt schrift*1.1).
  const istUntergeordnet = unterArtikelIds.has(u.id);

  const schriftFaktor = schrift / SCHRIFTGROESSE_DEFAULT;
  const topPad = ermittleUeberschriftTopPad({
    ebene: u.ebene,
    istUntergeordnet,
    schriftFaktor,
  });
  const paddingBottom = ermittleUeberschriftPaddingBottom(schriftFaktor);
  const zeigeTrenner: boolean = trennerVorIds.has(u.id);
  // Strich liegt mittig im topPad: floor(topPad/2) darüber, Rest darunter.
  const trennerOben = Math.floor(topPad / 2);
  const trennerUnten = topPad - trennerOben - 1; // -1 für die 1px border

  const farbe = ermittleUeberschriftFarbe({ istEingeklappt });

  // Zeiger-Position/-Höhe: siehe berechneZeigerMasse (schrumpft die volle
  // gemessene Zeilenhöhe auf reine Schriftbild-Höhe, siehe dortiger Kommentar).
  const ueberschriftFontSize = istUntergeordnet ? schrift : schrift * 1.1;
  const { top: zeigerTop, hoehe: zeigerHoehe } = berechneZeigerMasse(
    zeileHoehe,
    zeigeTrenner ? trennerUnten : topPad,
    10,
    ueberschriftFontSize,
    1.35,
  );

  // Nur u.titel (der beschreibende Teil, z.B. "Allgemeiner Teil") ist
  // unterstreichbar – u.bezeichnung (z.B. "Erster Abschnitt") nicht, analog
  // zur Normzahl bei NormBlock (siehe dort).
  const markierungen = markierungenNachXmlId.get(u.xmlId) ?? [];
  const trenner = ueberschriftTrenner(u.bezeichnung);

  return (
    <>
      {zeigeTrenner && (
        <div
          style={{
            borderTop: '1px solid var(--trenner-ebene)',
            marginTop: trennerOben,
            marginLeft: berechneTitelEinzug(minimalistischerModus, schrift),
          }}
        />
      )}
      <div
        ref={zeileRef}
        data-xml-id={u.xmlId}
        className="gt-klapp-zeile"
        onClick={() => klappKlick(u.id, onUeberschriftKlick)}
        style={
          {
            position: 'relative',
            paddingLeft: berechneTitelEinzug(minimalistischerModus, schrift),
            paddingTop: zeigeTrenner ? trennerUnten : topPad,
            paddingBottom,
            fontSize: istUntergeordnet ? schrift : schrift * 1.1,
            fontWeight: 700,
            lineHeight: 1.35,
            cursor: 'pointer',
            color: farbe,
            userSelect: 'text',
            // Lässt Markierungen (Unterstreichen/Normzitat/Kommentar) im
            // Titeltext (siehe textBlatt.tsx) bei zugeklapptem
            // Zustand dieselbe blasse Variante bekommen wie der Titeltext
            // selbst (--aktiv-element-blass o.ä. via `farbe` oben) – Vorbild:
            // --hyphens-Override in Gesetzestextansicht.tsx. Ohne diese Property
            // (Fallback, siehe dort) bleibt es bei --markierungsfarbe.
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
            farbe={istEingeklappt ? 'var(--aktiv-element-blass)' : 'var(--aktiv-element)'}
            schriftgroesse={schrift}
          />
        )}
        {!minimalistischerModus && <KlappChevron eingeklappt={istEingeklappt} />}
        {u.titel ? (
          <>
            <TextBlatt
              text={u.bezeichnung}
              pfad={{ typ: 'bereich', bereich: 'bezeichnung' }}
              markierungen={markierungen}
              ausgangsXmlId={u.xmlId}
              style={{}}
            />
            <TextAnzeige text={trenner} />
            <TextBlatt
              text={u.titel}
              pfad={{ typ: 'bereich', bereich: 'amtlicherTitel' }}
              markierungen={markierungen}
              ausgangsXmlId={u.xmlId}
              style={{}}
            />
            <VerweisSuperscript markierungen={markierungen} ausgangsXmlId={u.xmlId} />
            <KommentarSuperscript markierungen={markierungen} ausgangsXmlId={u.xmlId} />
          </>
        ) : (
          <>
            {/* ueberschriftVollTitel(u) gibt hier ohnehin nur u.bezeichnung
                zurück (siehe gesetzDarstellungAuswertung.ts) – direkt gerendert, damit das
                Bezeichnungs-Feld wie im u.titel-Zweig markierbar ist. */}
            <TextBlatt
              text={u.bezeichnung}
              pfad={{ typ: 'bereich', bereich: 'bezeichnung' }}
              markierungen={markierungen}
              ausgangsXmlId={u.xmlId}
              style={{}}
            />
            <VerweisSuperscript markierungen={markierungen} ausgangsXmlId={u.xmlId} />
            <KommentarSuperscript markierungen={markierungen} ausgangsXmlId={u.xmlId} />
          </>
        )}
      </div>
      {u.text && !istEingeklappt ? (
        <div
          data-nicht-markierbar
          style={{
            paddingLeft: berechneTitelEinzug(minimalistischerModus, schrift),
            paddingBlockStart: gesetzTextAbsatzAbstand(schrift),
          }}
        >
          <AbsatzListe
            absaetze={u.text.absaetze}
            zusatztexte={u.text.zusatztexte}
            schrift={schrift}
            satzNeuZeile={satzNeuZeile}
            getaggteVerweise={getaggteVerweiseAlsTextauszeichnungen(u.text)}
            ausgangsXmlId={u.xmlId}
          />
        </div>
      ) : null}
    </>
  );
}
