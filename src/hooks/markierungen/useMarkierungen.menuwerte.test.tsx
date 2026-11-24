// @vitest-environment jsdom
// Prüft Markieren und Historienaktionen mit echtem Hook und Dateispeicher bis Tauri.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, createElement } from 'react';
import { assert, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { tabFuerTest, holeTabGesetzFuerTest } from '@/test/tabs/tabBestandFuerTest';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import { useMarkierungen } from './useMarkierungen';
const dom = domTestWurzel();
it('meldet Rückgängig und Wiederholen nach Markieren, Rückgängig und Wiederholen', async () => {
  nativeAttrappeZuruecksetzen();
  const bisher = io.invoke.getMockImplementation();
  assert(bisher);
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'pruefvorgang_registrieren') return 'vorgang';
    if (name.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    return bisher(name, args);
  });
  initialisiereMarkierungen();
  io.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  const gesetz = gesetzDarstellung({
    elemente: [{ typ: 'norm', data: normaleNorm({ id: 'n', xmlId: 'n1', bezeichnung: '§ 1' }) }],
  });
  let hook: ReturnType<typeof useMarkierungen> | undefined;
  function Probe() {
    hook = useMarkierungen({
      holeTabGesetz: holeTabGesetzFuerTest,
      tabsRef: { current: [tabFuerTest({ id: 'tab', gesetz })] },
      aktiverTabIdRef: { current: 'tab' },
      markierungenDeaktiviertRef: { current: false },
    });
    return createElement(
      'div',
      { 'data-xml-id': 'n1' },
      createElement('span', { 'data-leaf': '' }, 'Text'),
    );
  }
  document.body.append(dom.host);
  await act(async () => dom.root.render(createElement(Probe)));
  assert(hook);
  const markierungen = hook;
  const pruefeMenue = (undo: boolean, redo: boolean) => {
    expect(io.invoke).toHaveBeenCalledWith('menu_item_aktivieren', {
      id: 'markierung-rueckgaengig',
      aktiv: undo,
    });
    expect(io.invoke).toHaveBeenCalledWith('menu_item_aktivieren', {
      id: 'markierung-wiederholen',
      aktiv: redo,
    });
    io.invoke.mockClear();
  };
  try {
    pruefeMenue(false, false);
    const range = document.createRange();
    const text = dom.host.querySelector('span');
    const auswahl = window.getSelection();
    assert(text);
    assert(auswahl);
    range.selectNodeContents(text);
    auswahl.removeAllRanges();
    auswahl.addRange(range);
    await act(async () => markierungen.handleUnterstreichen());
    pruefeMenue(true, false);
    await act(async () => markierungen.handleMarkierungRueckgaengig());
    pruefeMenue(false, true);
    await act(async () => markierungen.handleMarkierungWiederholen());
    pruefeMenue(true, false);
  } finally {
    window.getSelection()?.removeAllRanges();
    dom.host.remove();
  }
});
