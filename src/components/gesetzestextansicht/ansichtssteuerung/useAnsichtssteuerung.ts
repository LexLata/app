// useAnsichtssteuerung.ts
// Koordiniert strukturelle Ziele, Renderabwarten, Kontextpfad und Rückmeldungen.
// Scrollgeometrie und sämtliche Scrollfortsetzungen gehören dem inneren Scrollmodul.
import { flushSync } from 'react-dom';
import { useInitialLayoutFreigabe, useInitialPositionierung } from './useInitialPositionierung';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  Ansichtssteuerung,
  AnsichtssteuerungOptionen,
  BaumSteuerung,
  KlappstufenStatus,
  KontextLeistenModell,
} from './Ansichtssteuerung.types';
import { useStrukturZustand, type StrukturMomentaufnahme } from './struktur/struktur.index';
import {
  useScrollSteuerung,
  type ScrollAuftrag,
  type ScrollStand,
  type KlappAnker,
  type ScrollAnker,
  type ScrollPosition,
} from './scrollen/scrollen.index';
import { useTabBezeichnung } from './useTabBezeichnung';
import { useScrollNachfuehrung } from './useScrollNachfuehrung';
import { usePfeilbedienung } from './usePfeilbedienung';
import { useMesslauf } from './messlauf/useMesslauf';
import { useKontextPfadZustand, useStrukturKontext } from './useStrukturKontext';
import { schaetzeKontextHoehe } from './useStrukturKontext.helpers';
import {
  SCROLL_MARGIN,
  TEXT_SPALTE_BREITE,
  STANDARD_RAND_INLINE,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import {
  SCHRIFTGROESSE_DEFAULT,
  ZEILENABSTAND_DEFAULT,
  LESBARE_ZEILENLAENGE_DEFAULT,
} from '@/lib/stil/gesetzTextDarstellung';

interface Zielauftrag {
  /** Alter Strukturstand: nur darauf darf nach eigener Vorbereitung noch gewartet werden. */
  vorbereitungsStand: StrukturMomentaufnahme;
  auftrag: ScrollAuftrag;
  nachAbschluss?: () => void;
}
export function useAnsichtssteuerung(optionen: AnsichtssteuerungOptionen): Ansichtssteuerung {
  const schriftgroesse = optionen.schriftgroesse ?? SCHRIFTGROESSE_DEFAULT;
  const zeilenabstand = optionen.zeilenabstand ?? ZEILENABSTAND_DEFAULT;
  const lesbareZeilenlaenge = optionen.lesbareZeilenlaenge ?? LESBARE_ZEILENLAENGE_DEFAULT;
  const containerRef = useRef<HTMLDivElement>(null);
  const aktuellRef = useRef(optionen);
  useLayoutEffect(() => {
    aktuellRef.current = optionen;
  });
  const initialRef = useRef(optionen);
  const initialLayoutBereit = useInitialLayoutFreigabe(optionen.initialLayoutBereit);
  const struktur = useStrukturZustand({
    elemente: optionen.gesetz.elemente,
    initial: {
      eingeklappteUeberschriften: initialRef.current.initialEingeklappteUeberschriften ?? new Set(),
      eingeklappteNormen: initialRef.current.initialEingeklappteNormen ?? new Set(),
      aktivesElementId: initialRef.current.initialAktivesElementId ?? null,
    },
    initialNormAktiv: !!initialRef.current.initialNorm,
    sperren: optionen.einfuehrungSperren,
  });
  const basisBreite = optionen.maxTextSpalteBreite ?? TEXT_SPALTE_BREITE;
  const maxBreite = basisBreite * (schriftgroesse / SCHRIFTGROESSE_DEFAULT);
  const randInline = optionen.randInline ?? STANDARD_RAND_INLINE;
  const [kontextPfad, setKontextPfad] = useKontextPfadZustand();
  const [zielmessung, setZielmessung] = useState<KontextLeistenModell['messung']>();
  const [stand, setStand] = useState<ScrollStand | null>(null);
  const [leisteHoehe, setLeisteHoehe] = useState<number | null>(null);
  const leisteHoeheRef = useRef(-1);
  const [zielauftrag, setZielauftrag] = useState<Zielauftrag | null>(null);
  const kontext = useStrukturKontext({
    stand,
    sichtbareElemente: struktur.sichtbareElemente,
    schrift: schriftgroesse,
    skalierung: optionen.strukturKontextLeisteGroesse,
    scrollMargin: SCROLL_MARGIN,
    echteHoeheRef: leisteHoeheRef,
    auftragAktiv: zielauftrag !== null,
    setKontextPfad,
  });
  // Messlauf-Sperre für die vor ihr angelegten Rückmeldungen; Quelle ist useMesslauf.
  const messlaufGesperrtRef = useRef(false);
  const nachfuehrungRef = useRef<ReturnType<typeof useScrollNachfuehrung>>({
    entwerten() {},
    vormerken() {},
    fuehreFaelligeNach: () => false,
  });
  const scrollen = useScrollSteuerung({
    containerRef,
    initialLayoutBereit,
    sichtbareElemente: struktur.sichtbareElemente,
    ...struktur.momentaufnahme,
    unterArtikelIds: struktur.unterArtikelIds,
    messung: optionen.messung,
    geometrie: {
      inhaltEinzug: optionen.inhaltEinzug,
      satzNeuZeile: optionen.satzNeuZeile,
      lang: optionen.lang,
      hyphens: optionen.hyphens,
      textAlign: optionen.textAlign,
      schriftgroesse: schriftgroesse,
      zeilenabstand: zeilenabstand,
      randInline,
      maxTextBreite: lesbareZeilenlaenge ? maxBreite : 'none',
    },
    leisteHoehe,
    effektiveLeisteHoehe: kontext.effektiveHoehe,
    initialPosition:
      initialRef.current.initialNorm || initialRef.current.initialScrollIndex == null
        ? undefined
        : {
            index: initialRef.current.initialScrollIndex,
            offsetInItem: initialRef.current.initialScrollOffsetInItem ?? 0,
          },
    initialZielId: initialRef.current.initialNorm
      ? optionen.gesetz.elemente.find((el) => el.data.xmlId === initialRef.current.initialNorm)
          ?.data.id
      : undefined,
    schaetzeZielLeiste(elementId) {
      const index = struktur.sichtbareElemente.findIndex((el) => el.data.id === elementId);
      const pfad = kontext.zielPfad(index);
      const breite = (containerRef.current?.clientWidth ?? maxBreite) - 2 * randInline;
      return schaetzeKontextHoehe(
        pfad,
        schriftgroesse,
        optionen.strukturKontextLeisteGroesse,
        Math.max(
          1,
          (lesbareZeilenlaenge ? Math.min(maxBreite, breite) : breite) - optionen.inhaltEinzug,
        ),
        optionen.messung,
      );
    },
    onZielMessen(elementId, bestaetigen) {
      const index = struktur.sichtbareElemente.findIndex((el) => el.data.id === elementId);
      const messung = { pfad: kontext.zielPfad(index), bestaetigen };
      setZielmessung(messung);
      return () => setZielmessung((aktuell) => (aktuell === messung ? undefined : aktuell));
    },
    onZielUebernehmen(elementId, hoehe) {
      leisteHoeheRef.current = hoehe;
      setLeisteHoehe(hoehe);
      const index = struktur.sichtbareElemente.findIndex((el) => el.data.id === elementId);
      kontext.kontextPfadFuerZielSetzen(index);
      kontext.polsterZuruecksetzen();
    },
    onPositionsKontextUebernehmen() {
      kontext.polsterZuruecksetzen();
      kontext.kontextAktualisieren();
    },
    onZielVorbereiten(elementId) {
      const index = struktur.sichtbareElemente.findIndex((el) => el.data.id === elementId);
      kontext.kontextPfadFuerZielSetzen(index);
      kontext.polsterZuruecksetzen();
    },
    onScrollStandGeaendert(stand) {
      setStand(stand);
      nachfuehrungRef.current.vormerken(stand);
    },
    onBenutzerscrollen() {
      initialPositionierung.verwerfen();
      setZielauftrag(null);
      if (!messlaufGesperrtRef.current) aktuellRef.current.onBedienung?.();
    },
    onNachfuehrungEntwerten: () => nachfuehrungRef.current.entwerten(),
    onPositionGeaendert({ index, offsetInItem }: ScrollPosition) {
      if (messlaufGesperrtRef.current) return;
      const opts = aktuellRef.current;
      opts.onScrollIndexChange?.(index, offsetInItem);
    },
  });
  useLayoutEffect(() => {
    if (
      optionen.einfuehrungSperren?.normAuswahlGesperrt ||
      optionen.einfuehrungSperren?.ueberschriftenGesperrt
    )
      scrollen.entwerteNachfuehrung();
  });
  const bedienungRef = useRef({ struktur, scrollen });
  useLayoutEffect(() => {
    bedienungRef.current = { struktur, scrollen };
  });
  const messlauf = useMesslauf({
    containerRef,
    rekorder: scrollen.messlauf,
    zeilenhoehe: schriftgroesse * zeilenabstand,
    elementzahl: struktur.sichtbareElemente.length,
    gesetz: optionen.gesetz.kurztitel,
    einstellungen: {
      schriftgroesse,
      schriftart: optionen.schriftart,
      zeilenabstand,
      silbentrennung: optionen.hyphens,
      ausrichtung: optionen.textAlign,
      satzanordnung: optionen.satzNeuZeile ? 'Satz je Zeile' : 'fortlaufend',
      sprache: optionen.lang,
    },
    merkePosition() {
      const anker: ScrollAnker | null = bedienungRef.current.scrollen.erfasseAnker();
      return () =>
        new Promise((fertig) => {
          if (!anker) return fertig();
          const { struktur: s, scrollen: scroll } = bedienungRef.current;
          scroll.bereiteAuftragVor();
          const { elementId, offsetInItem } = anker;
          const auftrag = { art: 'wiederherstellen' as const, elementId, offsetInItem };
          setZielauftrag({ auftrag, nachAbschluss: fertig, vorbereitungsStand: s.momentaufnahme });
        });
    },
  });
  useLayoutEffect(() => {
    messlaufGesperrtRef.current = messlauf.gesperrt;
  });
  function nehmeAuftragAn(auftrag: ScrollAuftrag, nachAbschluss?: () => void) {
    scrollen.bereiteAuftragVor();
    setZielauftrag({ auftrag, nachAbschluss, vorbereitungsStand: struktur.momentaufnahme });
  }
  // Nur die Herkunft der nächsten Aktivierung; kein eigenes aktives Element.
  const aktivierungsartRef = useRef<'sprung' | 'schritt' | 'nachfuehrung'>('schritt');
  const vorlaeufigesAktivesElementId = useRef<string | null>(null);
  useLayoutEffect(() => {
    vorlaeufigesAktivesElementId.current = null;
  }, [struktur.momentaufnahme.aktivesElementId, optionen.gesetz]);
  const meldeTab = useTabBezeichnung(
    optionen.gesetz,
    struktur.momentaufnahme.aktivesElementId,
    optionen.onTabBezeichnung,
  );
  const nachfuehrung = useScrollNachfuehrung({
    vorlaeufigMelden(id) {
      if (vorlaeufigesAktivesElementId.current === id) return;
      vorlaeufigesAktivesElementId.current = id;
      meldeTab(id ?? struktur.momentaufnahme.aktivesElementId, id === null);
    },
    standLesen: () => scrollen.messeStand(),
    bereit: initialLayoutBereit && scrollen.bereit && zielauftrag === null,
    gesperrt:
      messlauf.gesperrt ||
      !!(
        optionen.einfuehrungSperren?.normAuswahlGesperrt ||
        optionen.einfuehrungSperren?.ueberschriftenGesperrt
      ),
    aktivesElementId: struktur.momentaufnahme.aktivesElementId,
    aktivieren(id) {
      vorlaeufigesAktivesElementId.current = null;
      meldeTab(id, true);
      aktivierungsartRef.current = 'nachfuehrung';
      struktur.waehleNormText(id);
    },
  });
  useLayoutEffect(() => {
    nachfuehrungRef.current = nachfuehrung;
  });
  useLayoutEffect(() => {
    nachfuehrungRef.current.entwerten();
  }, [optionen.gesetz]);
  function springeZuXmlId(
    xmlId: string,
    art: 'sprung' | 'schritt',
    opts?: { vorfahrenAufklappen?: boolean },
  ): boolean {
    const ziel = struktur.bereiteZielVor(xmlId, opts?.vorfahrenAufklappen !== false);
    if (ziel.status === 'nicht-gefunden') return false;
    initialPositionierung.verwerfen();
    aktuellRef.current.onBedienung?.();
    aktivierungsartRef.current = art;
    nehmeAuftragAn({ art: 'sichtbar-machen', elementId: ziel.elementId });
    return true;
  }
  const fuehreZielauftragAus = useEffectEvent(() => {
    if (!zielauftrag) return;
    if (!struktur.sichtbareElemente.some((el) => el.data.id === zielauftrag.auftrag.elementId)) {
      // Eigene Zielvorbereitung benötigt einen neuen Strukturstand. Ist dieser
      // schon angekommen und das Ziel wieder verborgen, hat die Bedienung den
      // Auftrag beendet; das Ziel wird nicht automatisch erneut aufgeklappt.
      if (struktur.momentaufnahme === zielauftrag.vorbereitungsStand) return;
      scrollen.beendeAuftragOhneZiel();
      setZielauftrag((aktuell) => (aktuell === zielauftrag ? null : aktuell));
      return;
    }
    let abgeschlossen = false;
    scrollen.starteAuftrag(zielauftrag.auftrag, () => {
      abgeschlossen = true;
      setZielauftrag((aktuell) => (aktuell === zielauftrag ? null : aktuell));
      zielauftrag.nachAbschluss?.();
    });
    return () => {
      // Nach Abschluss gehört die Lebensdauer bereits einem möglichen Resize.
      // Nur die noch laufende Fortsetzung dieses Zielauftrags stornieren.
      if (!abgeschlossen) scrollen.storniereFortsetzungen();
    };
  });
  useLayoutEffect(() => fuehreZielauftragAus(), [zielauftrag, struktur.sichtbareElemente]);
  const initialPositionierung = useInitialPositionierung({
    optionen,
    initial: initialRef.current,
    layoutBereit: initialLayoutBereit,
    struktur,
    scrollen,
    hatKontext: (index) => kontext.zielPfad(index).length > 0,
    annehmen: nehmeAuftragAn,
  });
  const { vorgegebenRef } = initialPositionierung;
  const gemeldetesElementRef = useRef<string | null | undefined>(undefined);
  // Wieder gezeigt (Activity) meldet die Ansicht ihr aktives Element erneut als vorgegeben; dieses
  // Echo schließt etwa einen Verlaufsschritt auf eine bereitgehaltene Ansicht mit aktivem Ziel ab.
  const wiedergezeigtRef = useRef(false);
  useEffect(() => () => void (wiedergezeigtRef.current = true), []);
  useEffect(() => {
    const snapshot = struktur.momentaufnahme;
    const wiedergezeigt = wiedergezeigtRef.current;
    if (gemeldetesElementRef.current !== snapshot.aktivesElementId || wiedergezeigt) {
      const el = optionen.gesetz.elemente.find((e) => e.data.id === snapshot.aktivesElementId);
      if (el) {
        const vorgegeben = vorgegebenRef.current === el.data.xmlId;
        const art =
          gemeldetesElementRef.current === undefined || vorgegeben || wiedergezeigt
            ? 'vorgegeben'
            : aktivierungsartRef.current;
        aktuellRef.current.onAktivierung?.({ xmlId: el.data.xmlId, art });
        // Ein noch ausstehendes anderes Ziel bleibt beim erneuten Melden vorgegeben.
        if (!wiedergezeigt || vorgegeben) vorgegebenRef.current = null;
        gemeldetesElementRef.current = snapshot.aktivesElementId;
        wiedergezeigtRef.current = false;
      }
    }
    aktuellRef.current.onEinklappZustandChange?.(
      new Set(snapshot.eingeklappteUeberschriften),
      new Set(snapshot.eingeklappteNormen),
      snapshot.aktivesElementId,
    );
  }, [struktur.momentaufnahme, optionen.gesetz.elemente, vorgegebenRef]);
  const klappeStufe = useCallback((richtung: 'auf' | 'zu') => {
    flushSync(() => nachfuehrungRef.current.fuehreFaelligeNach());
    const { struktur: s, scrollen: scroll } = bedienungRef.current;
    aktuellRef.current.onBedienung?.();
    const anker: KlappAnker | null = scroll.erfasseKlappAnker(
      s.momentaufnahme.aktivesElementId,
      richtung,
    );
    scroll.bereiteAuftragVor();
    aktivierungsartRef.current = richtung === 'zu' ? 'sprung' : 'schritt';
    const ziel = s.klappeStufe(richtung, anker?.elementId ?? null);
    if (ziel.zielId && anker)
      setZielauftrag({
        vorbereitungsStand: s.momentaufnahme,
        auftrag: scroll.erstelleKlappAuftrag(anker, ziel, richtung),
      });
    else {
      setZielauftrag(null);
      scroll.beendeAuftragOhneZiel();
    }
  }, []);
  const aufklappen = useCallback(() => klappeStufe('auf'), [klappeStufe]);
  const zuklappen = useCallback(() => klappeStufe('zu'), [klappeStufe]);
  const klappstufen = useMemo<KlappstufenStatus>(
    () => ({
      aufklappen,
      zuklappen,
      kannAufklappen: struktur.kannAufklappen,
      kannZuklappen: struktur.kannZuklappen,
    }),
    [aufklappen, zuklappen, struktur.kannAufklappen, struktur.kannZuklappen],
  );
  useLayoutEffect(() => {
    aktuellRef.current.onKlappstufenStatusAendern?.(klappstufen);
  }, [klappstufen]);
  usePfeilbedienung({ aktuellRef, bedienungRef, containerRef, aktivierungsartRef, setZielauftrag });
  const onUeberschriftKlick = useCallback((id: string) => {
    aktuellRef.current.onBedienung?.();
    bedienungRef.current.scrollen.entwerteNachfuehrung();
    aktivierungsartRef.current = 'schritt';
    bedienungRef.current.struktur.schalteUeberschrift(id);
  }, []);
  const onNormKlick = useCallback((id: string) => {
    aktuellRef.current.onBedienung?.();
    bedienungRef.current.scrollen.entwerteNachfuehrung();
    aktivierungsartRef.current = 'schritt';
    bedienungRef.current.struktur.schalteNorm(id);
  }, []);
  const onNormTextKlick = useCallback(
    (id: string) => {
      vorlaeufigesAktivesElementId.current = null;
      meldeTab(id, true);
      aktuellRef.current.onBedienung?.();
      bedienungRef.current.scrollen.entwerteNachfuehrung();
      aktivierungsartRef.current = 'schritt';
      bedienungRef.current.struktur.waehleNormText(id);
    },
    [meldeTab],
  );
  const baum = useMemo<BaumSteuerung>(
    () => ({
      ...struktur.momentaufnahme,
      unterArtikelIds: struktur.unterArtikelIds,
      ueberschriftArtigeNormIds: struktur.ueberschriftArtigeNormIds,
      trennerVorIds: struktur.trennerVorIds,
      onUeberschriftKlick,
      onNormKlick,
      onNormTextKlick,
    }),
    [
      struktur.momentaufnahme,
      struktur.unterArtikelIds,
      struktur.ueberschriftArtigeNormIds,
      struktur.trennerVorIds,
      onUeberschriftKlick,
      onNormKlick,
      onNormTextKlick,
    ],
  );
  const hoehenAktualisierenRef = useRef(kontext.kontextAktualisieren);
  useLayoutEffect(() => {
    hoehenAktualisierenRef.current = kontext.kontextAktualisieren;
  });
  const meldeGemesseneHoehe = useCallback((hoehe: number) => {
    const vorher = leisteHoeheRef.current;
    leisteHoeheRef.current = hoehe;
    setLeisteHoehe(hoehe);
    if (hoehe > vorher) hoehenAktualisierenRef.current();
  }, []);
  const kontextLeiste: KontextLeistenModell = {
    pfad: kontextPfad,
    messung: zielmessung,
    effektiveHoehe: kontext.effektiveHoehe,
    hoeheAnimiert: kontext.hoeheAnimiert,
    bereit: initialLayoutBereit && scrollen.bereit,
    waehleEintrag(eintrag) {
      springeZuXmlId((eintrag.ueberschrift ?? eintrag.gliederungsartikel!).xmlId, 'sprung', {
        vorfahrenAufklappen: false,
      });
    },
    meldeGemesseneHoehe,
  };
  return {
    containerRef,
    bereit: initialLayoutBereit && scrollen.bereit,
    textListe: scrollen.textListe,
    klappstufen,
    springeZuXmlId,
    baum,
    kontextLeiste,
    messziel: messlauf.messziel,
    meldeRender: messlauf.meldeRender,
  };
}
