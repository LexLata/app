// @vitest-environment jsdom
// Navigation über die öffentliche Ansichtssteuerung mit gemeinsamer DOM-Geometrie.
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import {
  geometrie,
  useTestVirtualizer,
  richteNavigationAnsichtEin,
  leistenProps,
} from '@/test/gesetz/navigationAnsicht';
import { useAnsichtssteuerung, StrukturKontextLeiste } from './ansichtssteuerung.index';
const fixture = richteNavigationAnsichtEin(useAnsichtssteuerung, (ansicht) => (
  <StrukturKontextLeiste modell={ansicht.kontextLeiste} {...leistenProps} />
));
const { starten, abwarten, container } = fixture;
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (o: Parameters<typeof useTestVirtualizer>[0]) => useTestVirtualizer(o),
}));
it('vollständig sichtbare Norm verändert weder Position noch einen abweichenden Kontextpfad', async () => {
  await starten();
  const vorher = fixture.ansicht.kontextLeiste.pfad;
  await act(async () => {
    container().scrollTop = 450;
    fixture.ansicht.springeZuXmlId('n5', 'sprung');
  });
  await abwarten();
  expect(container().scrollTop).toBe(450);
  expect(fixture.ansicht.kontextLeiste.pfad).toBe(vorher);
});
// Kurz abwärts zu n5 (Titel 540 bis 620): Der gemessene Titel von n6 endet bei 720, plus
// Vorschauabstand 0,25 × 16 = 4 -> 724; an der Fensterunterkante (400) -> 324.
it.each([
  ['kurz abwärts', 0, 'n5', 324],
  ['kurz aufwärts', 850, 'n7', 672],
  ['weit abwärts', 0, 'n15', 1472],
])('%s übernimmt Zielpfad und Landung erst gemeinsam', async (_fall, start, ziel, erwartet) => {
  await starten();
  const pfad = fixture.ansicht.kontextLeiste.pfad;
  await act(async () => {
    container().scrollTop = start;
    fixture.ansicht.springeZuXmlId(ziel, 'sprung');
  });
  expect(fixture.ansicht.kontextLeiste.pfad).toBe(pfad);
  await abwarten();
  expect(container().scrollTop).toBe(erwartet);
  expect(fixture.ansicht.kontextLeiste.pfad.at(-1)?.ueberschrift?.id).toBe(
    ziel === 'n5' ? undefined : ziel === 'n15' ? 'u10' : 'u4',
  );
});

