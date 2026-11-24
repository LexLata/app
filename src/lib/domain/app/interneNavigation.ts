// Strukturierte interne Navigation; öffentliche Links behalten ihren eigenen Vertrag.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

export interface InternerNavigationsauftrag {
  gesetz: Gesetzesreferenz;
  ziel:
    { type: 'norm'; bezeichnung: string } | { type: 'ueberschrift'; gliederungskennzahl: string };
}
