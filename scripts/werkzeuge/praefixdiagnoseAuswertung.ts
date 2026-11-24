// praefixdiagnoseAuswertung.ts
// Lokale Ursachendiagnose; liest Arbeitsdateien und schreibt ausschließlich Berichte.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SaxesParser } from 'saxes';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  ermittlePraefixstruktur,
  hatAlphabetischenKontext,
  ordnePraefixstrukturNormEin,
  praefixstrukturDiagnosegruende,
} from '@/lib/domain/praefixstruktur';
import { liesPraefixstrukturXml } from '@/lib/import/praefixstruktur/praefixstrukturXml';

function fallgruppe(
  praefixstruktur: string | undefined,
  anzahl: Record<
    | 'Paragraphen'
    | 'Artikel'
    | 'Römische Zahlen'
    | 'Arabische Nummern'
    | 'Alphabetische Abschnitte'
    | 'Regeln'
    | 'Nummern'
    | 'sonstige Bezeichnungen',
    number
  >,
) {
  if (praefixstruktur === undefined) return 'Leerer importierter Inhalt';
  if (praefixstruktur !== 'unklar') return 'Aktuell eindeutig';
  const gruppen = Object.entries(anzahl)
    .filter(([, n]) => n > 0)
    .map(([name]) => name);
  if (!gruppen.length) return 'Keine zählbaren Normen';
  if (gruppen.length === 1 && gruppen[0] === 'sonstige Bezeichnungen')
    return 'Nur sonstige Bezeichnungen';
  return [...gruppen.slice(0, -1)].join(', ') + ' und ' + gruppen.at(-1);
}

export function untersuchePraefixstruktur(xml: string) {
  // Auch unter Node strikt prüfen: kein repariertes XML als erfolgreichen Befund ausgeben.
  new SaxesParser({ xmlns: true }).write(xml).close();
  const gesetz = parseGesetzesXML(xml);
  if (!gesetz) throw new Error('GesetzesXML konnte nicht gelesen werden.');
  const alphabetischerKontext = hatAlphabetischenKontext(
    gesetz.elemente.flatMap((el) => (el.typ === 'norm' ? [el.data] : [])),
  );
  const normen = gesetz.elemente.flatMap((el) =>
    el.typ === 'norm'
      ? [
          {
            xmlId: el.data.xmlId,
            bezeichnung: el.data.bezeichnung,
            titel: el.data.titel,
            status: el.data.status,
            gliederungsEbene: el.data.gliederungsEbene,
            einordnung: ordnePraefixstrukturNormEin(el.data, alphabetischerKontext),
          },
        ]
      : [],
  );
  const anzahl = (gruppe: (typeof normen)[number]['einordnung']) =>
    normen.filter((n) => n.einordnung === gruppe).length;
  const paragraphen = anzahl('paragraph');
  const artikel = anzahl('artikel');
  const roemisch = anzahl('roemisch');
  const sonstige = anzahl('sonstige');
  const regel = anzahl('regel');
  const nummer = anzahl('nummer');
  const arabisch = anzahl('arabisch');
  const alphabetisch = anzahl('alphabetisch');
  const gezaehlt =
    paragraphen + artikel + roemisch + regel + nummer + arabisch + alphabetisch + sonstige;
  const { praefixstruktur, diagnosegrund, ermittlungsstatus } = ermittlePraefixstruktur(gesetz);
  return {
    kurztitel: gesetz.kurztitel,
    langtitel: gesetz.langtitel,
    normgeber: gesetz.normgeber,
    praefixstruktur,
    ermittlungsstatus,
    gruppe: fallgruppe(praefixstruktur, {
      Paragraphen: paragraphen,
      Artikel: artikel,
      'Römische Zahlen': roemisch,
      'Arabische Nummern': arabisch,
      'Alphabetische Abschnitte': alphabetisch,
      Regeln: regel,
      Nummern: nummer,
      'sonstige Bezeichnungen': sonstige,
    }),
    diagnosegrund,
    hatGliederungsartikel: gesetz.hatGliederungsartikel,
    gezaehlt,
    paragraphen,
    artikel,
    roemisch,
    arabisch,
    alphabetisch,
    regel,
    nummer,
    sonstige,
    ausgeschlossen: anzahl('ausgeschlossen'),
    erwaegungsgruende: anzahl('erwaegungsgrund'),
    normen,
    ueberschriften: gesetz.elemente.flatMap((el) =>
      el.typ === 'ueberschrift'
        ? [
            {
              xmlId: el.data.xmlId,
              bezeichnung: el.data.bezeichnung,
              titel: el.data.titel,
            },
          ]
        : [],
    ),
  };
}

