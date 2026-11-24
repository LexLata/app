import { expect, it } from 'vitest';
import { bezeichnungAusgangsstelle } from './ausgangsstelle';
// Prüft die drei erlaubten Ausgangsstellenfälle im Typvertrag.
import type { Ausgangsstelle } from './ausgangsstelle';
// Eine Norm trägt ihre vollständige Bezeichnung.
const ohnePraefix: Ausgangsstelle = { typ: 'norm', bezeichnung: '1' };
// @ts-expect-error – Eine Überschrift trägt eine Gliederungskennzahl, keine Normbezeichnung.
const ohneKennzahl: Ausgangsstelle = { typ: 'ueberschrift', bezeichnung: '010' };
// @ts-expect-error – Ein Erwägungsgrund darf keine Präfixliste tragen.
const mitPraefix: Ausgangsstelle = { typ: 'erwaegungsgrund', bezeichnung: 'E1', praefix: [''] };
// @ts-expect-error – Eine Norm trägt keine gesonderte Präfixliste.
const leereListe: Ausgangsstelle = { typ: 'norm', bezeichnung: '5', praefix: [] };
void [ohnePraefix, ohneKennzahl, mitPraefix, leereListe];

it('zeigt die eigene Kennung der drei Ausgangsstellenfälle', () => {
  expect(bezeichnungAusgangsstelle({ typ: 'norm', bezeichnung: '§ 433' })).toBe('§ 433');
  expect(bezeichnungAusgangsstelle({ typ: 'erwaegungsgrund', bezeichnung: 'E25' })).toBe('E25');
  expect(bezeichnungAusgangsstelle({ typ: 'ueberschrift', gliederungskennzahl: '010' })).toBe(
    '010',
  );
});
