// quelldateienUmgebung.ts
// Tauri-Anbindung der Bundes- und BW-Quelle ohne Zugriff auf PräfixstrukturXML oder App-Speicher.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import { meldeLaufErgebnis } from './laufMeldung';
import { erzeugeArbeitsdateinamen } from './arbeitsdateienLesen';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { alleImportindexEintraege } from '@/lib/import/importindex/importindex.index';
import {
  ladeUndEntpackeVonGesetzeImInternet,
  importiereBundXML,
} from '@/lib/import/bund/bund.index';
import {
  taggeGesetzesXML,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { pruefeQuelleErreichbar } from '@/lib/import/basis/basis.index';
import { ladeGesetzHTMLBW, parseGeladenesGesetz } from '@/lib/import/bw/bw.index';
import { beobachtePraefixlauf } from './praefixlaufDiagnose';
import {
  erzeugeGesetzesXML,
  beschaffeBundQuelldatei,
  beschaffeBWQuelldatei,
  type BeschaffungsUmgebung,
  type BeschaffungsErgebnis,
} from './beschaffung';
import type { GesetzesXMLUmgebung } from './gesetzesxmlLauf';
import type { QuelldateienUmgebung } from './quelldateienLauf';

export function erzeugeTauriQuelldateienUmgebung(
  kontext: ReferenzKontext,
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW = NORMGEBER_DE_BUND,
  anbindung?: Pick<BeschaffungsUmgebung, 'pause' | 'zufall'> & {
    ausgabe(zeile: string): void | Promise<void>;
  },
): GesetzesXMLUmgebung<Awaited<ReturnType<typeof erzeugeGesetzesXML>>> &
  QuelldateienUmgebung<BeschaffungsErgebnis> {
  const dateinamen = erzeugeArbeitsdateinamen();
  let gesetzesxml = new Set<string>();
  const umgebung: GesetzesXMLUmgebung<Awaited<ReturnType<typeof erzeugeGesetzesXML>>> &
    QuelldateienUmgebung<BeschaffungsErgebnis> = {
    async erzeuge(eintrag) {
      const quelle = await rufeBefehl('praefixlauf_arbeitsdatei_lesen', {
        art: 'quelle',
        kurztitel: dateinamen.fuer('quelle', eintrag.kurztitel),
      });
      if (quelle === null) throw new Error(`${eintrag.kurztitel}: Quelldatei fehlt beim Lesen.`);
      return erzeugeGesetzesXML(quelle, eintrag, beschaffung);
    },
    async leseDateistand() {
      const stand = await rufeBefehl('praefixlauf_dateistand');
      dateinamen.uebernehme(stand);
      gesetzesxml = new Set(stand.gesetzesxml.map((k) => k.toLowerCase()));
      return stand;
    },
    ladeKandidaten: () => alleImportindexEintraege(normgeber),
    async pruefeErreichbarkeit() {
      return (await pruefeQuelleErreichbar(normgeber)).fehler ?? null;
    },
    async beschaffe(eintrag) {
      if (normgeber === NORMGEBER_DE_BUND) return beschaffeBundQuelldatei(eintrag, beschaffung);
      const diagnose = beobachtePraefixlauf(eintrag.kurztitel, (zeile) => umgebung.ausgabe(zeile));
      try {
        return await beschaffeBW(eintrag, diagnose.schritt);
      } finally {
        diagnose.beenden();
      }
    },
    ausgabe: (zeile) =>
      anbindung ? anbindung.ausgabe(zeile) : rufeBefehl('praefixlauf_ausgabe', { zeile }),
  };
  const beschaffung: BeschaffungsUmgebung = {
    laden: async (e) => {
      if (normgeber === NORMGEBER_DE_BW) {
        await umgebung.ausgabe(`${e.kurztitel}: Abruf (BW-Hintergrundfenster)`);
        const geladen = await ladeGesetzHTMLBW(e);
        return 'fehler' in geladen
          ? { fehler: geladen.fehler.meldung }
          : { xmlString: geladen.gesamtausgabeHTML };
      }
      return ladeUndEntpackeVonGesetzeImInternet(
        e.abrufkennung,
        `Gesetz „${e.kurztitel}“ konnte nicht geladen werden.`,
      );
    },
    async loescheGesetzesXML(kurztitel) {
      await rufeBefehl('praefixlauf_arbeitsdatei_loeschen', {
        art: 'gesetzesxml',
        kurztitel: dateinamen.fuer('gesetzesxml', kurztitel),
      });
      return gesetzesxml.delete(kurztitel.toLowerCase());
    },
    schreibeQuelle: (kurztitel, inhalt) =>
      rufeBefehl('praefixlauf_arbeitsdatei_schreiben', {
        art: 'quelle',
        kurztitel: dateinamen.fuer('quelle', kurztitel),
        inhalt,
      }),
    konvertieren: (quelle, e) =>
      normgeber === NORMGEBER_DE_BUND
        ? importiereBundXML(quelle, 'Gesetze im Internet', e.kurztitel)
        : parseGeladenesGesetz(quelle, e.kurztitel),
    nachbereiten: (xml, e) =>
      taggeGesetzesXML(xml, e.kurztitel, normgeber, kontext, (meldung) => {
        void meldeLaufErgebnis(umgebung, meldung.text);
      }),
    parsen: parseGesetzesXML,
    async schreibeGesetzesXML(kurztitel, inhalt) {
      await rufeBefehl('praefixlauf_arbeitsdatei_schreiben', {
        art: 'gesetzesxml',
        kurztitel: dateinamen.fuer('gesetzesxml', kurztitel),
        inhalt,
      });
      gesetzesxml.add(kurztitel.toLowerCase());
    },
    pause: (ms) =>
      anbindung ? anbindung.pause(ms) : new Promise((resolve) => setTimeout(resolve, ms)),
    zufall: () => (anbindung ? anbindung.zufall() : Math.random()),
  };
  const beschaffeBW = beschaffeBWQuelldatei(beschaffung);
  return umgebung;
}

export function erzeugeTauriGesetzesXMLUmgebung(
  kontext: ReferenzKontext,
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
): GesetzesXMLUmgebung {
  return erzeugeTauriQuelldateienUmgebung(kontext, normgeber);
}
