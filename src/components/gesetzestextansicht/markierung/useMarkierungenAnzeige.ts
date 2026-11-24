// useMarkierungenAnzeige.ts
// Lädt die gespeicherten Unterstreichungen für das aktuell dargestellte
// Gesetz (markierungSpeicher.ts) und hält sie über Mehrfenster-Sync-Events
// aktuell – analog zu useFavoritenleiste.ts. Löst bezeichnung → xmlId auf (bei
// Normen mit der Präfixliste der Ausgangsstelle, bei Überschriften
// über die gliederungskennzahl),
// damit die Zuordnung in MarkierungCtx direkt nach xmlId erfolgen kann. Das
// eigentliche Hinzufügen (⌘U) geschieht App-seitig in useMarkierungen.ts –
// dieser Hook reagiert nur auf das danach ausgelöste Sync-Event und lädt für
// dieses eine Gesetz neu (kein erneutes Parsen der Gesetzes-XML, nur der
// kleinen Markup-Datei).
import { beginneMessspanne } from '@/lib/utils/perfMessung';

import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { useEffect, useEffectEvent, useState } from 'react';
import { findeElementZuBezeichnung } from '@/lib/markierungen/markierungen.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

/** Normen und ausdrücklich gekennzeichnete Überschriften getrennt auflösen. */
function bezeichnungOderGliederungskennzahlZuXmlId(
  gesetz: GesetzDarstellung,
  ausgangsstelle: Ausgangsstelle,
): string | null {
  return findeElementZuBezeichnung(gesetz, ausgangsstelle)?.xmlId ?? null;
}

export function useMarkierungenAnzeige(
  gesetz: GesetzDarstellung,
  markierungenDeaktiviert: boolean = false,
) {
  const gesetzSchluessel = gesetzesreferenzSchluessel(gesetz);
  const [version, setVersion] = useState(0);
  const [markierungenNachXmlId, setMarkierungenNachXmlId] = useState<
    Map<string, MarkierungsEintrag[]>
  >(new Map());

  const leseGesetz = useEffectEvent(() => gesetz);

  useEffect(() => {
    const gesetz = leseGesetz();
    // Einstellung "Markierungen deaktivieren" (siehe useMarkierungenDeaktiviert.ts):
    // gespeicherte Einträge bleiben unangetastet auf der Platte, werden hier
    // nur nicht geladen/angezeigt – bei erneutem Aktivieren (deaktiviert wird
    // wieder false, Effekt läuft erneut) erscheinen sie unverändert wieder.
    if (markierungenDeaktiviert) {
      setMarkierungenNachXmlId(new Map());
      return;
    }
    const messungBeenden = beginneMessspanne('Markierungen geladen');
    let abgebrochen = false;
    (async () => {
      const { ladeMarkierungen } = await import('@/lib/markierungen/markierungen.index');
      return ladeMarkierungen(gesetz);
    })()
      .then((eintraege) => {
        if (abgebrochen) return;
        const map = new Map<string, MarkierungsEintrag[]>();
        for (const eintrag of eintraege) {
          const xmlId = bezeichnungOderGliederungskennzahlZuXmlId(gesetz, eintrag.ausgangsstelle);
          if (!xmlId) continue;
          const liste = map.get(xmlId);
          if (liste) liste.push(eintrag);
          else map.set(xmlId, [eintrag]);
        }
        messungBeenden();
        setMarkierungenNachXmlId(map);
      })
      .catch(() => {
        if (!abgebrochen) setMarkierungenNachXmlId(new Map());
        if (!abgebrochen) messungBeenden('Lesefehler');
      });
    return () => {
      messungBeenden('abgebrochen');
      abgebrochen = true;
    };
  }, [gesetzSchluessel, version, markierungenDeaktiviert]);

  const { kurztitel, normgeber } = gesetz;
  useEffect(() => {
    // Bei deaktivierten Markierungen wird trotzdem weiter zugehört (billig,
    // löst nur ein setVersion aus) – sobald wieder aktiviert wird, ist
    // `version` damit garantiert schon auf dem neuesten Stand.
    let beendet = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        if (beendet) return;
        const { listen } = await import('@tauri-apps/api/event');
        if (beendet) return;
        const abmelden = await listen<{ gesetz: Gesetzesreferenz }>(
          'markierungen-geaendert',
          (event) => {
            if (
              !beendet &&
              event.payload?.gesetz &&
              istGleichesGesetz(event.payload.gesetz, { kurztitel, normgeber })
            ) {
              setVersion((v) => v + 1);
              // Die Browser-Textselektion, aus der die Markierung entstanden ist
              // (bzw. die beim Kombinieren/Aufsplitten mit betroffen war), bleibt
              // sonst optisch als „ausgewählt" (blauer Hintergrund) stehen, auch
              // wenn der zugrunde liegende Textknoten durch das Neu-Rendern gar
              // nicht ersetzt wurde (z.B. beim Kombinieren, wenn sich der neue
              // Bereich über bereits vorhandenen, unveränderten Text hinaus
              // erstreckt) – siehe Absprache: störend. Einfaches, zentrales
              // Löschen hier deckt alle Auslöser ab (⌘U/⇧⌘U im Hauptfenster,
              // Speichern in VerweismarkierungFenster.tsx/KommentarFenster.tsx, Undo/
              // Redo), ohne es an jeder einzelnen Erzeugungsstelle zu behandeln.
              window.getSelection()?.removeAllRanges();
            }
          },
        );
        // Das Effektende kann während der nativen Registrierung eintreten.
        if (beendet) abmelden();
        else unlisten = abmelden;
      } catch (fehler) {
        console.error('Listener für Markierungs-Updates konnte nicht eingerichtet werden:', fehler);
      }
    })();
    return () => {
      beendet = true;
      unlisten?.();
      unlisten = undefined;
    };
  }, [kurztitel, normgeber]);

  return { markierungenNachXmlId };
}
