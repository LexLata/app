// Prüft die native Weitergabe und die vom Befehlsnamen bestimmten Typen.
import { expect, it, vi } from 'vitest';
import { rufeBefehl } from './tauri-befehle.index';
const nativ = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ }));
it('übergibt Name und Argumente unverändert und liefert die Antwort', async () => {
  nativ.mockResolvedValue('token');
  expect(await rufeBefehl('datei_sperre_erwerben', { relativerPfad: 'a.xml' })).toBe('token');
  expect(nativ).toHaveBeenCalledWith('datei_sperre_erwerben', { relativerPfad: 'a.xml' });
});
function unzulaessigeAufrufe() {
  // @ts-expect-error Unbekannte Befehle gehören nicht zum nativen Vertrag.
  void rufeBefehl('unbekannt');
  // @ts-expect-error Der Pfad ist ein Text.
  void rufeBefehl('datei_sperre_erwerben', { relativerPfad: 1 });
  // @ts-expect-error Die Erwerbsanforderung benötigt einen Pfad.
  void rufeBefehl('datei_sperre_erwerben');
  // @ts-expect-error Der Aufrufer kann keinen Ergebnistyp behaupten.
  void rufeBefehl<boolean>('datei_sperre_erwerben', { relativerPfad: 'a.xml' });
}
void unzulaessigeAufrufe;

it.each([true, false])(
  'übergibt den Öffnen-Link mit beimAppStart=%s an Rust',
  async (beimAppStart) => {
    const auftrag = { type: 'oeffnen', suchtext: '433 BGB' } as const;
    await rufeBefehl('oeffnen_link_navigation_senden', { auftrag, beimAppStart });
    expect(nativ).toHaveBeenLastCalledWith('oeffnen_link_navigation_senden', {
      auftrag,
      beimAppStart,
    });
  },
);
