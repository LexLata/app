// textKuerzung.ts
// Gemeinsame Kürzungsregel für Vorschautexte: höchstens `maxZeichen` Zeichen,
// gekürzt vor dem angebrochenen Wort, danach „…“. Nur wenn schon das erste
// Wort zu lang ist, wird mitten im Wort gekürzt.

export function kuerzeAnWortgrenze(text: string, maxZeichen: number): string {
  if (text.length <= maxZeichen) return text;
  const grenze = text.slice(0, maxZeichen + 1).search(/\s+\S*$/);
  return `${text.slice(0, grenze > 0 ? grenze : maxZeichen)}…`;
}
