import { Gesetzesuebersicht } from './Gesetzesuebersicht';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
// Echte Oberfläche und Importauswahl; ausschließlich native Zugriffe sind ersetzt.
import { act } from 'react';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { AktualisierenOverlay } from './AktualisierenOverlay';
const io = vi.hoisted(() => ({ lesen: vi.fn(), invoke: vi.fn(), fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: io.lesen }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
const h = domTestWurzel();
const gesetz = (kurztitel: string) => gesetzDarstellung({ kurztitel, normgeber: 'de-bund' });
const index = importindexFixture(
  'de-bund',
  ['BGB', 'GG', 'Neu']
    .map(
      (titel) =>
        `<gesetz><kurztitel>${titel}</kurztitel><langtitel>Gesetz</langtitel><abrufkennung>${titel}</abrufkennung></gesetz>`,
    )
    .join(''),
);
const zeichne = async (gesetze: GesetzDarstellung[]) =>
  act(async () =>
    h.root.render(
      <AktualisierenOverlay
        gesetze={alsSuchverzeichniseintraege(gesetze)}
        onSchliessen={vi.fn()}
        onInfoAktualisiert={vi.fn()}
      />,
    ),
  );
const zeichneUebersicht = async (gesetze: GesetzDarstellung[]) =>
  act(async () =>
    h.root.render(
      <Gesetzesuebersicht
        gesetze={alsSuchverzeichniseintraege(gesetze)}
        gesetzeskurzbefehle={{}}
        onSchliessen={vi.fn()}
        onOeffnen={vi.fn()}
        onLoeschen={vi.fn()}
        onExportieren={vi.fn()}
        onExportAktionAnmelden={vi.fn()}
        onDateienAbgelegt={vi.fn()}
        onGesetzeskurzbefehleGeaendert={vi.fn()}
      />,
    ),
  );
const enter = async () =>
  act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });
const buttons = () => [...h.host.querySelectorAll('button')];
const start = () =>
  io.invoke.mock.calls.filter(([name]) => name === 'gesetz_import_sperre_versuchen_zu_erhalten');
