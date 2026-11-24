// Gemeinsame Anzeigeattrappen für DOM-Proben des Dateiimport-Overlays.
import { vi } from 'vitest';
vi.mock('@/components/textanzeige/textanzeige.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/textanzeige/textanzeige.index')>()),
  TextAnzeige: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock('@/hooks/stil/useTextRollen', async (importOriginal) => {
  const { erzeugeTextRollen } = await import('@/lib/stil/textRollen');
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    useTextRollen: () => erzeugeTextRollen(1),
  };
});
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useButtonRollen', () => ({
  useButtonRollen: () => ({ sekundaerKompakt: () => ({}), sekundaer: () => ({}) }),
}));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({ useAbstandRollen: () => ({}) }));
