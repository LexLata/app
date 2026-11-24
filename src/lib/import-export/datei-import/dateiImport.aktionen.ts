// dateiImport.aktionen.ts
// Aus dateiImport.ts ausgelagert (500-Zeilen-Richtgröße): die
// Konfliktauflösung, die erst NACH einer Nutzerentscheidung im
// DateiImportOverlay.tsx läuft (Ersetzen/Zusammenführen) – zeitlich/logisch
// nachgelagert zur Verarbeitung in dateiImport.ts, die konfliktfreie
// Dateien sofort schreibt und Konflikte sammelt. meldeAenderung ist in
// dateiImport.einfach.ts definiert (auch von der Klassifizierung
// selbst gebraucht) und wird direkt von dort importiert. Beide Dateien sind
// interne Teile desselben Submoduls; die öffentliche Fassade bleibt davon
// unberührt.
// Favoriten, Lesezeichen und Gesetzeskurzbefehle melden Änderungen selbst;
// Meldungsfehler warnen nach erfolgreicher Speicherung. meldeAenderung
// übernimmt hier ausschließlich Markierungen und nichtamtliche Titel.

import { ImportAbschlussFehler } from './dateiImport.types';
import {
  erzeugeAktionsMeldungsWeiterleitung,
  type AktionsMeldung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import { speichereGesetz, GesetzSpeicherFolgefehler } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  zusammenfuehrenFavoriten,
  pruefeFavoritenImport,
  ersetzeFavoritenDatei,
} from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { ersetzeNichtamtlicheTitelDatei } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  zusammenfuehrenLesezeichen,
  pruefeLesezeichenImport,
  ersetzeLesezeichenDatei,
} from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import {
  beurteileMarkierungsImport,
  istMarkierungsImportUnveraendert,
  leseMarkierungenRohtext,
  zusammenfuehrenMarkierungen,
  ersetzeMarkierungenDatei,
} from '@/lib/markierungen/markierungen.index';
import {
  zusammenfuehrenGesetzeskurzbefehle,
  pruefeGesetzeskurzbefehleImport,
  ersetzeGesetzeskurzbefehleDatei,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';

import {
  meldeAenderung,
  erzeugeImportAbschluss,
  importiereEinstellungen,
  ohneZeitstempel,
  ergaenzeImportFehler,
} from '@/lib/import-export/datei-import/dateiImport.einfach';
import type {
  ImportKonflikt,
  ImportAktion,
  BerichtEintrag,
  DateiKonflikt,
} from '@/lib/import-export/datei-import/dateiImport.types';

/** Liefert ohne Nebenwirkungen Ersetzen für alle Konfliktarten und zusätzlich
 * Zusammenführen für Favoriten, Lesezeichen, Gesetzeskurzbefehle und Markierungen. */
export function ermittleImportAktionen(konflikt: ImportKonflikt): readonly ImportAktion[] {
  switch (konflikt.art) {
    case 'favoriten':
    case 'lesezeichen':
    case 'gesetzeskurzbefehle':
    case 'markierung':
      return ['ersetzen', 'zusammenfuehren'];
    case 'einstellungen':
    case 'gesetz':
    case 'nichtamtlicheTitel':
      return ['ersetzen'];
  }
}

/** Validiert die Aktion vor jeder Änderung und löst den Konflikt einschließlich
 * seiner Änderungsbenachrichtigungen auf. Liefert genau einen Berichtseintrag
 * mit Kategorie, tatsächlicher Aktion und bisherigem Namen. Das Flag (Standard
 * true) wirkt nur beim Zusammenführen von Gesetzeskurzbefehlen/Markierungen.
 * Unzulässige Aktionen und Speicherfehler werfen. Meldungsfehler der
 * Nutzerdatenspeicher warnen gesondert. Explizite Schreibbestätigung oder ein
 * typisierter GesetzSpeicherFolgefehler erhält erledigte Entscheidungen auch
 * bei Folgefehlern. Fehler ohne bestätigte Zielspeicherung werfen; kein Rollback.
 * Kehrt direkt nach der Speicherung zurück; Befunde der Folgeläufe treffen
 * danach über `abschluss` in `meldungen` ein. */
export async function loeseImportKonflikt(
  konflikt: ImportKonflikt,
  aktion: ImportAktion,
  behalteBestehendeBeiKonflikt = true,
): Promise<BerichtEintrag> {
  if (!ermittleImportAktionen(konflikt).includes(aktion)) {
    throw new Error(
      `Die Aktion „${aktion === 'zusammenfuehren' ? 'Zusammenführen' : aktion}“ ist für diesen Importkonflikt nicht zulässig.`,
    );
  }
  if (konflikt.art === 'einstellungen') return loeseEinstellungenKonflikt(konflikt);
  if (konflikt.art === 'markierung')
    return loeseMarkierungsKonflikt(konflikt, aktion, behalteBestehendeBeiKonflikt);
  const meldungen: AktionsMeldung[] = [...(konflikt.meldungen ?? [])];
  const abschluss =
    konflikt.art === 'gesetz' || konflikt.art === 'nichtamtlicheTitel'
      ? erzeugeImportAbschluss(meldungen)
      : undefined;
  const empfangen: AktionsMeldungEmpfaenger =
    abschluss?.meldungEmpfangen ??
    ((meldung) => {
      if (!meldungen.some((m) => JSON.stringify(m) === JSON.stringify(meldung)))
        meldungen.push(meldung);
    });
  const vorherigeBefunde = meldungen.length;
  const anzahl = await pruefeKonfliktEingang(konflikt, empfangen);
  const eingangUnvollstaendig =
    konflikt.eingangUnvollstaendig === true || meldungen.length > vorherigeBefunde;
  const keineUebernahme = eingangUnvollstaendig && anzahl === 0;
  let geschrieben = false;
  let geaendert = true;
  try {
    if (!keineUebernahme)
      geaendert = await speichereImportKonflikt(
        konflikt,
        aktion,
        behalteBestehendeBeiKonflikt,
        empfangen,
        () => {
          geschrieben = true;
        },
      );
  } catch (fehler) {
    await behandleKonfliktSpeicherfehler(fehler, geschrieben, konflikt, meldungen, abschluss);
    ergaenzeFolgefehler(meldungen, fehler);
  }
  // Nach bestätigter Speicherung nicht auf die Folgeläufe warten: Ihre Befunde
  // (und ggf. der Fristhinweis) treffen über `abschluss` im Bericht ein.
  void abschluss?.warte();
  return {
    ...(abschluss ? { abschluss, meldungen } : {}),
    ...(konflikt.quelle ? { quelle: konflikt.quelle } : {}),
    ...(meldungen.length ? { meldungen, eingangUnvollstaendig } : {}),
    kategorie: konflikt.art,
    aktion: keineUebernahme ? 'nichtUebernommen' : erfolgsAktion(aktion, geaendert),
    name:
      konflikt.art === 'gesetz' ? konflikt.kurztitel : (konflikt.kurztitel ?? konflikt.anzeigename),
  };
}

/** Vor bestätigter Speicherung bleibt die Konfliktentscheidung offen. */
async function behandleKonfliktSpeicherfehler(
  fehler: unknown,
  geschrieben: boolean,
  konflikt: ImportKonflikt,
  meldungen: AktionsMeldung[],
  abschluss: ReturnType<typeof erzeugeImportAbschluss> | undefined,
): Promise<void> {
  if (geschrieben || fehler instanceof GesetzSpeicherFolgefehler) return;
  await abschluss?.warte();
  const bericht: BerichtEintrag | undefined = abschluss?.hatOffeneFolgelaeufe()
    ? {
        kategorie: konflikt.art,
        aktion: 'nichtUebernommen',
        name:
          konflikt.art === 'gesetz'
            ? konflikt.kurztitel
            : (konflikt.kurztitel ?? konflikt.anzeigename),
        meldungen,
        abschluss,
      }
    : undefined;
  throw ergaenzeImportFehler(fehler, meldungen, bericht);
}

/** Bestehende Speicherwege einschließlich ihrer Änderungsbenachrichtigungen. */
async function speichereImportKonflikt(
  konflikt: ImportKonflikt,
  aktion: ImportAktion,
  behalteBestehendeBeiKonflikt: boolean,
  empfangen: AktionsMeldungEmpfaenger,
  zielGeschrieben: () => void,
): Promise<boolean> {
  switch (konflikt.art) {
    case 'gesetz':
      await speichereGesetz(konflikt.neuesGesetz, konflikt.neuesXML, {
        inhaltGeaendert: true,
        meldungEmpfangen: empfangen,
        zielGeschrieben,
      });
      break;
    case 'favoriten':
      if (aktion === 'ersetzen') {
        await ersetzeFavoritenDatei(konflikt.gesetz!, konflikt.importInhalt, empfangen);
      } else {
        return (
          (await zusammenfuehrenFavoriten(konflikt.gesetz!, konflikt.importInhalt, empfangen))
            .size > 0
        );
      }
      break;
    case 'lesezeichen':
      if (aktion === 'ersetzen') {
        await ersetzeLesezeichenDatei(konflikt.importInhalt, empfangen);
      } else {
        return zusammenfuehrenLesezeichen(konflikt.importInhalt, empfangen);
      }
      break;
    case 'gesetzeskurzbefehle':
      if (aktion === 'ersetzen') {
        await ersetzeGesetzeskurzbefehleDatei(konflikt.importInhalt, empfangen);
      } else {
        return zusammenfuehrenGesetzeskurzbefehle(
          konflikt.importInhalt,
          behalteBestehendeBeiKonflikt,
          empfangen,
        );
      }
      break;
    case 'markierung':
      throw new Error('Markierungen verwenden ihren diagnostizierten Importweg.');
    case 'nichtamtlicheTitel':
      await ersetzeNichtamtlicheTitelDatei(
        konflikt.gesetz!,
        konflikt.importInhalt,
        empfangen,
        zielGeschrieben,
      );
      zielGeschrieben();
      await meldeAenderung('nichtamtlicheTitel', konflikt.gesetz);
      break;
    case 'einstellungen':
      throw new Error('Einstellungen verwenden ihren eigenen Übernahmestand.');
  }
  return true;
}

/** Gleiche Eingangsdiagnose für beide Overlayaktionen; Nullübernahme schreibt niemals. */
async function loeseMarkierungsKonflikt(
  konflikt: DateiKonflikt,
  aktion: ImportAktion,
  behalteBestehende: boolean,
): Promise<BerichtEintrag> {
  const gesetz = konflikt.gesetz!;
  const gelesen = beurteileMarkierungsImport(konflikt.importInhalt, gesetz);
  const meldungen = [...gelesen.meldungen];
  const bericht: BerichtEintrag = {
    kategorie: 'markierung',
    aktion: 'nichtUebernommen',
    name: gesetz.kurztitel,
    ...(konflikt.quelle ? { quelle: konflikt.quelle } : {}),
    ...(gelesen.ausgeschlossen
      ? { meldungen, ausgeschlosseneMarkierungen: gelesen.ausgeschlossen }
      : {}),
  };
  if (gelesen.ausgeschlossen && gelesen.eintraege.length === 0) return bericht;
  const bestehend = await leseMarkierungenRohtext(gesetz, (meldung) => {
    (bericht.meldungen ??= meldungen).push(meldung);
  });
  if (
    bestehend !== null &&
    (gelesen.ausgeschlossen
      ? istMarkierungsImportUnveraendert(gesetz, bestehend, gelesen.eintraege)
      : ohneZeitstempel(bestehend, 'markierung') ===
        ohneZeitstempel(konflikt.importInhalt, 'markierung'))
  )
    return { ...bericht, aktion: 'unveraendert' };
  const abschluss = erzeugeImportAbschluss(meldungen);
  const empfangen = erzeugeAktionsMeldungsWeiterleitung(abschluss.meldungEmpfangen, (meldung) => {
    if (meldung.anlass !== 'import') abschluss.meldungEmpfangen(meldung);
  });
  let geschrieben = false;
  let geaendert: boolean;
  const bestaetigeSchreiben = () => {
    geschrieben = true;
  };
  try {
    geaendert =
      aktion === 'ersetzen'
        ? await ersetzeMarkierungenDatei(
            gesetz,
            konflikt.importInhalt,
            empfangen,
            bestaetigeSchreiben,
          )
        : await zusammenfuehrenMarkierungen(
            gesetz,
            gelesen.eintraege,
            behalteBestehende,
            empfangen,
            bestaetigeSchreiben,
          );
    if (geaendert) {
      geschrieben = true;
      await meldeAenderung('markierung', gesetz);
    }
  } catch (fehler) {
    if (!geschrieben) {
      await abschluss.warte();
      throw ergaenzeImportFehler(
        fehler,
        meldungen,
        abschluss.hatOffeneFolgelaeufe() ? { ...bericht, meldungen, abschluss } : undefined,
      );
    }
    geaendert = true;
    ergaenzeFolgefehler(meldungen, fehler);
  }
  void abschluss.warte();
  return {
    ...bericht,
    abschluss,
    meldungen,
    aktion: erfolgsAktion(aktion, geaendert),
  };
}

/** Wiederholt dieselbe schreibfreie Diagnose vor einer späteren Entscheidung. */
async function pruefeKonfliktEingang(
  konflikt: ImportKonflikt,
  empfangen: AktionsMeldungEmpfaenger,
): Promise<number | undefined> {
  switch (konflikt.art) {
    case 'favoriten':
      return pruefeFavoritenImport(konflikt.importInhalt, konflikt.gesetz, empfangen);
    case 'lesezeichen':
      return pruefeLesezeichenImport(konflikt.importInhalt, empfangen);
    case 'gesetzeskurzbefehle':
      return pruefeGesetzeskurzbefehleImport(konflikt.importInhalt, empfangen);
    case 'einstellungen':
    case 'gesetz':
    case 'markierung':
    case 'nichtamtlicheTitel':
      return undefined;
  }
}

/** Derselbe empfangene Befund und seine Ausnahme ergeben eine gemeinsame Zeile. */
function ergaenzeFolgefehler(meldungen: AktionsMeldung[], fehler: unknown): void {
  const grund = fehler instanceof Error ? fehler.message : String(fehler);
  if (meldungen.some((m) => m.text.includes(grund))) return;
  meldungen.push({
    typ: 'fehler',
    art: 'hinweis',
    anlass: 'synchronisation',
    aenderungsstand: 'vollstaendig',
    text: `Die Zieldatei wurde gespeichert. Beim anschließenden Abschluss: ${grund}`,
  });
}

/** Einheitliche Aktionsbezeichnung für die beiden bestätigten Speicherwege. */
function erfolgsAktion(aktion: ImportAktion, geaendert = true) {
  if (!geaendert) return 'unveraendert';
  return aktion === 'ersetzen' ? 'ersetzt' : 'zusammengefuehrt';
}

/** Eine vollständig gescheiterte Übernahme bleibt entscheidbar; Teilübernahme
 * wird mit ihrem tatsächlichen Stand und eigenem Backupabschluss berichtet. */
async function loeseEinstellungenKonflikt(konflikt: DateiKonflikt): Promise<BerichtEintrag> {
  const bericht = {
    ...(await importiereEinstellungen(konflikt.importInhalt, 'ersetzt')),
    quelle: konflikt.quelle,
  };
  if (bericht.aktion === 'nichtUebernommen')
    throw new ImportAbschlussFehler(
      new Error('Die Einstellungen wurden nicht übernommen.'),
      bericht,
    );
  return bericht;
}
