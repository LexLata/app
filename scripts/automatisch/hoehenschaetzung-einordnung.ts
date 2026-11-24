// hoehenschaetzung-einordnung.ts
// Gleicht die benannten Elemente und Attribute eines RelaxNG-Schemas mit der Einordnung für die
// Höhenschätzung ab (Liste: src/components/gesetzestextansicht/ansichtssteuerung/scrollen/
// hoehenschaetzungEinordnung.json). Attribute heißen „element@attribut“; offene Platzhalter
// (anyName) bleiben außen vor, weil sie keinen Namen tragen.

export type HoehenschaetzungEinordnung =
  | { readonly einordnung: 'wird geschätzt'; readonly wo: string }
  | { readonly einordnung: 'ohne Höhenwirkung'; readonly begruendung: string };

const LISTE =
  'src/components/gesetzestextansicht/ansichtssteuerung/scrollen/hoehenschaetzungEinordnung.json';

/** Benannte Elemente und Attribute (als „element@attribut“) eines RelaxNG-Schemas. */
function schemaNamen(rng: string): Set<string> {
  const namen = new Set<string>();
  const offen: (string | undefined)[] = [];
  // Nur Element-Tags öffnen und schließen eine Ebene; Attribute gehören zum innersten Element.
  for (const [, ende, tag, rest = '', leer] of rng.matchAll(
    /<(\/?)(element|attribute)\b([^>]*?)(\/?)>/g,
  )) {
    const name = /\bname="([^"]+)"/.exec(rest)?.[1];
    if (tag === 'attribute') {
      const element = offen.at(-1);
      if (!ende && name && element) namen.add(`${element}@${name}`);
    } else if (ende) {
      offen.pop();
    } else {
      if (name) namen.add(name);
      if (!leer) offen.push(name);
    }
  }
  return namen;
}

/** Liefert verständliche Befunde; eine leere Liste heißt: vollständig und aktuell eingeordnet. */
export function pruefeHoehenschaetzungEinordnung(
  rng: string,
  eintraege: Readonly<Record<string, HoehenschaetzungEinordnung>>,
): string[] {
  const imSchema = schemaNamen(rng);
  const befunde: string[] = [];
  for (const name of imSchema) {
    if (!(name in eintraege)) {
      befunde.push(
        `„${name}“ steht im Schema docs/schema/gesetz.rng, ist aber nicht eingeordnet. ` +
          `Prüfen, ob es die angezeigte Höhe ändert, und in ${LISTE} eintragen: ` +
          `„wird geschätzt“ mit Verweis auf die Schätzstelle oder „ohne Höhenwirkung“ mit Begründung.`,
      );
    }
  }
  for (const [name, eintrag] of Object.entries(eintraege)) {
    if (!imSchema.has(name)) {
      befunde.push(
        `„${name}“ ist in ${LISTE} eingeordnet, steht aber nicht mehr im Schema docs/schema/gesetz.rng. ` +
          'Eintrag entfernen oder an den neuen Namen anpassen.',
      );
    } else if (
      eintrag.einordnung === 'wird geschätzt' ? !eintrag.wo?.trim() : !eintrag.begruendung?.trim()
    ) {
      befunde.push(
        `„${name}“ in ${LISTE}: Bei „wird geschätzt“ ist „wo“, bei „ohne Höhenwirkung“ ist „begruendung“ anzugeben.`,
      );
    }
  }
  return befunde;
}
