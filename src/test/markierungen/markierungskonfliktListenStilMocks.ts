// Gemeinsame Stil-Hooks für Tests der Konfliktliste ohne Einstellungs-Speicher.
import { vi } from 'vitest';

vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useTextRollen', () => ({
  useTextRollen: () => ({ standardtext: {}, standardtextBetont: {}, fehlertext: {} }),
}));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({ useAbstandRollen: () => ({ standard: 8 }) }));
vi.mock('@/hooks/stil/useRadiusRollen', () => ({ useRadiusRollen: () => ({ klein: 4 }) }));
