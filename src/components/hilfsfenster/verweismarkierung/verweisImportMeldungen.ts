// verweisImportMeldungen.ts
// Ergebnisaufbereitung nach dem Folgelaufwarten: lokale Befunde, gesetzesbezogene
// Importhinweise und verbleibende Meldungen des anschließenden Verweisabschlusses.
import { uebergebeMarkierungsFensterHinweise } from '@/components/hilfsfenster/gemeinsam/markierungsHinweise';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import { sicherungsHinweis } from '@/lib/domain/app/meldungsgruppen';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { ImportVersuchErgebnis, ZitatFehler } from '@/lib/markierungen/markierungen.index';

function meldungsSchluessel(meldung: AktionsMeldung) {
  return JSON.stringify([
    meldung.text,
    meldung.typ,
    meldung.art,
    meldung.anlass,
    meldung.aenderungsstand,
  ]);
}

function teileMeldungenAuf(
  meldungen: readonly AktionsMeldung[],
  abgeschlossen: boolean,
  fehlgeschlagen = false,
) {
  return {
    lokal: meldungen.filter(
      (meldung) =>
        (!abgeschlossen || fehlgeschlagen) &&
        (meldung.art === 'fehler' || meldung.aenderungsstand === 'keine'),
    ),
    hinweise: meldungen.filter(
      (meldung) =>
        abgeschlossen || (meldung.art === 'hinweis' && meldung.aenderungsstand !== 'keine'),
    ),
  };
}

/** Ohne Verweisabschluss bleiben Fehler und unveränderte Befunde lokal;
 * tatsächlich ausgeführte Quelländerungen erreichen trotzdem ein Hauptfenster. */
export function bereiteSpeicherMeldungenAuf(
  meldungen: readonly AktionsMeldung[],
  abgeschlossen: boolean,
  zitatFehler: readonly ZitatFehler[] = [],
) {
  const aufbereitung = teileMeldungenAuf(meldungen, abgeschlossen);
  const hinweis = sicherungsHinweis(aufbereitung.lokal);
  const lokal: ZitatFehler[] = abgeschlossen
    ? []
    : [
        ...zitatFehler,
        ...aufbereitung.lokal.map((meldung): ZitatFehler => ({ art: 'sonst', text: meldung.text })),
        ...(hinweis ? [{ art: 'sonst' as const, text: hinweis }] : []),
      ];
  return {
    lokal: [...new Map(lokal.map((befund) => [befund.text, befund])).values()],
    hinweise: aufbereitung.hinweise,
  };
}

/** Erst nach dem begrenzten Folgelaufwarten aufrufen: die Originalbündel werden
 * bis dahin noch ergänzt. Übergibt die Importhinweise vor der Rückgabe und
 * bereitet die verbleibenden Speicherbefunde auf; kein eigener Erfolgszustand. */
