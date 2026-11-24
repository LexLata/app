import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
// OeffnenLinkvorbelegung und normaler aktiver Tab im tatsächlichen Overlay-Host.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppOverlayHost } from './OverlayHost';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import type { OeffnenOverlay } from '@/components/overlays/overlays.index';

type OeffnenOverlayProps = ComponentProps<typeof OeffnenOverlay>;

const probe = vi.hoisted(() => ({ props: null as OeffnenOverlayProps | null }));
vi.mock('@/components/overlays/overlays.index', async (original) => ({
  useVolltextSuchtext: (await original<typeof import('@/components/overlays/overlays.index')>())
    .useVolltextSuchtext,
  OeffnenOverlay: (props: OeffnenOverlayProps) => {
    probe.props = props;
    return <button onClick={props.onSchliessen}>Schließen</button>;
  },
  TastenkuerzelOverlay: ({ onSchliessen }: { onSchliessen: () => void }) => (
    <button onClick={onSchliessen}>Tastenkürzel</button>
  ),
  Gesetzesuebersicht: () => null,
  AktualisierenOverlay: () => null,
  GesetzInfoOverlay: () => null,
  VolltextSucheOverlay: () => null,
  FavoritenHinzufuegenOverlay: () => null,
  VerlaufOverlay: () => null,
  ExportOverlay: () => null,
  DateiImportOverlay: () => null,
  ImportindexOverlay: () => null,
}));
let root: Root;
let props: ComponentProps<typeof AppOverlayHost> & { gesetze: GesetzDarstellung[] };
beforeEach(() => {
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('window', dom.window);
  nativeAttrappeZuruecksetzen();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.querySelector('main')!);
  const gesetz = {
    kurztitel: 'X',
    normgeber: 'de-bund',
    langtitel: '',
    hatGliederungsartikel: false,
    elemente: [],
  };
  props = appOverlayHostFixture({
    aktivesOverlay: 'oeffnen',
    gesetze: [gesetz],
    aktivesGesetz: gesetz,
    aktiverTab: tabFuerTest({ id: 'tab', gesetz }),
    oeffnenOverlayInitial: {
      suchtext: '433 BGB',
      meldung: 'Importfehler',
      ohneAktivesGesetz: true,
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it('übernimmt zusammengehörigen Fehlerkontext, schließt und öffnet wieder im normalen Kontext', async () => {
  await act(async () => root.render(<AppOverlayHost {...props} />));
  expect(probe.props).toMatchObject({
    aktivesGesetz: null,
    initialInput: '433 BGB',
    initialMeldung: 'Importfehler',
  });
  await act(async () => document.querySelector('button')!.click());
  expect(props.onSchliessen).toHaveBeenCalledOnce();
  await act(async () => root.render(<AppOverlayHost {...props} aktivesOverlay={null} />));
  await act(async () => root.render(<AppOverlayHost {...props} oeffnenOverlayInitial="" />));
  expect(probe.props).toMatchObject({
    aktivesGesetz: props.aktivesGesetz,
    initialInput: '',
    initialMeldung: undefined,
  });
  probe.props!.onGesetzOeffnen(props.gesetze[0]!, 'p1');
  expect(props.elementOeffnen).toHaveBeenCalledWith({
    gesetz: props.gesetze[0],
    xmlId: 'p1',
    modus: 'aktiver-tab',
  });
});

it('zeigt das Tastenkürzel-Overlay und reicht Schließen weiter', async () => {
  await act(async () => root.render(<AppOverlayHost {...props} aktivesOverlay="tastenkuerzel" />));
  expect(document.querySelector('button')?.textContent).toBe('Tastenkürzel');
  await act(async () => document.querySelector('button')!.click());
  expect(props.onSchliessen).toHaveBeenCalledOnce();
});