type Befund = ReturnType<typeof untersuchePraefixstruktur>;
interface Fall {
  normgeber: 'de-bund' | 'de-bw';
  kurztitel: string;
  gruppe: string;
  datei?: string;
  sha256?: string;
  fehler?: string;
  befund?: Befund;
}

function haeufigkeiten(werte: string[]) {
  const zahlen = new Map<string, number>();
  for (const wert of werte) zahlen.set(wert, (zahlen.get(wert) ?? 0) + 1);
  return [...zahlen].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
}

function bezeichnungen(fall: Fall, gruppe: string) {
  return (fall.befund?.normen ?? [])
    .filter((n) => n.einordnung === gruppe)
    .map((n) => n.bezeichnung);
}

function tabelle(faelle: Fall[]) {
  const zeilen: unknown[][] = [
    [
      'Normgeber',
      'Kurztitel',
      'Fallgruppe',
      'Diagnosegrund',
      'Gespeichert',
      'Aktuell',
      'Gezählt',
      'Paragraphen',
      'Artikel',
      'Römisch',
      'Arabisch',
      'Alphabetisch',
      'Regel',
      'Nummer',
      'Ermittlungsstatus',
      'Sonstige',
      'Ausgeschlossen',
      'Erwägungsgründe',
      'Sonstige Bezeichnungen',
      'Ausgeschlossene Bezeichnungen',
      'Datei',
      'Fehler',
    ],
  ];
  for (const f of faelle) {
    const b = f.befund;
    zeilen.push([
      f.normgeber,
      f.kurztitel,
      f.gruppe,
      f.fehler ? 'dateifehler' : b?.diagnosegrund,
      'unklar',
      b?.ermittlungsstatus ?? b?.praefixstruktur,
      b?.gezaehlt,
      b?.paragraphen,
      b?.artikel,
      b?.roemisch,
      b?.arabisch,
      b?.alphabetisch,
      b?.regel,
      b?.nummer,
      b?.ermittlungsstatus,
      b?.sonstige,
      b?.ausgeschlossen,
      b?.erwaegungsgruende,
      bezeichnungen(f, 'sonstige').join(' | '),
      bezeichnungen(f, 'ausgeschlossen').join(' | '),
      f.datei,
      f.fehler,
    ]);
  }
  return (
    '\uFEFF' +
    zeilen
      .map((zeile) =>
        zeile.map((feld) => `"${String(feld ?? '').replaceAll('"', '""')}"`).join(';'),
      )
      .join('\n') +
    '\n'
  );
}

