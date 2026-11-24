import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// Gesetzesuebersicht.test.tsx
// Drag&Drop-Registrierungen werden entfernt; Gesetzesnavigation erfolgt erst nach dem Schließen.
import { gesetzesreferenz, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { Gesetzesuebersicht } from './Gesetzesuebersicht';
import { gesetzesreferenzSchluessel, referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

const { registrieren, chips } = vi.hoisted(() => ({
  registrieren: vi.fn(),
  chips: new Map<
    string,
    {
      rowHovered: boolean;
      anyRecording: boolean;
      onRecordingStart: (schluessel: string) => void;
      onRecordingStop: (schluessel: string) => void;
    }
  >(),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: registrieren }),
}));
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => ({ istMac: false }) }));
vi.mock('@/hooks/stil/useRadiusRollen', () => ({ useRadiusRollen: () => ({}) }));
vi.mock('@/hooks/stil/useButtonRollen', () => ({
  useButtonRollen: () => ({ sekundaerKompakt: () => ({}) }),
}));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({ useAbstandRollen: () => ({}) }));
vi.mock('@/hooks/stil/useTextRollen', () => ({
  useTextRollen: () => ({}),
  useIconGroessen: () => ({}),
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/components/overlays/OverlayRahmen', () => ({
  OverlayRahmen: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  OVERLAY_BREITE_GROSS: 600,
}));
vi.mock('@/components/overlays/standard/Gesetzesuebersicht.kurzbefehlChip', () => ({
  KurzbefehlChip: (props: {
    schluessel: string;
    rowHovered: boolean;
    anyRecording: boolean;
    onRecordingStart: (schluessel: string) => void;
    onRecordingStop: (schluessel: string) => void;
  }) => {
    chips.set(props.schluessel, props);
    return null;
  },
}));
let root: Root;
const props = {
  gesetze: [] as GesetzDarstellung[],
  gesetzeskurzbefehle: {},
  onSchliessen: vi.fn(),
  onOeffnen: vi.fn(),
  onLoeschen: vi.fn(),
  onExportieren: vi.fn(),
  onExportAktionAnmelden: vi.fn(),
  onDateienAbgelegt: vi.fn(),
  onGesetzeskurzbefehleGeaendert: vi.fn(),
};
beforeEach(() => {
  registrieren.mockReset();
  chips.clear();
  const { window } = parseHTML('<html><body><div id="uebersicht"></div></body></html>');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  root = createRoot(document.getElementById('uebersicht')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
async function anzeigen(offen: boolean, neueProps = props) {
  await act(async () =>
    root.render(
      offen ? (
        <Gesetzesuebersicht
          {...neueProps}
          gesetze={alsSuchverzeichniseintraege(neueProps.gesetze)}
        />
      ) : null,
    ),
  );
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
it('benennt den leeren Gesetzesbestand auf dem Gerät', async () => {
  await anzeigen(true);
  expect(document.body.textContent).toContain('Noch keine Gesetze auf dem Gerät.');
  expect(
    [...document.querySelectorAll('button')]
      .filter((b) => /Öffnen|Exportieren|Löschen/.test(b.textContent ?? ''))
      .map((b) => b.textContent),
  ).toEqual(['Öffnen↵', 'ExportierenStrg+E', 'Löschen⌫']);
  expect(
    [...document.querySelectorAll('button')].filter((b) =>
      /Öffnen|Exportieren|Löschen/.test(b.textContent ?? ''),
    ),
  ).toHaveLength(3);
  expect(
    [...document.querySelectorAll('button')]
      .filter((b) => /Öffnen|Exportieren|Löschen/.test(b.textContent ?? ''))
      .every((b) => b.disabled),
  ).toBe(true);
});
describe('Lebensdauer des Drag&Drop-Listeners', () => {
  it('meldet eine normale Registrierung beim Schließen genau einmal ab', async () => {
    const abmelden = vi.fn();
    registrieren.mockResolvedValueOnce(abmelden);
    await anzeigen(true);
    expect(registrieren).toHaveBeenCalledOnce();
    expect(abmelden).not.toHaveBeenCalled();
    await anzeigen(false);
    expect(abmelden).toHaveBeenCalledOnce();
    await anzeigen(false);
    expect(abmelden).toHaveBeenCalledOnce();
  });
  it('meldet die erst nach dem Schließen abgeschlossene Registrierung sofort ab', async () => {
    let fertig!: (abmelden: () => void) => void;
    registrieren.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fertig = resolve;
        }),
    );
    await anzeigen(true);
    expect(registrieren).toHaveBeenCalledOnce();
    await anzeigen(false);
    const abmelden = vi.fn();
    await act(async () => {
      fertig(abmelden);
    });
    expect(abmelden).toHaveBeenCalledOnce();
    await anzeigen(false);
    expect(abmelden).toHaveBeenCalledOnce();
  });
  it('ordnet verspätete Abschlüsse nach erneutem Öffnen ihrer Sitzung zu', async () => {
    const abschluesse: Array<(abmelden: () => void) => void> = [];
    registrieren.mockImplementation(
      () =>
        new Promise((resolve) => {
          abschluesse.push(resolve);
        }),
    );
    await anzeigen(true);
    await anzeigen(false);
    await anzeigen(true);
    expect(registrieren).toHaveBeenCalledTimes(2);
    const altAbmelden = vi.fn();
    const neuAbmelden = vi.fn();
    await act(async () => {
      abschluesse[1]!(neuAbmelden);
    });
    await act(async () => {
      abschluesse[0]!(altAbmelden);
    });
    expect(altAbmelden).toHaveBeenCalledOnce();
    expect(neuAbmelden).not.toHaveBeenCalled();
    await anzeigen(false);
    expect(altAbmelden).toHaveBeenCalledOnce();
    expect(neuAbmelden).toHaveBeenCalledOnce();
  });
  it('räumt beim Wechsel der Importfunktion den alten Effekt auf', async () => {
    let fertig!: (abmelden: () => void) => void;
    const neuAbmelden = vi.fn();
    registrieren
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            fertig = resolve;
          }),
      )
      .mockResolvedValueOnce(neuAbmelden);
    await anzeigen(true);
    await anzeigen(true, { ...props, onDateienAbgelegt: vi.fn() });
    const altAbmelden = vi.fn();
    await act(async () => {
      fertig(altAbmelden);
    });
    expect(altAbmelden).toHaveBeenCalledOnce();
    expect(neuAbmelden).not.toHaveBeenCalled();
    await anzeigen(false);
    expect(neuAbmelden).toHaveBeenCalledOnce();
  });
});

