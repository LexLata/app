// MobileApp.tsx
//
// Root-Komponente für iOS/Android, analog zu App.tsx am Desktop, aber ohne
// Tab-/Fenster-Konzept: einfache Screen-State-Machine mit zwei Screens
// (Suche, Textansicht), siehe Mobile-Plan Abschnitt 3b. Eine Navigations-
// bibliothek wäre bei nur zwei Screens Overkill (siehe Plan, Alternativen).
//
// Gemeinsamer Einzelzugriff und Suchverzeichnis wie im Desktop.

import { useGeladeneGesetze } from '@/hooks/tabs/useGeladeneGesetze';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { zeigeBanner } from '@/lib/banner/banner.index';
import { verweisZuXmlId } from '@/lib/domain/norm/norm.index';
import { TIEFENLINK_ZIEL_HINWEIS } from '@/lib/domain/app/tiefenLink';
import { startelementFuerGesetz } from '@/hooks/tabs/startelementFuerGesetz';
import { useSuchverzeichnisAbgleich } from '@/hooks/useSuchverzeichnis';
import { BannerHost } from '@/components/hauptfenster/BannerHost';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { ElementOeffnenParams } from '@/lib/domain/appTypes';
import { synchronisiereStartupImportindizes } from '@/lib/import/import.index';
import { bereiteSuchverzeichnisVor } from '@/lib/gesetz-laden/gesetz-laden.index';
import { useZuletztAngezeigt } from '@/hooks/useZuletztAngezeigt';
import { useTiefenLinks } from '@/hooks/useTiefenLinks';
import { useMobileEinstellungen } from '@/mobile/useMobileEinstellungen';
import { MobileEinstellungenOverlay } from '@/mobile/components/MobileEinstellungenOverlay';
import { OeffnenScreen } from '@/mobile/screens/OeffnenScreen';
import { GesetzTextScreen } from '@/mobile/screens/GesetzTextScreen';
import '@/mobile/mobile.css';

type MobileTextansicht = { art: 'textansicht'; gesetz: GesetzDarstellung; initialNorm?: string };
type MobileScreen =
  | { art: 'oeffnen' }
  | { art: 'ladend'; referenz: Gesetzesreferenz; ausgang?: MobileTextansicht }
  | MobileTextansicht;

function mobilesNormziel(gesetz: GesetzDarstellung, xmlId?: string, bezeichnung?: string) {
  if (xmlId !== undefined)
    return gesetz.elemente.some((element) => element.data.xmlId === xmlId) ? xmlId : null;
  return bezeichnung ? verweisZuXmlId(gesetz, bezeichnung) : undefined;
}

