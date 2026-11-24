// bezeichnungVergleich.ts
//
// Numerischer Vergleich zweier Bezeichnung-Strings (z.B. „433", „249 3") für
// Sortierzwecke. Feature-übergreifend nutzbar – kein Bezug zu einem
// bestimmten Feature (Favoriten, Lesezeichen, ggf. künftige weitere
// bezeichnungsbasierte Markierungen).

/**
 * Numerischer Vergleich zweier Bezeichnung-Strings.
 *
 * Jeder String wird anhand von Leerzeichen in Tokens zerlegt und tokenweise
 * numerisch verglichen. Nicht-numerische Tokens werden lexikografisch (de)
 * verglichen. Kürzere Strings sortieren vor längeren mit identischem Präfix.
 *
 * Beispiele:
 *   "1" < "20" < "241" < "249 1" < "249 3" < "433"
 *   (Ein-Token "241" kommt vor Zwei-Token "249 1", weil 241 < 249.)
 */
export function vergleicheBezeichnung(a: string, b: string): number {
  const parseTeile = (s: string) =>
    s
      .trim()
      .split(/\s+/)
      .map((t) => {
        const n = parseInt(t, 10);
        return { n: isNaN(n) ? Infinity : n, s: t };
      });

  const teileA = parseTeile(a);
  const teileB = parseTeile(b);

  // Geprüft äquivalenter Mutant (Mutation-Testing-Analyse, siehe
  // Chatverlauf): bei i === max sind zwangsläufig BEIDE Arrays
  // out-of-bounds (i < max ist die einzig gültige Grenze, i === max liegt
  // bei jedem Array außerhalb) → auf beiden Seiten greift derselbe Fallback
  // { n: -Infinity, s: '' } → kein beobachtbarer Unterschied zu "<=".
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < Math.max(teileA.length, teileB.length); i++) {
    // Fehlendes Token (kürzerer String) sortiert vor vorhandenem. Der
    // Fallback-String s: '' wird NIE gelesen (s. u.), da ta.n/tb.n hier nur
    // dann gleich sein können, wenn beide Seiten defaulten – und das ist
    // innerhalb der obigen Schleifengrenze (i < max) unmöglich (siehe oben).
    // Geprüft äquivalenter Mutant (Mutation-Testing-Analyse, siehe
    // Chatverlauf).
    // Stryker disable next-line StringLiteral
    const ta = teileA[i] ?? { n: -Infinity, s: '' };
    // Stryker disable next-line StringLiteral
    const tb = teileB[i] ?? { n: -Infinity, s: '' };
    if (ta.n !== tb.n) return ta.n - tb.n;
    const sc = ta.s.localeCompare(tb.s, 'de');
    if (sc !== 0) return sc;
  }
  return 0;
}

/** Sortiert eine Liste von Bezeichnung-Strings numerisch (siehe vergleicheBezeichnung). */
export function sortiereBezeichnung(liste: string[]): string[] {
  return [...liste].sort(vergleicheBezeichnung);
}
