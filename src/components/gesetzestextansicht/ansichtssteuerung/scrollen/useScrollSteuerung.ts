// useScrollSteuerung.ts
// Besitzt Virtualizer und Sprung-/Restore-/Klapp-/Resize-Lebensdauer; meldet stabile Auftragspositionen.
import { meldeScrollDiagnose } from '@/lib/utils/scrollAufzeichnungDiagnose';
import { beginneMessspanne } from '@/lib/utils/perfMessung';
import { useBereitschaft } from './useBereitschaft';
import { useScrollstandBeimAnzeigen } from './useScrollstandBeimAnzeigen';
import { flushSync } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ScrollAuftrag,
  ScrollPosition,
  ScrollSteuerung,
  ScrollSteuerungOptionen,
} from './ScrollSteuerung.types';
import { erstelleScrollLebensdauer, type ScrollVorgang } from './ScrollVorgang';
import { SCROLL_MARGIN } from './virtualizer';
import { useTextVirtualizer } from './useTextVirtualizer';
import { TEXT_SPALTE_BREITE } from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import { vollstaendigSichtbar } from './navigationGeometrie';
import { useGesetzSprung } from './useGesetzSprung';
import { erfasseScrollAnker, useObersteSichtbareZeile } from './useObersteSichtbareZeile';
import { erfasseKlappAnker, erstelleKlappAuftrag } from './klappAnker';
import { korrigiereKlappAnker, nachKlappSprung } from './klappAnkerKorrektur';
import { messeScrollStand } from './messeScrollStand';
import { useScrollEreignisse } from './useScrollEreignisse';
import { erstelleResizeAnker } from './resizeAnker';
import { erstelleScrollHoehenAusgleich } from './scrollHoehenAusgleich';
export function useScrollSteuerung(optionen: ScrollSteuerungOptionen): ScrollSteuerung {
  const { containerRef, sichtbareElemente, geometrie } = optionen;
  const aktuell = useRef(optionen);
  useLayoutEffect(() => {
    aktuell.current = optionen;
  });
  const lebensdauerRef = useRef(
    erstelleScrollLebensdauer((phase, vorgang, anlass, grund) =>
      meldeScrollDiagnose(
        { art: 'positionskorrektur', phase, vorgang, anlass, grund },
        containerRef.current,
      ),
    ),
  );
  const lebensdauer = lebensdauerRef.current;
  const springeAktivRef = useRef(!!optionen.initialZielId || !!optionen.initialPosition);
  const leisteHoeheRef = useRef(optionen.leisteHoehe ?? -1);
  useLayoutEffect(() => {
    leisteHoeheRef.current = optionen.leisteHoehe ?? -1;
  });
  const [bereit, setBereit, verdecken] = useBereitschaft(
    !optionen.initialPosition && !optionen.initialZielId,
    optionen.initialLayoutBereit,
  );
  const aktiverAuftragRef = useRef<{
    auftrag: ScrollAuftrag;
    nachAbschluss?: () => void;
    layoutwechsel?: boolean;
  } | null>(null);
  const resizeVorgangRef = useRef<ScrollVorgang | null>(null);
  const [hoehenAusgleich] = useState(() =>
    erstelleScrollHoehenAusgleich(() => ({
      gesperrt: springeAktivRef.current || !!resizeVorgangRef.current?.istGueltig(),
      leisteHoehe: aktuell.current.effektiveLeisteHoehe,
    })),
  );
  const [resizeAnkerRef] = useState(() =>
    erstelleResizeAnker(() => ({
      container: containerRef.current,
      zeilen: virtualizer.getVirtualItems(),
      elemente: aktuell.current.sichtbareElemente,
      messKorrektur: messKorrekturRef.current || !!resizeVorgangRef.current?.istGueltig(),
      gesperrt: springeAktivRef.current,
      eigeneScrollPosition: eigeneScrollPositionRef.current,
      offsetFuerIndex: (index) => virtualizer.getOffsetForIndex(index, 'start')?.[0],
      eigenePosition: (position) => {
        eigeneScrollPositionRef.current = position;
      },
    })),
  );
  const beobachteteBreiteRef = useRef<number | null>(null);
  const breiteAusstehendRef = useRef(false);
  const resizeRuheBisRef = useRef(0);
  const messKorrekturRef = useRef(false);
  const renderAbwartenRef = useRef<{
    vorgang: ScrollVorgang;
    korrigieren?: () => void;
  } | null>(null);
  function textBreite(containerBreite: number | null) {
    const { randInline, maxTextBreite } = aktuell.current.geometrie;
    const deckel = maxTextBreite === 'none' ? TEXT_SPALTE_BREITE : maxTextBreite;
    const verfuegbar = Math.max(200, (containerBreite ?? deckel + 2 * randInline) - 2 * randInline);
    return maxTextBreite === 'none' ? verfuegbar : Math.min(verfuegbar, maxTextBreite);
  }
  const [textSpalteBreite, setTextSpalteBreite] = useState(() => textBreite(null));
  const freigegebeneBreiteRef = useRef(textSpalteBreite);
  const eigeneScrollPositionRef = useRef<number | null>(null);
  const bedienungRef = useRef(0);
  function entwerteNachfuehrung() {
    bedienungRef.current++;
    aktuell.current.onNachfuehrungEntwerten?.();
  }
  const ankerPositionRef = useRef<ScrollPosition>({ index: 0, offsetInItem: 0 });
  const [messIndex, setMessIndex] = useState<number | null>(null);
  const { virtualizer, hoehenKontext, hoehenIdentitaet, initialOffset, messlauf, textListe } =
    useTextVirtualizer({
      optionen,
      textSpalteBreite,
      messIndex,
      hoehenAusgleich,
      eigeneScrollPositionRef,
    });
  function meldeStand(benutzerscrollen = false) {
    const container = containerRef.current;
    if (!container) return;
    benutzerscrollen &&= !resizeVorgangRef.current?.istGueltig();
    if (!benutzerscrollen) eigeneScrollPositionRef.current = container.scrollTop;
    const zeilen = virtualizer.getVirtualItems();
    const messgrundlage = { ...aktuell.current, leisteHoehe: leisteHoeheRef.current };
    const stand = messeScrollStand(container, zeilen, messgrundlage, benutzerscrollen);
    aktuell.current.onScrollStandGeaendert(stand);
    if (springeAktivRef.current || resizeVorgangRef.current?.istGueltig()) return;
    const offset = Math.max(
      0,
      container.scrollTop - SCROLL_MARGIN + aktuell.current.effektiveLeisteHoehe,
    );
    const erste =
      zeilen.find((zeile) => zeile.start + zeile.size > offset) ?? zeilen[zeilen.length - 1];
    if (!erste) return;
    ankerPositionRef.current = {
      index: erste.index,
      offsetInItem: container.scrollTop - SCROLL_MARGIN - erste.start,
    };
    aktuell.current.onPositionGeaendert(ankerPositionRef.current);
    fuehreResizeAnkerNach(false, true);
  }
  const fuehreResizeAnkerNach = resizeAnkerRef.nachfuehren;
  const korrigiereGeste = resizeAnkerRef.korrigiereGeste;
  const meldeStandRef = useRef(meldeStand);
  useLayoutEffect(() => {
    meldeStandRef.current = meldeStand;
  });
  const sprung = useGesetzSprung({
    virtualizer,
    containerRef,
    leisteHoeheRef,
    sichtbareElemente,
    schriftgroesse: geometrie.schriftgroesse,
    hoehenKontext,
    lebensdauer,
    springeAktivRef,
    kontextAktualisieren: () => {},
    polsterZuruecksetzen: () => {},
    positionsKontextUebernehmen: () => aktuell.current.onPositionsKontextUebernehmen?.(),
    zielRendern: setMessIndex,
    abgedeckteHoehe: optionen.effektiveLeisteHoehe,
    zielHoeheSchaetzen: optionen.schaetzeZielLeiste,
    zielMessen: optionen.onZielMessen,
    ansichtBereit: bereit,
    zielUebernehmen: optionen.onZielUebernehmen,
  });
  const ermittleZeile = useObersteSichtbareZeile({
    virtualizer,
    containerRef,
    sichtbareElemente,
    leisteHoeheRef,
  });
  const erfasseAnker = () =>
    erfasseScrollAnker(containerRef.current, ermittleZeile(), sichtbareElemente);
  function starteAuftrag(auftrag: ScrollAuftrag, nachAbschluss?: () => void): boolean {
    meldeScrollDiagnose({ art: 'auftrag', anlass: auftrag.art }, containerRef.current);
    const index = sichtbareElemente.findIndex((el) => el.data.id === auftrag.elementId);
    if (index < 0) return false;
    const container = containerRef.current;
    if (
      auftrag.art === 'sichtbar-machen' &&
      !auftrag.ausrichtung &&
      container &&
      vollstaendigSichtbar(container, index, aktuell.current.effektiveLeisteHoehe)
    ) {
      storniereFortsetzungen();
      springeAktivRef.current = false;
      nachAbschluss?.();
      return true;
    }
    const messungBeenden = beginneMessspanne('Wiederherstellung');
    const layoutwechsel = aktiverAuftragRef.current?.auftrag === auftrag;
    storniereFortsetzungen();
    aktiverAuftragRef.current = { auftrag, nachAbschluss, layoutwechsel };
    resizeAnkerRef.current = null;
    eigeneScrollPositionRef.current = null;
    springeAktivRef.current = true;
    if (auftrag.art !== 'sichtbar-machen') aktuell.current.onZielVorbereiten(auftrag.elementId);
    let ankerVorgang: ScrollVorgang | null = null;
    const abschliessen = () => {
      const vorgang = ankerVorgang ?? sprung.aktuellerVorgang();
      if (!vorgang?.istGueltig()) return;
      aktiverAuftragRef.current = null;
      if (ankerVorgang) {
        renderAbwartenRef.current = null;
        setMessIndex(null);
      }
      springeAktivRef.current = false;
      resizeAnkerRef.current = null;
      messungBeenden(auftrag.art);
      setBereit(true);
      meldeStandRef.current();
      if (vorgang.istGueltig()) nachAbschluss?.();
      if (vorgang.istGueltig() && breiteAusstehendRef.current) {
        if (textBreite(beobachteteBreiteRef.current) !== freigegebeneBreiteRef.current)
          starteResizeRef.current();
        else breiteAusstehendRef.current = false;
      }
      ankerVorgang?.beenden();
    };
    if (auftrag.art === 'anker-halten' && 'haltung' in auftrag.anker) {
      ankerVorgang = lebensdauer.starten();
      const korrigieren = korrigiereKlappAnker(
        () => containerRef.current,
        index,
        auftrag.anker,
        ankerVorgang,
        abschliessen,
        false,
      );
      renderAbwartenRef.current = { vorgang: ankerVorgang, korrigieren };
      setMessIndex(index);
      korrigieren();
      return true;
    }
    const nachSprung = () =>
      nachKlappSprung(
        auftrag,
        sprung.aktuellerVorgang(),
        () => containerRef.current,
        index,
        abschliessen,
        springeAktivRef,
      );
    const offset =
      auftrag.art === 'wiederherstellen'
        ? auftrag.offsetInItem
        : auftrag.art === 'anker-halten'
          ? auftrag.anker.offsetInItem
          : 0;
    const ausfuehren = () =>
      sprung.springeZuIndex(
        index,
        nachSprung,
        offset,
        0,
        auftrag.art === 'sichtbar-machen',
        auftrag.art === 'sichtbar-machen' && auftrag.ausrichtung === 'oben'
          ? 'flush-oben'
          : undefined,
        auftrag.art !== 'sichtbar-machen' || auftrag.animieren !== false,
      );
    if (auftrag.art === 'sichtbar-machen') ausfuehren();
    else lebensdauer.starten().spaeter(ausfuehren, 20);
    return true;
  }
  function korrigiereResize(vorgang: ScrollVorgang) {
    meldeScrollDiagnose({ art: 'resize-korrektur-beginn' }, containerRef.current);
    const korrigieren = resizeAnkerRef.starteKorrektur(vorgang, {
      messeZeilen: () => hoehenAusgleich.messeGerenderteZeilen(containerRef.current, virtualizer),
      abgeschlossen(stabil) {
        meldeScrollDiagnose({ art: 'resize-korrektur-ende', stabil }, containerRef.current);
        resizeVorgangRef.current = null;
        renderAbwartenRef.current = null;
        messKorrekturRef.current = false;
        resizeAnkerRef.current = null;
        setMessIndex(null);
        if (stabil) meldeStandRef.current();
        else console.warn('[ResizeAnker] Nach 20 Versuchen nicht stabil – Korrektur beendet.');
      },
    });
    renderAbwartenRef.current = { vorgang, korrigieren };
    korrigieren();
  }
  function starteResize() {
    if (springeAktivRef.current || !bereit) return;
    fuehreResizeAnkerNach();
    const vorgang = lebensdauer.starten('resize');
    meldeScrollDiagnose(
      {
        art: 'resize-beginn',
        breite: beobachteteBreiteRef.current,
        freigegebeneBreite: freigegebeneBreiteRef.current,
      },
      containerRef.current,
    );
    resizeVorgangRef.current = vorgang;
    renderAbwartenRef.current = null;
    setMessIndex(resizeAnkerRef.current?.index ?? null);
    vorgang.frame(korrigiereGeste);
    vorgang.spaeter(
      () => {
        korrigiereGeste();
        breiteAusstehendRef.current = false;
        const breite = textBreite(beobachteteBreiteRef.current);
        if (breite !== freigegebeneBreiteRef.current) {
          freigegebeneBreiteRef.current = breite;
          messKorrekturRef.current = true;
          renderAbwartenRef.current = { vorgang };
          setMessIndex(resizeAnkerRef.current?.index ?? null);
          meldeScrollDiagnose({ art: 'textbreite-freigegeben', breite }, containerRef.current);
          setTextSpalteBreite(breite);
        } else if (messKorrekturRef.current) {
          korrigiereResize(vorgang);
        } else {
          resizeVorgangRef.current = null;
          setMessIndex(null);
          meldeStandRef.current();
          vorgang.beenden();
        }
      },
      Math.max(0, resizeRuheBisRef.current - Date.now()),
    );
  }
  // Darstellungswechsel bei gleicher Breite (Schrift, Zeilenabstand, Einzug, Blocksatz,
  // Silbentrennung, Satzanordnung …): Lesestelle wie beim Breitenwechsel halten.
  function starteDarstellungswechsel() {
    messKorrekturRef.current = true;
    starteResize();
    const vorgang = resizeVorgangRef.current;
    if (!vorgang) return;
    renderAbwartenRef.current = { vorgang };
    if (messIndex === resizeAnkerRef.current?.index) korrigiereResize(vorgang);
  }
  function korrigiereGerenderteZeilen() {
    if (!resizeVorgangRef.current?.istGueltig()) return;
    hoehenAusgleich.messeGerenderteZeilen(containerRef.current, virtualizer);
    korrigiereGeste();
  }
  const starteResizeRef = useRef(starteResize);
  const vorherigeIdentitaetRef = useRef(hoehenIdentitaet);
  const vorherigeRenderBreiteRef = useRef(textSpalteBreite);
  useLayoutEffect(() => {
    starteResizeRef.current = starteResize;
    korrigiereGerenderteZeilen();
    const breiteGerendert = vorherigeRenderBreiteRef.current !== textSpalteBreite;
    vorherigeRenderBreiteRef.current = textSpalteBreite;
    const renderVorgang = renderAbwartenRef.current;
    if (
      renderVorgang?.vorgang.istGueltig() &&
      (!renderVorgang.korrigieren || vorherigeIdentitaetRef.current === hoehenIdentitaet)
    ) {
      vorherigeIdentitaetRef.current = hoehenIdentitaet;
      // Messungen können weitere Commits auslösen: dieselbe Fortsetzung vor Paint halten.
      if (renderVorgang.korrigieren) renderVorgang.korrigieren();
      else korrigiereResize(renderVorgang.vorgang);
      return;
    }
    if (vorherigeIdentitaetRef.current === hoehenIdentitaet) return;
    vorherigeIdentitaetRef.current = hoehenIdentitaet;
    entwerteNachfuehrung();
    const resizeAktiv = !!resizeVorgangRef.current?.istGueltig();
    if (breiteGerendert && resizeAktiv && !aktiverAuftragRef.current) return;
    if (aktiverAuftragRef.current?.layoutwechsel) return;
    lebensdauer.abbrechen();
    resizeVorgangRef.current = null;
    eigeneScrollPositionRef.current = null;
    const aktiv = aktiverAuftragRef.current;
    if (aktiv) starteAuftrag(aktiv.auftrag, aktiv.nachAbschluss);
    else if (
      resizeAktiv &&
      (textBreite(beobachteteBreiteRef.current) !== freigegebeneBreiteRef.current ||
        messKorrekturRef.current)
    )
      starteResize();
    else if (!breiteGerendert && resizeAnkerRef.current) starteDarstellungswechsel();
    else {
      resizeAnkerRef.current = null;
      messKorrekturRef.current = false;
    }
  });
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || (beobachteteBreiteRef.current !== null && bereit)) return;
    beobachteteBreiteRef.current = Math.round(container.clientWidth / 8) * 8;
    const breite = textBreite(beobachteteBreiteRef.current);
    freigegebeneBreiteRef.current = breite;
    setTextSpalteBreite(breite);
  }, [containerRef, bereit, optionen.initialLayoutBereit]);
  useLayoutEffect(() => {
    const breite = textBreite(beobachteteBreiteRef.current);
    if (breite === freigegebeneBreiteRef.current) return;
    if (resizeVorgangRef.current?.istGueltig()) return;
    if (springeAktivRef.current) {
      breiteAusstehendRef.current = true;
      return;
    }
    freigegebeneBreiteRef.current = breite;
    setTextSpalteBreite(breite);
  }, [geometrie.randInline, geometrie.maxTextBreite]);
  useScrollstandBeimAnzeigen(containerRef, initialOffset);
  useScrollEreignisse({
    containerRef,
    sichtbareElemente,
    eigenePosition: eigeneScrollPositionRef,
    istGesperrt: () => springeAktivRef.current,
    leseBedienung: () => bedienungRef.current,
    onBenutzerscrollen: () => aktuell.current.onBenutzerscrollen?.(),
    onScrollAbsicht() {
      // Fortgesetzte Scrollgesten behalten die Vorschau; der neue Stand
      // erneuert die Ruhefrist, ohne das bisher aktive Element zu melden.
      storniereFortsetzungen();
      springeAktivRef.current = false;
      eigeneScrollPositionRef.current = null;
      aktuell.current.onBenutzerscrollen?.();
      meldeStandRef.current(true);
    },
    meldeStand: (nutzer) => meldeStandRef.current(nutzer),
    fuehreAnkerNach: resizeAnkerRef.nachfuehren,
  });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let beendet = false;
    const observer = new ResizeObserver(() => {
      if (beendet) return;
      entwerteNachfuehrung();
      meldeScrollDiagnose(
        {
          art: 'container-breite',
          breite: container.clientWidth,
          vorher: beobachteteBreiteRef.current,
          textBreiteFreigegeben: freigegebeneBreiteRef.current,
          sprungAktiv: springeAktivRef.current,
          bereit,
        },
        container,
      );
      beobachteteBreiteRef.current = Math.round(container.clientWidth / 8) * 8;
      breiteAusstehendRef.current = true;
      resizeRuheBisRef.current = Date.now() + 150;
      if (springeAktivRef.current || !bereit) return;
      // Geänderte DOM-Höhen und ihre Positionen müssen gemeinsam vor Paint ankommen.
      flushSync(() => {
        starteResizeRef.current();
        hoehenAusgleich.messeGerenderteZeilen(container, virtualizer);
      });
    });
    observer.observe(container);
    return () => {
      beendet = true;
      observer.disconnect();
      resizeVorgangRef.current?.beenden('beobachtung-beendet');
      resizeVorgangRef.current = null;
    };
  }, [containerRef, lebensdauer, bereit, hoehenAusgleich, virtualizer]);
  useEffect(() => {
    if (bereit && breiteAusstehendRef.current && !springeAktivRef.current)
      starteResizeRef.current();
  }, [bereit, optionen.initialLayoutBereit]);
  function storniereFortsetzungen() {
    lebensdauer.abbrechen();
    aktiverAuftragRef.current = null;
    setMessIndex(null);
    resizeVorgangRef.current = null;
    renderAbwartenRef.current = null;
    messKorrekturRef.current = false;
  }
  return {
    bereit,
    messeStand() {
      const container = containerRef.current;
      return container
        ? messeScrollStand(container, virtualizer.getVirtualItems(), aktuell.current, false)
        : null;
    },
    entwerteNachfuehrung,
    erfasseAnker,
    erfasseKlappAnker: (aktivesId, richtung) =>
      erfasseKlappAnker(
        containerRef.current,
        virtualizer.getVirtualItems(),
        sichtbareElemente,
        leisteHoeheRef.current,
        aktivesId,
        richtung,
        erfasseAnker,
        aktiverAuftragRef.current?.auftrag,
      ),
    erstelleKlappAuftrag,
    starteAuftrag,
    storniereFortsetzungen,
    verdeckeBeiWeitemSprung: (elementId) => bereit && sprung.istWeit(elementId) && verdecken(),
    bereiteAuftragVor() {
      entwerteNachfuehrung();
      storniereFortsetzungen();
      springeAktivRef.current = true;
    },
    beendeAuftragOhneZiel() {
      storniereFortsetzungen();
      resizeAnkerRef.current = null;
      springeAktivRef.current = false;
      if (breiteAusstehendRef.current) starteResizeRef.current();
    },
    messlauf,
    textListe,
  };
}
