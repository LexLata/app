// markierungen.hilfsfensterKontext.test.ts
// Textbezug wird im Bearbeitungskontext ausschließlich in textbezug gehalten.
import { expectTypeOf, it } from 'vitest';
import type {
  KommentarKontext,
  VerweismarkierungKontext,
} from './markierungen.hilfsfensterKontext';

it('schließt eine zweite Textstelle im Vorher-Zustand beider Hilfsfenster aus', () => {
  type KommentarVorher = NonNullable<KommentarKontext['bearbeiten']>['vorher'];
  type VerweisVorher = NonNullable<VerweismarkierungKontext['bearbeiten']>['vorher'];
  expectTypeOf<
    Extract<keyof KommentarVorher, 'textstelle' | 'bezugstext'>
  >().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof VerweisVorher, 'textstelle' | 'bezugstext'>>().toEqualTypeOf<never>();
});
