// checkboxRolle.test.ts
// Die Checkbox verwendet in beiden Themen die gemeinsamen Farbvariablen.
import { expect, it } from 'vitest';
import { erzeugeCheckboxRolle } from './checkboxRolle';

it('zeichnet skalierte Kästchen mit Themenfarben und gedämpftem deaktivierten Zustand', () => {
  const leer = erzeugeCheckboxRolle(1, false, false);
  expect(leer).toMatchObject({
    appearance: 'none',
    width: 14,
    height: 14,
    background: 'var(--bg-eingabe)',
    border: '1px solid var(--rahmen)',
    opacity: 1,
  });
  expect(erzeugeCheckboxRolle(2, true, true)).toMatchObject({
    width: 28,
    height: 28,
    background: 'var(--akzent-einheitlich)',
    border: '1px solid var(--akzent-einheitlich)',
    opacity: 0.4,
  });
});
