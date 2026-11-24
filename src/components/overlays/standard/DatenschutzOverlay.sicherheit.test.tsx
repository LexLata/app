// @vitest-environment jsdom
// Sicherheitsgrenze: Kommentare verschwinden, HTML im Inline-Code bleibt React-Text.
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { DatenschutzOverlay } from '@/components/overlays/overlays.index';
import type { DatenschutzOverlayProps } from './DatenschutzOverlay';

vi.mock('@/../DATENSCHUTZ.md?raw', () => ({
  default:
    '# Hinweis\n\n<!-- <script>window.angriff = true</script> -->\n\n`<img src=x onerror="window.angriff=true">` und `<script>window.angriff=true</script>`\n\n**fett** und *kursiv* und _kursiv_ und `code_mit_unterstrich`\n\n- Fortsetzung\n  in der nächsten Zeile\n\n| Kopf | Zweite |\n| --- | --- |\n| `code` | **fett** |',
}));
const dom = domTestWurzel();
const props: DatenschutzOverlayProps = { onSchliessen: vi.fn() };
it('gibt HTML ausschließlich als sichtbaren Code aus und führt nichts aus', async () => {
  await act(async () => dom.root.render(<DatenschutzOverlay {...props} />));
  expect(dom.host.querySelector('img, script')).toBeNull();
  expect([...dom.host.querySelectorAll('code')].map((el) => el.textContent)).toEqual([
    '<img src=x onerror="window.angriff=true">',
    '<script>window.angriff=true</script>',
    'code_mit_unterstrich',
    'code',
  ]);
  expect(dom.host.innerHTML).not.toContain('<!--');
  expect(Reflect.get(window, 'angriff')).toBeUndefined();
});
it('stellt beide Kursivformen, Fett, Listenfortsetzung und Tabellenzellen semantisch dar', async () => {
  await act(async () => dom.root.render(<DatenschutzOverlay {...props} />));
  expect([...dom.host.querySelectorAll('em')].map((el) => el.textContent)).toEqual([
    'kursiv',
    'kursiv',
  ]);
  expect([...dom.host.querySelectorAll('strong')].map((el) => el.textContent)).toEqual([
    'fett',
    'fett',
  ]);
  expect(dom.host.querySelector('li')?.textContent).toBe('Fortsetzung in der nächsten Zeile');
  expect(dom.host.querySelector('th')?.getAttribute('scope')).toBe('col');
  expect(dom.host.querySelector('tbody td code')?.textContent).toBe('code');
});
