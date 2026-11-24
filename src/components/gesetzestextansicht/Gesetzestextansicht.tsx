// Gesetzestextansicht.tsx
// Rendert das Steuerungsmodell und verbindet Auswahl, Markierungen und Favoriten.
import { messeSichtbareDarstellung } from '@/lib/utils/perfMessung';
import { meldeSpeicherauskunft } from '@/lib/utils/speicherMessung';
import { meldeScrollMessziel } from '@/lib/utils/scrollMesslaufAnmeldung';
import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
import {
  useTextDarstellungsModell,
  TextDarstellungsRahmen,
  type TextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { Profiler, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useId } from 'react';
import {
  useAnsichtssteuerung,
  StrukturKontextLeiste,
} from './ansichtssteuerung/ansichtssteuerung.index';
import { EinklappCtx } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import type { EinklappState } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import { MarkierungCtx } from '@/components/gesetzestextansicht/markierung/markierung.index';
import { useMarkierungenAnzeige } from '@/components/gesetzestextansicht/markierung/markierung.index';
import {
  useAuswahlleiste,
  useZitatKopieren,
  Auswahlleiste,
} from '@/components/gesetzestextansicht/auswahl/auswahl.index';
import {
  TEXT_SPALTE_BREITE,
  STANDARD_RAND_INLINE,
  berechneTitelEinzug,
} from './Gesetzestextansicht.layout';
import { VirtualisierteListe } from './baum/baum.index';
import { useFavoritenleiste } from '@/components/seitenleisten/seitenleisten.index';
import type { GesetzestextansichtProps } from '@/components/gesetzestextansicht/Gesetzestextansicht.types';
import { useMarkierungCtxValue } from '@/components/gesetzestextansicht/markierung/markierung.index';
import { pruefeKurzform, vollstaendigeBezeichnung } from '@/lib/domain/norm/norm.index';
import {
  SCHRIFTGROESSE_DEFAULT,
  SCHRIFTART_DEFAULT,
  ZEILENABSTAND_DEFAULT,
  SILBENTRENNUNG_DEFAULT,
  STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT,
  STRUKTURKONTEXTLEISTE_GROESSE_WERTE,
  LESBARE_ZEILENLAENGE_DEFAULT,
} from '@/lib/stil/gesetzTextDarstellung';

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function Gesetzestextansicht({
  gesetz,
  initialNorm,
  initialScrollIndex,
  initialScrollOffsetInItem = 0,
  onScrollIndexChange,
  onInitialNormScrolled,
  initialEingeklappteUeberschriften,
  initialEingeklappteNormen,
  initialAktivesElementId,
  onAktivierung,
  onBedienung,
  onEinklappZustandChange,
  schriftgroesse = SCHRIFTGROESSE_DEFAULT,
  schriftart = SCHRIFTART_DEFAULT,
  zeilenabstand = ZEILENABSTAND_DEFAULT,
  blocksatz,
  silbentrennungAktiviert = SILBENTRENNUNG_DEFAULT,
  strukturKontextLeisteGroesse = STRUKTURKONTEXTLEISTE_GROESSE_WERTE[
    STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT
  ],
  lesbareZeilenlaenge = LESBARE_ZEILENLAENGE_DEFAULT,
  maxTextSpalteBreite = TEXT_SPALTE_BREITE,
  randInline = STANDARD_RAND_INLINE,
  satzNeuZeile = true,
  markierungenDeaktiviert = false,
  onTabBezeichnung,
  favoritenVersion = 0,
  seitenleistenTastenkuerzel = false,
  seitenleistenFavoriten,
  lesezeichenGeladen = true,
  onVerweisKlick,
  onVerweisBearbeiten,
  onKommentarKlick,
  onMarkierungLoeschen,
  onUnterstreichen,
  onHervorheben,
  onVerweismarkierungAnfrage,
  onKommentarAnfrage,
  minimalistischerModus = false,
  onFavoritenStatusAendern,
  onSpeicherbareNormAendern,
  onKlappstufenStatusAendern,
  einfuehrungSperren,
}: GesetzestextansichtProps) {
  const textDarstellung: TextDarstellungsModell = useTextDarstellungsModell({
    schriftart,
    zeilenabstand,
    blocksatz,
    silbentrennungAktiviert,
    sprache: gesetz.sprache,
  });
  const elemente = gesetz.elemente;
  // Messmodus: Anmeldung beim Rendern, weil verdeckte Ansichten keine Effekte ausführen;
  // speicherbericht() findet die Ansicht über ihr DOM-Attribut und fragt den Messstand erst dann ab.
  const ansichtsId = useId();
  meldeSpeicherauskunft({
    art: 'ansicht',
    id: ansichtsId,
    gesetz,
    messstand: textDarstellung.messung.holeMessstand,
  });
  const normScrollen = (xmlId: string) => {
    steuerung.springeZuXmlId(xmlId, 'sprung');
  };
  const { favoritenEintraege, geladen: favoritenGeladen } = useFavoritenleiste({
    gesetz,
    favoritenVersion,
    seitenleistenTastenkuerzel,
    normScrollen,
  });
  const steuerung = useAnsichtssteuerung({
    gesetz,
    initialLayoutBereit:
      favoritenGeladen &&
      lesezeichenGeladen &&
      (seitenleistenFavoriten === undefined || seitenleistenFavoriten === favoritenEintraege),
    initialNorm,
    initialScrollIndex,
    initialScrollOffsetInItem,
    onScrollIndexChange,
    onInitialNormScrolled,
    initialEingeklappteUeberschriften,
    initialEingeklappteNormen,
    initialAktivesElementId,
    onAktivierung,
    onBedienung,
    onEinklappZustandChange,
    schriftgroesse,
    schriftart,
    zeilenabstand,
    lesbareZeilenlaenge,
    maxTextSpalteBreite,
    randInline,
    onTabBezeichnung,
    onKlappstufenStatusAendern,
    einfuehrungSperren,
    messung: textDarstellung.messung,
    lang: textDarstellung.lang,
    hyphens: textDarstellung.hyphens,
    textAlign: textDarstellung.textAlign,
    satzNeuZeile,
    inhaltEinzug: berechneTitelEinzug(minimalistischerModus, schriftgroesse),
    strukturKontextLeisteGroesse,
  });
  const { containerRef, bereit } = steuerung;
  useEffect(() => {
    if (!import.meta.env.DEV || !bereit) return;
    return messeSichtbareDarstellung(() => {
      let saetze = 0;
      let zeichen = 0;
      // Nur Textfelder und Satzlisten zählen, keine IDs oder Verweis-Metadaten.
      const zaehle = (wert: unknown): void => {
        if (!wert || typeof wert !== 'object') return;
        if (Array.isArray(wert)) {
          wert.forEach(zaehle);
          return;
        }
        for (const [name, inhalt] of Object.entries(wert)) {
          if (name === 'saetze' && Array.isArray(inhalt)) saetze += inhalt.length;
          if (
            ['text', 'titel', 'bezeichnung', 'fussnoten', 'fortsetzung'].includes(name) &&
            typeof inhalt === 'string'
          )
            zeichen += inhalt.length;
          if (
            [
              'data',
              'absaetze',
              'unterabsaetze',
              'saetze',
              'eintraege',
              'untereintraege',
              'zusatztexte',
            ].includes(name)
          )
            zaehle(inhalt);
        }
      };
      zaehle(gesetz.elemente);
      textDarstellung.messung.meldeMessstand('nach Aufbau');
      return `${gesetz.kurztitel}: ${gesetz.elemente.length} Elemente; ${saetze} Sätze; ${zeichen} Zeichen (Textfelder)`;
    });
  }, [bereit, gesetz, textDarstellung.messung]);
  // Messlauf (Entwicklungsbetrieb): nur gezeigte Ansichten führen Effekte aus und sind angemeldet.
  const { messziel } = steuerung;
  useEffect(() => (messziel ? meldeScrollMessziel(messziel) : undefined), [messziel]);
  const { aktivesElementId } = steuerung.baum;
  // Ist die aktive Norm ein Favorit? Ist Favoritenleiste überhaupt sichtbar
  // (mind. ein Favorit im Gesetz)? – siehe Lesezeichenleiste.tsx: der
  // Stern-Button dort wird nur gerendert, wenn diese Leiste NICHT sichtbar
  // ist (favoritenleisteSichtbar === false).
  //
  // Wichtig: favoritenEintraege[].xmlId ist data.xmlId (stabil), aktivesElementId
  // aber data.id (zufällig pro Parse-Lauf, siehe useStrukturZustand.ts) – ein
  // direkter Vergleich der beiden träfe nie zu. Stattdessen wird, wie beim
  // Speichern selbst (aktivesElementBezeichnungErmitteln in
  // useLesezeichenUndFavoriten.ts), über die bezeichnung verglichen.
  const aktuelleBezeichnung = useMemo(() => {
    const el = elemente.find((e) => e.data.id === aktivesElementId);
    const pruefung = el ? pruefeKurzform(gesetz, el) : null;
    return el && pruefung?.ok ? vollstaendigeBezeichnung(gesetz, el.data.xmlId) : null;
  }, [elemente, gesetz, aktivesElementId]);
  const istAktuellFavorit = useMemo(
    () =>
      !!aktuelleBezeichnung &&
      favoritenEintraege.some((f) => f.bezeichnung === aktuelleBezeichnung),
    [favoritenEintraege, aktuelleBezeichnung],
  );
  const normMeldungRef = useRef(onSpeicherbareNormAendern);
  useLayoutEffect(() => {
    normMeldungRef.current = onSpeicherbareNormAendern;
  });
  useLayoutEffect(() => {
    normMeldungRef.current?.(
      aktuelleBezeichnung
        ? { gesetz, bezeichnung: aktuelleBezeichnung, istFavorit: istAktuellFavorit }
        : null,
    );
  }, [gesetz, aktuelleBezeichnung, istAktuellFavorit]);
  useLayoutEffect(
    () => () => {
      normMeldungRef.current?.(null);
    },
    [],
  );
  const normScrollenRef = useRef(normScrollen);
  useLayoutEffect(() => {
    normScrollenRef.current = normScrollen;
  });
  const favoritAufrufen = useCallback((xmlId: string) => normScrollenRef.current(xmlId), []);
  const onFavoritenStatusAendernRef = useRef(onFavoritenStatusAendern);
  useLayoutEffect(() => {
    onFavoritenStatusAendernRef.current = onFavoritenStatusAendern;
  }, [onFavoritenStatusAendern]);
  useLayoutEffect(() => {
    onFavoritenStatusAendernRef.current?.({
      istAktuellFavorit,
      favoritenleisteSichtbar: favoritenEintraege.length > 0,
      favoritenEintraege,
      favoritAufrufen,
    });
  }, [istAktuellFavorit, favoritenEintraege, favoritAufrufen]);
  // Leert beim Abbau oder Verdecken. Als Layout-Aufräumen läuft es im selben
  // Commit vor der Meldung einer gleichzeitig sichtbar werdenden Ansicht.
  useLayoutEffect(
    () => () => {
      onFavoritenStatusAendernRef.current?.({
        istAktuellFavorit: false,
        favoritenleisteSichtbar: false,
        favoritenEintraege: [],
        favoritAufrufen: () => {},
      });
    },
    [],
  );
  useEffect(
    () => () => {
      normScrollenRef.current = () => {};
    },
    [],
  );

  // Markierungen (Unterstreichungen) für dieses Gesetz laden + über
  // Mehrfenster-Sync aktuell halten – siehe useMarkierungenAnzeige.ts.
  const { markierungenNachXmlId } = useMarkierungenAnzeige(gesetz, markierungenDeaktiviert);

  // Schwebende Auswahlleiste bei Pointer-Drag-Textauswahl – siehe
  // useAuswahlleiste.ts. Zweiter Eintrittspunkt für dieselben
  // Aktionen wie Tastenkürzel/Menü, daher rein additiv (onUnterstreichen usw.
  // bleiben optional – ohne sie zeigt die Leiste nichts an, siehe Rendering
  // unten).
  const {
    leiste,
    ausblenden: leisteAusblenden,
    setKopierenLaeuft,
  } = useAuswahlleiste({
    containerRef,
    gesetz,
    markierungenNachXmlId,
    markierungenDeaktiviert,
  });

  // "Zitat kopieren" in derselben Leiste – siehe useZitatKopieren.ts
  // (kolokiert, nur hier gebraucht, kein App.tsx-Prop nötig).
  const { kopieren: zitatKopieren } = useZitatKopieren(gesetz);

  const markierungValue = useMarkierungCtxValue({
    markierungenNachXmlId,
    onVerweisKlick,
    onVerweisBearbeiten,
    onKommentarKlick,
    onMarkierungLoeschen,
  });

  const einklappValue = useMemo<EinklappState>(
    () => ({ ...steuerung.baum, minimalistischerModus }),
    [steuerung.baum, minimalistischerModus],
  );

  const inhalt = (
    <MarkierungCtx.Provider value={markierungValue}>
      <EinklappCtx.Provider value={einklappValue}>
        <div
          style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}
          data-speichermessung-ansicht={import.meta.env.DEV ? ansichtsId : undefined}
        >
          <TextDarstellungsRahmen
            modell={textDarstellung}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
              height: '100%',
              visibility: bereit ? 'visible' : 'hidden',
            }}
          >
            <StrukturKontextLeiste
              modell={steuerung.kontextLeiste}
              schrift={schriftgroesse}
              skalierungsFaktor={strukturKontextLeisteGroesse}
              maxBreite={steuerung.textListe.maxTextBreite}
              randInline={randInline}
              minimalistischerModus={minimalistischerModus}
            />
            <UeberlagerterScrollbereich
              ref={containerRef}
              beschriftung="Gesetzestext"
              style={{
                overflow: 'auto',
                overflowAnchor: 'none',
                visibility: bereit ? 'visible' : 'hidden',
              }}
            >
              <VirtualisierteListe
                modell={steuerung.textListe}
                schriftgroesse={schriftgroesse}
                satzNeuZeile={satzNeuZeile}
                randInline={randInline}
              />
            </UeberlagerterScrollbereich>
          </TextDarstellungsRahmen>
        </div>
        {!!leiste &&
          !!(
            onUnterstreichen ||
            onHervorheben ||
            onVerweismarkierungAnfrage ||
            onKommentarAnfrage
          ) && (
            <Auswahlleiste
              leiste={leiste}
              onUnterstreichen={() => onUnterstreichen?.()}
              onHervorheben={() => onHervorheben?.()}
              onVerweismarkierungAnfrage={() => onVerweismarkierungAnfrage?.()}
              onKommentarAnfrage={() => onKommentarAnfrage?.()}
              onEntfernen={(eintraege) => {
                if (!leiste.xmlId || !onMarkierungLoeschen) return;
                for (const eintrag of eintraege) onMarkierungLoeschen(leiste.xmlId, eintrag);
              }}
              onZitatKopieren={zitatKopieren}
              onKopierenLaeuftAendern={setKopierenLaeuft}
              onAusgefuehrt={leisteAusblenden}
            />
          )}
      </EinklappCtx.Provider>
    </MarkierungCtx.Provider>
  );
  // Messlauf (nur Entwicklungsbetrieb): React-Renderzeit für die Bildzeit-Aufteilung. Die
  // Meldefunktion bleibt je Ansicht gleich, der Baum wird also nie umgehängt.
  return steuerung.meldeRender ? (
    <Profiler id="Gesetzestextansicht" onRender={steuerung.meldeRender}>
      {inhalt}
    </Profiler>
  ) : (
    inhalt
  );
}
