// Prüft das Öffnen des Datenordners gegen den gemockten nativen Befehl.
import { beforeEach, expect, it, vi } from 'vitest';

const nativ = vi.hoisted(() => ({
  invoke: vi.fn(async (_name: string, _argumente?: unknown) => {}),
}));
vi.mock('@tauri-apps/api/core', () => nativ);

import { oeffneDatenordner } from './datenordner';

beforeEach(() => nativ.invoke.mockReset());

it('öffnet ohne Datei den Datenordner', async () => {
  await oeffneDatenordner();
  expect(nativ.invoke).toHaveBeenCalledWith('datenordner_oeffnen', {});
});

it('öffnet mit einer Sicherungsdatei deren Ordner im Datenordner', async () => {
  await oeffneDatenordner('markierungen/BGB.beschaedigt-1.xml');
  expect(nativ.invoke).toHaveBeenCalledWith('datenordner_oeffnen', {
    relativerOrdner: 'markierungen',
  });
});

it('öffnet bei einer Datei direkt im Datenordner den Datenordner', async () => {
  await oeffneDatenordner('einstellungen.beschaedigt.xml');
  expect(nativ.invoke).toHaveBeenCalledWith('datenordner_oeffnen', {});
});

it('reicht die Ablehnung des nativen Befehls weiter', async () => {
  nativ.invoke.mockRejectedValueOnce('Ordner liegt nicht im Datenordner');
  await expect(oeffneDatenordner('../fremd/x.xml')).rejects.toBe(
    'Ordner liegt nicht im Datenordner',
  );
});
