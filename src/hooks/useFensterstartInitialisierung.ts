// useFensterstartInitialisierung.ts
//
// Kapselt den einmaligen Ablauf beim Fensterstart (Tab-Gesetze samt
// nichtamtlichen Titeln laden, Tab-Übertragung/Fenster-Restore/
// zuletzt-geschlossener-Tab/Tiefen-Link abarbeiten) – aus App.tsx
// ausgelagert (siehe dortiger Kopfkommentar: "App.tsx bleibt dünn"). Reiner
// Seiteneffekt beim Mount; die Rückgabe trennt erfolgreichen Start und abgeschlossenen Startversuch.
import { messeAsync, messeMitHauptfaden } from '@/lib/utils/perfMessung';
import { tabUebertragungAbholen } from '@/lib/plattform/fensterUebergabe';

import { zeigeBanner } from '@/lib/banner/banner.index';
import { FensterUebernahmeFehler } from '@/lib/persistenz/fenster/fenster.index';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import type { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import type { useFensterRestore } from '@/hooks/fenster/useFensterRestore';
import type { useTiefenLinks } from '@/hooks/useTiefenLinks.ts';
import type { OeffentlichesLinkZiel } from '@/lib/domain/app/tiefenLink';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { Tab, TabUebertragung } from '@/lib/domain/appTypes';
import {
  bestaetigeTabUebertragung,
  istTabUebertragungAbgelaufen,
} from '@/lib/plattform/tabUebertragungBestaetigung';
import { letzterTabAnfrageLesen } from '@/lib/plattform/tauriHelpers.ts';
import { empfangeAppStartAufgaben } from './app-start/startaufgaben';

interface FensterstartInitialisierungOptionen {
  importindexVorbereitungRef?: React.RefObject<Promise<void> | null>;
  ladeGesetz: ReturnType<typeof useAppTabs>['ladeGesetz'];
  tabAusUebertragungUebernehmen: ReturnType<typeof useAppTabs>['tabAusUebertragungUebernehmen'];
  tabWiederherstellen: ReturnType<typeof useGesetzOeffnen>['tabWiederherstellen'];
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setAktiverTabId: Dispatch<SetStateAction<string | null>>;
  fensterRestore: ReturnType<typeof useFensterRestore>;
  leseAppStartZiel: ReturnType<typeof useTiefenLinks>['leseAppStartZiel'];
  oeffneTiefenLinkZiel: ReturnType<typeof useTiefenLinks>['oeffneTiefenLinkZiel'];
}

export function useFensterstartInitialisierung({
  importindexVorbereitungRef,
  ladeGesetz,
  tabAusUebertragungUebernehmen,
  tabWiederherstellen,
  setTabs,
  setAktiverTabId,
  fensterRestore,
  leseAppStartZiel,
  oeffneTiefenLinkZiel,
}: FensterstartInitialisierungOptionen) {
  const [importindexVorbereitung] = useState(() => {
    let bereit = () => {};
    let fehlgeschlagen: (fehler: unknown) => void = () => {};
    const promise = new Promise<void>((resolve, reject) => {
      bereit = resolve;
      fehlgeschlagen = reject;
    });
    void promise.catch(() => {});
    return { promise, bereit, fehlgeschlagen };
  });
  useEffect(() => {
    if (importindexVorbereitungRef)
      importindexVorbereitungRef.current = importindexVorbereitung.promise;
  }, [importindexVorbereitungRef, importindexVorbereitung]);
  function oeffneLinkBeimAppStart(
    ziel: OeffentlichesLinkZiel | null,
    liste: GesetzDarstellung[],
    tabBelegt: boolean,
  ) {
    // Öffnen-Links warten im gemeinsamen Empfänger auf angewendete Starttabs.
    if (!ziel || 'type' in ziel) return;
    oeffneTiefenLinkZiel(ziel, liste, tabBelegt ? 'immer-neu' : 'aktiver-tab');
  }
  async function uebernehmeStartTab(uebertragung: TabUebertragung) {
    const uebernommen =
      !istTabUebertragungAbgelaufen(uebertragung) &&
      (await tabAusUebertragungUebernehmen(uebertragung));
    try {
      await bestaetigeTabUebertragung(uebertragung, uebernommen);
    } catch (fehler) {
      console.error(
        'Tab-Übernahme konnte nicht bestätigt werden; Quelltab bleibt erhalten:',
        fehler,
      );
    }
    return uebernommen;
  }
  async function uebernehmeFensterStartTab() {
    const uebertragung = await tabUebertragungAbholen();
    if (!gemountet.current || !uebertragung) return false;
    const uebernommen = await uebernehmeStartTab(uebertragung);
    // Ein neues Transportlabel besitzt keine Sitzung. Der Restore richtet dort
    // Schließen/Geometrie ein und zeigt den Tab während seines Einzelzugriffs.
    if (uebernommen && gemountet.current) {
      await fensterRestore.initialRestore(ladeGesetz, setTabs, setAktiverTabId);
    }
    return uebernommen;
  }
  const [startAbgeschlossen, setStartAbgeschlossen] = useState(false);
  const [startaufgabenBereit, setStartaufgabenBereit] = useState(false);
  // Unter React StrictMode (Dev-Modus) läuft dieser Effect zweimal
  // (Mount → simuliertes Unmount → Remount), um fehlende Cleanups
  // aufzudecken – Refs bleiben dabei erhalten, nur die Effekte selbst laufen
  // doppelt. initialRestore() darf aber NUR EINMAL laufen: ein zweiter Lauf
  // würde Fenster-Erzeugung und die debounced localStorage-Speicherung über
  // mehrere Fenster hinweg unkontrolliert doppelt anstoßen (Race Conditions
  // beim gemeinsam genutzten gesetze.fenster-Eintrag). Der Ref-Wächter sorgt
  // dafür, dass nur der erste der beiden Effekt-Läufe tatsächlich etwas tut.
  const initialRestoreLief = useRef(false);

  const gemountet = useRef(false);
  useEffect(() => {
    gemountet.current = true;
    const cleanup = () => {
      gemountet.current = false;
    };
    if (initialRestoreLief.current) return cleanup;
    initialRestoreLief.current = true;
    void messeMitHauptfaden('Fensterstart', async () => {
      try {
        // Nur das initiale Fenster main liest den app-globalen Plugin-Link.
        // Weitere Hauptfenster erhalten kein App-Startziel, auch wenn das
        // Plugin einen bereits bei laufender App verarbeiteten Link weiterhin behält.
        const appStartZiel = await leseAppStartZiel();

        if (!gemountet.current) return;

        const hatUebertragungUebernommen = await uebernehmeFensterStartTab();
        if (!gemountet.current) return;

        const hatWiederhergestellt = hatUebertragungUebernommen
          ? false
          : await messeAsync('Fensterstart: Tab-Wiederherstellung', () =>
              fensterRestore.initialRestore(ladeGesetz, setTabs, setAktiverTabId),
            );

        if (!gemountet.current) return;

        // Wurde dieses Fenster wegen ⇧⌘T ohne offenes Fenster neu erzeugt
        // (siehe letzter-tab-Zweig in menu.rs), den zuletzt geschlossenen Tab
        // direkt in den leeren Initial-Tab laden statt einen zweiten Tab
        // danebenzuschieben. Nur relevant, wenn weder fensterRestore noch eine
        // Tab-Übertragung bereits etwas in diesen Tab geschrieben haben –
        // ansonsten ist der Initial-Tab bereits belegt und die Anfrage wird
        // ignoriert (kann praktisch nicht gleichzeitig auftreten, ⇧⌘T ohne
        // Fenster erzeugt immer ein frisches, nicht wiederherstellbares Label).
        const letzterTabAngefordert = await letzterTabAnfrageLesen();
        if (!gemountet.current) return;
        let hatLetztenTabWiederhergestellt = false;
        if (!hatWiederhergestellt && !hatUebertragungUebernommen && letzterTabAngefordert) {
          tabWiederherstellen({ beimFensterstart: true });
          hatLetztenTabWiederhergestellt = true;
        }

        if (!gemountet.current) return;
        oeffneLinkBeimAppStart(
          appStartZiel,
          [],
          hatWiederhergestellt || hatLetztenTabWiederhergestellt,
        );
        if (gemountet.current) setStartAbgeschlossen(true);
      } catch (fehler) {
        console.error('Fensterstart-Initialisierung fehlgeschlagen:', fehler);
        if (fehler instanceof FensterUebernahmeFehler) {
          zeigeBanner({
            art: 'systemfehler',
            typ: 'fehler',
            text: 'Die Fenster konnten nicht wiederhergestellt werden. Die gespeicherten Zustände bleiben für einen erneuten App-Start erhalten.',
          });
          await fensterRestore.beiLadefehlerAnzeigen();
        }
      } finally {
        if (gemountet.current) setStartaufgabenBereit(true);
      }
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Fensterstart übernimmt Tabs und Startlink nur beim Mount; erneute Ausführung würde die laufende Sitzung überschreiben.
  }, []);
  useEffect(() => {
    if (!startaufgabenBereit) return;
    const empfang = empfangeAppStartAufgaben(
      importindexVorbereitung.bereit,
      importindexVorbereitung.fehlgeschlagen,
    );
    void empfang.bereit.catch((fehler: unknown) =>
      console.error('App-Startaufgaben konnten nicht angemeldet werden:', fehler),
    );
    return () => {
      void empfang.abmelden();
    };
  }, [startaufgabenBereit, importindexVorbereitung]);
  // Die Empfängerwirkung läuft erst nach dem React-Abschluss, in dem auch
  // useAppTabs seine Tabs-/Aktivtab-Refs auf den Restore-Stand gesetzt hat.
  return { startAbgeschlossen, startaufgabenBereit };
}