export async function verarbeiteImportMeldungen(
  ergebnis: ImportVersuchErgebnis,
  bisherigeFehler: readonly ZitatFehler[],
  oeffner: string,
  fristMeldung?: AktionsMeldung,
) {
  const lokaleMeldungen: AktionsMeldung[] = [];
  // Originalidentität gilt auch bei Änderungsbefunden; der Inhaltsschlüssel
  // erfasst wiederholt geladene unveränderte Diagnosen desselben Versuchs.
  const verarbeiteteHinweise = new Set<string | AktionsMeldung>();
  const verarbeiteBuendel = async (
    meldungen: readonly AktionsMeldung[],
    ersterSatz: string,
    abgeschlossen: boolean,
    fehlgeschlagen: boolean,
    gesetz = '',
  ) => {
    const aufbereitung = teileMeldungenAuf(meldungen, abgeschlossen, fehlgeschlagen);
    lokaleMeldungen.push(...aufbereitung.lokal);
    const hinweise = aufbereitung.hinweise.filter((meldung) => {
      // Unveränderte Referenzdiagnosen einmal pro Versuch; Änderungsbefunde
      // gehören zum jeweiligen Gesetz, selbst bei identischem Wortlaut.
      const schluessel = `${meldung.aenderungsstand === 'keine' ? '' : gesetz}:${meldungsSchluessel(meldung)}`;
      verarbeiteteHinweise.add(meldung);
      if (verarbeiteteHinweise.has(schluessel)) return false;
      verarbeiteteHinweise.add(schluessel);
      return true;
    });
    await uebergebeMarkierungsFensterHinweise(
      hinweise,
      oeffner,
      ersterSatz,
      abgeschlossen,
      'Importhinweis des Verweisfensters nicht angenommen:',
    );
  };
  await verarbeiteBuendel(
    [...ergebnis.bestandsMeldungen, ...(fristMeldung ? [fristMeldung] : [])],
    'Eine Quelldatei wurde geändert.',
    false,
    true,
  );
  await Promise.all(
    ergebnis.abschluesse.map(async (abschluss) => {
      const titel = abschluss.gesetz.kurztitel;
      // Verfügbarkeit für die Zitatprüfung ist kein Speichernachweis. Auch bei
      // frischem Ladefehler bleibt der tatsächliche Importabschluss maßgeblich.
      const importGespeichert =
        abschluss.art === 'import' && !!abschluss.ergebnis.importergebnis?.erfolgreiche.length;
      const aktualisierungGespeichert =
        abschluss.art === 'aktualisierung' && abschluss.ergebnis.art === 'erfolg';
      const ersterSatz = importGespeichert
        ? `${titel} wurde importiert.`
        : aktualisierungGespeichert
          ? abschluss.ergebnis.art === 'erfolg' &&
            'kategorie' in abschluss.ergebnis &&
            abschluss.ergebnis.kategorie === 'unveraendert'
            ? `${titel} ist inhaltlich unverändert; der Prüfzeitpunkt wurde aktualisiert.`
            : `${titel} wurde aktualisiert.`
          : `Eine Quelldatei für ${titel} wurde geändert.`;
      await verarbeiteBuendel(
        abschluss.meldungen,
        ersterSatz,
        importGespeichert || aktualisierungGespeichert,
        abschluss.art === 'nichtAbgeschlossen' || abschluss.ergebnis.art === 'fehler',
        gesetzesreferenzSchluessel(abschluss.gesetz),
      );
    }),
  );
  const zitatFehler: ZitatFehler[] = ergebnis.neuFehlgeschlagen
    .filter(
      (fehlgeschlagen) =>
        !bisherigeFehler.some(
          (befund) =>
            befund.art === 'gesetz' &&
            befund.gesetz &&
            gesetzesreferenzSchluessel(befund.gesetz) ===
              gesetzesreferenzSchluessel(fehlgeschlagen.gesetz),
        ),
    )
    .map((fehlgeschlagen) => ({
      art: 'sonst',
      text:
        fehlgeschlagen.fehler ??
        `${fehlgeschlagen.gesetz.kurztitel} konnte nicht importiert werden.`,
    }));
  return {
    verbleibendeMeldungen: lokaleMeldungen as readonly AktionsMeldung[],
    lokal: bereiteSpeicherMeldungenAuf(lokaleMeldungen, false, zitatFehler).lokal,
    fuerSpeicherabschluss(
      meldungen: readonly AktionsMeldung[],
      abgeschlossen: boolean,
      fehler: ZitatFehler[],
    ) {
      const verbleibend = meldungen.filter(
        (meldung) =>
          !abgeschlossen ||
          (!verarbeiteteHinweise.has(meldung) &&
            (meldung.aenderungsstand !== 'keine' ||
              !verarbeiteteHinweise.has(`:${meldungsSchluessel(meldung)}`))),
      );
      return bereiteSpeicherMeldungenAuf(verbleibend, abgeschlossen, [...fehler, ...zitatFehler]);
    },
  };
}
