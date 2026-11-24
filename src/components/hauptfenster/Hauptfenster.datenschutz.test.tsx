// @vitest-environment jsdom
// Echte Textquellen im Overlay-Host: Datenschutz und Über LexLata, geöffnet per Menüereignis.
import { act, useState, type ComponentProps } from 'react';
import { useMenueEvents } from '@/hooks/eingabe/useMenueEvents';
import type { AktivesOverlay } from '@/lib/domain/appTypes';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AppOverlayHost } from './OverlayHost';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { parseMiniMarkdown } from '@/lib/utils/miniMarkdown';
import { schuetzeLeerzeichen } from '@/lib/domain/basis/textNachbearbeitung';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';

const menue = vi.hoisted(() => ({ listener: new Map<string, () => void>() }));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', async (original) => ({
  ...(await original<object>()),
  hoereImEigenenFenster: (name: string, callback: () => void) => {
    menue.listener.set(name, callback);
    return { bereit: Promise.resolve(), abmelden: () => menue.listener.delete(name) };
  },
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '1.2.3' }));
const dom = domTestWurzel();
const roottext = readFileSync('DATENSCHUTZ.md', 'utf8');
const bloecke = parseMiniMarkdown(roottext);
type Inline = Extract<(typeof bloecke)[number], { art: 'absatz' }>['inhalt'];
const text = (inhalt: Inline): string =>
  inhalt
    .map((knoten) => (typeof knoten.inhalt === 'string' ? knoten.inhalt : text(knoten.inhalt)))
    .join('');
function alleInlineKnoten(inhalt: Inline): Inline {
  return inhalt.flatMap((knoten) =>
    typeof knoten.inhalt === 'string' ? [knoten] : [knoten, ...alleInlineKnoten(knoten.inhalt)],
  );
}
const inlineBereiche = bloecke.flatMap((block): Inline[] => {
  if (block.art === 'liste') return block.eintraege;
  if (block.art === 'tabelle') return [...block.kopf, ...block.zeilen.flat()];
  return [block.inhalt];
});
const anzahlInline = (art: Inline[number]['art']) =>
  inlineBereiche.flatMap(alleInlineKnoten).filter((knoten) => knoten.art === art).length;
const kommentar = /<!--([\s\S]*?)-->/.exec(roottext)?.[1]?.trim().split('\n')[0];
let props: ComponentProps<typeof AppOverlayHost>;
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  props = appOverlayHostFixture({ aktivesOverlay: 'datenschutz' });
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
async function anzeigen() {
  await act(async () =>
    dom.root.render(
      <UiGroesseProvider>
        <AppOverlayHost {...props} />
      </UiGroesseProvider>,
    ),
  );
}
it('zeigt alle Blöcke der echten Rootdatei ohne Kommentare und ohne aktives Gesetz', async () => {
  await anzeigen();
  for (const block of bloecke) {
    if (block.art === 'absatz' || block.art === 'ueberschrift') {
      expect(dom.host.textContent).toContain(schuetzeLeerzeichen(text(block.inhalt)));
    }
  }
  if (kommentar) expect(dom.host.textContent).not.toContain(kommentar);
  expect(dom.host.querySelectorAll('ul > li')).toHaveLength(
    bloecke.filter((b) => b.art === 'liste').reduce((summe, b) => summe + b.eintraege.length, 0),
  );
  for (const tabelle of bloecke.filter((b) => b.art === 'tabelle')) {
    expect([...dom.host.querySelectorAll('th')].map((z) => z.textContent)).toEqual(
      tabelle.kopf.map((z) => schuetzeLeerzeichen(text(z))),
    );
    expect(dom.host.querySelectorAll('tbody > tr')).toHaveLength(tabelle.zeilen.length);
  }
  expect(dom.host.querySelectorAll('table')).toHaveLength(
    bloecke.filter((b) => b.art === 'tabelle').length,
  );
  expect(dom.host.querySelectorAll('strong')).toHaveLength(anzahlInline('fett'));
  expect(dom.host.querySelectorAll('em')).toHaveLength(anzahlInline('kursiv'));
  expect(dom.host.querySelectorAll('code')).toHaveLength(anzahlInline('code'));
  expect(dom.host.querySelector('a, img, script')).toBeNull();
});

