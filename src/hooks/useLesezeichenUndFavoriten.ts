// useLesezeichenUndFavoriten.ts
//
// Hält den Lesezeichen-State und die Favoriten-Versionsnummer, lauscht auf
// Mehrfenster-Sync-Events (ein anderes oder dasselbe Fenster ändert
// Lesezeichen/Favoriten) und stellt die Speichern/Entfernen-Handler bereit,
// die u.a. von useTastenkuerzel.ts und useMenueEvents.ts aufgerufen werden.
//
// Die "aktive Norm" (welches Element gerade markiert ist) wird weiterhin
// App-seitig in einklappZustandRef (useAppTabs.ts) gehalten – dieser Hook
// liest sie nur über die übergebenen Refs aus, führt aber keine eigene
// Quelle dafür ein.

import type { useAppTabs as Tabsteuerung } from '@/hooks/tabs/useAppTabs';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { nativeBestaetigung } from '@/lib/plattform/tauriHelpers';
import { hoereGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { vollstaendigeBezeichnung } from '@/lib/domain/norm/norm.index';
import type { EinklappZustand, Tab } from '@/lib/domain/appTypes';
import { pruefeKurzform, type KurzformPruefung } from '@/lib/domain/norm/norm.index';
import type { Lesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { istDateiSperreWartefrist } from '@/lib/persistenz/kern/kern.index';
import { setzeAktiv, meldeNormstatus } from '@/lib/plattform/menu/menu.index';

import {
  abonniereSpeicherbareNorm,
  liesSpeicherbareNorm,
} from '@/lib/domain/aktives-element/aktives-element.index';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';

const KEINE_LESEZEICHEN: Lesezeichen[] = [];

interface LesezeichenUndFavoritenOptionen {
  holeTabGesetz: ReturnType<typeof Tabsteuerung>['holeTabGesetz'];
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>;
}

export function useLesezeichenUndFavoriten({
  holeTabGesetz,
  tabsRef,
  aktiverTabIdRef,
  einklappZustandRef,
}: LesezeichenUndFavoritenOptionen) {
  const [lesezeichenVersion, setLesezeichenVersion] = useState(0);
  const [geladeneLesezeichen, setLesezeichen] = useState<Lesezeichen[] | null>(null);
  const lesezeichen = geladeneLesezeichen ?? KEINE_LESEZEICHEN;
  const [favoritenVersion, setFavoritenVersion] = useState(0);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const { ladeLesezeichen } = await import('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher');
      return ladeLesezeichen();
    })()
      .then((liste) => {
        if (!abgebrochen) setLesezeichen(liste);
      })
      .catch(() => {
        if (!abgebrochen) setLesezeichen([]);
      });
    return () => {
      abgebrochen = true;
    };
  }, [lesezeichenVersion]);

  // Graut "Alle Lesezeichen löschen" (menu.rs: "alle-lesezeichen-entfernen")
  // ein oder aus, je nachdem, ob überhaupt Lesezeichen vorhanden sind – läuft
  // bei jeder Änderung von `lesezeichen` (initiales Laden + jede
  // fensterübergreifende Änderung, siehe Sync-Effekt oben) neu.
  useEffect(() => {
    setzeAktiv('alle-lesezeichen-entfernen', lesezeichen.length > 0);
  }, [lesezeichen]);

  // Häufige Normwechsel melden direkt an den Menüstore, ohne React-State.
  useEffect(() => {
    const melden = () => {
      const norm = liesSpeicherbareNorm();
      meldeNormstatus({
        bezeichnung: norm?.bezeichnung ?? null,
        ist_favorit: norm?.istFavorit ?? false,
        ist_lesezeichen:
          norm !== null &&
          lesezeichen.some(
            (eintrag) =>
              istGleichesGesetz(eintrag.gesetz, norm.gesetz) &&
              eintrag.bezeichnung === norm.bezeichnung,
          ),
      });
    };
    const abmelden = abonniereSpeicherbareNorm(melden);
    melden();
    return abmelden;
  }, [lesezeichen]);

  // Mehrfenster-Synchronisation: Wenn ein anderes (oder dasselbe) Fenster
  // Lesezeichen oder Favoriten ändert, wird die lokale Version hochgezählt
  // und damit ein Neu-Laden der Daten ausgelöst.
  useEffect(() => {
    const lesezeichenAnmeldung = hoereGlobal('lesezeichen-geaendert', () =>
      setLesezeichenVersion((v) => v + 1),
    );
    const favoritenAnmeldung = hoereGlobal('favoriten-geaendert', () =>
      setFavoritenVersion((v) => v + 1),
    );
    void Promise.all([lesezeichenAnmeldung.bereit, favoritenAnmeldung.bereit]).catch((fehler) =>
      console.error(
        'Lesezeichen/Favoriten-Synchronisation konnte nicht eingerichtet werden:',
        fehler,
      ),
    );
    return () => {
      lesezeichenAnmeldung.abmelden();
      favoritenAnmeldung.abmelden();
    };
  }, []);

  // Ermittelt Gesetz + aktuell aktives Element im aktiven Tab (ohne bereits
  // auf 'norm' einzuschränken) – gemeinsame Basis für aktivesElementBezeichnungErmitteln
  // unten sowie für die Handler, die bei einer aktiven Überschrift (kein
  // 'norm'-Element) eine eigene Fehlermeldung zeigen müssen statt einfach
  // nichts zu tun.
  function aktivesElementErmitteln() {
    const tab = aktiverTabIdRef.current
      ? tabsRef.current.find((t) => t.id === aktiverTabIdRef.current)
      : null;
    const tabGesetz = holeTabGesetz(tab);
    if (!tab?.gesetzesreferenz || !tabGesetz) return null;
    const gesetz = tabGesetz;
    const schluessel = tab.id + '-' + gesetzesreferenzSchluessel(tab.gesetzesreferenz);
    const aktivesElementId = einklappZustandRef.current[schluessel]?.aktivesElementId;
    if (!aktivesElementId) return null;
    const el = gesetz.elemente.find((e) => e.data.id === aktivesElementId);
    if (!el) return null;
    return { gesetz, el };
  }

  // Ermittelt Gesetz + bezeichnung des aktuell aktiven Elements im aktiven
  // Tab – gemeinsame Grundlage für Favorit- und Lesezeichen-Speichern.
  function aktivesElementBezeichnungErmitteln() {
    const treffer = aktivesElementErmitteln();
    if (!treffer) return null;
    const pruefung = pruefeKurzform(treffer.gesetz, treffer.el);
    if (!pruefung?.ok || !pruefung.bezeichnung) return null;
    return {
      gesetz: treffer.gesetz,
      bezeichnung:
        vollstaendigeBezeichnung(treffer.gesetz, treffer.el.data.xmlId) ??
        treffer.el.data.bezeichnung,
    };
  }

  async function zeigeKurzformWarnung(
    aktiv: NonNullable<ReturnType<typeof aktivesElementErmitteln>>,
    pruefung: Extract<KurzformPruefung, { ok: false }>,
    art: 'Favorit' | 'Lesezeichen',
  ) {
    const { zeigeBanner } = await import('@/lib/banner/banner.index');
    const volleBezeichnung =
      vollstaendigeBezeichnung(aktiv.gesetz, aktiv.el.data.xmlId) ?? aktiv.el.data.bezeichnung;
    const grund =
      pruefung.grund === 'anderes-element'
        ? `Die Bezeichnung „${pruefung.bezeichnung}“ führt zu ${pruefung.zielBezeichnung}.`
        : pruefung.grund === 'mehrdeutig'
          ? `Die Bezeichnung „${pruefung.bezeichnung}“ passt zu mehreren Normen und ist nicht eindeutig.`
          : 'Die gespeicherte Bezeichnung lässt sich nicht wiederfinden.';
    zeigeBanner({
      art: 'bedienhinweis',
      text: `${volleBezeichnung} kann nicht als ${art} gespeichert werden: ${grund}`,
      typ: 'warnung',
    });
  }

  async function handleFavoritSpeichern(): Promise<boolean> {
    const aktiv = aktivesElementErmitteln();
    if (!aktiv) return false;
    if (aktiv.el.typ !== 'norm') {
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'bedienhinweis',
        text: 'Überschriften können nicht als Favoriten gespeichert werden.',
        typ: 'warnung',
      });
      return false;
    }
    const pruefung = pruefeKurzform(aktiv.gesetz, aktiv.el);
    if (!pruefung) return false;
    if (!pruefung.ok) {
      await zeigeKurzformWarnung(aktiv, pruefung, 'Favorit');
      return false;
    }
    const bezeichnung =
      vollstaendigeBezeichnung(aktiv.gesetz, aktiv.el.data.xmlId) ?? aktiv.el.data.bezeichnung;
    try {
      const { umschaltenFavorit } = await import('@/lib/persistenz/nutzerdaten/favoritenSpeicher');
      await umschaltenFavorit(aktiv.gesetz, bezeichnung);
      return true;
    } catch (e) {
      if (istDateiSperreWartefrist(e)) return false; // Die Sperre hat die Wartefrist bereits erklärt.
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'systemfehler',
        text: 'Favorit konnte nicht gespeichert werden.',
        typ: 'fehler',
      });
      console.error('Favorit speichern fehlgeschlagen:', e);
      return false;
    }
  }

  async function handleLesezeichenSpeichern(): Promise<boolean> {
    const aktiv = aktivesElementErmitteln();
    if (!aktiv) return false;
    if (aktiv.el.typ !== 'norm') {
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'bedienhinweis',
        text: 'Überschriften können nicht als Lesezeichen gespeichert werden.',
        typ: 'warnung',
      });
      return false;
    }
    const pruefung = pruefeKurzform(aktiv.gesetz, aktiv.el);
    if (!pruefung) return false;
    if (!pruefung.ok) {
      await zeigeKurzformWarnung(aktiv, pruefung, 'Lesezeichen');
      return false;
    }
    const bezeichnung =
      vollstaendigeBezeichnung(aktiv.gesetz, aktiv.el.data.xmlId) ?? aktiv.el.data.bezeichnung;
    try {
      const { umschaltenLesezeichen } =
        await import('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher');
      await umschaltenLesezeichen(aktiv.gesetz, bezeichnung);
      return true;
    } catch (e) {
      if (istDateiSperreWartefrist(e)) return false; // Die Sperre hat die Wartefrist bereits erklärt.
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'systemfehler',
        text: 'Lesezeichen konnte nicht gespeichert werden.',
        typ: 'fehler',
      });
      console.error('Lesezeichen speichern fehlgeschlagen:', e);
      return false;
    }
  }

  async function handleAlleLesezeichenEntfernen() {
    const bestaetigt = await nativeBestaetigung(
      'Wirklich alle Lesezeichen unwiderruflich löschen?',
      {
        title: 'Lesezeichen löschen',
        kind: 'warning',
        okLabel: 'Löschen',
        cancelLabel: 'Abbrechen',
      },
    );
    if (!bestaetigt) return;
    try {
      const { loescheAlleLesezeichen } =
        await import('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher');
      await loescheAlleLesezeichen();
    } catch (e) {
      if (istDateiSperreWartefrist(e)) return; // Die Sperre hat die Wartefrist bereits erklärt.
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'systemfehler',
        text: 'Lesezeichen konnten nicht gelöscht werden.',
        typ: 'fehler',
      });
      console.error('Alle Lesezeichen löschen fehlgeschlagen:', e);
    }
  }

  return {
    lesezeichen,
    lesezeichenGeladen: geladeneLesezeichen !== null,
    favoritenVersion,
    handleFavoritSpeichern,
    handleLesezeichenSpeichern,
    handleAlleLesezeichenEntfernen,
    aktivesElementBezeichnungErmitteln,
  };
}
