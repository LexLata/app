// Meldet jedes neu im echten Bannerzustand erscheinende Banner an eine
// Testfunktion. So bleibt das Banner echt, und Tests prüfen auch Banner, die
// innerhalb des Bannermoduls (z. B. Aktionsmeldungen) angelegt werden.
import { getSnapshot, subscribe } from '@/lib/banner/banner.index';
import type { Banner } from '@/lib/banner/banner.index';

export function meldeGezeigteBanner(empfaenger: (banner: Omit<Banner, 'id'>) => void): () => void {
  const bekannt = new Set(getSnapshot().map((b) => b.id));
  return subscribe(() => {
    for (const { id, ...banner } of getSnapshot()) {
      if (bekannt.has(id)) continue;
      bekannt.add(id);
      empfaenger(banner);
    }
  });
}
