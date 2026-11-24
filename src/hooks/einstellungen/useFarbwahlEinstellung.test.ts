// @vitest-environment jsdom
// useFarbwahlEinstellung.test.ts
// Die drei Einstellungshelfer schreiben nur CSS-Farbwahldaten und keinen sichtbaren Text.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppAkzentfarbe } from './useAppAkzentfarbe';
import { useHervorhebungsfarbe } from './useHervorhebungsfarbe';
import { useGesetzestextAkzentfarbe } from './useGesetzestextAkzentfarbe';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(() => vi.unstubAllGlobals());

it('spiegelt die drei Farbwahlwerte ausschließlich in ihre data-Attribute', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  let farben!: ReturnType<typeof useAppAkzentfarbe> &
    ReturnType<typeof useHervorhebungsfarbe> &
    ReturnType<typeof useGesetzestextAkzentfarbe>;
  function Einstellungen() {
    farben = {
      ...useAppAkzentfarbe(),
      ...useHervorhebungsfarbe(),
      ...useGesetzestextAkzentfarbe(),
    };
    return null;
  }
  const attribute = ['data-app-akzent', 'data-markierungsfarbe', 'data-gesetzestext-akzent'];
  const setzeAttribut = vi.spyOn(document.documentElement, 'setAttribute');
  try {
    await act(async () => root.render(createElement(Einstellungen)));
    expect(setzeAttribut.mock.calls).toEqual(attribute.map((name) => [name, 'blau']));
    setzeAttribut.mockClear();
    await act(async () => {
      farben.setAppAkzentfarbe('rot');
      farben.setHervorhebungsfarbe('gruen');
      farben.setGesetzestextAkzentfarbe('orange');
    });
    expect(setzeAttribut.mock.calls).toEqual([
      ['data-app-akzent', 'rot'],
      ['data-markierungsfarbe', 'gruen'],
      ['data-gesetzestext-akzent', 'orange'],
    ]);
    expect(host.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
    setzeAttribut.mockRestore();
    for (const name of attribute) document.documentElement.removeAttribute(name);
  }
});
