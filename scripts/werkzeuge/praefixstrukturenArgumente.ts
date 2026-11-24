// praefixstrukturenArgumente.ts
// Validierter Entwickleraufruf mit Repository-Zielen, unabhängig vom Arbeitsverzeichnis.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IMPORTINDEX_KATEGORIEN } from '@/lib/domain/normgeber';
import { gleicheGrundbestandAb, leseGrundbestand, type GrundbestandGesetze } from './grundbestand';

const START_ARGUMENTE = ['tauri', '--', 'dev', '--no-watch'];

/**
 * `npm run grundbestand -- PFAD [--neu] [--debug]`: liest und prüft die Liste vor dem ersten
 * Appstart und bereitet je Normgeber einen Lauf `quelldateien --kurztitel …` vor (Kurztitel in
 * Schreibweise des Bestands). Der Pfad gilt relativ zum Arbeitsverzeichnis. Benötigt `DOMParser`
 * (im Startskript über jsdom).
 */
export function bereiteGrundbestandVor(
  argumente: string[],
  repository: string,
  arbeitsverzeichnis: string,
) {
  const optionen = argumente.filter((a) => a.startsWith('--'));
  const pfade = argumente.filter((a) => !a.startsWith('--'));
  const [pfad] = pfade;
  if (
    pfade.length !== 1 ||
    !pfad ||
    optionen.some((o) => !['--neu', '--debug'].includes(o)) ||
    new Set(optionen).size !== optionen.length
  )
    throw new Error('Aufruf: npm run grundbestand -- PFAD/ZUR/LISTE.xml [--neu] [--debug]');
  const datei = resolve(arbeitsverzeichnis, pfad);
  let text: string;
  try {
    text = readFileSync(datei, 'utf8');
  } catch (fehler) {
    throw new Error(`Grundbestandsliste nicht lesbar: ${datei}`, { cause: fehler });
  }
  let gesetze: GrundbestandGesetze;
  try {
    gesetze = leseGrundbestand(text).gesetze;
  } catch (fehler) {
    throw new Error(
      `Grundbestandsliste ungültig: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      { cause: fehler },
    );
  }
  const ressource = (teil: string) =>
    readFileSync(resolve(repository, 'src-tauri/resources', teil), 'utf8');
  const abgleich = gleicheGrundbestandAb(gesetze, {
    importindexBund: ressource('importindizes/de-bund.xml'),
    importindexBW: ressource('importindizes/de-bw.xml'),
    europaKuratiert: ressource('europa/europaKuratiert.json'),
  });
  const probleme = [
    ...Object.entries(abgleich.fehlend).map(([n, k]) => `nicht im Bestand (${n}): ${k.join(', ')}`),
    ...Object.entries(abgleich.mehrdeutig).map(([n, k]) => `mehrdeutig (${n}): ${k.join(', ')}`),
  ];
  if (probleme.length) throw new Error(`Grundbestandsliste abgewiesen: ${probleme.join('; ')}`);
  const laeufe = IMPORTINDEX_KATEGORIEN.flatMap((normgeber) => {
    const kurztitel = abgleich.kurztitel[normgeber] ?? [];
    if (!kurztitel.length) return [];
    // Der Lauf trennt `--kurztitel` am Komma; ein Kurztitel mit Komma wäre nicht übergebbar.
    const mitKomma = kurztitel.filter((k) => k.includes(','));
    if (mitKomma.length)
      throw new Error(
        `Kurztitel mit Komma nicht übergebbar (${normgeber}): ${mitKomma.join(', ')}`,
      );
    return [
      {
        normgeber,
        kurztitel,
        start: bereitePraefixlaufStartVor(
          [normgeber, '--kurztitel', kurztitel.join(','), ...optionen],
          repository,
          'quelldateien',
        ),
      },
    ];
  });
  if (!laeufe.length) throw new Error('Grundbestandsliste enthält keine Gesetze.');
  return { laeufe, arbeitsdaten: resolve(repository, 'arbeitsdaten') };
}

type Modus = 'praefix' | 'quelldateien' | 'gesetzesxml' | 'auswerten';
export function bereitePraefixlaufStartVor(
  argumente: string[],
  repository: string,
  modus: Modus = 'praefix',
) {
  if (
    argumente.some(
      (a) => a.startsWith('--') && !['--debug', '--offline', '--neu', '--kurztitel'].includes(a),
    ) ||
    argumente.filter((a) => a === '--kurztitel').length > 1
  )
    throw new Error('Unbekannte oder mehrfache Option im Entwickleraufruf.');
  const debugAnzahl = argumente.filter((a) => a === '--debug').length;
  if (debugAnzahl > 1) throw new Error('--debug darf nur einmal angegeben werden.');
  argumente = argumente.filter((a) => a !== '--debug');
  ({ argumente, modus } = bestimmeOfflineModus(argumente, modus));
  const neu = argumente.includes('--neu');
  const args = argumente.filter((a) => a !== '--neu');
  const normgeber = args[0];
  const beschaffung = modus === 'quelldateien' || modus === 'gesetzesxml';
  const { gescheitert, gezielt, kurztitel, anzahl, auswahlGueltig } = bestimmeAuswahl(args, modus);
  if (
    !['praefix', 'quelldateien', 'gesetzesxml', 'auswerten'].includes(modus) ||
    !['de-bund', 'de-bw', ...(beschaffung ? ['eu'] : [])].includes(normgeber) ||
    (neu && (!beschaffung || argumente.length !== args.length + 1)) ||
    (gescheitert && modus !== 'praefix') ||
    !auswahlGueltig ||
    !Number.isSafeInteger(anzahl)
  )
    throw new Error(
      'Ungültiger Entwickleraufruf: gültige Normgeber de-bund, de-bw (eu nur für quelldateien und gesetzesxml); Normgeber und ANZAHL oder --kurztitel angeben; Auswertung ohne ANZAHL.',
    );
  return {
    // npm darf --no-watch nicht als eigene Option verarbeiten.
    argumente: START_ARGUMENTE,
    umgebung: {
      LEXLATA_PRAEFIXLAUF: normgeber,
      LEXLATA_PRAEFIXLAUF_DEBUG: debugAnzahl ? '1' : undefined,
      LEXLATA_PRAEFIXLAUF_MODUS: modus,
      LEXLATA_PRAEFIXLAUF_NEU: neu ? '1' : undefined,
      LEXLATA_PRAEFIXLAUF_GESCHEITERT: gescheitert ? '1' : undefined,
      LEXLATA_PRAEFIXLAUF_ANZAHL: modus === 'auswerten' ? undefined : String(anzahl),
      LEXLATA_PRAEFIXLAUF_KURZTITEL: gezielt ? kurztitel.join(',') : undefined,
      LEXLATA_PRAEFIXLAUF_DATEI: beschaffung
        ? undefined
        : resolve(repository, 'src-tauri/resources/praefixstrukturen', `${normgeber}.xml`),
      LEXLATA_PRAEFIXLAUF_ARBEITSDATEN: resolve(repository, 'arbeitsdaten'),
    },
  };
}

function bestimmeAuswahl(args: string[], modus: Modus) {
  const [, auswahl, titel] = args;
  const gescheitert = auswahl === 'gescheitert';
  const gezielt = auswahl === '--kurztitel';
  const kurztitel = gezielt ? (titel ?? '').split(',').map((t) => t.trim()) : [];
  const zahl = gescheitert ? titel : auswahl;
  let anzahl = Number(zahl);
  let auswahlGueltig = args.length === (gescheitert ? 3 : 2) && /^[1-9]\d*$/.test(zahl);
  if (['quelldateien', 'gesetzesxml'].includes(modus) && auswahl === 'alle') {
    anzahl = Number.MAX_SAFE_INTEGER;
    auswahlGueltig = args.length === 2;
  }
  if (modus === 'auswerten') {
    anzahl = Number.MAX_SAFE_INTEGER;
    auswahlGueltig = args.length === 1;
  }
  if (gezielt) {
    anzahl = kurztitel.length;
    auswahlGueltig = args.length === 3 && kurztitel.every((t) => !!t);
  }
  return { gescheitert, gezielt, kurztitel, anzahl, auswahlGueltig };
}

function bestimmeOfflineModus(argumente: string[], modus: Modus) {
  const offline = argumente.filter((a) => a === '--offline').length;
  if (!offline) return { argumente, modus };
  if (modus !== 'praefix' || offline !== 1) throw new Error('Ungültiger Offline-Aufruf.');
  return { argumente: argumente.filter((a) => a !== '--offline'), modus: 'auswerten' as const };
}