function zusammenfassung(
  faelle: Fall[],
  bestand: {
    normgeber: string;
    gesamt: number;
    unklar: number;
    leer: number;
    gescheitert: number;
  }[],
) {
  const zeilen = [
    '# Diagnose der unklaren Präfixstrukturen',
    '',
    'Nur gespeicherte `unklar`-Einträge werden untersucht. Die bestehenden Parser und Erkennungsregeln werden unverändert verwendet.',
    '',
    'Die Fallgruppen erklären das Rechenergebnis, noch nicht dessen fachliche Richtigkeit. Ohne ursprüngliche Quelldateien lässt sich ein Importfehler nicht abschließend von einer Besonderheit der Quelle unterscheiden.',
    '',
    '`belege.json` enthält alle Normbezeichnungen des Darstellungsmodells mit XML-ID, Einordnung und gegebenenfalls Titel, Status und Gliederungsebene. Inhaltsübersichten kann bereits der bestehende Parser auslassen. `faelle.csv` enthält eine Zeile je unklarem Eintrag. SHA-256-Werte in den Belegen identifizieren die untersuchten Dateien.',
    '',
    '| Normgeber | Einträge insgesamt | Gespeichert unklar | Leer | Gescheitert |',
    '|---|---:|---:|---:|---:|',
    ...bestand.map(
      (b) => `| ${b.normgeber} | ${b.gesamt} | ${b.unklar} | ${b.leer} | ${b.gescheitert} |`,
    ),
    '',
    '| Fallgruppe | Bund | BW |',
    '|---|---:|---:|',
    ...haeufigkeiten(faelle.map((f) => f.gruppe)).map(
      ([gruppe]) =>
        `| ${gruppe} | ${faelle.filter((f) => f.gruppe === gruppe && f.normgeber === 'de-bund').length} | ${faelle.filter((f) => f.gruppe === gruppe && f.normgeber === 'de-bw').length} |`,
    ),
    '',
    '## Diagnosegründe',
    '',
    'Die Gründe beschreiben automatisch feststellbare Befunde im Darstellungsmodell. Sie behaupten keine anhand der Originalquelle geprüfte Ursache. Bei mehreren erkannten Präfixarten hat „gemischte-praefixe“ Vorrang; zusätzliche sonstige Bezeichnungen bleiben in den Belegen sichtbar.',
    '',
    '| Diagnosegrund | Bedeutung | Bund | BW |',
    '|---|---|---:|---:|',
    ...Object.entries(praefixstrukturDiagnosegruende).map(
      ([grund, text]) =>
        `| ${grund} | ${text} | ${faelle.filter((f) => f.normgeber === 'de-bund' && f.befund?.diagnosegrund === grund).length} | ${faelle.filter((f) => f.normgeber === 'de-bw' && f.befund?.diagnosegrund === grund).length} |`,
    ),
    '',
  ];
  for (const { normgeber } of bestand) {
    const auswahl = faelle.filter((f) => f.normgeber === normgeber);
    const ohneNormen = auswahl.filter((f) => f.befund?.normen.length === 0);
    const leer = ohneNormen.filter((f) => f.befund?.ueberschriften.length === 0);
    const schlussformel = auswahl.filter(
      (f) =>
        (f.befund?.paragraphen ?? 0) + (f.befund?.artikel ?? 0) > 0 &&
        f.befund?.praefixstruktur === 'unklar' &&
        bezeichnungen(f, 'sonstige').length > 0 &&
        bezeichnungen(f, 'sonstige').every((b) => b === 'Schlußformel'),
    );
    zeilen.push(
      `## ${normgeber}: vertiefende Zählungen`,
      '',
      `- Keine Normen und keine Überschriften im Darstellungsmodell: ${leer.length}. Beispiele: ${leer
        .slice(0, 3)
        .map((f) => f.kurztitel)
        .join(', ')}.`,
      `- Keine Normen, aber Überschriften: ${ohneNormen.length - leer.length}.`,
      `- Paragraphen oder Artikel vorhanden; einzige sonstige Bezeichnung „Schlußformel“: ${schlussformel.length}.`,
      `- Aktuell abweichend von gespeichertem „unklar“: ${auswahl.filter((f) => f.gruppe === 'Aktuell eindeutig').length}.`,
      `- Dateifehler: ${auswahl.filter((f) => f.fehler).length}.`,
      '',
    );
    zeilen.push(`## ${normgeber}: Beispiele nach Fallgruppe`, '');
    for (const [gruppe, zahl] of haeufigkeiten(auswahl.map((f) => f.gruppe))) {
      const beispiele = auswahl.filter((f) => f.gruppe === gruppe).slice(0, 5);
      zeilen.push(
        `### ${gruppe} (${zahl})`,
        '',
        ...beispiele.map(
          (f) =>
            `- ${f.kurztitel}: ${f.befund ? `${f.befund.paragraphen} Paragraphen, ${f.befund.artikel} Artikel, ${f.befund.roemisch} römische Zahlen, ${f.befund.arabisch} arabische Nummern, ${f.befund.alphabetisch} alphabetische Abschnitte, ${f.befund.regel} Regeln, ${f.befund.nummer} Nummern, ${f.befund.sonstige} sonstige; Bezeichnungen: ${JSON.stringify(bezeichnungen(f, 'sonstige').slice(0, 8))}; ausgeschlossen: ${JSON.stringify(bezeichnungen(f, 'ausgeschlossen').slice(0, 8))}` : f.fehler}`,
        ),
        '',
      );
    }
    zeilen.push(
      '### Häufigste sonstige Bezeichnungen (Normvorkommen)',
      '',
      ...haeufigkeiten(auswahl.flatMap((f) => bezeichnungen(f, 'sonstige')))
        .slice(0, 25)
        .map(([name, zahl]) => `- ${JSON.stringify(name)}: ${zahl}`),
      '',
    );
  }
  return zeilen.join('\n');
}

