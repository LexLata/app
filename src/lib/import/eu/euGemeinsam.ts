// euGemeinsam.ts
// Gemeinsame Titelaufbereitung für Formex.

// Deutsche Funktionswörter, die in einer sinnvoll großkleingeschriebenen
// Titelzeile klein bleiben sollen (Artikel, Präpositionen, Konjunktionen).
// Bewusst keine vollständige Liste – deckt die in EUR-Lex-Titeln üblichen
// Fälle ab (z.B. "Charta der Grundrechte der Europäischen Union").
const KLEIN_WOERTER = new Set([
  'der',
  'die',
  'das',
  'des',
  'dem',
  'den',
  'und',
  'oder',
  'sowie',
  'sowohl',
  'als',
  'wie',
  'ein',
  'eine',
  'einer',
  'eines',
  'einem',
  'einen',
  'in',
  'im',
  'an',
  'am',
  'auf',
  'zu',
  'zum',
  'zur',
  'für',
  'über',
  'von',
  'vom',
  'bei',
  'beim',
  'nach',
  'mit',
  'ohne',
  'um',
  'gegen',
  'durch',
  'aus',
  'bis',
  'seit',
  'unter',
  'vor',
  'während',
  'wegen',
]);

/**
 * Wandelt eine komplett großgeschriebene EUR-Lex-Titelzeile (z.B. "CHARTA
 * DER GRUNDRECHTE DER EUROPÄISCHEN UNION") in eine sinnvoll gemischte
 * Groß-/Kleinschreibung um ("Charta der Grundrechte der Europäischen
 * Union"). Enthält die Zeile bereits Kleinbuchstaben (z.B. weil sie schon
 * korrekt geschrieben ist, wie "über das auf … Recht" bei Rom II), wird sie
 * unverändert zurückgegeben – die Erkennung arbeitet also nur auf
 * tatsächlich rein großgeschriebenen Zeilen, nie auf gemischtem Text.
 *
 * Kurze Tokens (≤3 Buchstaben, z.B. Abkürzungen wie "EU"/"EG") und römische
 * Ziffern bleiben unangetastet großgeschrieben, da hier nicht zwischen
 * Abkürzung und normalem kurzem Wort unterschieden werden kann.
 */
export function sinnvolleGrossKleinschreibung(text: string): string {
  if (/\p{Ll}/u.test(text)) return text; // enthält bereits Kleinbuchstaben – nicht anfassen

  return text
    .split(' ')
    .map((wort, i) => {
      const kernwort = wort.toLowerCase().replace(/[^\p{L}]/gu, '');
      if (kernwort.length === 0) return wort;
      if (i > 0 && KLEIN_WOERTER.has(kernwort)) return wort.toLowerCase();
      if (kernwort.length <= 3) return wort; // vermutlich Abkürzung, z.B. "EU"/"EG"
      return wort
        .toLowerCase()
        .replace(/(^|-)(\p{L})/gu, (_m: string, sep: string, c: string) => sep + c.toUpperCase());
    })
    .join(' ');
}

/**
 * Entfernt den EWR-Relevanzhinweis ("(Text von Bedeutung für den EWR)" bzw.
 * "(Text mit Bedeutung für den EWR)") vom Ende einer Titelzeile/-zeilenkette.
 * Dieser Hinweis ist ein auf sehr vielen EU-Rechtsakten vorkommender
 * Standard-Zusatz, KEINE Dokument-Abkürzung – muss daher vor der jeweiligen
 * klammerAbkuerzung-Erkennung entfernt werden, sonst würde er selbst
 * fälschlich als Abkürzung übernommen (die runden Klammern sehen für den
 * Abkürzungs-Regex sonst identisch aus, z.B. zu "(Rom I)").
 */
export function entferneEWRHinweis(text: string): string {
  return text.replace(/\s*\(Text (?:von|mit) Bedeutung für den EWR\)\s*$/i, '').trim();
}
