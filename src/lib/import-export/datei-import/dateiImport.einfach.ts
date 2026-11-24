// Klassifiziert Nutzerdaten samt nichtamtlichen Titeln und Einstellungen.
// Speicherwege bestätigen die Speicherung; meldeAenderung meldet Markierungen/Titel.

import {
  erzeugeAktionsMeldungsSammlung,
  type AktionsMeldung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import { liesPflichtNormgeber } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { liesXmlWurzel, xmlKind } from '@/lib/utils/xmlVerarbeitung';
import {
  zusammenfuehrenFavoriten,
  pruefeFavoritenImport,
  leseFavoritenRohtext,
} from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import {
  leseNichtamtlicheTitelRohtext,
  ersetzeNichtamtlicheTitelDatei,
} from '@/lib/persistenz/gesetz/gesetz.index';
import {
  zusammenfuehrenLesezeichen,
  pruefeLesezeichenImport,
  leseLesezeichenRohtext,
} from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import {
  beurteileMarkierungsImport,
  istMarkierungsImportUnveraendert,
  zusammenfuehrenMarkierungen,
  leseMarkierungenRohtext,
  liesMarkierungsGesetz,
} from '@/lib/markierungen/markierungen.index';
import {
  zusammenfuehrenGesetzeskurzbefehle,
  pruefeGesetzeskurzbefehleImport,
  leseGesetzeskurzbefehleRohtext,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import {
  baueEinstellungenXML,
  einstellungenOhneVerarbeitungszeit,
  keineEinstellungExplizitGesetzt,
  wendeEinstellungenXMLAn,
} from '@/lib/einstellungen/einstellungen.index';

import { ImportAbschlussFehler } from '@/lib/import-export/datei-import/dateiImport.types';
import type {
  BerichtEintrag,
  DateiKonflikt,
} from '@/lib/import-export/datei-import/dateiImport.types';

/** Blendet nur den direkten Zeitstempel unter den Wurzel-infos aus.
 * Nutztext und verschachtelte fachliche Datumstags bleiben vergleichbar. */
export function ohneZeitstempel(xml: string, kategorie: EinfacheKategorie): string {
  const tag = kategorie === 'nichtamtlicheTitel' ? 'geaendert' : 'verarbeitungszeit';
  return xml.replace(
    /^((?:<\?xml[^>]*>\s*)?<[^!?][^>]*>\s*<infos>)([\s\S]*?)(<\/infos>)/,
    (_block, anfang: string, infos: string, ende: string) => {
      let tiefe = 0;
      for (const token of infos.matchAll(/<[^>]*>/g)) {
        if (tiefe === 0 && token[0] === `<${tag}>`) {
          const rest = infos.slice(token.index);
          const zeit = rest.match(new RegExp(`^<${tag}>[^<]*</${tag}>`));
          if (zeit) return anfang + infos.slice(0, token.index) + rest.slice(zeit[0].length) + ende;
        }
        if (token[0].startsWith('</')) tiefe--;
        else if (!token[0].endsWith('/>') && !token[0].startsWith('<!')) tiefe++;
      }
      return anfang + infos + ende;
    },
  );
}

function liesGesetz(inhalt: string): Gesetzesreferenz {
  const infos = xmlKind(liesXmlWurzel(inhalt), 'infos');
  const el = xmlKind(infos, 'gesetz');
  const kurztitel = el?.textContent?.trim();
  if (!kurztitel) throw new Error('Datei ungültig: Gesetzesreferenz fehlt.');
  return { kurztitel, normgeber: liesPflichtNormgeber(el?.getAttribute('normgeber') ?? undefined) };
}

export type EinfacheKategorie =
  | 'favoriten'
  | 'lesezeichen'
  | 'gesetzeskurzbefehle'
  | 'markierung'
  | 'nichtamtlicheTitel'
  | 'einstellungen';

/** Meldet Markierungs-/Titeländerungen; Nutzerdatenspeicher melden selbst. */
export async function meldeAenderung(
  kategorie: 'markierung' | 'nichtamtlicheTitel',
  gesetz?: Gesetzesreferenz,
): Promise<void> {
  const { emitTo } = await import('@tauri-apps/api/event');
  switch (kategorie) {
    case 'markierung':
      await emitTo({ kind: 'Any' }, 'markierungen-geaendert', { gesetz });
      break;
    case 'nichtamtlicheTitel':
      await emitTo('*', 'gesetze-geaendert', gesetz ? [gesetz] : []);
      break;
  }
}

/** Formatabhängiger Bestandsvergleich; Einstellungen verwenden localStorage. */
export interface EinfacheFormatKonfiguration {
  kategorie: Exclude<EinfacheKategorie, 'einstellungen'>;
  /** Kurztitel aus dem Inhalt oder fester Name bei appweiten Daten. */
  name: (inhalt: string) => string;
  gesetz?: (inhalt: string) => Gesetzesreferenz | undefined;
  leseRohtext: (
    name: string,
    gesetz?: Gesetzesreferenz,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ) => Promise<string | null>;
  importiere: (
    name: string,
    inhalt: string,
    gesetz?: Gesetzesreferenz,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
    zielGeschrieben?: () => void,
  ) => Promise<void>;
  pruefeEingang?: (
    inhalt: string,
    empfangen: AktionsMeldungEmpfaenger,
    gesetz?: Gesetzesreferenz,
  ) => number | Promise<number>;
  meldeAenderung?: (name: string, gesetz?: Gesetzesreferenz) => Promise<void>;
  anzeigename: (name: string) => string;
  /** Gesetzsbezogene Daten tragen einen Kurztitel. */
  hatKurztitel: boolean;
}

/** Fehlender Bestand wird übernommen; Abweichungen werden als Konflikt vorgelegt. */
export async function klassifiziereEinfacheDatei(
  inhalt: string,
  konfig: EinfacheFormatKonfiguration,
): Promise<
  | ({ art: BerichtEintrag['aktion']; kategorie: EinfacheKategorie; name: string } & Pick<
      BerichtEintrag,
      'meldungen' | 'ausgeschlosseneMarkierungen' | 'eingangUnvollstaendig' | 'abschluss'
    >)
  | DateiKonflikt
> {
  const name = konfig.name(inhalt);
  const gesetz = konfig.gesetz?.(inhalt);
  const meldungen: AktionsMeldung[] = [];
  const empfangen: AktionsMeldungEmpfaenger = (meldung) => {
    if (!meldungen.some((vorhanden) => JSON.stringify(vorhanden) === JSON.stringify(meldung)))
      meldungen.push(meldung);
  };
  const anzahl = await konfig.pruefeEingang?.(inhalt, empfangen, gesetz);
  const eingangUnvollstaendig = meldungen.length > 0;
  const befunde = () =>
    meldungen.length
      ? { meldungen, ...(eingangUnvollstaendig ? { eingangUnvollstaendig } : {}) }
      : {};
  if (eingangUnvollstaendig && anzahl === 0)
    return { art: 'nichtUebernommen', kategorie: konfig.kategorie, name, ...befunde() };
  const abschluss =
    konfig.kategorie === 'nichtamtlicheTitel' ? erzeugeImportAbschluss(meldungen) : undefined;
  const empfaenger = abschluss?.meldungEmpfangen ?? empfangen;
  let geschrieben = false;
  try {
    const bestehendRoh = await konfig.leseRohtext(name, gesetz, empfaenger);
    if (bestehendRoh === null) {
      if (gesetz) {
        await konfig.importiere(name, inhalt, gesetz, empfaenger, () => {
          geschrieben = true;
        });
        await konfig.meldeAenderung?.(name, gesetz);
      } else {
        await konfig.importiere(name, inhalt, undefined, empfangen);
        await konfig.meldeAenderung?.(name);
      }
      await abschluss?.warte();
      return {
        art: 'neu',
        kategorie: konfig.kategorie,
        name,
        ...befunde(),
        ...(abschluss ? { abschluss, meldungen } : {}),
      };
    }
    if (
      ohneZeitstempel(bestehendRoh, konfig.kategorie) === ohneZeitstempel(inhalt, konfig.kategorie)
    ) {
      return { art: 'unveraendert', kategorie: konfig.kategorie, name, ...befunde() };
    }
    return {
      art: konfig.kategorie,
      anzeigename: konfig.anzeigename(name),
      kurztitel: konfig.hatKurztitel ? name : undefined,
      ...(gesetz ? { gesetz } : {}),
      importInhalt: inhalt,
      ...befunde(),
    };
  } catch (fehler) {
    return behandleEinfacheSpeicherfehler(
      fehler,
      geschrieben,
      konfig.kategorie,
      name,
      meldungen,
      empfaenger,
      abschluss,
    );
  }
}

/** Folgefehler ändern die bestätigte Übernahme nicht zurück. */
async function behandleEinfacheSpeicherfehler(
  fehler: unknown,
  geschrieben: boolean,
  kategorie: EinfacheKategorie,
  name: string,
  meldungen: AktionsMeldung[],
  empfaenger: AktionsMeldungEmpfaenger,
  abschluss: ReturnType<typeof erzeugeImportAbschluss> | undefined,
) {
  await abschluss?.warte();
  const bericht: BerichtEintrag = {
    kategorie: kategorie,
    aktion: geschrieben ? 'neu' : 'nichtUebernommen',
    name,
    meldungen,
    ...(abschluss ? { abschluss } : {}),
  };
  if (!geschrieben) throw ergaenzeImportFehler(fehler, meldungen, abschluss ? bericht : undefined);
  const grund = fehler instanceof Error ? fehler.message : String(fehler);
  if (!meldungen.some((m) => m.text.includes(grund)))
    empfaenger({
      typ: 'fehler',
      art: 'hinweis',
      anlass: 'synchronisation',
      aenderungsstand: 'vollstaendig',
      text: `Die Zieldatei wurde gespeichert. Beim anschließenden Abschluss: ${grund}`,
    });
  const { aktion, ...rest } = bericht;
  return { art: aktion, ...rest, kategorie: kategorie };
}

/** Bereits empfangene Befunde bleiben auch bei abgebrochenem Speicheraufruf sichtbar. */
export function ergaenzeImportFehler(
  fehler: unknown,
  meldungen: readonly AktionsMeldung[],
  bericht?: BerichtEintrag,
): Error {
  const grund = fehler instanceof Error ? fehler.message : String(fehler);
  const texte = meldungen.map((m) => m.text);
  if (!texte.some((text) => text.includes(grund))) texte.push(grund);
  const importfehler = new Error(texte.join(' '), { cause: fehler });
  if (!bericht) return importfehler;
  if (!meldungen.some((m) => m.text.includes(grund)))
    bericht.meldungen?.push({
      text: grund,
      typ: 'fehler',
      art: 'fehler',
      anlass: 'import',
      aenderungsstand: 'keine',
    });
  return new ImportAbschlussFehler(importfehler, bericht);
}

const EINFACHE_FORMAT_KONFIGURATION: Record<
  'favoriten-xml' | 'lesezeichen-xml' | 'gesetzeskurzbefehle-xml' | 'nichtamtlicheTitel-xml',
  EinfacheFormatKonfiguration
> = {
  'favoriten-xml': {
    kategorie: 'favoriten',
    name: (inhalt) => {
      const name = xmlKind(xmlKind(liesXmlWurzel(inhalt), 'infos'), 'gesetz')?.textContent?.trim();
      if (!name) throw new Error('Datei ungültig: Gesetzesreferenz fehlt.');
      return name;
    },
    gesetz: (inhalt) =>
      xmlKind(xmlKind(liesXmlWurzel(inhalt), 'infos'), 'gesetz')?.hasAttribute('normgeber')
        ? liesGesetz(inhalt)
        : undefined,
    leseRohtext: (_name, gesetz, empfangen) => leseFavoritenRohtext(gesetz!, empfangen),
    pruefeEingang: (inhalt, empfangen, gesetz) => pruefeFavoritenImport(inhalt, gesetz, empfangen),
    importiere: async (_name, inhalt, gesetz, empfangen) => {
      await zusammenfuehrenFavoriten(gesetz!, inhalt, empfangen);
    },
    anzeigename: (name) => `${name} Favoriten`,
    hatKurztitel: true,
  },
  'lesezeichen-xml': {
    kategorie: 'lesezeichen',
    name: () => 'Lesezeichen',
    leseRohtext: (_name, _gesetz, empfangen) => leseLesezeichenRohtext(empfangen),
    pruefeEingang: (inhalt, empfangen) => pruefeLesezeichenImport(inhalt, empfangen),
    importiere: async (_name, inhalt, _gesetz, empfangen) => {
      await zusammenfuehrenLesezeichen(inhalt, empfangen);
    },
    anzeigename: () => 'Lesezeichen',
    hatKurztitel: false,
  },
  'nichtamtlicheTitel-xml': {
    kategorie: 'nichtamtlicheTitel',
    name: (inhalt) => liesGesetz(inhalt).kurztitel,
    gesetz: liesGesetz,
    leseRohtext: (_name, gesetz, empfangen) => leseNichtamtlicheTitelRohtext(gesetz!, empfangen),
    importiere: (_name, inhalt, gesetz, empfangen, geschrieben) =>
      ersetzeNichtamtlicheTitelDatei(gesetz!, inhalt, empfangen, geschrieben),
    meldeAenderung: (_name, gesetz) => meldeAenderung('nichtamtlicheTitel', gesetz),
    anzeigename: (name) => `${name} nichtamtliche Titel`,
    hatKurztitel: true,
  },
  'gesetzeskurzbefehle-xml': {
    kategorie: 'gesetzeskurzbefehle',
    name: () => 'Gesetzeskurzbefehle',
    leseRohtext: (_name, _gesetz, empfangen) => leseGesetzeskurzbefehleRohtext(empfangen),
    pruefeEingang: (inhalt, empfangen) => pruefeGesetzeskurzbefehleImport(inhalt, empfangen),
    importiere: async (_name, inhalt, _gesetz, empfangen) => {
      await zusammenfuehrenGesetzeskurzbefehle(inhalt, true, empfangen);
    },
    anzeigename: () => 'Gesetzeskurzbefehle',
    hatKurztitel: false,
  },
};

/** Bestandsvergleich; Einstellungen verwenden den aktuellen localStorage. */
export async function verarbeiteEinfacheDatei(
  format:
    | 'favoriten-xml'
    | 'lesezeichen-xml'
    | 'gesetzeskurzbefehle-xml'
    | 'markierung-xml'
    | 'nichtamtlicheTitel-xml'
    | 'einstellungen-xml',
  inhalt: string,
): Promise<
  | ({ art: BerichtEintrag['aktion']; kategorie: EinfacheKategorie; name: string } & Pick<
      BerichtEintrag,
      'meldungen' | 'ausgeschlosseneMarkierungen' | 'eingangUnvollstaendig' | 'abschluss'
    >)
  | DateiKonflikt
> {
  if (format === 'markierung-xml') return klassifiziereMarkierungsDatei(inhalt);
  if (format === 'einstellungen-xml') {
    if (keineEinstellungExplizitGesetzt()) {
      const { aktion, ...bericht } = await importiereEinstellungen(inhalt, 'neu');
      return { art: aktion, ...bericht, kategorie: 'einstellungen' };
    }
    const aktuelleXML = baueEinstellungenXML();
    if (
      einstellungenOhneVerarbeitungszeit(aktuelleXML) === einstellungenOhneVerarbeitungszeit(inhalt)
    ) {
      return { art: 'unveraendert', kategorie: 'einstellungen', name: 'Einstellungen' };
    }
    return { art: 'einstellungen', anzeigename: 'Einstellungen', importInhalt: inhalt };
  }
  return klassifiziereEinfacheDatei(inhalt, EINFACHE_FORMAT_KONFIGURATION[format]);
}

/** Eingangsdiagnose geht jedem Vergleich und jedem schreibenden Aufruf voraus. */
async function klassifiziereMarkierungsDatei(inhalt: string) {
  const gesetz = liesMarkierungsGesetz(inhalt);
  const name = gesetz.kurztitel;
  const basis = { kategorie: 'markierung' as const, name };
  const gelesen = beurteileMarkierungsImport(inhalt, gesetz);
  const befunde = () => ({
    ...(gelesen.meldungen.length ? { meldungen: gelesen.meldungen } : {}),
    ...(gelesen.ausgeschlossen ? { ausgeschlosseneMarkierungen: gelesen.ausgeschlossen } : {}),
  });
  if (gelesen.ausgeschlossen && gelesen.eintraege.length === 0)
    return { art: 'nichtUebernommen' as const, ...basis, ...befunde() };
  const bestehend = await leseMarkierungenRohtext(gesetz, (meldung) =>
    gelesen.meldungen.push(meldung),
  );
  if (bestehend === null) {
    const abschluss = await uebernehmeNeueMarkierungen(gesetz, gelesen);
    return {
      art: 'neu' as const,
      abschluss,
      ...basis,
      ...befunde(),
      meldungen: gelesen.meldungen,
    };
  }
  if (
    gelesen.ausgeschlossen
      ? istMarkierungsImportUnveraendert(gesetz, bestehend, gelesen.eintraege)
      : ohneZeitstempel(bestehend, 'markierung') === ohneZeitstempel(inhalt, 'markierung')
  )
    return { art: 'unveraendert' as const, ...basis, ...befunde() };
  return {
    art: 'markierung' as const,
    anzeigename: `${name} Markierungen`,
    kurztitel: name,
    gesetz,
    importInhalt: inhalt,
    ...befunde(),
  };
}

/** Speicherbestätigung bleibt auch bei anschließender Ereignisablehnung erhalten. */
async function uebernehmeNeueMarkierungen(
  gesetz: Gesetzesreferenz,
  gelesen: ReturnType<typeof beurteileMarkierungsImport>,
) {
  const abschluss = erzeugeImportAbschluss(gelesen.meldungen);
  let geschrieben = false;
  try {
    await zusammenfuehrenMarkierungen(
      gesetz,
      gelesen.eintraege,
      true,
      abschluss.meldungEmpfangen,
      () => {
        geschrieben = true;
      },
    );
    await meldeAenderung('markierung', gesetz);
  } catch (fehler) {
    if (!geschrieben) {
      await abschluss.warte();
      throw ergaenzeImportFehler(
        fehler,
        gelesen.meldungen,
        abschluss.hatOffeneFolgelaeufe()
          ? {
              kategorie: 'markierung',
              aktion: 'nichtUebernommen',
              name: gesetz.kurztitel,
              meldungen: gelesen.meldungen,
              abschluss,
            }
          : undefined,
      );
    }
    abschluss.meldungEmpfangen({
      typ: 'fehler',
      art: 'hinweis',
      anlass: 'synchronisation',
      aenderungsstand: 'vollstaendig',
      text: `Die Markierungen wurden gespeichert. Beim anschließenden Abschluss: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    });
  }
  await abschluss.warte();
  return abschluss;
}

/** Flüchtiger Besitzer je Dateiaktion; erst außerhalb des Speicherwegs warten. */
export function erzeugeImportAbschluss(
  meldungen: AktionsMeldung[],
  abhilfe = 'Bitte vollständig neu prüfen.',
) {
  const sammlung = erzeugeAktionsMeldungsSammlung(meldungen);
  const empfangen: AktionsMeldungEmpfaenger = (meldung) => {
    if (!meldungen.some((m) => JSON.stringify(m) === JSON.stringify(meldung)))
      sammlung.meldungEmpfangen(meldung);
  };
  empfangen.folgelaufErfassen = sammlung.meldungEmpfangen.folgelaufErfassen;
  let fristbefund: AktionsMeldung | undefined;
  sammlung.abonnieren(() => {
    if (!fristbefund || sammlung.hatOffeneFolgelaeufe()) return;
    const index = meldungen.indexOf(fristbefund);
    if (index >= 0) meldungen.splice(index, 1);
    fristbefund = undefined;
  });
  return {
    ...sammlung,
    meldungEmpfangen: empfangen,
    async warte(fristMs = 30_000): Promise<void> {
      if ((await sammlung.warteAufAbschluss(fristMs)) === 'abgeschlossen') return;
      fristbefund = {
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'pruefabschluss',
        aenderungsstand: 'keine',
        text: `Der nachgelagerte Abschluss ist nach ${Math.round(fristMs / 1000)} Sekunden nicht bestätigt. Der bestätigte Speicherstand bleibt erhalten. ${abhilfe}`,
      };
      sammlung.meldungEmpfangen(fristbefund);
    },
  };
}

/** Übernahme und Backup gehören demselben Bericht; ihr Ergebnis bleibt getrennt. */
export async function importiereEinstellungen(
  inhalt: string,
  aktion: 'neu' | 'ersetzt',
): Promise<BerichtEintrag> {
  const meldungen: AktionsMeldung[] = [];
  const abschluss = erzeugeImportAbschluss(
    meldungen,
    'Bitte die Einstellungen erneut ändern, um das Backup neu anzustoßen.',
  );
  const ergebnis = wendeEinstellungenXMLAn(inhalt, abschluss.meldungEmpfangen);
  await abschluss.warte();
  return {
    kategorie: 'einstellungen',
    name: 'Einstellungen',
    aktion: ergebnis.aenderungsstand === 'keine' ? 'nichtUebernommen' : aktion,
    eingangUnvollstaendig: ergebnis.fehler.length > 0,
    meldungen,
    abschluss,
  };
}
