// fliesstextBlock.tsx
// Ein Fließtextblock fortlaufender Sätze („Neue Zeile für jeden Satz“ aus):
// Satznummer hochgestellt im Fließtext, ohne Spalte und ohne hängenden Einzug.
// Jeder Satzteil (Satz oder Fortsetzung nach einer Aufzählung) bleibt ein
// eigenes TextBlatt mit seinem Pfad. Gliederung: gliedereFortlaufendeSaetze;
// Aufrufer: FortlaufendeSaetze in satzEintragBausteine.tsx.

import { Fragment } from 'react';
import type { Textauszeichnung } from '@/lib/darstellung/darstellung.index';
import type { FortlaufenderTeil } from '@/lib/domain/gesetzDarstellungAuswertung';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import { useSatzNummerStil } from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { TextBlatt } from '@/components/gesetzestextansicht/baum/textBlatt';
import { gesetzTextInhaltStil } from '@/components/gesetzestextansicht/baum/textStile';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
export type FortlaufendProps = {
  zeigeNummern: boolean;
  schrift: number;
  basisPfad: Extract<Textpfad, { typ: 'normtext' }>;
  satzFeld: 'satz' | 'satzInEintrag';
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[] | undefined;
  ausgangsXmlId?: string | undefined;
};

export function FliesstextBlock({
  teile,
  kontext: props,
}: {
  teile: FortlaufenderTeil[];
  kontext: FortlaufendProps;
}) {
  const satzNummerStil = useSatzNummerStil();
  return (
    <div style={gesetzTextInhaltStil(props.schrift)}>
      {teile.map(({ art, satz, nummer }, teilIdx) => (
        <Fragment key={`${satz.id}-${art}`}>
          {teilIdx > 0 ? ' ' : null}
          {art === 'satz' && props.zeigeNummern ? (
            // Gesetzestext-Feinabstand nach der Satznummer-Hochstellung –
            // siehe Kopfkommentar von absatzBausteine.tsx.
            // eslint-disable-next-line lexlata/keine-unskalierten-px -- Fester 1-Pixel-Feinabstand nach der hochgestellten Satznummer innerhalb des Gesetzestextes.
            <sup style={{ ...satzNummerStil(props.schrift), marginRight: 1 }}>
              <TextAnzeige text={nummer} />
            </sup>
          ) : null}
          {art === 'fortsetzung' || satz.text ? (
            <TextBlatt
              text={art === 'fortsetzung' ? (satz.fortsetzung ?? '') : satz.text}
              pfad={{ ...props.basisPfad, [props.satzFeld]: satz.zahl }}
              markierungen={props.markierungen}
              getaggteVerweise={props.getaggteVerweise}
              // Fortsetzung: gleiche Versatz-Formel wie bei SatzZeile.
              versatz={art === 'fortsetzung' ? satz.text.length : undefined}
              ausgangsXmlId={props.ausgangsXmlId}
              style={{}}
            />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
