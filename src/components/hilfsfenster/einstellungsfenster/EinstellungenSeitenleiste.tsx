// EinstellungenSeitenleiste.tsx
// Seitenleiste im Einstellungen-Fenster: Inhaltsverzeichnis der vier
// Hauptkategorien (siehe EinstellungenKategorieAbschnitt.tsx). Klick springt
// per scrollIntoView zum jeweiligen Abschnitt, die aktuell sichtbare
// Kategorie wird über useAktiverEinstellungenAbschnitt.ts (IntersectionObserver,
// von EinstellungenFenster.tsx übergeben) hervorgehoben. Fehler bleiben unten
// sichtbar, während Navigation und Einstellungsinhalt unabhängig scrollen.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { standardOderBetont } from '@/lib/stil/textRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { zeilePadding, pxSkaliert } from '@/lib/stil/paddingRollen';

export interface EinstellungenKategorie {
  id: string;
  titel: string;
}

interface EinstellungenSeitenleisteProps {
  kategorien: readonly EinstellungenKategorie[];
  aktiveId: string;
  fehlermeldungen: readonly string[];
}

export function EinstellungenSeitenleiste({
  kategorien,
  aktiveId,
  fehlermeldungen,
}: EinstellungenSeitenleisteProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();

  function springeZu(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav
      style={{
        width: pxSkaliert(150, uiFaktor),
        flexShrink: 0,
        borderRight: '1px solid var(--rahmen)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'hidden',
        minHeight: 0,
      }}
    >
      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {kategorien.map(({ id, titel }) => {
          const aktiv = id === aktiveId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => springeZu(id)}
              style={{
                ...standardOderBetont(aktiv, textRollen),
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: zeilePadding(uiFaktor),
                border: 'none',
                background: aktiv ? 'var(--hover)' : 'transparent',
                borderLeft: `2px solid ${aktiv ? 'var(--akzent)' : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              <TextAnzeige text={titel} />
            </button>
          );
        })}
      </div>
      {fehlermeldungen.length > 0 && (
        <div
          lang="de"
          style={{
            marginTop: 'auto',
            flexShrink: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: zeilePadding(uiFaktor),
            overflowWrap: 'anywhere',
            hyphens: 'auto',
            WebkitHyphens: 'auto',
          }}
        >
          {fehlermeldungen.map((text) => {
            return (
              <div key={text} role="alert" style={textRollen.fehlertext}>
                <TextAnzeige text={text} />
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}
