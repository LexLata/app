// useFarbwahlEinstellung.ts
//
// Gemeinsame Basis für die drei Farbwahl-Einstellungen der App
// (Gesetzestext-Akzentfarbe, Markierungsfarbe, App-Akzentfarbe – siehe
// farbpalette.ts): alle drei folgen exakt demselben Muster – ein per
// useLocalStorageState.ts persistierter Farbwahl-Wert, der bei jeder
// Änderung (inkl. initial) als data-Attribut auf <html> gespiegelt wird,
// wo index.css ihn per [data-*]-Selektor auswertet. Da es jetzt drei
// identische, echte Anwendungsfälle sind (nicht mehr nur ein einzelner),
// ist diese Extraktion gerechtfertigt (siehe Absprache) – vorher war das
// dreimal fast wortgleich dupliziert.
//
// NICHT für useFarbschema.ts geeignet, obwohl strukturell ähnlich: das hat
// zusätzliche Logik (OS-Farbschema-Beobachtung, IPC-Meldung ans native
// Menü), die hier nicht passt – siehe dortigen Kopfkommentar.

import { useEffect } from 'react';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';
import {
  type Farbwahl,
  FARBWAHL_STANDARD,
  istFarbwahl,
} from '@/lib/einstellungen/einstellungen.index';

export function useFarbwahlEinstellung(key: string, datenAttribut: string) {
  const [wert, setWert] = useLocalStorageState<Farbwahl>(key, FARBWAHL_STANDARD, {
    parse: (roh) => (istFarbwahl(roh) ? roh : FARBWAHL_STANDARD),
  });

  useEffect(() => {
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: useFarbwahlEinstellung setzt ausschließlich data-app-akzent, data-markierungsfarbe oder data-gesetzestext-akzent als CSS-Farbwahl; useFarbwahlEinstellung.test.ts prüft die drei Einstellungshelfer und festen Attribute.
    document.documentElement.setAttribute(datenAttribut, wert);
  }, [datenAttribut, wert]);

  return [wert, setWert] as const;
}
