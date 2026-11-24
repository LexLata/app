// useAppUpdate.ts
//
// Spiegelt den App-Update-Zustand aus Rust (commands/app_update.rs) als
// Update-Banner dieses Hauptfensters. Rust hält den Zustand prozessweit und
// meldet jede Änderung allen Hauptfenstern (Ereignis `app-update-zustand`);
// ein später geöffnetes Fenster liest den bestehenden Zustand beim Mount.
// Schließt der Nutzer das Banner, blendet Rust es in allen Hauptfenstern aus.
// Das Banner führt durch Angebot („Herunterladen“, bei deb/rpm „Release-Seite
// öffnen“), Download-Fortschritt und Neustart („Jetzt neu starten“); nach
// einem Fehler lädt „Erneut versuchen“ erneut. Die Knöpfe rufen nur Befehle;
// den neuen Stand meldet Rust allen Hauptfenstern.
//
// Die manuelle Updateprüfung (Menü „Nach Updates suchen…“) meldet „aktuell“
// und Fehler nur im auslösenden Fenster; ein Fund erscheint über den Zustand
// in allen Hauptfenstern. Fehler erscheinen mit verständlichem Grund; das
// technische Detail steht nur in der Konsole.
//
import { useEffect } from 'react';
import {
  useAutomatischeUpdatepruefung,
  type UseAppUpdateParams,
} from './useAutomatischeUpdatepruefung';
import {
  bannerAktualisieren,
  bannerSchliessen,
  getSnapshot,
  subscribe,
  zeigeBanner,
} from '@/lib/banner/banner.index';
import type { BannerTyp } from '@/lib/banner/banner.index';
import type {
  AppUpdateFehlergrund,
  AppUpdateMeldung,
  AppUpdateZustand,
} from '@/lib/domain/app/appUpdate';
import { hoereImEigenenFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

/** Knopf des Update-Banners; `hinweis` erscheint, wenn der Befehl scheitert. */
interface Updateknopf {
  label: string;
  ausfuehren: () => Promise<void>;
  hinweis?: string;
}

interface Updatebanner {
  text: string;
  typ: BannerTyp;
  aktion?: Updateknopf;
}

function herunterladenKnopf(label: string): Updateknopf {
  return { label, ausfuehren: () => rufeBefehl('app_update_herunterladen') };
}

function fehlertext(version: string | null, grund: AppUpdateFehlergrund): string {
  if (grund === 'signatur') {
    return 'Das heruntergeladene Update ist nicht gültig signiert und wurde verworfen.';
  }
  const update = version ? `Das Update auf LexLata ${version}` : 'Das Update';
  return grund === 'keineVerbindung'
    ? `${update} ist fehlgeschlagen (keine Verbindung).`
    : `${update} ist fehlgeschlagen.`;
}

/** Inhalt des Update-Banners; null: kein Banner; undefined: Banner unverändert lassen. */
function updatebanner(zustand: AppUpdateZustand): Updatebanner | null | undefined {
  if (zustand.art === 'ruhe') return null;
  // Eine laufende Prüfung ändert das sichtbare Angebot nicht.
  if (zustand.art === 'pruefung') return undefined;
  if (zustand.ausgeblendet) return null;
  switch (zustand.art) {
    case 'verfuegbar':
      return {
        text: `LexLata ${zustand.version} ist verfügbar.`,
        typ: 'info',
        aktion: zustand.installierbar
          ? herunterladenKnopf('Herunterladen')
          : {
              label: 'Release-Seite öffnen',
              ausfuehren: () => rufeBefehl('app_update_release_seite_oeffnen'),
              hinweis: 'Die Release-Seite konnte nicht geöffnet werden.',
            },
      };
    case 'herunterladen':
      return {
        text:
          zustand.prozent === null
            ? `LexLata ${zustand.version} wird heruntergeladen …`
            : `LexLata ${zustand.version} wird heruntergeladen … ${zustand.prozent} %`,
        typ: 'info',
      };
    case 'bereit':
      return {
        text: `LexLata ${zustand.version} ist bereit. LexLata wird zum Installieren neu gestartet.`,
        typ: 'info',
        aktion: {
          label: 'Jetzt neu starten',
          ausfuehren: async () => {
            if ((await rufeBefehl('app_update_installieren')) === 'beendenLaeuftBereits') {
              zeigeBanner({
                art: 'bedienhinweis',
                typ: 'info',
                text: 'LexLata wartet bereits auf das Beenden. Bitte zuerst die offene Rückfrage beantworten.',
              });
            }
          },
        },
      };
    case 'fehler':
      return {
        text: fehlertext(zustand.version, zustand.grund),
        typ: 'fehler',
        aktion: herunterladenKnopf('Erneut versuchen'),
      };
  }
}

/** Führt die Bannerknopf-Aktion aus; der Knopf ruht, bis der Befehl zurückkehrt. */
async function knopfAusfuehren(bannerId: string, knopf: Updateknopf): Promise<void> {
  bannerAktualisieren(bannerId, { laedt: true });
  try {
    await knopf.ausfuehren();
  } catch (fehler) {
    console.error(`App-Update: „${knopf.label}“ fehlgeschlagen:`, fehler);
    if (knopf.hinweis) zeigeBanner({ art: 'bedienhinweis', typ: 'fehler', text: knopf.hinweis });
  } finally {
    bannerAktualisieren(bannerId, { laedt: false });
  }
}

async function manuellPruefen(): Promise<void> {
  try {
    const { ergebnis, laufenderVorgang, grund, detail } = await rufeBefehl('app_update_pruefen', {
      anlass: 'manuell',
    });
    if (ergebnis === 'aktuell') {
      const { getVersion } = await import('@tauri-apps/api/app');
      zeigeBanner({
        art: 'erfolg',
        text: `LexLata ist auf dem neuesten Stand (${await getVersion()}).`,
      });
    } else if (ergebnis === 'laeuftBereits' && laufenderVorgang === 'pruefung') {
      zeigeBanner({
        art: 'bedienhinweis',
        typ: 'info',
        text: 'Die Suche nach Updates läuft bereits.',
      });
    } else if (ergebnis === 'fehler') {
      console.error('Updateprüfung fehlgeschlagen:', detail);
      zeigeUpdatepruefungFehler(grund);
    }
  } catch (fehler) {
    console.error('Updateprüfung fehlgeschlagen:', fehler);
    zeigeUpdatepruefungFehler(undefined);
  }
}

function zeigeUpdatepruefungFehler(grund: AppUpdateFehlergrund | undefined) {
  zeigeBanner({
    art: 'bedienhinweis',
    typ: 'fehler',
    text:
      grund === 'keineVerbindung'
        ? 'Die Suche nach Updates ist fehlgeschlagen (keine Verbindung).'
        : 'Die Suche nach Updates ist fehlgeschlagen.',
  });
}

export function useAppUpdate(params: UseAppUpdateParams): void {
  useAutomatischeUpdatepruefung(params);

  useEffect(() => {
    let bannerId: string | undefined;
    let aktiv = true;
    let vorherigerZustand: AppUpdateZustand['art'] | undefined;
    let letzteFolge = -1;

    function anzeigen(zustand: AppUpdateMeldung) {
      if (!aktiv || zustand.folge <= letzteFolge) return;
      letzteFolge = zustand.folge;
      if (zustand.art === 'fehler' && vorherigerZustand !== 'fehler') {
        console.error('App-Update fehlgeschlagen:', zustand.detail);
      }
      vorherigerZustand = zustand.art;
      const inhalt = updatebanner(zustand);
      if (inhalt === undefined) return;
      if (inhalt === null) {
        const id = bannerId;
        bannerId = undefined;
        if (id) bannerSchliessen(id);
        return;
      }
      const { text, typ, aktion } = inhalt;
      const offen = bannerId && getSnapshot().some((b) => b.id === bannerId);
      const id = offen && bannerId ? bannerId : zeigeBanner({ art: 'vorgangsfortschritt', text });
      bannerId = id;
      bannerAktualisieren(id, {
        text,
        typ,
        laedt: false,
        aktion: aktion
          ? { label: aktion.label, onClick: () => void knopfAusfuehren(id, aktion) }
          : null,
      });
    }

    // Schließt der Nutzer das Update-Banner, gilt das für alle Hauptfenster.
    const abmeldenBanner = subscribe(() => {
      if (!bannerId || getSnapshot().some((b) => b.id === bannerId)) return;
      bannerId = undefined;
      void rufeBefehl('app_update_ausblenden').catch((fehler) => {
        console.error('Update-Banner konnte nicht ausgeblendet werden:', fehler);
      });
    });

    const zustandEmpfang = hoereImEigenenFenster('app-update-zustand', (event) =>
      anzeigen(event.payload),
    );
    void zustandEmpfang.bereit
      .then(() => rufeBefehl('app_update_zustand'))
      .then(anzeigen)
      .catch((fehler) => {
        console.error('App-Update-Zustand nicht verfügbar:', fehler);
      });

    const menueEmpfang = hoereImEigenenFenster('nach-updates-suchen-anfrage', () => {
      void manuellPruefen();
    });
    void menueEmpfang.bereit.catch((fehler) => {
      console.error('Menüereignis „Nach Updates suchen“ nicht anmeldbar:', fehler);
    });

    return () => {
      aktiv = false;
      zustandEmpfang.abmelden();
      menueEmpfang.abmelden();
      abmeldenBanner();
      const id = bannerId;
      bannerId = undefined;
      if (id) bannerSchliessen(id);
    };
  }, []);
}
