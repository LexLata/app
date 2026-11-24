// adressierbarkeit.ts
// Offline-Messung bestehender Ausgangskennungen ohne Änderung von App oder Quelldaten.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import { praefixeVonNorm } from '@/lib/domain/norm/normAufloesung';
import { loeseAusgangsstelleAuf } from '@/lib/markierungen/gemeinsam/markierungskonfliktPruefung';

function leereSummen() {
  return {
    normen: 0,
    ueberschriften: 0,
    eindeutig: 0,
    mehrdeutig: 0,
    nichtAuffindbar: 0,
    ohnePraefix: 0,
    erwaegungsgruendeOhnePraefix: 0,
    // Historischer Messschlüssel: zählt heute rechtsbündig angepasste Rohlisten.
    praefixlisteVerworfen: 0,
    unbekannterPraefix: 0,
    gliederungskennzahlMehrdeutig: 0,
    leerePraefixliste: 0,
  };
}
type Summen = ReturnType<typeof leereSummen>;

// Der Normalisierer ist privat. Eine isolierte, gleich bezeichnete Probenorm
// durchläuft deshalb die echte Auflösung, statt dessen Präfixregeln zu kopieren.
function istUnbekannterPraefix(gesetz: GesetzDarstellung, praefix: string): boolean {
  if (!praefix.trim()) return false;
  const probe: GesetzDarstellung = {
    ...gesetz,
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm',
        data: {
          art: 'normal',
          id: 'probe',
          xmlId: 'probe',
          bezeichnung: `${praefix} 1`,
          absaetze: [],
        },
      },
    ],
  };
  return (
    loeseAusgangsstelleAuf(probe, { typ: 'norm', bezeichnung: `${praefix} 1` }).anzahlTreffer === 0
  );
}

function beschreibeGruende(
  kennungVorhanden: boolean,
  treffer: number,
  verworfen: boolean,
  unbekannt: boolean,
  ohne: boolean,
  erwaegungsgrund: boolean,
) {
  return [
    !kennungVorhanden
      ? 'keine Kennung'
      : treffer > 1
        ? `${treffer} Treffer`
        : treffer === 0
          ? 'kein Treffer'
          : '',
    verworfen ? 'Präfixliste rechtsbündig angepasst' : '',
    unbekannt ? 'unbekannter Präfix-Text' : '',
    ohne
      ? erwaegungsgrund
        ? 'Erwägungsgrund ohne gespeicherten Präfix'
        : 'ohne gespeicherten Präfix'
      : '',
  ].filter(Boolean);
}

export function messeGesetz(xml: string) {
  const gesetz = parseGesetzesXML(xml);
  if (!gesetz) throw new Error('GesetzesXML konnte nicht gelesen werden.');
  const summen = leereSummen();
  const unbekanntCache = new Map<string, boolean>();
  const stellen = gesetz.elemente.map((el) => {
    summen[el.typ === 'norm' ? 'normen' : 'ueberschriften']++;
    const kennung = ausgangsnormKennung(gesetz, el);
    const anzahlTreffer = kennung ? loeseAusgangsstelleAuf(gesetz, kennung).anzahlTreffer : 0;
    summen[
      anzahlTreffer === 0 ? 'nichtAuffindbar' : anzahlTreffer === 1 ? 'eindeutig' : 'mehrdeutig'
    ]++;
    const praefixe = el.typ === 'norm' ? praefixeVonNorm(gesetz, el.data) : [];
    const ohnePraefix = el.typ === 'norm' && praefixe.every((p) => !p.trim());
    const erwaegungsgrund = el.typ === 'norm' && el.data.art === 'erwaegungsgrund';
    // Ausgangsstellen speichern keine gesonderte Präfixliste mehr; die historische
    // Messspalte bleibt für den Vergleich vorhandener Diagnoseberichte stets null.
    const praefixlisteVerworfen = false;
    const unbekannterPraefix = praefixe.some((p) => {
      if (!unbekanntCache.has(p)) unbekanntCache.set(p, istUnbekannterPraefix(gesetz, p));
      return unbekanntCache.get(p);
    });
    summen.ohnePraefix += Number(ohnePraefix);
    summen.erwaegungsgruendeOhnePraefix += Number(ohnePraefix && erwaegungsgrund);
    summen.praefixlisteVerworfen += Number(praefixlisteVerworfen);
    summen.unbekannterPraefix += Number(unbekannterPraefix);
    summen.gliederungskennzahlMehrdeutig += Number(el.typ === 'ueberschrift' && anzahlTreffer > 1);
    summen.leerePraefixliste += Number(
      el.typ === 'norm' &&
        !erwaegungsgrund &&
        !praefixlisteVerworfen &&
        praefixe.some((p) => !p.trim()),
    );
    const gruende = beschreibeGruende(
      !!kennung,
      anzahlTreffer,
      praefixlisteVerworfen,
      unbekannterPraefix,
      ohnePraefix,
      erwaegungsgrund,
    );
    return {
      typ: el.typ,
      xmlId: el.data.xmlId,
      bezeichnung: el.data.bezeichnung,
      kennung,
      anzahlTreffer,
      praefixe,
      praefixlisteVerworfen,
      unbekannterPraefix,
      gruende,
    };
  });
  return {
    normgeber: gesetz.normgeber ?? '(nicht angegeben)',
    kurztitel: gesetz.kurztitel,
    summen,
    stellen,
  };
}

