// @vitest-environment jsdom
// Sicherheitsgrenze: Über-Text und Drittlizenzen erscheinen nur als React-Text, nie als HTML.
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { UeberOverlay } from '@/components/overlays/overlays.index';

vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '<b>9.9.9</b>' }));
vi.mock('./ueber.md?raw', () => ({
  default:
    '# Über\n\n<!-- <script>window.angriff = true</script> -->\n\n`<img src=x onerror="window.angriff=true">`',
}));
vi.mock('@/../THIRD-PARTY-LICENSES?raw', () => ({
  default: '<script>window.angriff=true</script>\n# keine Überschrift\n**kein fett**',
}));
const dom = domTestWurzel();
it('gibt Markdown-HTML, Version und Drittlizenzen ausschließlich als Text aus', async () => {
  await act(async () => dom.root.render(<UeberOverlay onSchliessen={vi.fn()} />));
  await act(async () => dom.host.querySelector<HTMLButtonElement>('[aria-expanded]')?.click());
  await vi.waitFor(() => expect(dom.host.querySelector('pre')?.textContent).toContain('<script>'));
  expect(dom.host.querySelector('img, script, b')).toBeNull();
  expect(dom.host.querySelector('code')?.textContent).toBe(
    '<img src=x onerror="window.angriff=true">',
  );
  expect(dom.host.textContent).toContain('Version <b>9.9.9</b>');
  expect(dom.host.querySelector('pre')?.textContent).toContain(
    '# keine Überschrift\n**kein fett**',
  );
  expect(dom.host.querySelectorAll('h1')).toHaveLength(1);
  expect(dom.host.innerHTML).not.toContain('<!--');
  expect(Reflect.get(window, 'angriff')).toBeUndefined();
});