it('Scrollabsicht beendet ausstehende Messung vor einer eigenen Bewegung', async () => {
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  await act(async () => container().dispatchEvent(new Event('wheel')));
  await abwarten();
  expect(container().scrollTop).toBe(0);
  expect(fixture.ansicht.kontextLeiste.messung).toBeUndefined();
});
it('ein früher Frame-Zeitstempel bewegt den Text vor der Abwärtsanimation nicht zurück', async () => {
  await starten();
  await act(async () => {
    container().scrollTop = 100;
    fixture.ansicht.springeZuXmlId('n5', 'sprung');
  });
  const aktuell = [...fixture.frames.values()];
  fixture.frames.clear();
  await act(async () => aktuell.forEach((fn) => fn(performance.now() - 100)));
  expect(container().scrollTop).toBeGreaterThanOrEqual(100);
  await abwarten();
  expect(container().scrollTop).toBe(324);
});
it.each([
  ['außerhalb der Textansicht', false, 'PageDown', {}, 1472],
  ['Leertaste auf einem Button', true, ' ', {}, 1472],
  ['Navigation mit Alt', true, 'ArrowDown', { altKey: true }, 1572],
  ['Navigation mit Control', true, 'ArrowDown', { ctrlKey: true }, 1872],
  ['Navigation mit Meta', true, 'ArrowDown', { metaKey: true }, 1872],
])('%s erhält den vorgesehenen Sprung', async (_fall, innen, key, modifier, erwartet) => {
  await starten();
  const button = document.createElement('button');
  (innen ? container() : fixture.host).append(button);
  button.focus();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  await act(async () =>
    button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifier })),
  );
  await abwarten();
  expect(container().scrollTop).toBe(erwartet);
});
it('PageDown mit Fokus in der Textansicht beendet den laufenden Sprung', async () => {
  await starten();
  container().tabIndex = 0;
  container().focus();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  await act(async () =>
    container().dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })),
  );
  await abwarten();
  expect(container().scrollTop).toBe(0);
  expect(fixture.ansicht.kontextLeiste.messung).toBeUndefined();
});
it('ein neuer Auftrag entwertet die alte Messantwort und deren Frist', async () => {
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  const alt = fixture.ansicht.kontextLeiste.messung;
  await act(async () => fixture.ansicht.springeZuXmlId('n7', 'sprung'));
  await act(async () => alt?.bestaetigen(900));
  await abwarten();
  // n7 endet bei 820; gemessener Titel von n8 endet bei 920, plus 4 -> 524.
  expect(container().scrollTop).toBe(524);
});
it('überlange Norm mit leerem Zielpfad wird am Anfang oben ausgerichtet', async () => {
  geometrie.groesse = 500;
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n1', 'sprung'));
  await abwarten();
  expect(container().scrollTop).toBe(532);
  expect(fixture.ansicht.kontextLeiste.pfad).toHaveLength(0);
});
it('die reale Scrollgrenze gewinnt auch gegen eine zu große Resthöhenschätzung', async () => {
  await starten();
  const container = fixture.ansicht.containerRef.current;
  if (!container) throw new Error('Textansicht fehlt');
  let top = 0;
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (wert: number) => {
      top = Math.max(0, Math.min(950, wert));
    },
  });
  const pfade: string[][] = [];
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  pfade.push(fixture.ansicht.kontextLeiste.pfad.map((e) => e.ueberschrift?.id ?? ''));
  await abwarten();
  pfade.push(fixture.ansicht.kontextLeiste.pfad.map((e) => e.ueberschrift?.id ?? ''));
  expect(top).toBe(950);
  expect(fixture.ansicht.kontextLeiste.pfad.at(-1)?.ueberschrift?.id).toBe('u4');
  expect(pfade.flat()).not.toContain('u10');
});
it('untere Ausrichtung braucht keine Zielpfadmessung', async () => {
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n5', 'sprung'));
  expect(fixture.ansicht.kontextLeiste.messung).toBeUndefined();
  await abwarten();
  expect(container().scrollTop).toBe(324);
});

it('bei knappem Platz wird eine nach Kontextwachstum überlange Abwärtsnorm oben ausgerichtet', async () => {
  geometrie.normHoehe = 380;
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n5', 'sprung'));
  await abwarten();
  expect(container().scrollTop).toBe(472);
});

it('sichtbare Norm erhält auch vorhandenes Polster nach ausstehenden Frames', async () => {
  await polsterVorbereiten();
  const hoehe = fixture.ansicht.kontextLeiste.effektiveHoehe;
  const pfad = fixture.ansicht.kontextLeiste.pfad;
  expect(hoehe).toBe(60);
  await act(async () => fixture.ansicht.springeZuXmlId('n1', 'sprung'));
  await abwarten();
  expect(container().scrollTop).toBe(0);
  expect(fixture.ansicht.kontextLeiste.pfad).toBe(pfad);
  expect(fixture.ansicht.kontextLeiste.effektiveHoehe).toBe(hoehe);
});
it('ein anderer gleich hoher Pfad braucht eine eigene aktuelle Bestätigung', async () => {
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  await abwarten();
  await act(async () => fixture.ansicht.springeZuXmlId('n7', 'sprung'));
  await abwarten();
  expect(container().scrollTop).toBe(672);
  expect(fixture.ansicht.kontextLeiste.pfad.at(-1)?.ueberschrift?.id).toBe('u4');
});
it('mehrzeilig gemessene Zielleiste bestimmt das obere Ziel', async () => {
  geometrie.leiste = 120;
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  await abwarten();
  expect(container().scrollTop).toBe(1412);
});
it('oberer Abstand bezieht sich auf sichtbaren Titeltext und bleibt nach normaler Nachführung erhalten', async () => {
  const neu = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = neu();
    range.getBoundingClientRect = () => {
      const node = range.commonAncestorContainer;
      const element = node instanceof Element ? node : node.parentElement;
      const rect = element?.getBoundingClientRect();
      return new DOMRect(0, (rect?.top ?? 0) + 20, 800, (rect?.height ?? 0) - 30);
    };
    return range;
  });
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  await abwarten();
  expect(container().scrollTop).toBe(1492);
  expect(fixture.ansicht.kontextLeiste.pfad.at(-1)?.ueberschrift?.id).toBe('u10');
  await act(async () => container().dispatchEvent(new Event('scroll')));
  await abwarten();
  expect(container().scrollTop).toBe(1492);
  expect(fixture.ansicht.kontextLeiste.pfad.at(-1)?.ueberschrift?.id).toBe('u10');
});

