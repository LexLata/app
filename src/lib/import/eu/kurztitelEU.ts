// kurztitelEU.ts
// Einheitliche Dokumenttypen und Nummernregeln für den EU-Importindex.
export const EU_TYPEN = {
  REG: ['verordnung', 'VO'],
  REG_DEL: ['delegierte-verordnung', 'DelVO'],
  REG_IMPL: ['durchfuehrungsverordnung', 'DVO'],
  DIR: ['richtlinie', 'RL'],
  DIR_DEL: ['delegierte-richtlinie', 'DelRL'],
  DIR_IMPL: ['durchfuehrungsrichtlinie', 'DurchfRL'],
} as const;

/** Leitet die Kurzbezeichnung aus Basis-CELEX und Dokumenttyp ab. */
export function leiteKurztitelAb(celex: string, typ: string): string {
  const treffer = /^3(\d{4})[RL](\d{4,5})$/.exec(celex);
  const art = Object.values(EU_TYPEN).find(([wert]) => wert === typ);
  if (!treffer || !art) throw new Error('Ungültige CELEX oder unbekannter EU-Rechtsakttyp.');
  const jahr = Number(treffer[1]);
  const nummer = String(Number(treffer[2]));
  const jahrText = jahr < 1999 ? treffer[1]!.slice(2) : String(jahr);
  return `${art[1]} ${typ.toLowerCase().includes('richtlinie') || jahr >= 2015 ? `${jahrText}/${nummer}` : `${nummer}/${jahrText}`}`;
}
