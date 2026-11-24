// Gemeinsame Fabriken für die drei fachlich getrennten Ausgangsstellen in Tests.
import { type Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

export function normAusgangsstelle(bezeichnung = '§ 1'): Extract<Ausgangsstelle, { typ: 'norm' }> {
  return { typ: 'norm', bezeichnung };
}
export function erwaegungsgrundAusgangsstelle(
  bezeichnung = 'E1',
): Extract<Ausgangsstelle, { typ: 'erwaegungsgrund' }> {
  return { typ: 'erwaegungsgrund', bezeichnung };
}
export function ueberschriftAusgangsstelle(
  gliederungskennzahl = '010',
): Extract<Ausgangsstelle, { typ: 'ueberschrift' }> {
  return { typ: 'ueberschrift', gliederungskennzahl };
}
