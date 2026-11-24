// praefixlaufUmgebung.ts
// Entwickleradapter: Quelle und Nachbereitung, anschließend ausschließlich Repository-I/O.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import { alleImportindexEintraege } from '@/lib/import/importindex/importindex.index';
import {
  meldeLaufErgebnis,
  erzeugeTauriQuelldateienUmgebung,
} from '@/lib/import/quelldateien/quelldateien.index';
import {
  mitReferenzKontext,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import type { PraefixlaufUmgebung } from './praefixlauf.types';

export function erzeugeTauriPraefixlaufUmgebung(
  gemeinsamerKontext?: ReferenzKontext,
): Promise<PraefixlaufUmgebung> {
  const ausgabe = (zeile: string) => {
    void rufeBefehl('praefixlauf_ausgabe', { zeile }).catch((fehler: unknown) =>
      console.error('Präfixlauf-Ausgabe:', fehler),
    );
  };
  const empfangen = (meldung: { text: string }) => meldeLaufErgebnis(umgebung, meldung.text);
  // Gemeinsame Identität ohne Referenzcache: jede Beschaffung benutzt die
  // bestehende Diagnosebehandlung und einen ausdrücklichen Terminalempfänger.
  const kontext: ReferenzKontext = gemeinsamerKontext ?? {
    // Der Entwicklerlauf schreibt keine installierten Gesetze.
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: (arbeit, empfaenger) =>
      mitReferenzKontext(arbeit, empfaenger, 'importindizes'),
    meldeEinschraenkung: (quelle, meldung) => {
      void meldeLaufErgebnis(umgebung, `${quelle}: ${meldung}`);
    },
    referenzenFuer: (normgeber) =>
      mitReferenzKontext((k) => k.referenzenFuer(normgeber), empfangen, 'importindizes'),
  };
  const umgebung: PraefixlaufUmgebung = {
    leseListe: () => rufeBefehl('praefixlauf_datei_lesen'),
    schreibeListe: (xml) => rufeBefehl('praefixlauf_datei_schreiben', { xml }),
    ladeKandidaten: (normgeber) => alleImportindexEintraege(normgeber),
    leseDateistand: (normgeber) => quelle(normgeber).leseDateistand(),
    pruefeErreichbarkeit: (normgeber) => quelle(normgeber).pruefeErreichbarkeit(),
    async ladeGesetz(normgeber, eintrag, meldeSchritt, quelleVorhanden = false) {
      await meldeSchritt?.(
        quelleVorhanden
          ? 'Quelldatei lesen und GesetzesXML neu erzeugen'
          : 'Quelldatei beschaffen und GesetzesXML erzeugen',
      );
      const adapter = quelle(normgeber);
      return quelleVorhanden
        ? { ...(await adapter.erzeuge(eintrag)), netz: false }
        : adapter.beschaffe(eintrag);
    },
    ausgabe,
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    zufall: Math.random,
  };
  const quellen = new Map<string, ReturnType<typeof erzeugeTauriQuelldateienUmgebung>>();
  function quelle(normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW) {
    let adapter = quellen.get(normgeber);
    if (!adapter) {
      adapter = erzeugeTauriQuelldateienUmgebung(kontext, normgeber, {
        ausgabe: (zeile) => umgebung.ausgabe(zeile),
        pause: (ms) => umgebung.pause(ms),
        zufall: () => umgebung.zufall(),
      });
      adapter.melde = (meldung) =>
        umgebung.melde ? umgebung.melde(meldung) : umgebung.ausgabe(meldung.text);
      quellen.set(normgeber, adapter);
    }
    return adapter;
  }
  return Promise.resolve(umgebung);
}
