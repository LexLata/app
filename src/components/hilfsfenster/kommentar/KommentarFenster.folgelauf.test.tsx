// @vitest-environment jsdom
// Echtes Kommentarformular mit registrierter Prüfkoordination, Quellen und Prüfqueue.
import { pruefeMarkierungsFensterFolgelauf } from '@/test/markierungen/markierungsFensterFolgelaufTestAufbau';

import { vi } from 'vitest';

pruefeMarkierungsFensterFolgelauf(false, async () => (await import('./KommentarFenster')).default);

vi.mock('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse', async (original) => ({
  ...(await original<typeof import('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse')>()),
  useDynamischeFensterGroesse: vi.fn(),
}));
