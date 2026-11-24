// Belegt die vom Compiler ausgeschlossenen Kombinationen des Textpfads.
import { expect, it } from 'vitest';
import type { Textpfad } from './textpfad';

function pruefeTypen(): void {
  const akzeptiere = (_pfad: Textpfad) => undefined;
  // @ts-expect-error -- Ein Bereich enthält keine Absatzadresse.
  akzeptiere({ typ: 'bereich', bereich: 'bezeichnung', absatz: '1' });
  // @ts-expect-error -- Ein Satz im Listeneintrag braucht eine Eintragskette.
  akzeptiere({ typ: 'normtext', satzInEintrag: 1 });
  // @ts-expect-error -- Die Eintragskette enthält mindestens einen Schritt.
  akzeptiere({ typ: 'normtext', eintraege: [] });
  // @ts-expect-error -- Jeder Textpfad trägt seine Diskriminante.
  akzeptiere({ absatz: '1' });
}

it('hält unzulässige Pfadkombinationen als Typprüfungen fest', () => {
  expect(pruefeTypen).toBeTypeOf('function');
});