type Messung = ReturnType<typeof messeGesetz> & { datei: string; quelle: string };
export interface Quelle {
  name: string;
  ordner: string;
}

async function xmlDateien(ordner: string): Promise<string[]> {
  const eintraege = await readdir(ordner, { withFileTypes: true });
  const dateien: string[] = [];
  for (const eintrag of eintraege.sort((a, b) => a.name.localeCompare(b.name))) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) dateien.push(...(await xmlDateien(pfad)));
    else if (eintrag.isFile() && eintrag.name.endsWith('.xml')) dateien.push(pfad);
  }
  return dateien;
}

async function messeDatei(datei: string) {
  const xml = await readFile(datei, 'utf8');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML-Parsefehler');
  if (doc.documentElement.tagName !== 'gesetz') return null;
  return messeGesetz(xml);
}

function meldeFortschritt(
  melden: (text: string) => void,
  name: string,
  index: number,
  gesamt: number,
) {
  if (index % 250 === 0) melden(`${name}: ${index}/${gesamt} Dateien`);
}

export async function messeQuellen(
  quellen: Quelle[],
  fortschritt: (text: string) => void = () => {},
) {
  const messungen: Messung[] = [];
  const quellenbericht: string[] = [];
  const fehler: string[] = [];
  for (const quelle of quellen) {
    let dateien: string[];
    try {
      dateien = await xmlDateien(quelle.ordner);
    } catch (ursache) {
      if (ursache instanceof Error && 'code' in ursache && ursache.code === 'ENOENT') {
        quellenbericht.push(
          `${quelle.name}: fehlt (${quelle.ordner}); Ordner beim Nutzer erfragen.`,
        );
        continue;
      }
      throw ursache;
    }
    let zahl = 0;
    for (const [index, datei] of dateien.entries()) {
      meldeFortschritt(fortschritt, quelle.name, index, dateien.length);
      try {
        const messung = await messeDatei(datei);
        if (messung) {
          messungen.push({ ...messung, datei, quelle: quelle.name });
          zahl++;
        }
      } catch (ursache) {
        fehler.push(`${datei}: ${String(ursache)}`);
      }
    }
    quellenbericht.push(
      `${quelle.name}: ${zahl} Gesetze aus ${dateien.length} XML-Dateien (${quelle.ordner}).`,
    );
  }
  return { messungen, quellenbericht, fehler };
}

const tabellenkopf =
  '| Normgeber | Gesetze | Normen | Überschriften | eindeutig | mehrdeutig | nicht auffindbar | ohne Präfix (davon Erwägungsgründe) | Präfixliste angepasst | unbekannter Präfix | mehrdeutige Überschriften |';
