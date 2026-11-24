// europaKuratiert.ts
// Validierung und Überlagerung der handgepflegten CELEX-Angebote für Suche und Import.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { ressourcenPfad } from '@/lib/plattform/dateipfade';
import type { ImportindexSucheEintrag, VerzeichnisErgebnis } from './importindexVertrag.types';

interface KuratierterEintrag {
  celex: string;
  kurztitel: string;
  langtitel: string;
  alternativen?: string[];
}

/** Ungültige Ressourcen werfen eine verständliche Diagnose; keine Teilübernahme. */
export function parseKuratierteListe(text: string): KuratierterEintrag[] {
  const daten: unknown = JSON.parse(text);
  if (!Array.isArray(daten)) throw new Error('Kuratierte Liste muss ein Array sein.');
  const titel = new Set<string>();
  const celexNummern = new Set<string>();
  return daten.map((wert: unknown) => {
    if (typeof wert !== 'object' || wert === null)
      throw new Error('Kuratierter Eintrag muss ein Objekt sein.');
    const felder = wert as Record<string, unknown>;
    for (const feld of ['celex', 'kurztitel', 'langtitel']) {
      if (typeof felder[feld] !== 'string' || !felder[feld].trim())
        throw new Error(`Kuratierter Eintrag: Pflichtfeld ${feld} fehlt oder ist leer.`);
    }
    const { celex, kurztitel, langtitel } = felder as unknown as KuratierterEintrag;
    if (!/^(?:3\d{4}[RL]\d{4,5}|1\d{4}[EMP]\/TXT)$/.test(celex))
      throw new Error(`Ungültige CELEX-Nummer: ${celex}`);
    if (celexNummern.has(celex)) throw new Error(`Doppelte CELEX-Nummer: ${celex}`);
    celexNummern.add(celex);
    const alternativen = leseAlternativen(felder.alternativen, kurztitel);
    for (const name of [kurztitel, ...(alternativen ?? [])]) {
      const normalisiert = name.trim().toLowerCase();
      if (titel.has(normalisiert)) throw new Error(`Doppelter Name: ${name}`);
      titel.add(normalisiert);
    }
    return {
      celex,
      kurztitel,
      langtitel,
      ...(alternativen === undefined ? {} : { alternativen }),
    };
  });
}

function leseAlternativen(wert: unknown, kurztitel: string): string[] | undefined {
  if (wert === undefined) return undefined;
  const meldung = `Ungültige Alternativbezeichnungen für ${kurztitel}: nichtleere Liste nichtleerer Zeichenketten erforderlich.`;
  if (!Array.isArray(wert) || wert.length === 0) throw new Error(meldung);
  return wert.map((name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) throw new Error(meldung);
    return name;
  });
}

/** Ersetzt ganze Einträge nach Basis-CELEX und ergänzt noch fehlende Angebote. */
export function legeKuratierteListeUeber(
  eintraege: ImportindexSucheEintrag[],
  kuratiert: KuratierterEintrag[],
): ImportindexSucheEintrag[] {
  const angebote = new Map(
    kuratiert.map(({ celex, ...titel }) => [
      celex,
      { ...titel, abrufkennung: celex, normgeber: NORMGEBER_EU },
    ]),
  );
  const vorhanden = new Set(eintraege.map(({ abrufkennung }) => abrufkennung));
  return [
    ...eintraege.map((eintrag) => {
      const angebot = angebote.get(eintrag.abrufkennung);
      return angebot ? { ...angebot, abgeleiteterKurztitel: eintrag.kurztitel } : eintrag;
    }),
    ...[...angebote.values()].filter(({ abrufkennung }) => !vorhanden.has(abrufkennung)),
  ];
}

let erfolg: VerzeichnisErgebnis | undefined;
/** Nur erfolgreiche Ressourcenlesungen werden im aktuellen Fenster zwischengespeichert. */
export async function leseKuratierteListe(): Promise<VerzeichnisErgebnis> {
  if (erfolg) return erfolg;
  try {
    const liste = parseKuratierteListe(
      await readTextFile(await ressourcenPfad('resources/europa/europaKuratiert.json')),
    );
    erfolg = { eintraege: legeKuratierteListeUeber([], liste), fehler: [] };
    return erfolg;
  } catch (e) {
    return {
      eintraege: [],
      fehler: [
        {
          quelle: NORMGEBER_EU,
          meldung: `Kuratierte Europa-Liste nicht verwendbar: ${String(e)}`,
        },
      ],
    };
  }
}