it.each(['Enter', 'Doppelklick', 'Button'])('schließt vor dem Öffnen per %s', async (bedienung) => {
  const gesetz: GesetzDarstellung = gesetzDarstellung({
    kurztitel: 'BGB',
    langtitel: 'Bürgerliches Gesetzbuch',
    hatGliederungsartikel: false,
    elemente: [],
  });
  const ablauf: string[] = [];
  registrieren.mockResolvedValueOnce(vi.fn());
  await anzeigen(true, {
    ...props,
    gesetze: [gesetz],
    onSchliessen: vi.fn(() => {
      ablauf.push('schliessen');
    }),
    onOeffnen: vi.fn(() => {
      ablauf.push('oeffnen');
    }),
  });
  const zeile = [...document.querySelectorAll('div')].find(
    (element) => element.textContent === 'BGB',
  )!.parentElement!;
  await act(async () => {
    zeile.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
  await act(async () => {
    if (bedienung === 'Enter') {
      const ereignis = new window.Event('keydown', { bubbles: true });
      Object.defineProperty(ereignis, 'key', { value: 'Enter' });
      zeile.dispatchEvent(ereignis);
    } else if (bedienung === 'Button') {
      const button = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Öffnen'),
      );
      assert(button);
      button.click();
    } else {
      zeile.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
    }
  });
  expect(ablauf).toEqual(['schliessen', 'oeffnen']);
});

it('P3-A5: bleibt nach dem Ablegen von Dateien bedienbar und schließbar', async () => {
  const abgelegt = vi.fn();
  const schliessen = vi.fn();
  const oeffnen = vi.fn();
  registrieren.mockResolvedValue(vi.fn());
  await anzeigen(true, {
    ...props,
    gesetze: [
      gesetzDarstellung({
        kurztitel: 'BGB',
        langtitel: 'Bürgerliches Gesetzbuch',
        hatGliederungsartikel: false,
        elemente: [],
      }),
    ],
    onSchliessen: schliessen,
    onOeffnen: oeffnen,
    onDateienAbgelegt: abgelegt,
  });
  const zeile = [...document.querySelectorAll('div')].find(
    (el) => el.textContent === 'BGB',
  )!.parentElement!;
  await act(async () => {
    zeile.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
  await act(async () => {
    registrieren.mock.calls.at(-1)![0]({ payload: { type: 'drop', paths: ['/bgb.xml'] } });
  });
  expect(abgelegt).toHaveBeenCalledExactlyOnceWith(['/bgb.xml']);
  expect(document.body.textContent).not.toContain('Lädt …');
  expect([...document.querySelectorAll('button')].every((b) => !b.disabled)).toBe(true);
  await act(async () => {
    zeile.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  });
  expect(oeffnen).toHaveBeenCalledOnce();
  await act(async () => {
    document.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
  expect(schliessen).toHaveBeenCalledTimes(2);
  await anzeigen(false);
});

it('schützt Titel und öffnet das unveränderte Gesetz', async () => {
  const gesetz: GesetzDarstellung = gesetzDarstellung({
    kurztitel: '§ 12 BGB',
    langtitel: 'Titel zu Art. 3 GG',
    hatGliederungsartikel: false,
    elemente: [],
  });
  const oeffnen = vi.fn();
  registrieren.mockResolvedValueOnce(vi.fn());
  await anzeigen(true, {
    ...props,
    gesetze: [gesetz],
    onOeffnen: oeffnen,
  });
  expect(document.body.textContent).toContain('§\u00a012 BGB');
  expect(document.body.textContent).toContain('Art.\u00a03 GG');
  const titel = [...document.querySelectorAll('div')].find(
    (el) => el.textContent === '§\u00a012 BGB',
  )!;
  await act(async () =>
    titel.parentElement!.parentElement!.dispatchEvent(
      new window.Event('dblclick', { bubbles: true }),
    ),
  );
  expect(oeffnen).toHaveBeenCalledWith(referenzVon(gesetz));
  expect(gesetz.kurztitel).toBe('§ 12 BGB');
  expect(document.querySelector('input')!.getAttribute('placeholder')).toBe('Suchen …');
});

it.each([
  { kurztitel: 'BGB', normgeber: 'de-bund' },
  { kurztitel: 'BGB', normgeber: 'de-bw' },
  gesetzesreferenz({ kurztitel: 'Xyz' }),
])('behält Auswahl, Hover, Aufnahme und Aktionen für %j bei', async (referenz) => {
  // Reihenfolge der Anzeige: Kurztitel, dann Normgeber (Baden-Württemberg vor Bund).
  const gesetze = [
    { kurztitel: 'BGB', normgeber: 'de-bw' },
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    gesetzesreferenz({ kurztitel: 'Xyz' }),
  ].map((ref) => ({
    ...ref,

    langtitel: ref.normgeber ?? 'Ohne Normgeber',
    elemente: [],
    hatGliederungsartikel: false,
  }));
  const loeschen = vi.fn(async () => {});
  const exportieren = vi.fn(async () => {});
  const oeffnen = vi.fn();
  const testProps = {
    ...props,
    gesetze,
    onLoeschen: loeschen,
    onExportieren: exportieren,
    onOeffnen: oeffnen,
  };
  registrieren.mockResolvedValue(vi.fn());
  await anzeigen(true, testProps);
  const index = gesetze.findIndex(
    (g) => gesetzesreferenzSchluessel(g) === gesetzesreferenzSchluessel(referenz),
  );
  const zeilen = () =>
    [...document.querySelectorAll('div')].filter((el) => el.style.cursor === 'pointer');
  await act(async () => {
    zeilen()[index]!.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
  await act(async () => {
    zeilen()[index]!.dispatchEvent(new window.Event('mouseover', { bubbles: true }));
  });
  const schluessel = gesetzesreferenzSchluessel(referenz);
  expect(chips.get(schluessel)?.rowHovered).toBe(true);
  for (const [andererSchluessel, chip] of chips) {
    if (andererSchluessel !== schluessel) expect(chip.rowHovered).toBe(false);
  }
  await act(async () => {
    chips.get(schluessel)!.onRecordingStart(schluessel);
  });
  expect(
    [...document.querySelectorAll('button')]
      .filter((b) => /Öffnen|Exportieren|Löschen/.test(b.textContent ?? ''))
      .every((b) => b.disabled),
  ).toBe(true);
  const gesperrteExportAktion = props.onExportAktionAnmelden.mock.lastCall?.[0];
  assert(gesperrteExportAktion);
  gesperrteExportAktion();
  expect(exportieren).not.toHaveBeenCalled();
  for (const [andererSchluessel, chip] of chips)
    expect(chip.anyRecording).toBe(andererSchluessel !== schluessel);
  await act(async () => {
    chips.get(schluessel)!.onRecordingStop(schluessel);
  });
  // Eine neu geladene Schreibweise behält dieselbe Auswahl.
  const neueGesetze = gesetze.map((g) => ({
    ...g,
    kurztitel: g.kurztitel.toLowerCase(),
    normgeber: g.normgeber?.toLowerCase(),
  }));
  await anzeigen(true, { ...testProps, gesetze: neueGesetze });
  const taste = async (key: string, ctrlKey = false) => {
    await act(async () => {
      const e = new window.Event('keydown', { bubbles: true });
      Object.defineProperties(e, { key: { value: key }, ctrlKey: { value: ctrlKey } });
      zeilen()[index]!.dispatchEvent(e);
    });
  };
  const exportAktion = props.onExportAktionAnmelden.mock.lastCall?.[0];
  assert(exportAktion);
  exportAktion();
  expect(exportieren).toHaveBeenCalledExactlyOnceWith({
    kurztitel: referenz.kurztitel.toLowerCase(),
    normgeber: referenz.normgeber,
  });
  await taste('Enter');
  expect(oeffnen).toHaveBeenCalledExactlyOnceWith({
    kurztitel: referenz.kurztitel.toLowerCase(),
    normgeber: referenz.normgeber,
  });
  await taste('Delete');
  expect(loeschen).toHaveBeenCalledExactlyOnceWith(referenzVon(neueGesetze[index]!));
});

it('zeigt keine Importbuttons und behält Drag-and-drop als Importweg', async () => {
  registrieren.mockResolvedValueOnce(vi.fn());
  await anzeigen(true);
  const texte = [...document.querySelectorAll('button')].map((el) => el.textContent);
  expect(texte).not.toContain('+ Aus dem Internet');
  expect(texte).not.toContain('+ Aus Datei');
  expect(registrieren).toHaveBeenCalledOnce();
});

it('zeigt den Drop-Hinweis und übergibt abgelegte Pfade ohne eigene Import- oder Ladeanzeige', async () => {
  const abgelegt = vi.fn();
  registrieren.mockResolvedValueOnce(vi.fn());
  await anzeigen(true, { ...props, onDateienAbgelegt: abgelegt });
  const drop = (payload: object) => registrieren.mock.calls.at(-1)![0]({ payload });
  await act(async () => drop({ type: 'over' }));
  expect(document.body.textContent).toContain('Datei(en) hier loslassen zum Importieren …');
  await act(async () => drop({ type: 'drop', paths: ['/bgb.xml'] }));
  expect(abgelegt).toHaveBeenCalledExactlyOnceWith(['/bgb.xml']);
  expect(document.body.textContent).not.toContain('Datei(en) hier loslassen');
  expect(document.body.textContent).not.toContain('Lädt …');
  expect(document.body.textContent).not.toContain('importiert');
});

it('zeigt die Fußzeile dauerhaft und sperrt die Aktionen ohne gefilterte Auswahl', async () => {
  registrieren.mockResolvedValue(vi.fn());
  await anzeigen(true, {
    ...props,
    gesetze: [
      gesetzDarstellung({
        kurztitel: 'MKH',
        langtitel: 'Hauptgesetz',
        elemente: [],
        hatGliederungsartikel: false,
      }),
    ],
  });
  const fusszeile = () => {
    const element = [...document.querySelectorAll('div')].find(
      (el) => el.style.borderTop === '1px solid var(--rahmen)',
    );
    assert(element);
    return element;
  };
  expect(fusszeile()?.querySelectorAll('button')).toHaveLength(3);
  expect([...fusszeile().querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  const zeile = [...document.querySelectorAll('div')].find((el) => el.style.cursor === 'pointer')!;
  await act(async () => zeile.dispatchEvent(new window.Event('click', { bubbles: true })));
  expect(fusszeile()?.textContent).toContain('Exportieren');
  expect([...fusszeile().querySelectorAll('button')].every((b) => !b.disabled)).toBe(true);
  await anzeigen(true, { ...props, gesetze: [] });
  expect(fusszeile()?.querySelectorAll('button')).toHaveLength(3);
  expect([...fusszeile().querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
});

it('exportiert per Button ohne Schließen und leert die Auswahl erst nach erfolgreichem Löschen', async () => {
  const gesetz = gesetzDarstellung({ kurztitel: 'BGB' });
  const exportieren = vi.fn(async () => {});
  let fertig!: () => void;
  const loeschen = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        fertig = resolve;
      }),
  );
  const schliessen = vi.fn();
  registrieren.mockResolvedValue(vi.fn());
  await anzeigen(true, {
    ...props,
    gesetze: [gesetz],
    onExportieren: exportieren,
    onLoeschen: loeschen,
    onSchliessen: schliessen,
  });
  const zeile = [...document.querySelectorAll('div')].find((el) => el.style.cursor === 'pointer');
  assert(zeile);
  await act(async () => zeile.dispatchEvent(new window.Event('click', { bubbles: true })));
  const button = (text: string) => {
    const b = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
    assert(b);
    return b;
  };
  await act(async () => button('Exportieren').click());
  expect(exportieren).toHaveBeenCalledExactlyOnceWith(referenzVon(gesetz));
  expect(schliessen).not.toHaveBeenCalled();
  await act(async () => button('Löschen').click());
  expect(loeschen).toHaveBeenCalledExactlyOnceWith(referenzVon(gesetz));
  expect(button('Öffnen').disabled).toBe(false);
  await act(async () => fertig());
  expect(button('Öffnen').disabled).toBe(true);
  expect(button('Exportieren').disabled).toBe(true);
  expect(button('Löschen').disabled).toBe(true);
  expect(schliessen).not.toHaveBeenCalled();
});
