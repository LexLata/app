// Live-Verknüpfungsangebote und Verknüpfungsaktionen; Effekte in bisheriger Reihenfolge.

import type { Auswahl } from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import {
  formatiereEinzelVerknuepfung,
  formatiereVerknuepfungsBericht,
  entfernungsBestaetigung,
} from '@/components/hilfsfenster/markierungskonflikte/konfliktTexte';
import type {
  AnzeigeGesetzKonflikte,
  MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import {
  aktualisiereAusgangsVerknuepfungMitErgebnis,
  aktualisiereVerknuepfungMitErgebnis,
  ermittleAktuelleVerknuepfungsMoeglichkeit,
  ladeAktuelleMarkierung,
  verknuepfeMitAktuellenNormen,
} from '@/lib/markierungen/markierungen.index';
import { nativeBestaetigung } from '@/lib/plattform/tauriHelpers';
import { useEffect, useEffectEvent, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { erzeugeAktionsMeldungsSammlung, schliesseKonfliktMeldungenAb } from './konfliktMeldungen';
import type { useKonfliktaktionslauf } from './useKonfliktaktionslauf';

export function useKonfliktVerknuepfung({
  auswahl,
  gesetze,
  aktionsAbschlussOffen,
  verknuepfungsMoeglichkeit,
  registriereAbschluss,
  onAktionsNachfehler,
  aktionsStartErlaubt,
  auswahlIdentitaet,
  setAktionsFehler,
  setEinzelImportFehler,
  ausfuehren,
  setVerknuepfungsMeldung,
  setVerknuepfungsFehler,
  setAllgemeineRueckmeldung,
  setHilfeOffen,
}: {
  auswahl: Auswahl | null;
  gesetze: AnzeigeGesetzKonflikte[];
  aktionsAbschlussOffen: boolean;
  verknuepfungsMoeglichkeit: { moeglich: boolean; fehler: string | null };
  registriereAbschluss?: (lauf: Promise<unknown>) => void;
  onAktionsNachfehler?: () => void;
  aktionsStartErlaubt: ReturnType<typeof useKonfliktaktionslauf>['aktionsStartErlaubt'];
  auswahlIdentitaet: string | null;
  setAktionsFehler: ReturnType<typeof useKonfliktaktionslauf>['setAktionsFehler'];
  setEinzelImportFehler: ReturnType<typeof useKonfliktaktionslauf>['setEinzelImportFehler'];
  ausfuehren: ReturnType<typeof useKonfliktaktionslauf>['ausfuehren'];
  setVerknuepfungsMeldung: Dispatch<SetStateAction<string | null>>;
  setVerknuepfungsFehler: Dispatch<SetStateAction<string | null>>;
  setAllgemeineRueckmeldung: Dispatch<SetStateAction<boolean>>;
  setHilfeOffen: Dispatch<SetStateAction<boolean>>;
}) {
  const [liveMarkierung, setLiveMarkierung] = useState<{
    auswahl: Auswahl;
    eintrag: MarkierungsEintrag;
  } | null>(null);
  const verknuepfungMoeglich = !aktionsAbschlussOffen && verknuepfungsMoeglichkeit.moeglich;
  const [ausgangAngebot, setAusgangAngebot] = useState<Auswahl | null>(null);
  const ausgangMoeglich =
    !aktionsAbschlussOffen && ausgangAngebot !== null && ausgangAngebot === auswahl;
  const liveEintrag =
    !aktionsAbschlussOffen && liveMarkierung?.auswahl === auswahl
      ? liveMarkierung.eintrag
      : undefined;
  const moeglichkeitsFehler = verknuepfungsMoeglichkeit.fehler;
  useEffect(() => {
    let aktuell = true;
    setAusgangAngebot(null);
    if (aktionsAbschlussOffen || aktionsStartErlaubt.current?.() === false) return;
    if (auswahl?.art === 'zeile' && auswahl.zeile.zeilenart === 'pauschalerBezugUnpassend') {
      const umfang = [
        { gesetz: auswahl.gesetz, eintraege: [{ ...auswahl.eintrag, zielKonflikte: [] }] },
      ];
      const sammlung = erzeugeAktionsMeldungsSammlung();
      const lauf = ermittleAktuelleVerknuepfungsMoeglichkeit(umfang, sammlung.meldungEmpfangen)
        .then(async (ergebnis) => {
          const lokal = await schliesseKonfliktMeldungenAb(sammlung, true);
          if (!aktuell) return;
          if (lokal) setAktionsFehler({ text: lokal, bereich: 'auswahl', auswahlIdentitaet });
          setAusgangAngebot(ergebnis.moeglich ? auswahl : null);
          if (ergebnis.fehler.length > 0)
            setAktionsFehler({
              text: lokal ?? 'Die Ausgangsstelle konnte nicht geladen werden.',
              bereich: 'auswahl',
              auswahlIdentitaet,
            });
        })
        .catch(async (fehler: unknown) => {
          const lokal = await schliesseKonfliktMeldungenAb(sammlung, false);
          if (!aktuell) return;
          console.error('Ausgangsstelle konnte nicht geladen werden:', fehler);
          setAktionsFehler({
            text: lokal ?? 'Die Ausgangsstelle konnte nicht geladen werden.',
            bereich: 'auswahl',
            auswahlIdentitaet,
          });
        });
      registriereAbschluss?.(lauf);
    }
    return () => {
      aktuell = false;
    };
  }, [
    auswahl,
    auswahlIdentitaet,
    aktionsAbschlussOffen,
    registriereAbschluss,
    aktionsStartErlaubt,
    setAktionsFehler,
  ]);

  const zeile = auswahl?.art === 'zeile' ? auswahl.zeile : null;
  const registriereLiveAbschluss = useEffectEvent((lauf: Promise<unknown>) =>
    registriereAbschluss?.(lauf),
  );
  const brauchtLiveEintrag =
    !!zeile?.zielgesetz &&
    (zeile.zeilenart === 'zielNormUnpassend' ||
      zeile.zeilenart === 'zielNormFehlt' ||
      zeile.zeilenart === 'zielNormNichtEindeutig');

  useEffect(() => {
    setLiveMarkierung(null);
    if (aktionsAbschlussOffen || aktionsStartErlaubt.current?.() === false) return;
    setEinzelImportFehler(null);
    setAktionsFehler((vorher) => (vorher?.bereich === 'auswahl' ? null : vorher));
    if (auswahl?.art === 'zeile' && brauchtLiveEintrag) {
      let aktuell = true;
      const sammlung = erzeugeAktionsMeldungsSammlung();
      const lauf = ladeAktuelleMarkierung(
        auswahl.gesetz,
        auswahl.eintrag.schluessel,
        sammlung.meldungEmpfangen,
      )
        .then(async (e) => {
          const lokal = await schliesseKonfliktMeldungenAb(sammlung, true);
          if (aktuell && lokal)
            setAktionsFehler({ text: lokal, bereich: 'auswahl', auswahlIdentitaet });
          if (aktuell) setLiveMarkierung(e ? { auswahl, eintrag: e } : null);
        })
        .catch(async (fehler: unknown) => {
          const lokal = await schliesseKonfliktMeldungenAb(sammlung, false);
          if (!aktuell) return;
          console.error('Markierung konnte nicht geladen werden:', fehler);
          setAktionsFehler({
            text: lokal ?? 'Die Markierung konnte nicht geladen werden.',
            bereich: 'auswahl',
            auswahlIdentitaet,
          });
        });
      registriereLiveAbschluss(lauf);
      return () => {
        aktuell = false;
      };
    }
  }, [
    auswahl,
    auswahlIdentitaet,
    aktionsAbschlussOffen,
    brauchtLiveEintrag,
    zeile,
    aktionsStartErlaubt,
    setAktionsFehler,
    setEinzelImportFehler,
  ]);

  function zeigeVerknuepfungsErgebnis(anzeige: { meldung: string | null; fehler: string | null }) {
    setVerknuepfungsMeldung(anzeige.meldung);
    setVerknuepfungsFehler(anzeige.fehler);
    if (anzeige.fehler) onAktionsNachfehler?.();
  }

  async function verknuepfen(art: 'alle' | 'ausgang' | 'ziel' | 'entfernen') {
    if (aktionsAbschlussOffen || aktionsStartErlaubt.current?.() === false) return;
    setVerknuepfungsMeldung(null);
    setVerknuepfungsFehler(null);
    setHilfeOffen(false);
    await ausfuehren(
      async (meldungEmpfangen) => {
        if (art === 'entfernen') {
          const dialog = entfernungsBestaetigung(zeile?.verweisziele.length ?? 0);
          const bestaetigt = await nativeBestaetigung(dialog.text, {
            title: dialog.titel,
            kind: 'warning',
            okLabel: 'Entfernen',
            cancelLabel: 'Abbrechen',
          });
          if (!bestaetigt) return;
        }
        // Die Hilfe gehört zur Verknüpfungsrückmeldung und bleibt bei anderen Aktionen erhalten.
        setAllgemeineRueckmeldung(art === 'alle');
        if (art === 'alle') {
          const bericht = await verknuepfeMitAktuellenNormen(gesetze, meldungEmpfangen);
          zeigeVerknuepfungsErgebnis(formatiereVerknuepfungsBericht(bericht));
          return bericht.gesetze.some((g) => g.ergebnis.status === 'geaendert');
        }
        if (auswahl?.art !== 'zeile') return;
        let ergebnis;
        if (art === 'ausgang') {
          ergebnis = await aktualisiereAusgangsVerknuepfungMitErgebnis(
            auswahl.gesetz,
            auswahl.eintrag.schluessel,
            meldungEmpfangen,
          );
        } else {
          const { zeile } = auswahl;
          if (
            !zeile.zielgesetz ||
            (zeile.zeilenart !== 'zielNormUnpassend' &&
              zeile.zeilenart !== 'zielNormNichtEindeutig' &&
              zeile.zeilenart !== 'zielNormFehlt')
          )
            return;
          ergebnis = await aktualisiereVerknuepfungMitErgebnis(
            auswahl.gesetz,
            auswahl.eintrag.schluessel,
            zeile.zielgesetz,
            art === 'entfernen' ? 'entfernen' : 'verknuepfen',
            { zeilenart: zeile.zeilenart, verweisziele: zeile.verweisziele },
            meldungEmpfangen,
          );
        }
        zeigeVerknuepfungsErgebnis(formatiereEinzelVerknuepfung(ergebnis, art));
        return ergebnis.status === 'geaendert';
      },
      art === 'alle' ? 'verknuepfung' : 'alle',
    );
  }

  return {
    verknuepfungMoeglich,
    ausgangMoeglich,
    liveEintrag,
    moeglichkeitsFehler,
    zeile,
    verknuepfen,
  };
}