const nichts = () => {};
function AppMitMenue() {
  const [aktivesOverlay, setAktivesOverlay] = useState<AktivesOverlay | null>(null);
  useMenueEvents({
    setAktivesOverlay,
    setOeffnenOverlayInitial: nichts,
    handleExportOeffnen: nichts,
    tabOderFensterSchliessen: nichts,
    fensterSchliessen: nichts,
    handleFavoritSpeichern: nichts,
    handleLesezeichenSpeichern: nichts,
    handleAlleLesezeichenEntfernen: nichts,
    handleUnterstreichen: nichts,
    handleHervorheben: nichts,
    handleVerweismarkierungAnfrage: nichts,
    handleKommentarAnfrage: nichts,
    handleMarkierungRueckgaengig: nichts,
    handleMarkierungWiederholen: nichts,
    erstelleLeerenTab: nichts,
    tabWiederherstellen: nichts,
    handleDateiImportAnfrage: nichts,
    einfuehrungNeuStarten: nichts,
    einfuehrungAktiv: false,
    einfuehrungTeilaktion: 0,
  });
  return (
    <UiGroesseProvider>
      <AppOverlayHost {...props} aktivesOverlay={aktivesOverlay} />
    </UiGroesseProvider>
  );
}

it('führt das Datenschutz-Menüereignis bis zum eingebetteten Hinweis im echten Host fort', async () => {
  await act(async () => dom.root.render(<AppMitMenue />));
  expect(dom.host.querySelector('[data-overlay-aktiv]')).toBeNull();
  expect(menue.listener.has('datenschutz-oeffnen')).toBe(true);
  await act(async () => menue.listener.get('datenschutz-oeffnen')!());
  expect(dom.host.querySelector('[data-overlay-aktiv]')).not.toBeNull();
  expect(dom.host.textContent).toContain('Datenschutzhinweis LexLata');
  expect(dom.host.querySelector('table')).not.toBeNull();
});

const drittlizenzen = readFileSync('THIRD-PARTY-LICENSES', 'utf8');
const nurText = (inhalt: string) => inhalt.replace(/\s+/g, ' ').trim();

it('öffnet über das Menüereignis die Über-Ansicht mit Version, Lizenz, Hinweisen und Drittlizenzen', async () => {
  await act(async () => dom.root.render(<AppMitMenue />));
  expect(dom.host.querySelector('[data-overlay-aktiv]')).toBeNull();
  await act(async () => menue.listener.get('ueber-oeffnen')?.());
  const text = () => nurText(dom.host.textContent ?? '');
  await vi.waitFor(() => expect(text()).toContain('Version 1.2.3'));
  expect(text()).toContain('Copyright (C) 2026 LexLata');
  expect(text()).toContain('AGPL-3.0-or-later');
  expect(text()).toContain('github.com/LexLata/app');
  expect(text()).toContain('Ausgenommen sind Name und Logo sowie die nichtamtlichen Titel');
  expect(text()).toContain('Keine Rechtsberatung.');
  expect(text()).toContain('eckigen Klammern');
  expect(text()).toContain('Haftungsausschluss');

  const knopf = [...dom.host.querySelectorAll('button')].find(
    (el) => el.textContent === 'Drittlizenzen',
  );
  if (!knopf) throw new Error('Aufklappknopf fehlt');
  expect(knopf.getAttribute('aria-expanded')).toBe('false');
  expect(dom.host.querySelector('pre')).toBeNull();
  await act(async () => knopf.click());
  expect(knopf.getAttribute('aria-expanded')).toBe('true');
  await vi.waitFor(() =>
    expect(dom.host.querySelector('pre')?.textContent).toBe(schuetzeLeerzeichen(drittlizenzen)),
  );
  await act(async () => knopf.click());
  expect(dom.host.querySelector('pre')).toBeNull();
});
