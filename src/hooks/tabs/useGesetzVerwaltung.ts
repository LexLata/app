// Verwaltet Kurzbefehle und Dateiaktionen; Gesetze liegen ausschließlich im Fensterbestand.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { referenzVon, gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { exportiereGesetz } from './gesetzExportieren';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GesetzLoeschErgebnis } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  bereiteSuchverzeichnisVor,
  pruefeGesetzdateienNachImport,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { entferneAktivierung } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';
import {
  type Gesetzeskurzbefehl,
  ladeAlleGesetzeskurzbefehle,
  loescheGesetzeskurzbefehl,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { hoereGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';

interface UseGesetzVerwaltungParams {
  gesetzeTabsSchliessen: (referenzen: Gesetzesreferenz[]) => void;
}
export function useGesetzVerwaltung({ gesetzeTabsSchliessen }: UseGesetzVerwaltungParams) {
  const lebensdauer = useRef({ aktiv: true });
  const [gesetzeskurzbefehle, setGesetzeskurzbefehle] = useState<
    Record<string, Gesetzeskurzbefehl>
  >({});
  const aufLoeschung = useEffectEvent((referenzen: Gesetzesreferenz[]) =>
    gesetzeTabsSchliessen(referenzen),
  );
  useEffect(() => {
    const ablauf = { aktiv: true };
    lebensdauer.current = ablauf;
    void handleGesetzeskurzbefehleGeaendert();
    const anmeldungen = [
      hoereGlobal('gesetze-geloescht', (event) => aufLoeschung(event.payload ?? [])),
      hoereGlobal('gesetzeskurzbefehle-geaendert', () => {
        void handleGesetzeskurzbefehleGeaendert();
      }),
    ];
    for (const anmeldung of anmeldungen)
      void anmeldung.bereit.catch((fehler: unknown) =>
        console.error('Mehrfenster-Synchronisation konnte nicht eingerichtet werden:', fehler),
      );
    return () => {
      ablauf.aktiv = false;
      for (const anmeldung of anmeldungen) anmeldung.abmelden();
    };
  }, []);
  function verarbeiteLoeschung(referenzen: Gesetzesreferenz[]) {
    if (lebensdauer.current.aktiv) gesetzeTabsSchliessen(referenzen);
  }
  async function gleicheGesetzeAb() {
    await bereiteSuchverzeichnisVor([], { erneut: true });
  }
  async function ladeGesetzeNachDateiImport(
    referenzen: readonly Gesetzesreferenz[],
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ) {
    await pruefeGesetzdateienNachImport(referenzen, meldungEmpfangen);
  }
  async function handleLoeschen(referenz: Gesetzesreferenz) {
    const gesetz = referenz;
    let ergebnis: GesetzLoeschErgebnis;
    try {
      const { loescheGesetz } = await import('@/lib/persistenz/gesetz/gesetz.index');
      ergebnis = await loescheGesetz(referenzVon(gesetz));
    } catch (fehler) {
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      console.error('Gesetz konnte nicht gelöscht werden:', fehler);
      zeigeBanner({
        art: 'bedienhinweis',
        text: 'Das Gesetz konnte nicht gelöscht werden.',
        typ: 'fehler',
      });
      return;
    }

    verarbeiteLoeschung([gesetz]);
    if (ergebnis.benachrichtigung === 'fehlgeschlagen') {
      console.error('Fensterabgleich nach Löschung fehlgeschlagen:', ergebnis.fehler);
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'systemfehler',
        text: 'Das Gesetz wurde gelöscht. Andere Fenster konnten nicht benachrichtigt werden; dort können noch veraltete Tabs angezeigt werden.',
        typ: 'fehler',
      });
    }
    try {
      if (gesetz) entferneAktivierung(gesetz);
    } catch (fehler) {
      console.error('Aktivierung des gelöschten Gesetzes konnte nicht entfernt werden:', fehler);
    }

    try {
      // Ohne diesen Aufruf bliebe ein Gesetzeskurzbefehl in gesetzeskurzbefehle.xml stehen und
      // würde eine spätere Zuweisung an ein anderes Gesetz blockieren.
      if (gesetz) await loescheGesetzeskurzbefehl(gesetz);
      await handleGesetzeskurzbefehleGeaendert();
    } catch (fehler) {
      console.error(
        'Gesetzeskurzbefehl des gelöschten Gesetzes konnte nicht entfernt werden:',
        fehler,
      );
      // Der lokale Stand darf den möglicherweise verbliebenen Gesetzeskurzbefehl nicht
      // weiter einem Gesetz zuordnen, das nicht mehr existiert.
      setGesetzeskurzbefehle((bisherige) => {
        if (!gesetz) return bisherige;
        const {
          [gesetzesreferenzSchluessel(gesetz)]: _entfernterGesetzeskurzbefehl,
          ...verbliebeneGesetzeskurzbefehle
        } = bisherige;
        return verbliebeneGesetzeskurzbefehle;
      });
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'systemfehler',
        text: 'Das Gesetz wurde gelöscht. Ein möglicherweise verbliebener Gesetzeskurzbefehl konnte nicht entfernt werden.',
        typ: 'fehler',
      });
    }
  }

  async function handleExportieren(referenz: Gesetzesreferenz) {
    await exportiereGesetz(referenz);
  }

  async function handleGesetzeskurzbefehleGeaendert() {
    const ablauf = lebensdauer.current;
    try {
      const gesetzeskurzbefehle = await ladeAlleGesetzeskurzbefehle();
      if (ablauf.aktiv) setGesetzeskurzbefehle(gesetzeskurzbefehle);
    } catch {
      if (ablauf.aktiv) setGesetzeskurzbefehle({});
    }
  }

  return {
    gesetzeskurzbefehle,
    ladeGesetzeNachDateiImport,
    gleicheGesetzeAb,
    handleLoeschen,
    handleExportieren,
    handleGesetzeskurzbefehleGeaendert,
  };
}
