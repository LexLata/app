import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
// Importanzeigen.test.tsx
// Anzeigegrenzen schützen zusammengehörende Normangaben und erhalten Importdaten;
// der Importbericht ist nach Kategorie und Aktion gegliedert (P1-A2/A3/A5/A8).
import { act, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { DateiImportOverlay } from './DateiImportOverlay';
import { AktualisierenOverlay } from './AktualisierenOverlay';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { textRollen } from '@/lib/stil/textRollen';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import type {
  BerichtEintrag,
  DateiImportErgebnis,
  ImportKonflikt,
} from '@/lib/import-export/import-export.index';

const api = vi.hoisted(() => ({ loesen: vi.fn() }));
vi.mock('@/components/overlays/OverlayRahmen', () => ({
  OVERLAY_BREITE_NORMAL: 500,
  OVERLAY_BREITE_GROSS: 560,
  OverlayRahmen: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('./OverlayKopfzeile', () => ({ OverlayKopfzeile: () => null }));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/lib/import-export/import-export.index', async (original) => ({
  loeseImportKonflikt: api.loesen,
  ermittleImportAktionen: () => ['ersetzen'],
  istReinerImportErfolg: () => false,
  gliedereImportbericht: (
    await original<typeof import('@/lib/import-export/import-export.index')>()
  ).gliedereImportbericht,
}));
const io = vi.hoisted(() => ({ lesen: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: io.lesen }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
import { importindexFixture } from '@/test/import/europaImportFixtures';
const h = domTestWurzel();
const roh = 'Art. 1 Abs. 1';
const geschuetzt = 'Art.\u00a01 Abs.\u00a01';
function button(text: string) {
  return Array.from(h.host.querySelectorAll('button')).find((el) => el.textContent === text)!;
}
beforeEach(() => {
  vi.clearAllMocks();
  io.invoke.mockResolvedValue(false);
  io.lesen.mockResolvedValue(
    importindexFixture(
      'de-bund',
      '<gesetz><kurztitel>Art. 1 Abs. 1</kurztitel><langtitel>Gesetz</langtitel><abrufkennung>test</abrufkennung></gesetz>',
    ),
  );
});

it('schützt Konfliktnamen, Kategoriebericht und Fehler; Konfliktauflösung erhält Originaldaten', async () => {
  const konflikt: ImportKonflikt = {
    art: 'favoriten',
    anzeigename: roh,
    kurztitel: roh,
    importInhalt: '<favoriten />',
  };
  api.loesen.mockResolvedValue({ kategorie: 'favoriten', name: roh, aktion: 'ersetzt' });
  await act(async () =>
    h.root.render(
      <DateiImportOverlay
        zustand={{
          art: 'fertig',
          ergebnis: {
            konflikte: [konflikt],
            berichtEintraege: [{ kategorie: 'gesetz', aktion: 'neu', name: roh }],
            fehler: [{ grund: 'unerwartet', datei: `${roh}.xml`, detail: 'Fehler' }],
          },
        }}
        onSchliessen={vi.fn()}
        onNeuLaden={vi.fn()}
      />,
    ),
  );
  expect(h.host.textContent).toContain(geschuetzt);
  expect(h.host.querySelector('[data-kategorie="gesetz"]')?.textContent).toContain(geschuetzt);
  expect(h.host.querySelector('[data-kategorie="fehler"]')?.textContent).toContain(
    // Satzform: das Detail steht in Klammern hinter dem Namen.
    `${geschuetzt}.xml (Fehler)`,
  );
  expect(h.host.querySelector('strong')!.textContent).toBe('Gesetze:');
  await act(async () => button('Ersetzen').click());
  expect(api.loesen).toHaveBeenCalledWith(konflikt, 'ersetzen', true);
  expect(konflikt.anzeigename).toBe(roh);
});

it('schützt Kandidaten und Fehler einschließlich Tooltip; Aktualisierung erhält die Originalreferenz', async () => {
  const gesetz: GesetzDarstellung = {
    normgeber: 'de-bund',
    kurztitel: roh,
    langtitel: roh,
    aenderungsvermerk: `Geändert: ${roh}`,
    elemente: [],
    hatGliederungsartikel: false,
  };
  await act(async () =>
    h.root.render(
      <AktualisierenOverlay
        gesetze={alsSuchverzeichniseintraege([gesetz])}
        onSchliessen={vi.fn()}
        onInfoAktualisiert={vi.fn()}
      />,
    ),
  );
  expect(h.host.textContent).toContain(geschuetzt);
  expect(h.host.textContent).toContain(`Geändert: ${geschuetzt}`);
  await act(async () => button('Aktualisieren').click());
  expect(io.invoke).toHaveBeenCalledWith('gesetz_import_sperre_versuchen_zu_erhalten', {
    kurztitel: JSON.stringify(['de-bund', roh.toLowerCase()]),
  });
  expect(h.host.querySelector('[title]')?.getAttribute('title')).toBe(
    `${geschuetzt} wird bereits an anderer Stelle aktualisiert.`,
  );
  expect(h.host.textContent).toContain(
    `✗ ${geschuetzt} wird bereits an anderer Stelle aktualisiert.`,
  );
  expect(gesetz.kurztitel).toBe(roh);
});

function vorhanden<T>(wert: T | null | undefined): T {
  if (wert === undefined || wert === null) throw new Error('Erwarteter Testwert fehlt.');
  return wert;
}
function gesetzEintrag(
  name: string,
  aktion: BerichtEintrag['aktion'],
  meldungen?: AktionsMeldung[],
) {
  const eintrag: BerichtEintrag = {
    kategorie: 'gesetz',
    aktion,
    name,
    quelle: `${name}-quelle.xml`,
  };
  return meldungen ? { ...eintrag, meldungen } : eintrag;
}
async function zeigeBericht(ergebnis: Partial<DateiImportErgebnis>) {
  await act(async () =>
    h.root.render(
      <DateiImportOverlay
        zustand={{
          art: 'fertig',
          ergebnis: { konflikte: [], berichtEintraege: [], fehler: [], ...ergebnis },
        }}
        onSchliessen={vi.fn()}
        onNeuLaden={vi.fn()}
      />,
    ),
  );
}
function kategorieText(schluessel: string) {
  return vorhanden(h.host.querySelector(`[data-kategorie="${schluessel}"]`)).textContent;
}

it('P1-A2: 3 neue und 2 unveränderte Gesetze in Satzform ohne Dateinamen', async () => {
  await zeigeBericht({
    berichtEintraege: [
      gesetzEintrag('AAG', 'neu'),
      gesetzEintrag('BGB', 'neu'),
      gesetzEintrag('StGB', 'neu'),
      gesetzEintrag('ZPO', 'unveraendert'),
      gesetzEintrag('GG', 'unveraendert'),
    ],
  });
  expect(h.host.querySelector('[data-gruppe]')).toBeNull();
  const text = kategorieText('gesetz');
  for (const name of ['AAG', 'BGB', 'StGB', 'ZPO', 'GG']) expect(text).toContain(name);
  expect(text).not.toContain('-quelle.xml');
});

it('P1-A3: 6 Einträge in Gliederungsform mit Gruppen, eingerückten Namen, Anzahl und allen Namen', async () => {
  const neu = ['A', 'B', 'C', 'D'];
  await zeigeBericht({
    berichtEintraege: [
      ...neu.map((n) => gesetzEintrag(n, 'neu')),
      gesetzEintrag('E', 'ersetzt'),
      gesetzEintrag('F', 'ersetzt'),
    ],
  });
  const kategorie = vorhanden(h.host.querySelector('[data-kategorie="gesetz"]'));
  const gruppen = Array.from(kategorie.querySelectorAll<HTMLElement>('[data-gruppe]'));
  expect(gruppen.map((g) => g.dataset.gruppe)).toEqual(['neu', 'ersetzt']);
  // Eine Kategorie mit mehreren Gruppen: Gruppen links, nur die Namen eingerückt.
  for (const g of gruppen) {
    const [kopf, namen] = Array.from(g.querySelectorAll<HTMLElement>('[data-zeile]'));
    expect(kopf?.dataset.einzug).toBe('0');
    expect(namen?.style.paddingLeft).toBe(textRollen.berichtGruppe.paddingLeft);
  }
  const [neuGruppe, ersetztGruppe] = gruppen.map((g) => g.textContent);
  expect(neuGruppe).toContain('(4)');
  for (const n of neu) expect(neuGruppe).toContain(n);
  expect(ersetztGruppe).toContain('(2)');
});

it('P1-A5: Konflikte erscheinen nicht im Bericht; nach Ersetzen steht der Eintrag unter Ersetzt', async () => {
  const konflikt: ImportKonflikt = {
    art: 'favoriten',
    anzeigename: 'KonfliktG',
    kurztitel: 'KonfliktG',
    importInhalt: '<favoriten />',
  };
  api.loesen.mockResolvedValue({ kategorie: 'favoriten', name: 'KonfliktG', aktion: 'ersetzt' });
  await zeigeBericht({ konflikte: [konflikt], berichtEintraege: [gesetzEintrag('BGB', 'neu')] });
  expect(h.host.querySelector('[data-kategorie="favoriten"]')).toBeNull();
  await act(async () => button('Ersetzen').click());
  // Zwei Einträge: Satzform; die Aktion „ersetzt“ steht im Satz der Kategorie.
  expect(kategorieText('favoriten')).toContain('KonfliktG ersetzt');
});

it('P1-A8: jede Meldung genau einmal im Bericht, kein Sammeltext', async () => {
  const meldung = (text: string): AktionsMeldung => ({
    text,
    typ: 'fehler',
    art: 'fehler',
    anlass: 'pruefabschluss',
    aenderungsstand: 'vollstaendig',
  });
  await zeigeBericht({
    berichtEintraege: [
      gesetzEintrag('BGB', 'neu', [meldung('Abgleich fehlgeschlagen X1')]),
      gesetzEintrag('StGB', 'neu', [meldung('Abgleich fehlgeschlagen X2')]),
    ],
  });
  const text = vorhanden(h.host.textContent);
  expect(text.split('Abgleich fehlgeschlagen X1')).toHaveLength(2);
  expect(text.split('Abgleich fehlgeschlagen X2')).toHaveLength(2);
});
