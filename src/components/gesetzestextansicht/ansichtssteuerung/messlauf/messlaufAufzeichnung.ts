// messlaufAufzeichnung.ts
// Messlauf Stufe 2, Modus C Aufzeichnung (nur Entwicklungsbetrieb, Aufruf über
// lexlataScrollAufzeichnung): Der Nutzer scrollt selbst (Trackpad); der Lauf zeichnet nur auf und
// schreibt die Scrollposition nie. Normales Verhalten ohne Messlauf-Sperre, weil der Nutzer
// selbst scrollt. Gleiche Messgrößen wie Schritt- und Gleitmodus; Bildzeiten nur für Bilder mit
// Scrollbewegung, damit Ruhephasen sie nicht verdünnen.
import { beginneScrollDiagnose } from '@/lib/utils/scrollAufzeichnungDiagnose';
import type { MesslaufUmgebung } from './messlaufDurchfuehrung';
import { bild, erstelleBildreihen } from './messlaufBildreihen';
import {
  fasseZusammen,
  messeBildperiode,
  neuaufbauUeberAlle,
  textzusammenfassung,
  werteDurchlaufAus,
  BILDZEIT_AUFTEILUNG_HINWEIS,
  type MesslaufBericht,
} from './messlaufBericht';
import { erstelleUmgebungsprotokoll } from './messlaufUmgebungsprotokoll';

export async function fuehreAufzeichnungDurch(
  umgebung: Omit<MesslaufUmgebung, 'sperren'>,
  sekunden: number,
  { textsprung = true }: { textsprung?: boolean } = {},
): Promise<{ bericht: MesslaufBericht; zusammenfassung: string }> {
  if (!(sekunden > 0)) throw new Error('sekunden erwartet eine Zahl größer 0');
  const bildperiodeMs = await messeBildperiode();
  umgebung.rekorder.zuruecksetzen();
  const diagnose = beginneScrollDiagnose(umgebung.container);
  try {
    const reihen = erstelleBildreihen(umgebung, { nurBeiBewegung: true, textsprung });
    const anfang = await bild();
    for (let zeit = anfang; ; zeit = await bild()) {
      reihen.erfasse(zeit);
      if (zeit - anfang >= sekunden * 1000) break;
    }
    const ergebnis = await reihen.beenden(bildperiodeMs, umgebung.elementzahl);
    const { neuaufbauKostenMs } = ergebnis;
    const kennzahlen = werteDurchlaufAus(umgebung, ergebnis);
    const bericht: MesslaufBericht = {
      stufe: 2,
      diagnose: diagnose.beenden(),
      erstelltAm: new Date().toISOString(),
      umgebung: await erstelleUmgebungsprotokoll({ ...umgebung, bildperiodeMs }),
      szenarien: [
        {
          name: 'Aufzeichnung',
          parameter: { modus: 'C Aufzeichnung', dauerS: sekunden, textsprungMessung: textsprung },
          kennzahlen: {
            wiederholungen: [kennzahlen],
            zusammenfassung: fasseZusammen([kennzahlen]),
          },
        },
      ],
      neuaufbauKosten: neuaufbauUeberAlle(neuaufbauKostenMs, umgebung.elementzahl),
      hinweise: [
        'Modus C Aufzeichnung: Der Nutzer scrollt selbst; keine Messlauf-Sperre, Nachführung und Rückmeldungen laufen normal.',
        'Bildzeiten nur für Bilder mit Scrollbewegung.',
        textsprung
          ? 'Textsprung: Scrolländerung ohne Höhenkorrekturen des Programms gegen die Lage des obersten sichtbaren Elements; die Lage wird je Bild einmal gebündelt nach dem Bild gelesen (eigene Aufgabe nach dem Zeichnen, Layout bereits berechnet), nicht mehr im Bildrückruf.'
          : 'Textsprung nicht gemessen (textsprung: false): keine Lage gelesen, kein erzwungenes Layout.',
        'Diagnose: gemeinsame Zeitleiste; Layout nur bei Änderung nach dem Bild. Feste XML-ID: letzte sichtbare Norm/Überschrift vor Löschen/Seitenleistenwechsel (Ausgangslage obersteXmlId/obersteBildschirmTop in der vorherigen Layoutprobe); bis zum nächsten Anlass fest. Die ersten acht Referenzen bleiben zusätzlich in referenzen für den gesamten Lauf erhalten, auch über weitere Anlässe hinweg. Ohne vorherige Probe erste sichtbare Lage; bei Virtualisierung ausdrücklich fehlend. Layoutlesungen können selbst Layout auslösen. Bei textsprung: false fehlen Layout und Textreferenz. Höchstens 20.000 Ereignisse; verworfene Ereignisse werden gezählt. Erreicht beim Schreiben ist der unmittelbar gelesene Wert, Scrollereignisse/Layout melden spätere Werte. Hauptansichtsereignisse gelten fensterweit.',
        BILDZEIT_AUFTEILUNG_HINWEIS,
        'Neuaufbau-Kosten: Näherung aus Arbeitszeit (bis zur letzten Erstmessung im Bild) über der Grundlast je erstmals gemessenem Element; Hochrechnung der Vollmessung = Elementzahl mal Median.',
      ],
    };
    return { bericht, zusammenfassung: textzusammenfassung(bericht) };
  } finally {
    diagnose.beenden();
  }
}