const hash = (xml: string) => createHash('sha256').update(xml).digest('hex');

async function ordneArbeitsdateienZu(repository: string, basis: string) {
  const dateien = new Map<string, string[]>();
  // Dekodieren statt die native Dateinamenmaskierung nochmals zu implementieren.
  for (const name of await readdir(join(repository, basis))) {
    if (!name.endsWith('.xml')) continue;
    const kurztitel = decodeURIComponent(name.slice(0, -4));
    dateien.set(kurztitel, [...(dateien.get(kurztitel) ?? []), name]);
  }
  return dateien;
}

async function untersucheEintrag(
  repository: string,
  basis: string,
  dateien: Map<string, string[]>,
  normgeber: 'de-bund' | 'de-bw',
  kurztitel: string,
): Promise<Fall> {
  const fall: Fall = { normgeber, kurztitel, gruppe: 'Dateifehler' };
  try {
    const namen = dateien.get(kurztitel) ?? [];
    if (namen.length !== 1) throw new Error(`${namen.length} zuordenbare Arbeitsdateien.`);
    fall.datei = join(basis, namen[0]!);
    const gesetz = await readFile(join(repository, fall.datei), 'utf8');
    fall.sha256 = hash(gesetz);
    const befund = untersuchePraefixstruktur(gesetz);
    if (befund.kurztitel !== kurztitel || befund.normgeber !== normgeber)
      throw new Error('Gesetzesreferenz in Arbeitsdatei weicht vom Listeneintrag ab.');
    fall.befund = befund;
    fall.gruppe = befund.gruppe;
  } catch (fehler) {
    fall.fehler = fehler instanceof Error ? fehler.message : String(fehler);
  }
  return fall;
}

export async function fuehrePraefixdiagnoseAus(
  repository: string,
  melde: (zeile: string) => void = () => {},
) {
  const faelle: Fall[] = [];
  const bestand = [];
  const listen = [];
  for (const [ordner, normgeber] of [
    ['de-bund', 'de-bund'],
    ['de-bw', 'de-bw'],
  ] as const) {
    const listenpfad = join('src-tauri/resources/praefixstrukturen', `${ordner}.xml`);
    const xml = await readFile(join(repository, listenpfad), 'utf8');
    const liste = liesPraefixstrukturXml(xml, normgeber);
    listen.push({
      datei: listenpfad,
      sha256: hash(xml),
      verarbeitungszeit: liste.verarbeitungszeit,
    });
    const unklar = liste.eintraege.filter((e) => e.praefixstruktur === 'unklar');
    bestand.push({
      normgeber,
      gesamt: liste.eintraege.length,
      unklar: unklar.length,
      leer: liste.eintraege.filter((e) => e.ermittlungsstatus === 'leer').length,
      gescheitert: liste.eintraege.filter((e) => e.ermittlungsstatus === 'gescheitert').length,
    });
    const basis = join('arbeitsdaten/gesetzesxml', ordner);
    const dateien = unklar.length ? await ordneArbeitsdateienZu(repository, basis) : new Map();
    for (const [index, eintrag] of unklar.entries()) {
      faelle.push(
        await untersucheEintrag(repository, basis, dateien, normgeber, eintrag.kurztitel),
      );
      if ((index + 1) % 100 === 0) melde(`${normgeber}: ${index + 1}/${unklar.length} untersucht`);
    }
    melde(`${normgeber}: ${unklar.length}/${unklar.length} untersucht`);
  }
  const berichtsbasis = join(repository, 'arbeitsdaten/berichte/diagnose');
  await mkdir(berichtsbasis, { recursive: true });
  const zeit = new Date().toISOString().replaceAll(':', '-').toLowerCase();
  const ziel = join(berichtsbasis, `${zeit}-${randomUUID()}`);
  await mkdir(ziel);
  await writeFile(
    join(ziel, 'belege.json'),
    JSON.stringify(
      {
        erstellt: new Date().toISOString(),
        listen,
        bestand,
        faelle,
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(join(ziel, 'faelle.csv'), tabelle(faelle));
  await writeFile(join(ziel, 'zusammenfassung.md'), zusammenfassung(faelle, bestand));
  melde(`Bericht: ${relative(repository, ziel)}`);
  return { ziel, faelle };
}