async function polsterVorbereiten() {
  await starten();
  await act(async () => {
    container().scrollTop = 650;
    container().dispatchEvent(new Event('scroll'));
  });
  await abwarten();
  await act(async () => {
    container().scrollTop = 0;
    container().dispatchEvent(new Event('scroll'));
  });
  await abwarten();
  expect(fixture.ansicht.kontextLeiste.pfad).toHaveLength(0);
  expect(fixture.ansicht.kontextLeiste.effektiveHoehe).toBe(60);
}
it('untere Landung entfernt altes Polster', async () => {
  await polsterVorbereiten();
  await act(async () => fixture.ansicht.springeZuXmlId('n3', 'sprung'));
  await abwarten();
  // Nächstes Element ist die Überschrift u4: gemessener Titel endet bei 520, plus 4 -> 124.
  expect(container().scrollTop).toBe(124);
  expect(fixture.ansicht.kontextLeiste.effektiveHoehe).toBe(0);
  expect(fixture.ansicht.kontextLeiste.hoeheAnimiert).toBe(false);
});
it('kurze Abwärtsnorm passt nach Wegfall des alten Polsters unten', async () => {
  await polsterVorbereiten();
  geometrie.normHoehe = 380;
  await act(async () => fixture.ansicht.springeZuXmlId('n3', 'sprung'));
  await abwarten();
  expect(container().scrollTop).toBe(320);
});

it.each([60, 120])(
  'erstmaliges Öffnen berücksichtigt die reale Zielleiste von %ipx',
  async (hoehe) => {
    geometrie.leiste = hoehe;
    await starten('n7');
    expect(fixture.ansicht.bereit).toBe(true);
    expect(fixture.ansicht.kontextLeiste.pfad.at(-1)?.ueberschrift?.id).toBe('u4');
    expect(container().querySelector('[data-index="7"]')?.getBoundingClientRect().top).toBe(
      hoehe + 8,
    );
    expect(container().scrollTop).toBe(732 - hoehe);
  },
);

it('erstmaliges Öffnen zeigt nach der Zielmessung die fertige Position ohne Zwischenbewegung', async () => {
  await starten('n7', false);
  const aktuell = [...fixture.frames.values()];
  fixture.frames.clear();
  await act(async () => aktuell.forEach((fn) => fn(performance.now())));
  expect(fixture.ansicht.bereit).toBe(true);
  expect(container().scrollTop).toBe(672);
  await abwarten();
  expect(container().scrollTop).toBe(672);
});

it('erstmaliges Öffnen lässt ein vollständig sichtbares Ziel ohne Kontext unverändert', async () => {
  await starten('n1', false);
  const vorher = container().scrollTop;
  await abwarten();
  expect(container().scrollTop).toBe(vorher);
  expect(fixture.ansicht.kontextLeiste.pfad).toHaveLength(0);
});

it('ein später vorgegebenes Ziel im geöffneten Gesetz behält die kurze Sprunganimation', async () => {
  const vorgeben = await starten('n7');
  expect(container().scrollTop).toBe(672);
  await vorgeben('n5');
  const aktuell = [...fixture.frames.values()];
  fixture.frames.clear();
  await act(async () => aktuell.forEach((fn) => fn(performance.now())));
  expect(container().scrollTop).toBe(672);
  await abwarten();
  expect(container().scrollTop).toBe(472);
});