export default function MobileApp() {
  const bestand = useGeladeneGesetze();
  const oeffnungsauftrag = useRef({ kennung: 0 });
  const [bereit, setBereit] = useState(false);
  useSuchverzeichnisAbgleich(bereit);
  const [screen, setScreen] = useState<MobileScreen>({ art: 'oeffnen' });
  const [einstellungenOffen, setEinstellungenOffen] = useState(false);
  const einstellungen = useMobileEinstellungen();
  async function referenzOeffnen(
    referenz: Gesetzesreferenz,
    xmlId?: string,
    bezeichnung?: string,
    tiefenlink = false,
    ausgang?: MobileTextansicht,
  ) {
    if (!bestand) return;
    const auftrag = ++oeffnungsauftrag.current.kennung;
    setScreen({ art: 'ladend', referenz, ausgang });
    const ergebnis = await bestand.ladeGesetz(referenz);
    if (auftrag !== oeffnungsauftrag.current.kennung) return;
    if (ergebnis.status !== 'geladen') {
      zeigeBanner({
        art: 'bedienhinweis',
        text:
          ergebnis.status === 'fehlt'
            ? tiefenlink
              ? TIEFENLINK_ZIEL_HINWEIS
              : ausgang
                ? `${referenz.kurztitel} ist noch nicht importiert. Bitte über „Gesetz oder Norm öffnen“ importieren.`
                : 'Gesetz nicht mehr vorhanden.'
            : 'Das Gesetz konnte nicht verlässlich geladen werden.',
        typ: 'warnung',
      });
      setScreen(ausgang ?? { art: 'oeffnen' });
      return;
    }
    const ziel = mobilesNormziel(ergebnis.gesetz, xmlId, bezeichnung);
    if (ziel === null)
      zeigeBanner({
        art: 'bedienhinweis',
        text: tiefenlink ? TIEFENLINK_ZIEL_HINWEIS : 'Norm nicht gefunden.',
        typ: 'warnung',
      });
    setScreen({
      art: 'textansicht',
      gesetz: ergebnis.gesetz,
      initialNorm: startelementFuerGesetz(ergebnis.gesetz, ziel ?? undefined),
    });
  }

  // elementOeffnen-kompatible Brücke für useTiefenLinks: oeffneTiefenLinkZiel
  // befüllt ausschließlich gesetz/xmlId (siehe useTiefenLinks.ts) – modus/
  // ohneVerlauf sind reine Desktop-Tab-/Verlauf-Konzepte, die es auf
  // Mobile nicht gibt und die hier bewusst ignoriert werden.
  const tiefenlinkElementOeffnen = useCallback(({ gesetz, xmlId }: ElementOeffnenParams) => {
    if (!gesetz) return;
    setScreen({ art: 'textansicht', gesetz, initialNorm: xmlId });
  }, []);

  const { leseAppStartZiel, oeffneTiefenLinkZiel } = useTiefenLinks({
    gesetzesreferenzOeffnen: (ziel) => {
      void referenzOeffnen(ziel.gesetzesreferenz, ziel.xmlId, ziel.bezeichnung, ziel.tiefenlink);
    },
    elementOeffnen: tiefenlinkElementOeffnen,
  });

  const initialisiere = useEffectEvent(async (istAktuell: () => boolean) => {
    try {
      await synchronisiereStartupImportindizes();
      if (!istAktuell()) return;
      // Das Linkziel wird über denselben Einzelzugriff wie die Suche geöffnet.
      const appStartZiel = await leseAppStartZiel();
      if (!istAktuell()) return;
      if (appStartZiel) {
        oeffneTiefenLinkZiel(appStartZiel, []);
      }
    } catch (fehler) {
      console.error('App-Start-Initialisierung (Mobile) fehlgeschlagen:', fehler);
    } finally {
      if (istAktuell()) setBereit(true);
    }
  });

  useEffect(() => {
    if (!bestand) return;
    const laufzeit = oeffnungsauftrag.current;
    let aktuell = true;
    void initialisiere(() => aktuell);
    return () => {
      aktuell = false;
      laufzeit.kennung++;
    };
  }, [bestand]);

  useZuletztAngezeigt(screen.art === 'textansicht' ? screen.gesetz : null);

  if (!bereit || (screen.art === 'ladend' && !screen.ausgang)) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--text-sekundaer)',
          fontFamily: 'var(--schrift)',
        }}
      >
        <TextAnzeige
          text={screen.art === 'ladend' ? `${screen.referenz.kurztitel} wird geladen …` : 'Lädt …'}
        />
        <BannerHost />
      </div>
    );
  }

  const einstellungenOverlay = einstellungenOffen ? (
    <MobileEinstellungenOverlay
      schriftgroesse={einstellungen.schriftgroesse}
      onSchriftgroesseAendern={einstellungen.setSchriftgroesse}
      randInline={einstellungen.randInline}
      onRandInlineAendern={einstellungen.setRandInline}
      seitenleistenGroesse={einstellungen.seitenleistenGroesse}
      onSeitenleistenGroesseAendern={einstellungen.setSeitenleistenGroesse}
      customTastaturAktiv={einstellungen.customTastaturAktiv}
      onCustomTastaturAktivAendern={einstellungen.setCustomTastaturAktiv}
      onSchliessen={() => setEinstellungenOffen(false)}
    />
  ) : null;

  const textansicht =
    screen.art === 'textansicht' ? screen : screen.art === 'ladend' ? screen.ausgang : undefined;
  if (textansicht) {
    return (
      <>
        <div
          inert={screen.art === 'ladend'}
          style={{ height: '100%', visibility: screen.art === 'ladend' ? 'hidden' : undefined }}
        >
          <GesetzTextScreen
            key={gesetzesreferenzSchluessel(textansicht.gesetz)}
            gesetz={textansicht.gesetz}
            initialNorm={textansicht.initialNorm}
            onZurueckZuOeffnen={() => setScreen({ art: 'oeffnen' })}
            onEinstellungenOeffnen={() => setEinstellungenOffen(true)}
            schriftgroesse={einstellungen.schriftgroesse}
            randInline={einstellungen.randInline}
            seitenleistenGroesse={einstellungen.seitenleistenGroesse}
            onAnderesGesetzOeffnen={(referenz, bezeichnung) =>
              void referenzOeffnen(referenz, undefined, bezeichnung, false, textansicht)
            }
          />
        </div>
        {screen.art === 'ladend' && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--bg-haupt)',
            }}
          >
            <TextAnzeige text={`${screen.referenz.kurztitel} wird geladen …`} />
          </div>
        )}
        {einstellungenOverlay}
        <BannerHost />
      </>
    );
  }

  return (
    <>
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onReferenzGewaehlt={(referenz, xmlId) => {
          void referenzOeffnen(referenz, xmlId);
        }}
        onGesetzGewaehlt={(gesetz, xmlId) => void referenzOeffnen(gesetz, xmlId)}
        onGesetzImportiert={async () => {
          await bereiteSuchverzeichnisVor([], { erneut: true });
        }}
        customTastaturAktiv={einstellungen.customTastaturAktiv}
      />
      {einstellungenOverlay}
      <BannerHost />
    </>
  );
}
