// domTestWurzel.ts
// Gemeinsamer Lebenszyklus für React-Anzeigetests in der jsdom-Umgebung.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';

export function domTestWurzel() {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
  return {
    get host() {
      return host;
    },
    get root() {
      return root;
    },
  };
}
