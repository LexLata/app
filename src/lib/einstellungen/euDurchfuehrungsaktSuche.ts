// euDurchfuehrungsaktSuche.ts
// Liest die EU-Suchpräferenz aus ihrem localStorage-Rohwert.
export type EuDurchfuehrungsaktSuche = boolean;
export function parseEuDurchfuehrungsaktSuche(roh: string | null): EuDurchfuehrungsaktSuche {
  return roh === 'true';
}
