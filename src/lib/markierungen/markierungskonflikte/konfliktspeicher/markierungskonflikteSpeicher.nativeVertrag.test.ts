// Gemeinsame native Testdaten an der tatsächlichen Prüfvorgangsgrenze.
import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import vertraege from '@/test/plattform/native-vertraege.json';
import { pruefvorgangsAktion } from './markierungskonflikteSpeicher.dateiZugriff';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());
it('verwendet Command, Argumente und Ergebnisfelder aus dem gemeinsamen Vertrag', async () => {
  vi.mocked(invoke).mockResolvedValue(vertraege.pruefvorgang.stand);
  await expect(pruefvorgangsAktion('abfragen', 'token')).resolves.toEqual(
    vertraege.pruefvorgang.stand,
  );
  expect(invoke).toHaveBeenCalledWith(
    vertraege.pruefvorgang.command,
    vertraege.pruefvorgang.argumente,
  );
});
it.each(vertraege.pruefvorgang.ungueltig)(
  'weist abweichenden Prüfstand zurück: %j',
  async (antwort) => {
    vi.mocked(invoke).mockResolvedValue(antwort);
    await expect(pruefvorgangsAktion('abfragen', 'token')).rejects.toThrow('Prüfvorgangsstand');
  },
);
