// praefixlaufStart.ts
// Sondermodus: gemeinsamer Referenzkontext, Terminalabschluss und genau ein Exit.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import {
  erzeugeTauriGesetzesXMLUmgebung,
  fuehreGesetzesXMLLaufAus,
  erzeugeTauriQuelldateienUmgebung,
  erzeugeTauriEuQuelldateienUmgebung,
  erzeugeTauriEuGesetzesXMLUmgebung,
  fuehreQuelldateienLaufAus,
  type LaufBericht,
  type LaufMeldung,
  formatiereLaufBericht,
  formatiereLaufZusammenfassung,
} from './quelldateien/quelldateien.index';
import { mitReferenzKontext } from '@/lib/import/importabschluss/importabschluss.index';
import {
  erzeugeTauriPraefixAuswertungUmgebung,
  fuehrePraefixAuswertungAus,
  erzeugeTauriPraefixlaufUmgebung,
  fuehrePraefixlaufAus,
} from './praefixstruktur/praefixstruktur.index';
import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag';

export async function startePraefixlauf(auftrag: PraefixlaufAuftrag): Promise<void> {
  let code = 0;
  const beginn = new Date().toISOString();
  const laufangaben = `Modus: ${auftrag.modus} / Normgeber: ${auftrag.normgeber}\nBeginn: ${beginn}\n`;
  let bericht: LaufBericht | undefined;
  let schwererFehler: unknown;
  let ausgaben: Promise<void> = Promise.resolve();
  const ausgabe = (zeile: string, art: 'detail' | 'ergebnis' | 'status' = 'detail') => {
    ausgaben = ausgaben
      .then(() => rufeBefehl('praefixlauf_ausgabe', { zeile, art }))
      .catch((fehler: unknown) => {
        code = 1;
        console.error('Präfixlauf-Ausgabe fehlgeschlagen:', fehler);
      });
    return ausgaben;
  };
  const melde = (meldung: LaufMeldung) => ausgabe(meldung.text, meldung.art);
  await melde({ art: 'status', text: 'Vorbereitung …' });
  try {
    if (
      auftrag.normgeber === NORMGEBER_EU &&
      !['quelldateien', 'gesetzesxml'].includes(auftrag.modus)
    )
      throw new Error('EU wird in diesem Entwicklerlauf noch nicht unterstützt.');
    const normgeber = auftrag.normgeber;
    await mitReferenzKontext(
      async (kontext) => {
        if (auftrag.modus === 'auswerten') {
          const umgebung = await erzeugeTauriPraefixAuswertungUmgebung();
          umgebung.ausgabe = (zeile) => ausgabe(zeile);
          umgebung.melde = melde;
          bericht = await fuehrePraefixAuswertungAus(auftrag, umgebung, (stand) => {
            bericht = stand;
          });
        } else if (auftrag.modus === 'quelldateien') {
          const umgebung =
            normgeber === NORMGEBER_EU
              ? erzeugeTauriEuQuelldateienUmgebung(kontext)
              : erzeugeTauriQuelldateienUmgebung(kontext, normgeber);
          umgebung.ausgabe = (zeile) => ausgabe(zeile);
          umgebung.melde = melde;
          bericht = await fuehreQuelldateienLaufAus(auftrag, umgebung, (stand) => {
            bericht = stand;
          });
        } else if (auftrag.modus === 'gesetzesxml') {
          const umgebung =
            normgeber === NORMGEBER_EU
              ? erzeugeTauriEuGesetzesXMLUmgebung(kontext)
              : erzeugeTauriGesetzesXMLUmgebung(kontext, normgeber);
          umgebung.ausgabe = (zeile) => ausgabe(zeile);
          umgebung.melde = melde;
          bericht = await fuehreGesetzesXMLLaufAus(auftrag, umgebung, (stand) => {
            bericht = stand;
          });
        } else {
          const umgebung = await erzeugeTauriPraefixlaufUmgebung(kontext);
          umgebung.ausgabe = (zeile) => ausgabe(zeile);
          umgebung.melde = melde;
          bericht = await fuehrePraefixlaufAus(auftrag, umgebung, (stand) => {
            bericht = stand;
          });
        }
        await ausgabe(
          `Präfixlauf abgeschlossen: ${formatiereLaufZusammenfassung(bericht)}`,
          'ergebnis',
        );
      },
      (meldung) => {
        void ausgabe(meldung.text, 'ergebnis');
      },
      'importindizes',
    );
  } catch (fehler) {
    code = 1;
    schwererFehler = fehler;
    await ausgabe(`Präfixlauf fehlgeschlagen: ${String(fehler)}`, 'ergebnis');
  }
  let fehlerbericht = formatiereLaufBericht(
    bericht ?? { gespeichert: 0, teilerfolge: [], fehlgeschlagen: [] },
  );
  fehlerbericht += `\n${laufangaben}`;
  if (schwererFehler !== undefined) fehlerbericht += `Schwerer Fehler: ${String(schwererFehler)}\n`;
  await melde({ art: 'status', text: 'Bericht schreiben …' });
  try {
    const pfad = await rufeBefehl('praefixlauf_bericht_schreiben', {
      zeitstempel: beginn.replace(/[:.]/g, '-'),
      inhalt: fehlerbericht,
    });
    await ausgabe(`Fehlerbericht: ${pfad}`, 'ergebnis');
  } catch (fehler) {
    code = 1;
    await ausgabe(`Fehlerbericht konnte nicht geschrieben werden: ${String(fehler)}`, 'ergebnis');
  }
  await melde({ art: 'status', text: code ? 'Abgebrochen.' : 'Beendet.' });
  try {
    await ausgaben;
  } catch (fehler) {
    code = 1;
    console.error('Präfixlauf-Ausgabe fehlgeschlagen:', fehler);
  } finally {
    await rufeBefehl('praefixlauf_beenden', { code });
  }
}