function anteil(zahl: number, gesamt: number) {
  return `${zahl} (${gesamt ? ((100 * zahl) / gesamt).toFixed(2) : '0.00'} %)`;
}
function zelle(text: string) {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function erstelleBericht(ergebnis: Awaited<ReturnType<typeof messeQuellen>>) {
  const gruppen = new Map<string, { gesetze: number; summen: Summen }>();
  for (const messung of ergebnis.messungen) {
    const gruppe = gruppen.get(messung.normgeber) ?? { gesetze: 0, summen: leereSummen() };
    gruppe.gesetze++;
    for (const feld of Object.keys(gruppe.summen) as (keyof Summen)[])
      gruppe.summen[feld] += messung.summen[feld];
    gruppen.set(messung.normgeber, gruppe);
  }
  const zeilen = [
    '# Messbericht Adressierbarkeit',
    '',
    'Messumfang gemäß Nutzerentscheidung: ausschließlich GesetzesXML unter arbeitsdaten/gesetzesxml. Keine Hochrechnung auf andere Bestände.',
    '',
    '## Quellen',
    '',
    ...ergebnis.quellenbericht.map((s) => `- ${s}`),
    '',
    'Dateien werden je Quelle gezählt; dasselbe Gesetz in verschiedenen Quellen zählt mehrfach. Gezählt werden die vom bestehenden Parser übernommenen Elemente, einschließlich weggefallener Normen. Inhaltsübersichten, die der Parser auslässt, zählen nicht.',
    '',
    '## Ergebnis je Normgeber',
    '',
    tabellenkopf,
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [name, gruppe] of gruppen) {
    const s = gruppe.summen;
    const gesamt = s.normen + s.ueberschriften;
    zeilen.push(
      `| ${zelle(name)} | ${gruppe.gesetze} | ${s.normen} | ${s.ueberschriften} | ${anteil(s.eindeutig, gesamt)} | ${anteil(s.mehrdeutig, gesamt)} | ${anteil(s.nichtAuffindbar, gesamt)} | ${anteil(s.ohnePraefix, s.normen)} (${s.erwaegungsgruendeOhnePraefix}) | ${anteil(s.praefixlisteVerworfen, s.normen)} | ${anteil(s.unbekannterPraefix, s.normen)} | ${anteil(s.gliederungskennzahlMehrdeutig, s.ueberschriften)} |`,
    );
  }
  zeilen.push(
    '',
    'Anteile der Auflösung beziehen sich auf alle Elemente, Präfixbefunde auf Normen, mehrdeutige Gliederungskennzahlen auf Überschriften. Präfixkategorien können sich überschneiden.',
    '',
    '## Bis zu 20 Gesetze mit den meisten problematischen Stellen',
    '',
  );
  const rangliste = ergebnis.messungen
    .filter((m) => m.summen.mehrdeutig + m.summen.nichtAuffindbar > 0)
    .sort(
      (a, b) =>
        b.summen.mehrdeutig +
        b.summen.nichtAuffindbar -
        (a.summen.mehrdeutig + a.summen.nichtAuffindbar),
    )
    .slice(0, 20);
  if (!rangliste.length)
    zeilen.push('Keine nicht eindeutigen oder nicht auffindbaren Stellen im gemessenen Bestand.');
  for (const m of rangliste) {
    zeilen.push(
      `- ${m.normgeber} / ${m.kurztitel}: ${m.summen.mehrdeutig} mehrdeutig, ${m.summen.nichtAuffindbar} nicht auffindbar (${m.datei}).`,
    );
    for (const s of m.stellen.filter((s) => s.anzahlTreffer !== 1).slice(0, 3))
      zeilen.push(
        `  - ${m.kurztitel}, ${s.bezeichnung || '(ohne Bezeichnung)'} [${s.xmlId}]: ${s.gruende.join('; ')}.`,
      );
  }
  zeilen.push(
    '',
    '## Zählung je Gesetz',
    '',
    '| Normgeber | Kurztitel | Normen | Überschriften | eindeutig | mehrdeutig | nicht auffindbar | ohne Präfix | davon Erwägungsgründe | Liste angepasst | unbekannter Präfix | mehrdeutige Überschriften | Datei |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  );
  for (const m of ergebnis.messungen) {
    const s = m.summen;
    zeilen.push(
      `| ${zelle(m.normgeber)} | ${zelle(m.kurztitel)} | ${s.normen} | ${s.ueberschriften} | ${s.eindeutig} | ${s.mehrdeutig} | ${s.nichtAuffindbar} | ${s.ohnePraefix} | ${s.erwaegungsgruendeOhnePraefix} | ${s.praefixlisteVerworfen} | ${s.unbekannterPraefix} | ${s.gliederungskennzahlMehrdeutig} | ${zelle(m.datei)} |`,
    );
  }
  const leere = ergebnis.messungen.reduce((summe, m) => summe + m.summen.leerePraefixliste, 0);
  zeilen.push(
    '',
    '## Einordnung der Präfixlisten',
    '',
    `${leere} Normen (ohne Erwägungsgründe) haben mindestens einen leeren Präfixeintrag bei passender Listenlänge. Diese Einträge werden ausdrücklich als „kein Präfix“ aufgelöst. Die Auflösungszahlen oben messen den aktuellen Code.`,
    '',
    'Doppelte vollständige Kennungen und doppelte Gliederungskennzahlen werden dadurch nicht eindeutig. Eigene Präfixtexte und römischer Artikelkontext werden verlustfrei erhalten; unbekannte Präfixsymbole sind keine pauschale Auflösungsschranke.',
    '',
    '## Lesefehler',
    '',
    ...(ergebnis.fehler.length ? ergebnis.fehler.map((f) => `- ${f}`) : ['Keine.']),
    '',
  );
  return zeilen.join('\n');
}
