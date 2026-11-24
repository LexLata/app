// Fehlerbehandlung nach bereits erfolgreicher Nutzerdatenspeicherung.
import { beforeEach, expect, it, vi } from 'vitest';
const emit = vi.fn();
const banner = vi.fn();
vi.mock('@tauri-apps/api/event', () => ({ emitTo: (...args: unknown[]) => emit(...args) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: (...args: unknown[]) => banner(...args),
}));
import { nutzerdatenAenderungMelden } from './nutzerdatenAenderungMelden';
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
it('versendet das bestehende Ereignis einmal an alle Fenster', async () => {
  await nutzerdatenAenderungMelden('favoriten-geaendert');
  expect(emit).toHaveBeenCalledExactlyOnceWith('*', 'favoriten-geaendert');
  expect(banner).not.toHaveBeenCalled();
});
it('warnt gesondert bei Ereignisfehler und bleibt erfolgreich', async () => {
  emit.mockRejectedValueOnce(Error('Ereignis'));
  await expect(nutzerdatenAenderungMelden('lesezeichen-geaendert')).resolves.toBeUndefined();
  expect(banner).toHaveBeenCalledExactlyOnceWith({
    art: 'dateibefunde',
    typ: 'warnung',
    text: expect.stringContaining('Geöffnete Fenster'),
  });
  expect(console.error).toHaveBeenCalledOnce();
});
it('auch Warnungsfehler weisen erfolgreiche Speicherung nicht als Fehler aus', async () => {
  emit.mockRejectedValueOnce(Error('Ereignis'));
  banner.mockImplementationOnce(() => {
    throw Error('Banner');
  });
  await expect(
    nutzerdatenAenderungMelden('gesetzeskurzbefehle-geaendert'),
  ).resolves.toBeUndefined();
  expect(console.error).toHaveBeenCalledTimes(2);
  expect(emit).toHaveBeenCalledOnce();
});
