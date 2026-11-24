// praefixlaufAbweisung.test.ts
// Noch nicht verfügbare Laufmodi enden sichtbar vor jedem Importzugriff.
import { beforeEach, expect, it, vi } from 'vitest';
const nativ = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke }));
import { startePraefixlauf } from './praefixlaufStart';

beforeEach(() => {
  nativ.invoke.mockReset();
  nativ.invoke.mockResolvedValue(undefined);
});
it.each(['praefix'] as const)(
  'weist EU im Modus %s mit verständlicher Meldung ab',
  async (modus) => {
    await Reflect.apply(startePraefixlauf, undefined, [{ modus, normgeber: 'eu', anzahl: 1 }]);
    expect(nativ.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
      art: 'ergebnis',
      zeile: expect.stringContaining('EU wird in diesem Entwicklerlauf noch nicht unterstützt'),
    });
    expect(nativ.invoke).toHaveBeenCalledWith('praefixlauf_beenden', { code: 1 });
    expect(nativ.invoke.mock.calls.map(([befehl]) => befehl)).toEqual([
      'praefixlauf_ausgabe',
      'praefixlauf_ausgabe',
      'praefixlauf_ausgabe',
      'praefixlauf_bericht_schreiben',
      'praefixlauf_ausgabe',
      'praefixlauf_ausgabe',
      'praefixlauf_beenden',
    ]);
  },
);