function warten<T>() {
  let resolve!: (wert: T) => void;
  let reject!: (fehler: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.lesen.mockResolvedValue(index);
  io.invoke.mockImplementation(async (name: string) =>
    name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? true : null,
  );
  io.fetch.mockRejectedValue(new Error('Netz nicht verfügbar'));
});
it('zeigt nur indexierte Gesetze und den Pluralhinweis; Enter startet auch ausgeblendete Kandidaten', async () => {
  await zeichne([gesetz('BGB'), gesetz('GG'), gesetz('MKH'), gesetz('MKN')]);
  expect(h.host.textContent).toContain('BGB');
  expect(h.host.textContent).not.toContain('MKH');
  expect(h.host.textContent).toContain('2 Gesetze stehen nicht im Importindex');
  await enter();
  expect(start()).toHaveLength(2);
  expect(JSON.stringify(start())).not.toContain('mkh');
});
it('zeigt Singular und Leerzustand für einen fehlenden Eintrag und startet nichts', async () => {
  await zeichne([gesetz('MKH')]);
  expect(h.host.textContent).toContain('Keine Gesetze aus dem Internet importiert.');
  expect(h.host.textContent).toContain('1 Gesetz steht nicht im Importindex');
  await enter();
  expect(start()).toHaveLength(0);
});
it('zeigt ohne fehlende Einträge keinen Hinweis und startet über den Sammelbutton nur Kandidaten', async () => {
  await zeichne([gesetz('BGB')]);
  expect(h.host.textContent).not.toContain('stehen nicht im Importindex');
  await act(async () =>
    buttons()
      .find((b) => b.textContent === 'Alle aktualisieren')
      ?.click(),
  );
  expect(start()).toHaveLength(1);
});
it('zeigt bei unlesbarem Index den Fehler statt Liste und startet nichts', async () => {
  io.lesen.mockRejectedValue(new Error('defekt'));
  await zeichne([gesetz('BGB')]);
  expect(h.host.textContent).toContain(
    'Der Importindex konnte nicht gelesen werden. Gesetze lassen sich derzeit nicht aktualisieren.',
  );
  expect(buttons().some((b) => b.textContent === 'Alle aktualisieren')).toBe(false);
  await enter();
  expect(start()).toHaveLength(0);
});
it('zeigt beim ersten Ermitteln keinen Leerzustand und sperrt Enter', async () => {
  const offen = warten<string>();
  io.lesen.mockReturnValue(offen.promise);
  await zeichne([gesetz('BGB')]);
  expect(h.host.textContent).not.toContain('Keine Gesetze');
  await enter();
  expect(start()).toHaveLength(0);
  await act(async () => offen.resolve(index));
  expect(h.host.textContent).toContain('BGB');
});
it('behält bei neuer Menge die Liste, sperrt alle Auslöser und verwirft überholte Ergebnisse', async () => {
  await zeichne([gesetz('BGB')]);
  const alt = warten<string>();
  io.lesen.mockReturnValue(alt.promise);
  await zeichne([gesetz('BGB'), gesetz('GG')]);
  expect(h.host.textContent).toContain('BGB');
  expect(
    buttons()
      .filter((b) => ['Aktualisieren', 'Alle aktualisieren'].includes(b.textContent ?? ''))
      .every((b) => b.disabled),
  ).toBe(true);
  await enter();
  await act(async () =>
    buttons()
      .find((b) => b.textContent === 'Aktualisieren')
      ?.click(),
  );
  expect(start()).toHaveLength(0);
  io.lesen.mockResolvedValue(index);
  await zeichne([gesetz('Neu')]);
  expect(h.host.textContent).toContain('Neu');
  await act(async () => alt.resolve(index));
  expect(h.host.textContent).not.toContain('BGB');
  expect(h.host.textContent).toContain('Neu');
});
it('liest bei neuer Arrayinstanz, Reihenfolge und Prüfzeit nicht erneut und zeigt aktuelle Daten', async () => {
  await zeichne([gesetz('BGB'), gesetz('GG')]);
  const gelesen = io.lesen.mock.calls.length;
  await zeichne([
    { ...gesetz('GG'), verarbeitungszeit: new Date('2026-11-01') },
    { ...gesetz('BGB'), verarbeitungszeit: new Date('2026-11-02') },
  ]);
  expect(io.lesen).toHaveBeenCalledTimes(gelesen);
  expect(h.host.textContent).toContain('1.\u00a0November 2026');
});
it('hält eine laufende Einzelaktualisierung bei Bestandswechsel und Indexfehler sichtbar', async () => {
  await zeichne([gesetz('BGB')]);
  const sperre = warten<boolean>();
  io.invoke.mockImplementation(async (name: string) =>
    name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? sperre.promise : null,
  );
  await act(async () =>
    buttons()
      .find((b) => b.textContent === 'Aktualisieren')
      ?.click(),
  );
  io.lesen.mockRejectedValue(new Error('defekt'));
  await zeichne([gesetz('GG')]);
  expect(h.host.textContent).toContain('BGB');
  expect(h.host.textContent).toContain('Lädt …');
  await act(async () => sperre.resolve(false));
  expect(h.host.textContent).toContain('Der Importindex konnte nicht gelesen werden.');
});

