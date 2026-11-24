import { beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ melden: vi.fn(), aktivieren: vi.fn() }));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  menuNormstatusMelden: native.melden,
  menuItemAktivieren: native.aktivieren,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
it('meldet nur Änderungen und meldet den letzten fensterlokalen Normstatus bei Fokus erneut', async () => {
  const menu = await import('./menuAktivZustandStore');
  const norm = { bezeichnung: 'Art. 229 § 3', ist_favorit: false, ist_lesezeichen: false };
  menu.meldeNormstatus(norm);
  menu.meldeNormstatus({ ...norm });
  expect(native.melden).toHaveBeenCalledTimes(1);
  menu.meldeNormstatus({ ...norm, ist_favorit: true });
  menu.meldeNormstatus({ ...norm, bezeichnung: '§ 4' });
  expect(native.melden).toHaveBeenCalledTimes(3);
  menu.synchronisiereNativenZustand();
  expect(native.melden).toHaveBeenLastCalledWith({ ...norm, bezeichnung: '§ 4' });
  expect(native.melden).toHaveBeenCalledTimes(4);
  menu.meldeNormstatus({ bezeichnung: null, ist_favorit: false, ist_lesezeichen: false });
  menu.meldeNormstatus({ bezeichnung: null, ist_favorit: false, ist_lesezeichen: false });
  expect(native.melden).toHaveBeenCalledTimes(5);
});
it.each([
  [
    null,
    false,
    'Ausgewählte Norm als Favoriten speichern',
    'Ausgewählte Norm als Lesezeichen speichern',
  ],
  ['§ 4', false, '§ 4 als Favoriten speichern', '§ 4 als Lesezeichen speichern'],
  [
    'Art. 229 § 3',
    true,
    'Art. 229 § 3 aus Favoriten entfernen',
    'Art. 229 § 3 aus Lesezeichen entfernen',
  ],
  ['A & B_C', false, 'A & B_C als Favoriten speichern', 'A & B_C als Lesezeichen speichern'],
])('bildet sichtbare Menütexte für %s', async (bezeichnung, gespeichert, favorit, lesezeichen) => {
  const menu = await import('./menuAktivZustandStore');
  if (bezeichnung)
    menu.meldeNormstatus({ bezeichnung, ist_favorit: gespeichert, ist_lesezeichen: gespeichert });
  expect(menu.menuText('favorit-speichern')).toBe(favorit);
  expect(menu.menuText('lesezeichen-speichern')).toBe(lesezeichen);
  expect(menu.menuText('gesetz-info')).toBeNull();
});
