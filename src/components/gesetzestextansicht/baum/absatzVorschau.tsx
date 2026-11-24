// absatzVorschau.tsx
// Eigenständige Absatzvorschau ohne Navigations- oder Einklappzustand.

import {
  useTextDarstellungsModell,
  TextDarstellungsRahmen,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { AbsatzListe as AbsatzBaum } from './absatzBausteine';
import type { AbsatzListeProps } from '@/components/gesetzestextansicht/Gesetzestextansicht.types';

export function AbsatzListe(props: AbsatzListeProps) {
  const modell = useTextDarstellungsModell(props);
  return (
    <TextDarstellungsRahmen modell={modell}>
      <AbsatzBaum
        absaetze={props.absaetze}
        zusatztexte={props.zusatztexte}
        schrift={props.schrift}
        satzNeuZeile={props.satzNeuZeile}
        markierungen={props.markierungen}
        ausgangsXmlId={props.ausgangsXmlId}
      />
    </TextDarstellungsRahmen>
  );
}