it('fokussiert die Suche und filtert Kurz- und Langtitel; Enter aktualisiert auch ausgeblendete Gesetze', async () => {
  document.body.append(h.host);
  try {
    await zeichne([gesetz('BGB'), { ...gesetz('GG'), langtitel: 'Grundgesetz' }]);
    expect(document.activeElement).toBe(h.host.querySelector('input'));
    await act(async () => {
      const input = h.host.querySelector('input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'gRuNd',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(h.host.textContent).not.toContain('BGB');
    expect(h.host.textContent).toContain('GG');
    expect(h.host.textContent).toContain(
      '„Alle aktualisieren“ berücksichtigt auch ausgeblendete Gesetze.',
    );
    await enter();
    expect(
      io.invoke.mock.calls.filter(
        ([name]) => name === 'gesetz_import_sperre_versuchen_zu_erhalten',
      ),
    ).toHaveLength(2);
  } finally {
    h.host.remove();
  }
});
it('behält die laufende Sammelaktualisierung bei neuen Prüfzeiten ohne erneutes Indexlesen', async () => {
  await zeichne([gesetz('BGB'), gesetz('GG')]);
  const gelesen = io.lesen.mock.calls.length;
  const sperre = warten<boolean>();
  io.invoke.mockImplementation(async (name: string) =>
    name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? sperre.promise : null,
  );
  await act(async () =>
    buttons()
      .find((b) => b.textContent === 'Alle aktualisieren')
      ?.click(),
  );
  await zeichne([gesetz('GG'), { ...gesetz('BGB'), verarbeitungszeit: new Date('2026-11-02') }]);
  expect(io.lesen).toHaveBeenCalledTimes(gelesen);
  expect(h.host.textContent).toContain('BGB');
  expect(h.host.textContent).toContain('Lädt …');
  expect(h.host.textContent).toContain('2.\u00a0November 2026');
  await act(async () => sperre.resolve(false));
});
it('sperrt auch beim Zurückwechseln auf eine frühere Menge bis zum neuen Ergebnis', async () => {
  await zeichne([gesetz('BGB')]);
  const offen = warten<string>();
  io.lesen.mockReturnValue(offen.promise);
  await zeichne([gesetz('GG')]);
  await zeichne([gesetz('BGB')]);
  expect(buttons().find((b) => b.textContent === 'Alle aktualisieren')?.disabled).toBe(true);
  await enter();
  expect(start()).toHaveLength(0);
  await act(async () => offen.resolve(index));
  expect(buttons().find((b) => b.textContent === 'Alle aktualisieren')?.disabled).toBe(false);
});
it('behält die bisherige Liste auch wenn bei der Neuermittlung alle alten Gesetze entfallen', async () => {
  await zeichne([gesetz('BGB')]);
  const offen = warten<string>();
  io.lesen.mockReturnValue(offen.promise);
  await zeichne([gesetz('Neu')]);
  expect(h.host.textContent).toContain('BGB');
  expect(h.host.textContent).not.toContain('Keine Gesetze');
  await act(async () => offen.resolve(index));
  expect(h.host.textContent).toContain('Neu');
  expect(h.host.textContent).not.toContain('BGB');
});
it('ermittelt bei Normgeberwechsel neu und hält namensgleiche laufende Gesetze getrennt', async () => {
  io.lesen.mockImplementation(async (pfad: string) =>
    pfad.endsWith('de-bw.xml')
      ? importindexFixture(
          'de-bw',
          '<gesetz><kurztitel>BGB</kurztitel><langtitel>Gesetz</langtitel><abrufkennung>bgb</abrufkennung></gesetz>',
        )
      : index,
  );
  const bund = gesetz('BGB');
  const bw = { ...bund, normgeber: 'de-bw' };
  await zeichne([bund]);
  const gelesen = io.lesen.mock.calls.length;
  await zeichne([bw]);
  expect(io.lesen.mock.calls.length).toBeGreaterThan(gelesen);
  await zeichne([bund, bw]);
  const sperre = warten<boolean>();
  io.invoke.mockImplementation(async (name: string, args: { kurztitel?: string }) => {
    if (name !== 'gesetz_import_sperre_versuchen_zu_erhalten') return null;
    return args.kurztitel === JSON.stringify(['de-bw', 'bgb']) ? sperre.promise : false;
  });
  await act(async () =>
    buttons()
      .find((b) => b.textContent === 'Alle aktualisieren')
      ?.click(),
  );
  expect(start()).toHaveLength(2);
  expect(h.host.textContent).toContain('BGB wird bereits an anderer Stelle aktualisiert.');
  expect(h.host.textContent).toContain('Lädt …');
  expect(buttons().find((b) => b.textContent === 'Alle aktualisieren')?.disabled).toBe(true);
  await act(async () => sperre.resolve(false));
  expect(h.host.textContent).not.toContain('Lädt …');
});

async function filtereUnicodeTitel(form: 'NFC' | 'NFD', titel = 'AÜG') {
  await act(async () => {
    const input = h.host.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    assert(input);
    assert(setter);
    setter.call(input, titel.normalize(form));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it.each(['NFC', 'NFD'] as const)(
  'filtert Unicode-Kurztitel im Aktualisieren-Dialog (%s)',
  async (form) => {
    io.lesen.mockResolvedValue(index.replaceAll('BGB', 'AÜG'));
    await zeichne([gesetz('AÜG'), gesetz('GG')]);
    await filtereUnicodeTitel(form);
    expect(h.host.textContent).toContain('AÜG');
    expect(h.host.textContent).not.toContain('GG');
  },
);

it.each(['NFC', 'NFD'] as const)(
  'filtert Unicode-Kurztitel in der Gesetzesübersicht (%s)',
  async (form) => {
    await zeichneUebersicht([gesetz('AÜG'), gesetz('GG')]);
    await filtereUnicodeTitel(form);
    expect(h.host.textContent).toContain('AÜG');
    expect(h.host.textContent).not.toContain('GG');
  },
);

it.each(['NFC', 'NFD'] as const)(
  'filtert zerlegte Langtitel in beiden Listen und zeigt das Original (%s)',
  async (form) => {
    const langtitel = 'Ärztegesetz'.normalize('NFD');
    const gesetze = [{ ...gesetz('BGB'), langtitel }, gesetz('GG')];
    await zeichne(gesetze);
    await filtereUnicodeTitel(form, 'Ärztegesetz');
    expect.soft(h.host.textContent).toContain('BGB');
    expect(gesetze[0]?.langtitel).toBe(langtitel);
    expect(h.host.textContent).not.toContain('GG');
    await zeichneUebersicht(gesetze);
    await filtereUnicodeTitel(form, 'Ärztegesetz');
    expect(h.host.textContent).toContain('BGB');
    expect(h.host.textContent).toContain(langtitel);
    expect(h.host.textContent).not.toContain('GG');
  },
);

const reihenfolge = (titel: string[]) =>
  titel
    .map((t) => [t, h.host.textContent?.indexOf(t) ?? -1] as const)
    .sort(([, a], [, b]) => a - b)
    .map(([t]) => t);
describe('Reihenfolge und Sofortanzeige', () => {
  it('ordnet die Gesetzesübersicht nach Kurztitel und bei Gleichstand nach Normgeber', async () => {
    await zeichneUebersicht([
      gesetz('Zzzgesetz'),
      gesetz('aaagesetz'),
      { ...gesetz('Mmmgesetz'), normgeber: 'de-bund', langtitel: 'LangtitelB' },
      { ...gesetz('Mmmgesetz'), normgeber: 'de-bw', langtitel: 'LangtitelA' },
    ]);
    expect(reihenfolge(['aaagesetz', 'Mmmgesetz', 'Zzzgesetz'])).toEqual([
      'aaagesetz',
      'Mmmgesetz',
      'Zzzgesetz',
    ]);
    const text = h.host.textContent ?? '';
    expect(text.indexOf('LangtitelA')).toBeGreaterThan(-1);
    expect(text.indexOf('LangtitelA')).toBeLessThan(text.indexOf('LangtitelB'));
  });
  it('ordnet das Aktualisieren-Overlay nach Ermittlung alphabetisch', async () => {
    io.lesen.mockResolvedValue(
      importindexFixture(
        'de-bund',
        ['Zzzgesetz', 'aaagesetz', 'Mmmgesetz']
          .map(
            (t) =>
              `<gesetz><kurztitel>${t}</kurztitel><langtitel>Gesetz</langtitel><abrufkennung>${t}</abrufkennung></gesetz>`,
          )
          .join(''),
      ),
    );
    await zeichne([gesetz('Zzzgesetz'), gesetz('aaagesetz'), gesetz('Mmmgesetz')]);
    expect(reihenfolge(['aaagesetz', 'Mmmgesetz', 'Zzzgesetz'])).toEqual([
      'aaagesetz',
      'Mmmgesetz',
      'Zzzgesetz',
    ]);
  });
  it('zeigt vor dem Prüfergebnis sofort alle Gesetze mit Importindex-Normgeber, sortiert und gesperrt', async () => {
    const offen = warten<string>();
    io.lesen.mockReturnValue(offen.promise);
    await zeichne([
      gesetz('Zzzgesetz'),
      gesetz('aaagesetz'),
      { ...gesetz('Fremdgesetz'), normgeber: 'europarat' },
    ]);
    expect(reihenfolge(['aaagesetz', 'Zzzgesetz'])).toEqual(['aaagesetz', 'Zzzgesetz']);
    expect(h.host.textContent).not.toContain('Fremdgesetz');
    expect(buttons().find((b) => b.textContent === 'Alle aktualisieren')?.disabled).toBe(true);
    await enter();
    expect(start()).toHaveLength(0);
    await act(async () => offen.resolve(index));
  });
  it('entfernt nach dem Prüfergebnis Gesetze, die nicht im Importindex stehen', async () => {
    const offen = warten<string>();
    io.lesen.mockReturnValue(offen.promise);
    await zeichne([gesetz('BGB'), gesetz('Zzzgesetz')]);
    expect(h.host.textContent).toContain('Zzzgesetz');
    await act(async () => offen.resolve(index));
    expect(h.host.textContent).toContain('BGB');
    expect(h.host.textContent).not.toContain('Zzzgesetz');
    expect(h.host.textContent).toContain('1 Gesetz steht nicht im Importindex');
  });
  it('ersetzt die Sofortanzeige bei unlesbarem Importindex durch den Fehler', async () => {
    const offen = warten<string>();
    io.lesen.mockReturnValue(offen.promise);
    await zeichne([gesetz('BGB')]);
    expect(h.host.textContent).toContain('BGB');
    await act(async () => offen.reject(new Error('defekt')));
    expect(h.host.textContent).toContain('Der Importindex konnte nicht gelesen werden.');
    expect(h.host.textContent).not.toContain('BGB');
  });
});
