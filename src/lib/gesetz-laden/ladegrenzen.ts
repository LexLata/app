// Vorläufige Messwerte; einzelne Plattformen können nach Desktopmessung abweichen.
import { plattformFallsBekannt } from '@/lib/plattform/tauriHelpers';
const HAUPTFENSTER_HALTEGRENZE = 50;
export const HILFSFENSTER_HALTEGRENZE = 0;
const VORLADEGRENZE = 10;
type Grenzen = { haltegrenze: number; vorladegrenze: number };
const PLATTFORM_GRENZEN: Partial<
  Record<NonNullable<ReturnType<typeof plattformFallsBekannt>>, Partial<Grenzen>>
> = {};
export function holeLadegrenzen(): Grenzen {
  const plattform = plattformFallsBekannt();
  return {
    haltegrenze: HAUPTFENSTER_HALTEGRENZE,
    vorladegrenze: VORLADEGRENZE,
    ...(plattform ? PLATTFORM_GRENZEN[plattform] : undefined),
  };
}
