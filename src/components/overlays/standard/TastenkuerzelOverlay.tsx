// Zeigt eine redaktionell gekürzte Übersicht; alle Belegungen stammen aus dem Katalog.
import { useSeitenleistenTastenkuerzel } from '@/hooks/einstellungen/useSeitenleistenTastenkuerzel';
import { Keyboard } from '@phosphor-icons/react';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from './OverlayKopfzeile';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayAussenPadding } from '@/lib/stil/paddingRollen';
import { usePlattform } from '@/hooks/utils/usePlattform';
import {
  tastenkuerzelAnzeige,
  tastenkuerzelKatalog,
} from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';

type UebersichtsZeile = string | { ids: string[]; bezeichnung: string };
// Hier stehen nur Auswahl und Zusammenfassung, keine eigenen Tastenbelegungen.
const ABSCHNITTE: { titel: string; zeilen: UebersichtsZeile[] }[] = [
  {
    titel: 'Fenster & Tabs',
    zeilen: [
      'neues-fenster',
      'neuer-tab',
      'letzter-tab',
      'schliessen-tab',
      'fenster-schliessen',
      'einstellungen',
      'tab-position',
      { ids: ['tab-naechster', 'tab-vorheriger'], bezeichnung: 'Nächster / vorheriger Tab' },
    ],
  },
  {
    titel: 'Gesetze & Suche',
    zeilen: [
      'oeffnen',
      'oeffnen-vorbelegt',
      'gesetzesuebersicht',
      'volltext-suche',
      'volltext-alle',
      'verlauf-anzeigen',
      'gesetz-info',
      'dateien-importieren',
      'gesetze-aktualisieren',
      'export',
    ],
  },
  {
    titel: 'Lesezeichen & Favoriten',
    zeilen: [
      'lesezeichen-speichern',
      'alle-lesezeichen-entfernen',
      'lesezeichen-1-10',
      'lesezeichen-11-20',
      'favorit-speichern',
      'favoriten-1-26',
      'favoriten-27-52',
      'favoriten-53-78',
    ],
  },
  {
    titel: 'Markieren',
    zeilen: [
      'unterstreichen',
      'hervorheben',
      'verweismarkierung',
      'kommentar',
      'markierung-rueckgaengig',
      'markierung-wiederholen',
    ],
  },
  {
    titel: 'Pfeiltasten',
    zeilen: [
      { ids: ['verlauf-vor', 'verlauf-zurueck'], bezeichnung: 'Im Verlauf vorwärts / zurück' },
      {
        ids: ['element-naechstes', 'element-vorheriges'],
        bezeichnung: 'Zum nächsten / vorherigen Element',
      },
      {
        ids: ['ueberschrift-naechste', 'ueberschrift-vorherige'],
        bezeichnung: 'Zur nächsten / vorherigen Überschrift',
      },
      {
        ids: ['klappstufe-aufklappen', 'klappstufe-zuklappen'],
        bezeichnung: 'Klappstufe des Gesetzes aufklappen / zuklappen',
      },
      'elternelement',
      'elternelement-einklappen',
      'element-aufklappen',
      'element-einzeln-aufklappen',
    ],
  },
];

export function TastenkuerzelOverlay({ onSchliessen }: { onSchliessen: () => void }) {
  const textRollen = useTextRollen();
  const abstand = useAbstandRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const { istMac } = usePlattform();
  const { seitenleistenTastenkuerzel } = useSeitenleistenTastenkuerzel();
  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_GROSS}>
      <OverlayKopfzeile icon={Keyboard} titel="Tastenkürzel" onSchliessen={onSchliessen} />
      <div
        style={{
          overflowY: 'auto',
          minHeight: 0,
          padding: overlayAussenPadding(uiFaktor),
          display: 'flex',
          flexDirection: 'column',
          gap: abstand.gross,
        }}
      >
        {ABSCHNITTE.map((abschnitt, index) => {
          const zeilen: UebersichtsZeile[] = abschnitt.zeilen;
          return (
            <section
              key={abschnitt.titel}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: abstand.gross,
                ...(index > 0
                  ? { borderTop: '1px solid var(--rahmen)', paddingTop: abstand.gross }
                  : {}),
              }}
            >
              <TextAnzeige
                element="h2"
                text={abschnitt.titel}
                style={{ ...textRollen.abschnittsUeberschrift, margin: 0 }}
              />
              {abschnitt.titel === 'Lesezeichen & Favoriten' && !seitenleistenTastenkuerzel && (
                <TextAnzeige
                  element="p"
                  text="Die Kürzel zum Öffnen von Lesezeichen und Favoriten sind nur wirksam, wenn in den Einstellungen „Tastenkürzel in Seitenleisten aktivieren“ gesetzt ist."
                  style={{ ...textRollen.hinweistext, margin: 0 }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: abstand.standard }}>
                {zeilen.map((zeile) => {
                  const ids = typeof zeile === 'string' ? [zeile] : zeile.ids;
                  const bezeichnung =
                    typeof zeile === 'string'
                      ? tastenkuerzelKatalog.find((e) => e.id === zeile)!.bezeichnung
                      : zeile.bezeichnung;
                  return (
                    <div
                      key={ids[0]}
                      data-tastenkuerzel-ids={ids.join(' ')}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: abstand.standard,
                        justifyContent: 'space-between',
                      }}
                    >
                      <TextAnzeige text={bezeichnung} style={textRollen.standardtext} />
                      <kbd
                        style={{
                          ...textRollen.standardtext,
                          fontFamily: 'var(--schrift)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        <TextAnzeige
                          text={ids.map((id) => tastenkuerzelAnzeige(id, istMac)).join(' / ')}
                        />
                      </kbd>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        <TextAnzeige
          element="p"
          text="Gesetzeskurzbefehle können Sie unter „Gesetze verwalten“ festlegen."
          style={{ ...textRollen.hinweistext, margin: 0 }}
        />
      </div>
    </OverlayRahmen>
  );
}
