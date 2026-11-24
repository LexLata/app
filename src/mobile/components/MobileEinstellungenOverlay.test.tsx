// @vitest-environment jsdom
// MobileEinstellungenOverlay.test.tsx
// Prüft Zitatvorschau, Erklärtexte und unveränderte Einstellungs-Callbacks.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { MobileEinstellungenOverlay } from './MobileEinstellungenOverlay';
afterEach(() => vi.unstubAllGlobals());
it('zeigt die Vorschau ausdrücklich als Zitat und erhält mobile Werte und Ereignisse', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const aendern = vi.fn();
  const tastatur = vi.fn();
  const schliessen = vi.fn();
  const props = {
    schriftgroesse: 14,
    randInline: 12,
    seitenleistenGroesse: 180,
    customTastaturAktiv: false,
    onSchriftgroesseAendern: aendern,
    onRandInlineAendern: vi.fn(),
    onSeitenleistenGroesseAendern: vi.fn(),
    onCustomTastaturAktivAendern: tastatur,
    onSchliessen: schliessen,
  };
  // Ohne Formattermock: der Komponentenvertrag legt den Zitatmodus fest.
  const baum = MobileEinstellungenOverlay(props);
  const inhalt = baum.props.children[1].props.children;
  const vorschau = inhalt[1];
  expect(vorschau.type).toBe(TextAnzeige);
  expect(vorschau.props.modus).toBe('zitat');
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<MobileEinstellungenOverlay {...props} />));
    expect(host.querySelector('.gesetz-text')?.textContent).toBe(
      '§\u00a01 Beispieltext zur Vorschau der gewählten Schriftgröße.',
    );
    expect(host.textContent).toContain(
      'Zeigt eine an die deutsche Tastatur angelehnte Tastatur mit §-Sonderzeichen statt der System-Tastatur.',
    );
    expect(host.textContent).toContain('14 pt');
    const range = host.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '15');
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(aendern).toHaveBeenCalledWith(15);
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(tastatur).toHaveBeenCalledWith(true);
    await act(async () => host.querySelector('button')!.click());
    expect(schliessen).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
