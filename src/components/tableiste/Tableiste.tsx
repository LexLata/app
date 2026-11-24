// Tableiste.tsx
// Zeigt geöffnete Tabs und verarbeitet Auswahl, Reihenfolge und neue Tabs.
import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { Fragment, useEffect, useRef, type ReactElement } from 'react';
import './tableiste.css';
import { VerlaufButtons } from './Tableiste.verlauf';
import type { Tab } from '@/lib/domain/appTypes.ts';
import { useTabDragUeberFenster } from '@/components/tableiste/hooks/useTabDragUeberFenster';
import { useTableisteScrollFades } from '@/components/tableiste/hooks/useTableisteScrollFades';
import { useTabDragUndReihenfolge } from '@/components/tableiste/hooks/useTabDragUndReihenfolge';
import {
  basisTabStil,
  leistenButtonStil,
  neuerTabButtonBreite,
  TAB_PADDING_VERTIKAL_ROH,
} from '@/components/tableiste/tableisteStil';
import { useTableisteHoehe, LINIE_HOEHE } from '@/components/tableiste/Tableiste.hoehe';
import { TabBeschriftung } from '@/components/tableiste/TabBeschriftung';
import { FremdTabPlatzhalter } from '@/components/tableiste/FremdTabPlatzhalter';
import { TableisteDragKlon } from './Tableiste.dragKlon';
import { usePlattform } from '@/hooks/utils/usePlattform';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { TableisteFensterButtons } from '@/components/tableiste/Tableiste.fensterButtons';
import { useLinuxTitelleistenPraeferenz } from '@/hooks/einstellungen/useLinuxTitelleistenPraeferenz';
import { useTextRollen, useIconGroessen } from '@/hooks/stil/useTextRollen';
import { iconGroesseSkaliert, iconGroessen as ICON_GROESSEN_ROH } from '@/lib/stil/textRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { zeigeHamburgerMenu } from '@/components/tableiste/hamburgerMenu';
import { List, X, Plus } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Tableiste
// ---------------------------------------------------------------------------

interface TableisteProps {
  einfuehrungGesperrt?: boolean;
  tabs: Tab[];
  aktiverTabId: string | null;
  tabTitel: Record<string, string>;
  onTabAktivieren: (id: string) => void;
  onTabSchliessen: (id: string) => void;
  onTabsNeuAnordnen: React.Dispatch<React.SetStateAction<Tab[]>>;
  onUebersichtOeffnen: () => void;
  /** Öffnet einen neuen, leeren Tab (ruft erstelleLeerenTab in
   *  useAppTabs.ts auf – dieselbe Funktion, die auch ⌘T/Strg+T nutzt). */
  onNeuenTabOeffnen: () => void;
  /** Während der Einführung (useEinfuehrung.ts): sperrt den Gesetzesübersicht-
   *  Button, damit der Nutzer nicht vor Abschluss der Einführung ausweicht.
   *  Default false (keine Einschränkung außerhalb der Einführung). */
  uebersichtDeaktiviert?: boolean;
  /** Einstellungen.tsx: "Plattformfremde UI anzeigen" (siehe
   *  usePlattformfremdeUiAnzeigen.ts) – lässt den ☰-Button auch auf macOS
   *  wie unter Windows/Linux das Dropdown-Menü öffnen, zu Testzwecken
   *  (siehe Absprache). Ohne Wirkung auf Windows/Linux selbst, dort öffnet
   *  ☰ ohnehin immer das Dropdown. */
  plattformfremdeUiAnzeigen: boolean;
  /**
   * Wird aufgerufen, wenn ein Tab per Drag aus dem Fenster herausgezogen
   * und AUSSERHALB jedes anderen offenen Fensters losgelassen wurde (siehe
   * useTabDragUndReihenfolge.ts). Tableiste
   * kennt selbst keine Serialisierung/Tauri-Details – App.tsx übernimmt die
   * eigentliche Übertragung in ein neues Fenster. Ein zurückgegebener Promise
   * endet erst nach tatsächlicher Übernahme oder sicherem Fehlschlag.
   */
  onTabHerausziehen: (tabId: string) => void | Promise<void>;
  /**
   * Wird aufgerufen, wenn ein Tab per Drag herausgezogen und über einem
   * ANDEREN, bereits bestehenden Fenster losgelassen wurde. zielLabel ist
   * das Tauri-Fenster-Label dieses Ziels (siehe useTabDragUndReihenfolge.ts:
   * fensterUnterCursorFinden). App.tsx übernimmt die Übertragung dorthin;
   * der Promise umfasst auch die Bestätigung oder den sicheren Fehlschlag.
   */
  onTabInFensterAufnehmen: (tabId: string, zielLabel: string) => void | Promise<void>;
  /**
   * Von App.tsx erzeugter Ref, der (über Tableiste → useTabDragUeberFenster)
   * synchron immer den aktuellen Live-Vorschau-Index spiegelt. App.tsx liest
   * ihn beim Verarbeiten von "tab-uebertragung-eingefuegt", um den
   * ankommenden Tab an der live angezeigten Stelle statt immer ans Ende
   * einzufügen (siehe useTabDragUeberFenster.ts).
   */
  fremdVorschauIndexRef: React.RefObject<number | null>;
  /** "Minimalistischer Modus" (Einstellungen.tsx): blendet die
   *  Verlaufs-Pfeile aus, ohne die zugrundeliegende ⌥←/⌥→-Navigation
   *  (useTastenkuerzel.ts) zu beeinflussen. */
  minimalistischerModus: boolean;
  /** Ob im Verlauf des aktiven Tabs zurück/vorwärts navigiert werden kann
   *  (siehe tabVerlauf.ts) – steuert den ausgegrauten Zustand der Pfeile. */
  kannVerlaufZurueck: boolean;
  kannVerlaufVorwaerts: boolean;
  onVerlaufZurueck: () => void;
  onVerlaufVorwaerts: () => void;
}

