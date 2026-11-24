import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
// MetadatenTextanzeige.test.tsx
// Metadaten und Verlauf schützen Anzeigen und erhalten Daten, Aktionen und Vorschauprops.
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GesetzInfoOverlay } from './GesetzInfoOverlay';
import { ImportindexOverlay } from './ImportindexOverlay';
import { VerlaufOverlay } from './VerlaufOverlay';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

const { aktualisieren, wiederherstellen, vorschau } = vi.hoisted(() => ({
  aktualisieren: vi.fn(async () => undefined),
  wiederherstellen: vi.fn(async () => undefined),
  vorschau: vi.fn(),
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/components/overlays/OverlayRahmen', () => ({
  OverlayRahmen: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  OVERLAY_BREITE_NORMAL: 400,
  OVERLAY_BREITE_KOMPAKT: 300,
  OVERLAY_BREITE_GROSS: 600,
}));
vi.mock('@/lib/utils/datumFormat', () => ({
  formatDatumLang: () => 'Art. 1 Abs. 1',
  formatAusfertigung: () => 'Art. 1 Abs. 1',
}));
vi.mock('@/lib/import/import.index', () => ({
  importindexStatus: async () => ({ verarbeitungszeit: 'originaldatum', herkunft: 'selbst' }),
  istImportindexAktiv: () => false,
  aktualisiereImportindex: aktualisieren,
  stelleStandardWieder: wiederherstellen,
}));
vi.mock('@/components/gesetzestextansicht/gesetzestextansicht.index', () => ({
  AbsatzListe: (props: unknown) => {
    vorschau(props);
    return null;
  },
}));
const roh = 'Art. 1 Abs. 1';
const geschuetzt = 'Art.\u00a01 Abs.\u00a01';
let root: Root;
let verlaufBestand: ReturnType<typeof erzeugeGeladeneGesetze> | undefined;
let gesetz: GesetzDarstellung;
beforeEach(() => {
  vi.clearAllMocks();
  verlaufBestand = undefined;
  const { window } = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  nativeAttrappeZuruecksetzen();
  root = createRoot(document.querySelector('main')!);
  gesetz = gesetzDarstellung({
    kurztitel: 'BGB',
    langtitel: roh,
    fundstelle: roh,
    ausfertigung: '2026-10-09',
    neugefasst: roh,
    aenderungsvermerk: roh,
    datenquelle: { name: roh },
    verarbeitungszeit: new Date('2026-10-09'),
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm',
        data: normaleNorm({
          id: 'norm',
          xmlId: 'original-xml-id',
          bezeichnung: 'Art. 1',
          titel: roh,
          absaetze: [],
        }),
      },
    ],
  });
});
afterEach(async () => {
  verlaufBestand?.beenden();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
async function klicken(element: Element) {
  await act(async () => {
    element.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
}
it('schützt sämtliche Gesetzesmetadaten ohne Rückschreibung', async () => {
  const vorher = structuredClone(gesetz);
  await act(async () => root.render(<GesetzInfoOverlay gesetz={gesetz} onSchliessen={vi.fn()} />));
  const text = document.querySelector('main')!.textContent!;
  expect(text).toContain('Kurztitel');
  expect(text).not.toContain('Abkürzung');
  expect(text).not.toContain(roh);
  expect(text.split(geschuetzt)).toHaveLength(8);
  expect(document.querySelectorAll('span[style*="white-space:nowrap"]').length).toBeGreaterThan(0);
  expect(gesetz).toEqual(vorher);
});
it('schützt Indexdatum als vollständigen Metatext und erhält beide Aktionen', async () => {
  await act(async () => root.render(<ImportindexOverlay onSchliessen={vi.fn()} />));
  const text = document.querySelector('main')!.textContent!;
  expect(text).toContain('Importindizes aktualisieren');
  expect(text).toContain('Importindex Bundesrecht');
  expect(text).toContain('Importindex Landesrecht Baden-Württemberg');
  expect(text).toContain(`Selbst erstellt am ${geschuetzt}`);
  const buttons = [...document.querySelectorAll('button')];
  await klicken(buttons.find((el) => el.textContent === 'Aktualisieren')!);
  expect(aktualisieren).toHaveBeenCalledWith('de-bund');
  await klicken(buttons.filter((el) => el.textContent === 'Standard wiederherstellen')[1]!);
  expect(wiederherstellen).toHaveBeenCalledWith('de-bw');
});
it('schützt Verlaufkopf und reicht ausschließlich vereinbarte Vorschauprops unverändert weiter', async () => {
  const aktuellerBestand = erzeugeGeladeneGesetze();
  verlaufBestand = aktuellerBestand;
  aktuellerBestand.uebernehmeGeladenes(gesetz);
  const textDarstellung = {
    schriftgroesse: 19,
    silbentrennung: true,
    schriftart: 'serif' as const,
    zeilenabstand: 1.5,
    blocksatz: false,
    satzNeuZeile: false,
    title: roh,
    'aria-label': roh,
  };
  await act(async () =>
    root.render(
      <VerlaufOverlay
        textDarstellung={textDarstellung}
        ladeGesetz={aktuellerBestand.ladeGesetz}
        verlauf={{
          eintraege: [
            {
              gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
              xmlId: 'original-xml-id',
            },
          ],
          position: 0,
        }}
        onSchliessen={vi.fn()}
        onOeffnen={vi.fn()}
        onNeuenTabOeffnen={vi.fn()}
      />,
    ),
  );
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.body.textContent).toContain(`Art.\u00a01 BGB: ${geschuetzt}`);
  });
  const kopf = [...document.querySelectorAll('span')].find(
    (el) => el.textContent === `Art.\u00a01 BGB: ${geschuetzt}`,
  )!;
  expect(kopf).toBeDefined();
  await klicken(kopf.parentElement!);
  const norm = gesetz.elemente[0];
  if (!norm || norm.typ !== 'norm') throw new Error('Norm fehlt im Test');
  expect(vorschau).toHaveBeenCalledWith({
    schriftart: 'serif',
    zeilenabstand: 1.5,
    blocksatz: false,
    absaetze: norm.data.absaetze,
    schrift: 19,
    satzNeuZeile: false,
    sprache: undefined,
    silbentrennungAktiviert: true,
  });
  expect(textDarstellung.title).toBe(roh);
});
