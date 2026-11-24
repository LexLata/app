// @vitest-environment jsdom
// Prüft Auswahl, Gruppierung, Plattformanzeige und Schließen der Tastenkürzelübersicht.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TastenkuerzelOverlay } from './TastenkuerzelOverlay';
import {
  tastenkuerzelAnzeige,
  tastenkuerzelKatalog,
} from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
const plattform = vi.hoisted(() => ({ istMac: false }));
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => plattform }));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
let root: Root;
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<main></main>';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.querySelector('main')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it.each([false, true])(
  'zeigt die gekürzte Übersicht in Plattformschreibweise (Mac: %s)',
  async (istMac) => {
    plattform.istMac = istMac;
    await act(async () => root.render(<TastenkuerzelOverlay onSchliessen={vi.fn()} />));
    const zeile = (id: string) => document.querySelector(`[data-tastenkuerzel-ids~="${id}"]`);
    for (const eintrag of tastenkuerzelKatalog) {
      const verborgen =
        eintrag.bereich === 'system' ||
        eintrag.bereich === 'hilfsfenster' ||
        eintrag.bereich === 'overlay' ||
        /^(?:ArrowUp|ArrowDown)$/.test(eintrag.accelerator) ||
        /(?:Enter|Escape|Delete|Backspace)$/.test(eintrag.accelerator) ||
        eintrag.thema === 'Export' ||
        ['oeffnen-paragraf', 'oeffnen-schliessen'].includes(eintrag.id);
      if (verborgen) expect(zeile(eintrag.id), eintrag.id).toBeNull();
      else {
        expect(zeile(eintrag.id), eintrag.id).not.toBeNull();
        expect(zeile(eintrag.id)?.querySelector('kbd')?.textContent).toContain(
          tastenkuerzelAnzeige(eintrag.id, istMac),
        );
      }
    }
    expect(zeile('klappstufe-aufklappen')).toBe(zeile('klappstufe-zuklappen'));
    expect(zeile('klappstufe-aufklappen')?.textContent).toContain(
      'Klappstufe des Gesetzes aufklappen / zuklappen',
    );
    expect(zeile('verlauf-vor')).toBe(zeile('verlauf-zurueck'));
    expect(zeile('tab-naechster')).toBe(zeile('tab-vorheriger'));
    for (const id of ['favoriten-1-26', 'favoriten-27-52', 'favoriten-53-78']) {
      expect(zeile(id)?.closest('section')?.querySelector('h2')?.textContent).toBe(
        'Lesezeichen & Favoriten',
      );
    }
    expect([...document.querySelectorAll('h2')].map((e) => e.textContent)).toEqual([
      'Fenster & Tabs',
      'Gesetze & Suche',
      'Lesezeichen & Favoriten',
      'Markieren',
      'Pfeiltasten',
    ]);
    for (const id of [
      'verlauf-vor',
      'verlauf-zurueck',
      'element-naechstes',
      'element-vorheriges',
      'ueberschrift-naechste',
      'ueberschrift-vorherige',
    ]) {
      expect(zeile(id)?.closest('section')?.querySelector('h2')?.textContent).toBe('Pfeiltasten');
    }
    expect(document.querySelector('h3')).toBeNull();
    expect(document.body.textContent).not.toMatch(/[()]/);
    expect(document.body.textContent).not.toContain('Gesetz offen');
    expect(document.body.textContent?.replaceAll('\u00a0', ' ')).toContain(
      'Gesetzeskurzbefehle können Sie unter „Gesetze verwalten“ festlegen.',
    );
  },
);
it('schließt bei Escape', async () => {
  const schliessen = vi.fn();
  await act(async () => root.render(<TastenkuerzelOverlay onSchliessen={schliessen} />));
  const ereignis = new window.Event('keydown');
  Object.defineProperty(ereignis, 'key', { value: 'Escape' });
  await act(async () => window.dispatchEvent(ereignis));
  expect(schliessen).toHaveBeenCalledOnce();
});

it('zeigt a–z und den Einstellungshinweis nur bei ausgeschalteter Einstellung', async () => {
  await act(async () => root.render(<TastenkuerzelOverlay onSchliessen={vi.fn()} />));
  const hinweis =
    'Die Kürzel zum Öffnen von Lesezeichen und Favoriten sind nur wirksam, wenn in den Einstellungen „Tastenkürzel in Seitenleisten aktivieren“ gesetzt ist.';
  expect(document.body.textContent).toContain(hinweis);
  const zeile = document.querySelector('[data-tastenkuerzel-ids="favoriten-1-26"]');
  expect(zeile?.textContent).toContain('Favorit 1–26 öffnen');
  expect(zeile?.querySelector('kbd')?.textContent).toBe('a–z');
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'lexlata.seitenleistenTastenkuerzel',
        newValue: 'true',
      }),
    ),
  );
  expect(document.body.textContent).not.toContain(hinweis);
  for (const id of [
    'favoriten-1-26',
    'favoriten-27-52',
    'favoriten-53-78',
    'lesezeichen-1-10',
    'lesezeichen-11-20',
  ]) {
    expect(document.querySelector(`[data-tastenkuerzel-ids~="${id}"]`)).not.toBeNull();
  }
});

it('zeigt die Aufklapphinweise für die Normtexte im Kapitel und für die einzelne Norm', async () => {
  await act(async () => root.render(<TastenkuerzelOverlay onSchliessen={vi.fn()} />));
  expect(document.body.textContent).toContain(
    'Überschrift oder die Normtexte des Kapitels aufklappen',
  );
  expect(document.body.textContent).toContain(
    'Überschrift oder nur den Text dieser Norm aufklappen',
  );
});
