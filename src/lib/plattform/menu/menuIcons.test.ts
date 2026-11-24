// menuIcons.test.ts
// Prüft die Iconvarianten für Datenschutz, Tastenkürzel und Updateprüfung in allen Menüstatus.
import { expect, it, vi } from 'vitest';
import { menuIconPfad } from './menuIcons';
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (pfad: string) => pfad }));
it.each(
  ['datenschutz', 'tastenkuerzel'].flatMap((id) =>
    (
      [
        [false, true, 'light'],
        [false, false, 'light-disabled'],
        [true, true, 'dark'],
        [true, false, 'dark-disabled'],
      ] as const
    ).map(([dunkel, aktiv, ordner]) => ({ id, dunkel, aktiv, ordner })),
  ),
)('verwendet $id bei dunkel=$dunkel und aktiv=$aktiv', async ({ id, dunkel, aktiv, ordner }) => {
  expect(await menuIconPfad(id, dunkel, aktiv)).toBe(`icons/menu/${ordner}/${id}.png`);
});
it.each([
  [false, true, 'light'],
  [false, false, 'light-disabled'],
  [true, true, 'dark'],
  [true, false, 'dark-disabled'],
] as const)(
  'verwendet für Nach Updates suchen bei dunkel=%s und aktiv=%s das Download-Icon',
  async (dunkel, aktiv, ordner) => {
    expect(await menuIconPfad('nach-updates-suchen', dunkel, aktiv)).toBe(
      `icons/menu/${ordner}/nach_updates_suchen.png`,
    );
  },
);
it('verwendet für Über LexLata das Info-Icon', async () => {
  expect(await menuIconPfad('ueber', true, false)).toBe('icons/menu/dark-disabled/gesetz_info.png');
});
