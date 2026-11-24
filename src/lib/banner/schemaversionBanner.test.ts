import { beforeEach, expect, it, vi } from 'vitest';

const zeigeBanner = vi.fn();
vi.mock('./bannerStore', () => ({ zeigeBanner }));

beforeEach(() => {
  vi.resetModules();
  zeigeBanner.mockClear();
});

it('zeigt bei aufeinanderfolgenden und parallelen Funden nur ein bleibendes Banner', async () => {
  const { zeigeSchemaversionBannerEinmal } = await import('./schemaversionBanner');
  zeigeSchemaversionBannerEinmal();
  await Promise.all([
    Promise.resolve().then(zeigeSchemaversionBannerEinmal),
    Promise.resolve().then(zeigeSchemaversionBannerEinmal),
  ]);
  expect(zeigeBanner).toHaveBeenCalledTimes(1);
  expect(zeigeBanner).toHaveBeenCalledWith({
    art: 'systemfehler',
    typ: 'warnung',
    text: 'Mindestens eine Datei hat eine andere LexLata-Schemaversion. Bitte prüfen Sie, ob eine Aktualisierung der App verfügbar ist.',
  });
  zeigeSchemaversionBannerEinmal();
  expect(zeigeBanner).toHaveBeenCalledTimes(1);
});