const FADE_BREITE = 24;

export function Tableiste({
  einfuehrungGesperrt = false,
  tabs,
  aktiverTabId,
  tabTitel,
  onTabAktivieren,
  onTabSchliessen,
  onTabsNeuAnordnen,
  onUebersichtOeffnen,
  onNeuenTabOeffnen,
  uebersichtDeaktiviert,
  plattformfremdeUiAnzeigen,
  onTabHerausziehen,
  onTabInFensterAufnehmen,
  fremdVorschauIndexRef,
  minimalistischerModus,
  kannVerlaufZurueck,
  kannVerlaufVorwaerts,
  onVerlaufZurueck,
  onVerlaufVorwaerts,
}: TableisteProps) {
  const textRollen = useTextRollen();
  const iconGroessen = useIconGroessen();
  const uiFaktor = useUiSkalierungsFaktor();
  const { zeile: leistenHoehe } = useTableisteHoehe();
  const neuerTabButtonBreiteWert = neuerTabButtonBreite(uiFaktor, iconGroessen.iconButton);
  const leisteRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<Tab[]>(tabs);
  const hamburgerButtonRef = useRef<HTMLButtonElement>(null);
  const { istMac: istMacOS, istWindows, istLinux } = usePlattform();
  const { linuxTitelleistenPraeferenz } = useLinuxTitelleistenPraeferenz();
  // ☰-Button: auf Windows/Linux immer das Dropdown-Menü (native Menübar
  // existiert dort nicht); auf macOS normalerweise direkt "Gesetze
  // verwalten" (bisheriges Verhalten, native Menübar deckt den Rest ab) –
  // AUSSER die Einstellung "Plattformfremde UI anzeigen" ist aktiv, dann
  // auch auf macOS das Dropdown, rein zu Testzwecken (siehe Absprache).
  const zeigeDropdownMenu = istWindows || istLinux || (istMacOS && plattformfremdeUiAnzeigen);
  // Fenster-Buttons (Minimieren/Maximieren/Schließen) rechts: immer unter
  // Windows (decorations:false ist dort fest in tauri.windows.conf.json
  // gesetzt), unter Linux nur bei expliziter 'eigene'-Präferenz (siehe
  // useLinuxTitelleistenPraeferenz.ts) – dort ist decorations:true der
  // sichere Default, solange der Nutzer nichts anderes gewählt hat.
  const zeigeFensterButtons = istWindows || (istLinux && linuxTitelleistenPraeferenz === 'eigene');

  // Immer aktueller Spiegel von tabTitel (gleiches Muster wie tabsRef) –
  // wird von useTabDragUndReihenfolge beim Melden der Drag-Bewegung
  // gebraucht (lebt in einem Effect mit LEEREM Dependency-Array und würde
  // sonst mit dem tabTitel-Stand vom Mount-Zeitpunkt arbeiten).
  const tabTitelRef = useRef(tabTitel);
  useEffect(() => {
    tabTitelRef.current = tabTitel;
  }, [tabTitel]);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const { fremdVorschau, dragBewegungMelden, dragEndeVorbereiten } = useTabDragUeberFenster({
    leisteRef,
    tabsRef,
    fremdVorschauIndexRef,
  });

  const {
    kannLinksScrollen,
    kannRechtsScrollen,
    neuerTabButtonPasstInline,
    scrollFadeAktualisieren,
    autoScrollBeiCursorAktualisieren,
    autoScrollStoppen,
  } = useTableisteScrollFades({
    leisteRef,
    tabs,
    aktiverTabId,
    neuerTabButtonBreite: neuerTabButtonBreiteWert,
  });

  const { dragZustand, ausstehendeTabIds, offsetX, onTabPointerDown, startDragWindow } =
    useTabDragUndReihenfolge({
      tabs,
      leisteRef,
      onTabAktivieren,
      onTabsNeuAnordnen,
      onTabHerausziehen,
      onTabInFensterAufnehmen,
      tabTitelRef,
      dragBewegungMelden,
      dragEndeVorbereiten,
      autoScrollBeiCursorAktualisieren,
      autoScrollStoppen,
    });

  const tabElemente: ReactElement[] = tabs.map((tab, index) => {
    const aktiv = tab.id === aktiverTabId;
    const wirdGezogen = dragZustand?.tabId === tab.id;
    const uebergabeAusstehend = ausstehendeTabIds.has(tab.id);

    return (
      <Fragment key={tab.id}>
        {fremdVorschau?.index === index && (
          <FremdTabPlatzhalter zeile1={fremdVorschau.zeile1} zeile2={fremdVorschau.zeile2} />
        )}
        <div
          data-tab-id={tab.id}
          onPointerDown={(e) => {
            if (!einfuehrungGesperrt) onTabPointerDown(e, tab.id);
          }}
          style={
            {
              ...basisTabStil(uiFaktor),
              cursor: dragZustand ? 'grabbing' : 'grab',

              ...(wirdGezogen || uebergabeAusstehend
                ? {
                    ...(dragZustand?.ausserhalb || uebergabeAusstehend ? { display: 'none' } : {}),
                    opacity: 0,
                    pointerEvents: 'none',
                  }
                : aktiv
                  ? {
                      background: 'var(--bg-haupt)',
                      position: 'relative',
                      zIndex: 1,
                      marginBottom: -LINIE_HOEHE,
                      // Bugfix: vorher `paddingBottom: LINIE_HOEHE`
                      // – das ERSETZTE das reguläre untere Padding
                      // aus basisTabStil() komplett (statt es zu
                      // ergänzen), wodurch der aktive Tab unten
                      // IMMER nur 1px Padding hatte statt des
                      // skalierten Werts (5–6px je nach UI-Größe),
                      // während oben das volle Padding blieb –
                      // sichtbar asymmetrisch, besonders bei
                      // UI-Größe "groß" (größerer absoluter
                      // Unterschied). Jetzt: reguläres Padding +
                      // die 1px für die Unterstrich-Reserve oben
                      // drauf, kompensiert wie bisher über
                      // marginBottom.
                      paddingBottom: pxSkaliert(TAB_PADDING_VERTIKAL_ROH, uiFaktor) + LINIE_HOEHE,
                    }
                  : {
                      background: 'transparent',
                      transition: 'background 0.1s',
                    }),
            } as React.CSSProperties
          }
          onMouseEnter={(e) => {
            if (!aktiv && !wirdGezogen && !dragZustand)
              (e.currentTarget as HTMLElement).style.background = 'var(--hover)';
          }}
          onMouseLeave={(e) => {
            if (!aktiv && !wirdGezogen)
              (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <TabBeschriftung
            titel={tab.gesetzesreferenz?.kurztitel ?? 'Neuer Tab'}
            untertitel={
              !tab.ladezustand || tab.ladezustand === 'geladen' ? tabTitel[tab.id] : undefined
            }
            aktiv={aktiv}
          />

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!einfuehrungGesperrt) onTabSchliessen(tab.id);
            }}
            style={{
              ...textRollen.hinweistext,
              color: 'var(--symbol-gedaempft)',
              width: pxSkaliert(18, uiFaktor),
              height: pxSkaliert(18, uiFaktor),
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              WebkitAppearance: 'none',
              appearance: 'none',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--rahmen)';
              e.currentTarget.style.color = 'var(--text-primaer)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--symbol-gedaempft)';
            }}
          >
            <X
              size={iconGroesseSkaliert(ICON_GROESSEN_ROH.standard, 0.875 * uiFaktor)}
              weight="regular"
            />
          </button>
        </div>
      </Fragment>
    );
  });

  const gezogenerTab = tabs.find((tab) => tab.id === dragZustand?.tabId);
  return (
    <div data-einfuehrung-grenze="oben" style={{ flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          height: leistenHoehe,
          background: 'var(--bg-leiste)',
        }}
      >
        {!!istMacOS && (
          <div
            data-tauri-drag-region
            style={{ width: pxSkaliert(88, uiFaktor), flexShrink: 0 }}
            onMouseDown={startDragWindow}
          />
        )}

        {!minimalistischerModus && (
          <VerlaufButtons
            kannVerlaufZurueck={kannVerlaufZurueck}
            kannVerlaufVorwaerts={kannVerlaufVorwaerts}
            onVerlaufZurueck={onVerlaufZurueck}
            onVerlaufVorwaerts={onVerlaufVorwaerts}
            istMacOS={istMacOS}
            uiFaktor={uiFaktor}
            iconButtonGroesse={iconGroessen.iconButton}
          />
        )}

        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <div
            ref={leisteRef}
            className="gz-tableiste-scroll"
            onDragStart={(e) => e.preventDefault()}
            onScroll={scrollFadeAktualisieren}
            style={
              {
                display: 'flex',
                alignItems: 'stretch',
                height: '100%',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                cursor: dragZustand ? 'grabbing' : 'default',
                overflowX: 'auto',
                overflowY: 'hidden',
              } as React.CSSProperties
            }
          >
            {tabElemente}
            {!!fremdVorschau && fremdVorschau.index >= tabs.length && (
              <FremdTabPlatzhalter zeile1={fremdVorschau.zeile1} zeile2={fremdVorschau.zeile2} />
            )}

            {!minimalistischerModus && !!neuerTabButtonPasstInline && (
              <TextAttributElement
                element="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (!einfuehrungGesperrt) onNeuenTabOeffnen();
                }}
                title={`Neuer Tab (${tastenkuerzelAnzeige('neuer-tab', istMacOS)})`}
                style={{ ...leistenButtonStil(uiFaktor), flexShrink: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primaer)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-sekundaer)')}
              >
                <Plus size={iconGroessen.iconButton} weight="regular" />
              </TextAttributElement>
            )}

            <div data-tauri-drag-region style={{ flex: 1 }} onMouseDown={startDragWindow} />
          </div>

          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: FADE_BREITE,
              background: 'linear-gradient(to right, var(--bg-leiste), transparent)',
              pointerEvents: 'none',
              zIndex: 2,
              opacity: kannLinksScrollen ? 1 : 0,
              transition: 'opacity 0.15s',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: FADE_BREITE,
              background: 'linear-gradient(to left, var(--bg-leiste), transparent)',
              pointerEvents: 'none',
              zIndex: 2,
              opacity: kannRechtsScrollen ? 1 : 0,
              transition: 'opacity 0.15s',
            }}
          />
        </div>

        {!minimalistischerModus && !neuerTabButtonPasstInline && (
          <TextAttributElement
            element="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (!einfuehrungGesperrt) onNeuenTabOeffnen();
            }}
            title={`Neuer Tab (${tastenkuerzelAnzeige('neuer-tab', istMacOS)})`}
            style={{
              ...leistenButtonStil(uiFaktor),
              flexShrink: 0,
              borderLeft: '1px solid var(--rahmen)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primaer)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-sekundaer)')}
          >
            <Plus size={iconGroessen.iconButton} weight="regular" />
          </TextAttributElement>
        )}

        <TextAttributElement
          element="button"
          ref={hamburgerButtonRef}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (uebersichtDeaktiviert) return;
            if (zeigeDropdownMenu && hamburgerButtonRef.current) {
              void zeigeHamburgerMenu(hamburgerButtonRef.current);
            } else {
              onUebersichtOeffnen();
            }
          }}
          disabled={uebersichtDeaktiviert}
          title={
            zeigeDropdownMenu
              ? 'Menü'
              : `Gesetzesübersicht (${tastenkuerzelAnzeige('gesetzesuebersicht', istMacOS)})`
          }
          style={{
            ...leistenButtonStil(uiFaktor, 16),
            borderLeft: '1px solid var(--rahmen)',
            cursor: uebersichtDeaktiviert ? 'default' : 'pointer',
            opacity: uebersichtDeaktiviert ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (!uebersichtDeaktiviert) e.currentTarget.style.color = 'var(--text-primaer)';
          }}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-sekundaer)')}
        >
          <List size={iconGroessen.iconButton} weight="regular" />
        </TextAttributElement>

        {!!zeigeFensterButtons && <TableisteFensterButtons />}
      </div>

      <div style={{ height: LINIE_HOEHE, background: 'var(--rahmen)' }} />

      {dragZustand && !dragZustand.ausserhalb && gezogenerTab ? (
        <TableisteDragKlon
          zustand={dragZustand}
          tab={gezogenerTab}
          untertitel={
            !gezogenerTab.ladezustand || gezogenerTab.ladezustand === 'geladen'
              ? tabTitel[gezogenerTab.id]
              : undefined
          }
          aktiv={gezogenerTab.id === aktiverTabId}
          uiFaktor={uiFaktor}
          offset={offsetX.current}
          hoehe={leistenHoehe}
        />
      ) : null}
    </div>
  );
}
