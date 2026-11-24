// Auswahlbezogene Aktionen für Datensatz, fehlende Titeldatei und Konfliktzeile.
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import type { Auswahl } from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import { zuMarkierungsAuswahl } from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import { verknuepfungsBeschriftung, entfernungsBeschriftung } from './konfliktTexte';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { oeffneInternesZiel } from '@/hooks/fenster/useInterneNavigation';
import { bearbeiteVerweismarkierung } from '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster.ausgangskontext';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useIconGroessen, useTextRollen } from '@/hooks/stil/useTextRollen';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { importFehlenderNormen, loescheAusgewaehlt } from '@/lib/markierungen/markierungen.index';
import { nativeBestaetigung } from '@/lib/plattform/tauriHelpers';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import {
  ArrowSquareOut,
  DownloadSimple,
  Link,
  LinkBreak,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react';

import type { useKonfliktaktionslauf } from './useKonfliktaktionslauf';
import type { useKonfliktVerknuepfung } from './useKonfliktVerknuepfung';
export function KonfliktseitenleisteAuswahl({
  auswahl,
  ladeGesetz,
  laeuft,
  wirdGeladen,
  aktionsAbschlussOffen,
  buttonStil,
  textRollen,
  iconGroessen,
  uiFaktor,
  ausfuehren,
  verknuepfen,
  liveEintrag,
  zeile,
  ausgangMoeglich,
  einzelImportFehler,
  setEinzelImportFehler,
  auswahlIdentitaet,
  onErfolgreicherImport,
}: {
  auswahl: Auswahl | null;
  ladeGesetz: GesetzLader | undefined;
  laeuft: boolean;
  wirdGeladen: boolean;
  aktionsAbschlussOffen: boolean;
  buttonStil: React.CSSProperties;
  textRollen: ReturnType<typeof useTextRollen>;
  iconGroessen: ReturnType<typeof useIconGroessen>;
  abstandRollen: ReturnType<typeof useAbstandRollen>;
  uiFaktor: number;
  ausfuehren: ReturnType<typeof useKonfliktaktionslauf>['ausfuehren'];
  verknuepfen: ReturnType<typeof useKonfliktVerknuepfung>['verknuepfen'];
  liveEintrag: ReturnType<typeof useKonfliktVerknuepfung>['liveEintrag'];
  zeile: ReturnType<typeof useKonfliktVerknuepfung>['zeile'];
  ausgangMoeglich: boolean;
  einzelImportFehler: ReturnType<typeof useKonfliktaktionslauf>['einzelImportFehler'];
  setEinzelImportFehler: ReturnType<typeof useKonfliktaktionslauf>['setEinzelImportFehler'];
  auswahlIdentitaet: string | null;
  onErfolgreicherImport: (gesetz: Gesetzesreferenz) => void;
}) {
  function renderZielAktionen() {
    if (!zeile || auswahl?.art !== 'zeile' || !liveEintrag) return null;

    const verweisziele = zeile.verweisziele;
    return (
      <>
        {zeile.zeilenart === 'zielNormUnpassend' && verweisziele.length === 1 && (
          <button
            style={buttonStil}
            disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
            onClick={() =>
              void ausfuehren(
                () =>
                  oeffneInternesZiel({
                    gesetz: zeile.zielgesetz!,
                    ziel: {
                      type: 'norm',
                      bezeichnung: verweisziele[0]!.bezeichnung,
                    },
                  }),
                'auswahl',
                'Das Ziel konnte nicht an das Hauptfenster übergeben werden.',
              )
            }
          >
            <ArrowSquareOut size={iconGroessen.standard} weight="regular" aria-hidden="true" />
            <TextAnzeige text={'Zielnorm öffnen'} />
          </button>
        )}
        <button
          style={buttonStil}
          disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
          onClick={() => {
            if (!ladeGesetz) return;
            return ausfuehren(
              (meldungEmpfangen) =>
                bearbeiteVerweismarkierung(
                  auswahl.gesetz,
                  ladeGesetz,
                  liveEintrag,
                  meldungEmpfangen,
                ),
              'auswahl',
              'Das Fenster zum Bearbeiten des Verweises konnte nicht geöffnet werden.',
            );
          }}
        >
          <PencilSimple size={iconGroessen.standard} weight="regular" aria-hidden="true" />
          <TextAnzeige text={'Verweis bearbeiten'} />
        </button>{' '}
        {zeile.zeilenart === 'zielNormUnpassend' && (
          <button
            style={buttonStil}
            disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
            onClick={() => verknuepfen('ziel')}
          >
            <Link size={iconGroessen.standard} weight="regular" aria-hidden="true" />
            <TextAnzeige text={verknuepfungsBeschriftung(verweisziele.length)} />
          </button>
        )}
        <button
          style={buttonStil}
          disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
          onClick={() => verknuepfen('entfernen')}
        >
          <LinkBreak size={iconGroessen.standard} weight="regular" aria-hidden="true" />
          <TextAnzeige text={entfernungsBeschriftung(verweisziele.length)} />
        </button>
      </>
    );
  }

  const einzelImportFehlerAnzeige = einzelImportFehler?.auswahlIdentitaet === auswahlIdentitaet &&
    !!einzelImportFehler && (
      <TextAnzeige
        element="div"
        style={{
          ...textRollen.fehlertext,
          marginTop: -2,
          marginBottom: pxSkaliert(6, uiFaktor),
        }}
        text={einzelImportFehler.text}
      />
    );

  return (
    <>
      {!auswahl && (
        <TextAnzeige
          element="div"
          style={{ ...textRollen.standardtext, color: 'var(--text-sekundaer)' }}
          text={
            'Links eine Markierung oder einen Markierungsdatensatz auswählen, um Aktionen anzuzeigen.'
          }
        />
      )}

      {auswahl?.art === 'datensatz' && (
        <>
          <button
            style={buttonStil}
            disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
            onClick={() =>
              ausfuehren(async (meldungEmpfangen) => {
                setEinzelImportFehler(null);
                const [bericht] = await importFehlenderNormen(
                  [auswahl.gesetz],
                  undefined,
                  meldungEmpfangen,
                );
                if (!bericht?.erfolg) {
                  setEinzelImportFehler({
                    text: bericht?.fehler ?? 'Import fehlgeschlagen.',
                    auswahlIdentitaet,
                  });
                  return;
                }
                onErfolgreicherImport(auswahl.gesetz);
                return bericht.gespeichert === true;
              })
            }
          >
            <DownloadSimple size={iconGroessen.standard} weight="regular" aria-hidden="true" />
            <TextAnzeige text={'Import des Gesetzes aus dem Internet'} />
          </button>
          {einzelImportFehlerAnzeige}
          <button
            style={buttonStil}
            disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
            onClick={() =>
              ausfuehren(async (meldungEmpfangen) => {
                const bestaetigt = await nativeBestaetigung(
                  `Alle Markierungen zu ${auswahl.gesetz.kurztitel} werden unwiderruflich gelöscht. Wirklich löschen?`,
                  {
                    title: 'Markierungen löschen',
                    kind: 'warning',
                    okLabel: 'Löschen',
                    cancelLabel: 'Abbrechen',
                  },
                );
                if (!bestaetigt) return;
                return loescheAusgewaehlt(zuMarkierungsAuswahl(auswahl), meldungEmpfangen);
              })
            }
          >
            <Trash size={iconGroessen.standard} weight="regular" aria-hidden="true" />
            <TextAnzeige text={'Markierungen löschen'} />
          </button>
        </>
      )}

      {auswahl?.art === 'nichtamtlicheTitelXmlFehlt' && (
        <button
          style={buttonStil}
          disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
          onClick={() =>
            ausfuehren(async (meldungEmpfangen) => {
              if (
                await nativeBestaetigung(
                  `Alle Markierungen nichtamtlicher Titel des Gesetzes ${auswahl.gesetz.kurztitel} werden unwiderruflich gelöscht. Wirklich löschen?`,
                  {
                    title: 'Markierungen nichtamtlicher Titel löschen',
                    kind: 'warning',
                    okLabel: 'Löschen',
                    cancelLabel: 'Abbrechen',
                  },
                )
              ) {
                return loescheAusgewaehlt(zuMarkierungsAuswahl(auswahl), meldungEmpfangen);
              }
            })
          }
        >
          <Trash size={iconGroessen.standard} weight="regular" aria-hidden="true" />
          <TextAnzeige text={'Markierungen nichtamtlicher Titel löschen'} />
        </button>
      )}

      {auswahl?.art === 'zeile' && (
        <>
          <button
            style={buttonStil}
            disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
            onClick={() =>
              ausfuehren((meldungEmpfangen) =>
                loescheAusgewaehlt(zuMarkierungsAuswahl(auswahl), meldungEmpfangen),
              )
            }
          >
            <Trash size={iconGroessen.standard} weight="regular" aria-hidden="true" />
            <TextAnzeige text={'Markierung löschen'} />
          </button>

          {zeile?.zeilenart === 'pauschalerBezugUnpassend' && !!ausgangMoeglich && (
            <button
              style={buttonStil}
              disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
              onClick={() => verknuepfen('ausgang')}
            >
              <Link size={iconGroessen.standard} weight="regular" aria-hidden="true" />
              <TextAnzeige text={'Mit aktueller Norm verknüpfen'} />
            </button>
          )}

          {!!zeile?.zielgesetz && zeile.zeilenart === 'zielGesetzFehlt' && (
            <>
              <button
                style={buttonStil}
                disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
                onClick={() =>
                  ausfuehren(async (meldungEmpfangen) => {
                    setEinzelImportFehler(null);
                    const [bericht] = await importFehlenderNormen(
                      [zeile.zielgesetz!],
                      undefined,
                      meldungEmpfangen,
                    );
                    if (!bericht?.erfolg) {
                      setEinzelImportFehler({
                        text: bericht?.fehler ?? 'Import fehlgeschlagen.',
                        auswahlIdentitaet,
                      });
                    }
                    return bericht?.gespeichert === true;
                  })
                }
              >
                <DownloadSimple size={iconGroessen.standard} weight="regular" aria-hidden="true" />
                <TextAnzeige text={'Import aus dem Internet'} />
              </button>
              {einzelImportFehlerAnzeige}
            </>
          )}

          {!!zeile?.zielgesetz &&
            (zeile.zeilenart === 'zielNormUnpassend' ||
              zeile.zeilenart === 'zielNormFehlt' ||
              zeile.zeilenart === 'zielNormNichtEindeutig') &&
            !!liveEintrag &&
            renderZielAktionen()}
        </>
      )}
    </>
  );
}
