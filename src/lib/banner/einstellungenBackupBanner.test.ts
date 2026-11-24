// Der Wiederherstellungshinweis erscheint pro Fensterstart höchstens einmal.
import { expect, it, vi } from 'vitest';
const zeigeBanner = vi.hoisted(() => vi.fn());
vi.mock('./bannerStore', () => ({ zeigeBanner }));
it('zeigt den vereinbarten Hinweis nur einmal', async () => {
  const { zeigeEinstellungenBackupBannerEinmal } = await import('./einstellungenBackupBanner');
  zeigeEinstellungenBackupBannerEinmal();
  zeigeEinstellungenBackupBannerEinmal();
  expect(zeigeBanner).toHaveBeenCalledTimes(1);
  expect(zeigeBanner).toHaveBeenCalledWith({
    art: 'dateibefunde',
    typ: 'info',
    text: 'Einstellungen aus der Sicherung wiederhergestellt.',
  });
});
