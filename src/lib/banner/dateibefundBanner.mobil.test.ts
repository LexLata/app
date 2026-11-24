// Prüft, dass das Dateibefund-Banner auf Mobilgeräten keinen Knopf
// „Datenordner öffnen“ erhält; die Plattform ist gemockt.
import { expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'ios' }));

import { getSnapshot, meldeDateibefund } from './banner.index';
import { holePlattform } from '@/lib/plattform/tauriHelpers';

it('zeigt mobil trotz Sicherung keinen Knopf', async () => {
  await holePlattform();
  meldeDateibefund({
    typ: 'warnung',
    grund: 'imDatenordnerGesichert',
    betroffen: 'a.xml',
    sicherung: 'markierungen/a.beschaedigt.xml',
    text: 'a.xml gesichert.',
  });
  expect(getSnapshot()[0]?.aktion).toBeUndefined();
});
