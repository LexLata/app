// euUmgebung.ts
// Repository-Anbindung der EU-Beschaffung ohne App-Einstellungen oder Gesetzesspeicher.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { meldeLaufErgebnis } from './laufMeldung';
import { erzeugeArbeitsdateinamen } from './arbeitsdateienLesen';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { alleImportindexEintraege } from '@/lib/import/importindex/importindex.index';
import { ladeEuQuelle } from '@/lib/import/eu/eu.index';
import {
  taggeGesetzesXML,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { pruefeQuelleErreichbar } from '@/lib/import/basis/basis.index';
import { beschaffeEuQuelldatei, type EuBeschaffungsUmgebung } from './euBeschaffung';
import { erzeugeEuGesetzesXMLAusBestand } from './euGesetzesxml';
import type { GesetzesXMLUmgebung } from './gesetzesxmlLauf';
import type { QuelldateienUmgebung } from './quelldateienLauf';

export function erzeugeTauriEuQuelldateienUmgebung(
  kontext: ReferenzKontext,
): QuelldateienUmgebung & GesetzesXMLUmgebung {
  const dateinamen = erzeugeArbeitsdateinamen();
  let gesetzesxml = new Set<string>();
  const umgebung: QuelldateienUmgebung & GesetzesXMLUmgebung = {
    erzeuge: (eintrag) =>
      erzeugeEuGesetzesXMLAusBestand(eintrag, {
        ...beschaffung,
        async leseArchiv(art, kurztitel) {
          const bytes = await rufeBefehl('praefixlauf_archiv_lesen', {
            art,
            kurztitel: dateinamen.fuer(art, kurztitel),
          });
          return bytes === null ? null : new Uint8Array(bytes);
        },
      }),
    async leseDateistand() {
      const stand = await rufeBefehl('praefixlauf_dateistand');
      dateinamen.uebernehme(stand);
      gesetzesxml = new Set(stand.gesetzesxml.map((k) => k.toLowerCase()));
      return stand;
    },
    ladeKandidaten: () => alleImportindexEintraege(NORMGEBER_EU),
    async pruefeErreichbarkeit() {
      const erreichbarkeit = await pruefeQuelleErreichbar(NORMGEBER_EU);
      return erreichbarkeit.fehler ?? null;
    },
    beschaffe: (eintrag) => beschaffeEuQuelldatei(eintrag, beschaffung),
    ausgabe: (zeile) => rufeBefehl('praefixlauf_ausgabe', { zeile }),
  };
  const beschaffung: EuBeschaffungsUmgebung = {
    laden: ladeEuQuelle,
    leseHerkunft: (kurztitel) =>
      rufeBefehl('praefixlauf_arbeitsdatei_lesen', {
        art: 'herkunft',
        kurztitel: dateinamen.fuer('herkunft', kurztitel),
      }),
    async leseOriginal(kurztitel) {
      const bytes = await rufeBefehl('praefixlauf_archiv_lesen', {
        art: 'original',
        kurztitel: dateinamen.fuer('original', kurztitel),
      });
      return bytes === null ? null : new Uint8Array(bytes);
    },
    async loescheGesetzesXML(kurztitel) {
      await rufeBefehl('praefixlauf_arbeitsdatei_loeschen', {
        art: 'gesetzesxml',
        kurztitel: dateinamen.fuer('gesetzesxml', kurztitel),
      });
      return gesetzesxml.delete(kurztitel.toLowerCase());
    },
    loescheHerkunft: (kurztitel) =>
      rufeBefehl('praefixlauf_arbeitsdatei_loeschen', {
        art: 'herkunft',
        kurztitel: dateinamen.fuer('herkunft', kurztitel),
      }),
    schreibeArchiv: (art, kurztitel, inhalt) =>
      rufeBefehl('praefixlauf_archiv_schreiben', {
        art,
        kurztitel: dateinamen.fuer(art, kurztitel),
        inhalt: Array.from(inhalt),
      }),
    schreibeHerkunft: (kurztitel, herkunft) =>
      rufeBefehl('praefixlauf_arbeitsdatei_schreiben', {
        art: 'herkunft',
        kurztitel: dateinamen.fuer('herkunft', kurztitel),
        inhalt: JSON.stringify(herkunft),
      }),
    nachbereiten: (xml, eintrag) =>
      taggeGesetzesXML(xml, eintrag.kurztitel, NORMGEBER_EU, kontext, (meldung) => {
        void meldeLaufErgebnis(umgebung, meldung.text);
      }),
    pruefeXML: (xml) => parseGesetzesXML(xml) !== null,
    async schreibeGesetzesXML(kurztitel, inhalt) {
      await rufeBefehl('praefixlauf_arbeitsdatei_schreiben', {
        art: 'gesetzesxml',
        kurztitel: dateinamen.fuer('gesetzesxml', kurztitel),
        inhalt,
      });
      gesetzesxml.add(kurztitel.toLowerCase());
    },
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    zufall: Math.random,
    jetzt: () => new Date(),
  };
  return umgebung;
}

export function erzeugeTauriEuGesetzesXMLUmgebung(kontext: ReferenzKontext): GesetzesXMLUmgebung {
  return erzeugeTauriEuQuelldateienUmgebung(kontext);
}
