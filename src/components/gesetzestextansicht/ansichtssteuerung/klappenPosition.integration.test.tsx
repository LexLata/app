// @vitest-environment jsdom
// Klappstellen über die öffentliche Ansichtssteuerung mit gemeinsamer DOM-Geometrie.
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import {
  useTestVirtualizer,
  richteNavigationAnsichtEin,
  leistenProps,
  geometrie,
} from '@/test/gesetz/navigationAnsicht';
import { useAnsichtssteuerung, StrukturKontextLeiste } from './ansichtssteuerung.index';
const fixture = richteNavigationAnsichtEin(useAnsichtssteuerung, (ansicht) => (
  <StrukturKontextLeiste modell={ansicht.kontextLeiste} {...leistenProps} />
));
const { starten, container } = fixture;
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (o: Parameters<typeof useTestVirtualizer>[0]) => useTestVirtualizer(o),
}));
function position(id: string) {
  const index = fixture.ansicht.textListe.zeilen.find((z) => z.element.data.id === id)?.index;
  const block = container().querySelector(`[data-index="${index}"]`);
  if (!block) throw new Error('Zielblock fehlt');
  return block.getBoundingClientRect().top;
}
it('P2-A1/A3/A4: aktive Norm und danach ihre Elternüberschrift halten beim Klappen die Bildschirmstelle', async () => {
  await starten();
  await act(async () => fixture.ansicht.baum.onNormTextKlick('n5'));
  container().scrollTop = 400;
  const vorher = position('n5');
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  expect(position('n5')).toBeCloseTo(vorher, 1);
  await act(async () => fixture.ansicht.klappstufen.aufklappen());
  expect(position('n5')).toBeCloseTo(vorher, 1);
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  expect(fixture.ansicht.baum.aktivesElementId).toBe('u4');
  expect(position('u4')).toBeCloseTo(vorher, 1);
});

it('P2-A11: Messlauf restauriert die oberste sichtbare Lesestelle bei einer anderen sichtbaren aktiven Norm', async () => {
  await starten();
  await act(async () => fixture.ansicht.baum.onNormTextKlick('n2'));
  container().scrollTop = 40;
  Object.defineProperty(container(), 'scrollHeight', { configurable: true, value: 3000 });
  const ziel = fixture.ansicht.messziel;
  if (!ziel) throw new Error('Messlaufbedienung fehlt');
  let fertig = false;
  const lauf = ziel.fuehreDurch({ szenarien: ['S1'], wiederholungen: 1, dauerSekunden: 0.05 });
  void lauf.then(() => {
    fertig = true;
  });
  for (let bild = 0; bild < 500 && !fertig; bild++) {
    const aktuell = [...fixture.frames.values()];
    fixture.frames.clear();
    await act(async () => aktuell.forEach((fn) => fn(performance.now() + bild * 16)));
    await act(async () => vi.advanceTimersByTime(16));
  }
  expect(fertig).toBe(true);
  await lauf;
  expect(fixture.ansicht.baum.aktivesElementId).toBe('n2');
  expect(container().scrollTop).toBeCloseTo(40, 1);
});

it('P3-A1/A2/A6/A8: Zuklappen aus sichtbarem Normtext legt Norm und danach Elternüberschrift sofort unter die gemessene Leiste', async () => {
  geometrie.groesse = 400;
  geometrie.gesamt = 10000;
  await starten();
  await act(async () => fixture.ansicht.baum.onNormTextKlick('n5'));
  const normtextSichtbarMachen = () => {
    container().scrollTop += position('n5') + 60;
    const index = fixture.ansicht.textListe.zeilen.find((z) => z.element.data.id === 'n5')?.index;
    const block = container().querySelector(`[data-index="${index}"]`);
    if (!block) throw new Error('Normblock fehlt');
    const text = document.createElement('div');
    text.setAttribute('data-scroll-koerper', '');
    text.getBoundingClientRect = () => new DOMRect(0, 70, 800, 320);
    block.append(text);
  };
  normtextSichtbarMachen();
  geometrie.leiste = 120;
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  expect(position('n5')).toBeCloseTo(128, 1);
  await fixture.abwarten();
  expect(position('n5')).toBeCloseTo(128, 1);
  normtextSichtbarMachen();
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  expect(fixture.ansicht.baum.aktivesElementId).toBe('u4');
  expect(position('u4')).toBeCloseTo(8, 1);
  await fixture.abwarten();
  expect(position('u4')).toBeCloseTo(8, 1);
});
