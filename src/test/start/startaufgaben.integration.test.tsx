// @vitest-environment jsdom
// Fenstergetrennte Modulgraphen, echte Fachmodule; nur Tauri und Dateisystem sind ersetzt.
import { startaufgabenGrenze } from './startaufgabenNativeGrenze';
import { afterEach, expect, it, vi } from 'vitest';
const empfaenger: Array<{ abmelden: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(empfaenger.splice(0).map((e) => e.abmelden()));
});
function sperre() {
  const tor = { fertig: () => {} };
  const warten = new Promise<void>((resolve) => {
    tor.fertig = resolve;
  });
  return { warten, fertig: () => tor.fertig() };
}
const xml = (titel: string) =>
  `<gesetz><infos><kurztitel>${titel}</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>`;
const kurzbefehle =
  '<gesetzeskurzbefehle version="1"><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">Fehlt</gesetz><taste primaer="true">j</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>';
const kurzbefehlpfad = 'einstellungen/gesetzeskurzbefehle.xml';
function anmelden(
  start: Awaited<ReturnType<ReturnType<typeof startaufgabenGrenze>['kontext']>>['start'],
) {
  const e = start.empfangeAppStartAufgaben(() => {});
  empfaenger.push(e);
  return e;
}
it('führt bei zwei gleichzeitig startenden Fenstern die gemeinsamen Aufgaben nur einmal und Kurzbefehle zuletzt aus', async () => {
  const n = startaufgabenGrenze();
  n.dateien.set('gesetze/Probe_de-bund.xml', xml('Probe'));
  n.dateien.set(
    'resources/nichtamtliche-titel/de-bund/Probe.xml',
    '<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">Probe</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Probetitel</titel></norm></inhalt></nichtamtlicheTitel>',
  );
  n.dateien.set(kurzbefehlpfad, kurzbefehle);
  const a = await n.kontext('main');
  const b = await n.kontext('zweites');
  expect(a.persistenz.leseSuchverzeichnis).not.toBe(b.persistenz.leseSuchverzeichnis);
  expect(a.start.empfangeAppStartAufgaben).not.toBe(b.start.empfangeAppStartAufgaben);
  await Promise.all([anmelden(a.start).bereit, anmelden(b.start).bereit]);
  await vi.waitFor(() => expect(n.schritt, JSON.stringify(n.protokoll.slice(-12))).toBe(5));
  const abschluesse = n.protokoll.filter((p) => p.name === 'startaufgaben_abschliessen');
  expect(abschluesse.map((p) => p.schritt)).toEqual([0, 1, 2, 3, 4]);
  expect(new Set(abschluesse.map((p) => p.label)).size).toBe(1);
  expect(
    n.protokoll.filter(
      (p) => p.name === 'lesen' && p.pfad === 'resources/importindizes/de-bund.xml',
    ),
  ).toHaveLength(1);
  expect(
    n.protokoll.filter(
      (p) => p.name === 'lesen' && p.schritt === 1 && p.pfad === 'gesetze/Probe_de-bund.xml',
    ),
  ).toHaveLength(1);
  expect(
    n.protokoll.filter((p) => p.name === 'datei_sperre_erwerben' && p.pfad === kurzbefehlpfad),
  ).toHaveLength(1);
  expect(
    n.protokoll.filter(
      (p) => p.name === 'lesen' && p.pfad === 'resources/nichtamtliche-titel/de-bund/Probe.xml',
    ),
  ).toHaveLength(1);
  expect(n.dateien.get(kurzbefehlpfad)).not.toContain('Fehlt');
});
it.each([true, false])(
  'setzt beim Schließen des Besitzers den teilweisen Abgleich fort (anderes Fenster bereits offen: %s)',
  async (offen) => {
    const n = startaufgabenGrenze();
    n.dateien.set('gesetze/A_de-bund.xml', xml('A'));
    n.dateien.set('gesetze/B_de-bund.xml', xml('B'));
    const erreicht = sperre();
    const weiter = sperre();
    n.vorLesen((label, pfad) => {
      if (label === 'main' && pfad === 'gesetze/B_de-bund.xml') {
        erreicht.fertig();
        return weiter.warten;
      }
      return undefined;
    });
    const a = await n.kontext('main');
    const b = offen ? await n.kontext('zweites') : undefined;
    const e = anmelden(a.start);
    await e.bereit;
    if (b) await anmelden(b.start).bereit;
    await erreicht.warten;
    expect((await a.persistenz.leseSuchverzeichnis()).eintraege.map((g) => g.kurztitel)).toEqual([
      'A',
    ]);
    const alterAbschluss = e.abmelden();
    n.zerstoeren('main');
    if (!b) await anmelden((await n.kontext('neues')).start).bereit;
    try {
      await vi.waitFor(() => expect(n.schritt, JSON.stringify(n.protokoll.slice(-12))).toBe(5));
      const nachfolger = offen ? 'zweites' : 'neues';
      expect(
        n.protokoll.filter(
          (p) => p.label === nachfolger && p.name === 'lesen' && p.pfad === 'gesetze/A_de-bund.xml',
        ),
      ).toHaveLength(0);
      expect(
        n.protokoll.filter(
          (p) => p.label === nachfolger && p.name === 'lesen' && p.pfad === 'gesetze/B_de-bund.xml',
        ),
      ).toHaveLength(1);
      expect(
        n.protokoll.filter(
          (p) => p.label === nachfolger && p.pfad === 'resources/importindizes/de-bund.xml',
        ),
      ).toHaveLength(0);
    } finally {
      weiter.fertig();
      await alterAbschluss;
    }
  },
);
it('wartet vor der Kurzbefehlbereinigung auf den wirklichen Abschluss der strengen Markierungsprüfung', async () => {
  const n = startaufgabenGrenze();
  n.dateien.set(kurzbefehlpfad, kurzbefehle);
  const erreicht = sperre();
  const weiter = sperre();
  n.vorLesen((_label, pfad) => {
    if (n.schritt === 3 && pfad === 'markierungskonflikte.xml') {
      erreicht.fertig();
      return weiter.warten;
    }
    return undefined;
  });
  const a = await n.kontext('main');
  await anmelden(a.start).bereit;
  await erreicht.warten;
  expect((await a.persistenz.leseSuchverzeichnis()).abgeglichen).toBe(true);
  expect(n.dateien.get(kurzbefehlpfad)).toBe(kurzbefehle);
  expect(
    n.protokoll.some((p) => p.name === 'datei_sperre_erwerben' && p.pfad === kurzbefehlpfad),
  ).toBe(false);
  weiter.fertig();
  await vi.waitFor(() => expect(n.schritt, JSON.stringify(n.protokoll.slice(-12))).toBe(5));
  expect(n.dateien.get(kurzbefehlpfad)).not.toContain('Fehlt');
});
it.each([true, false])(
  'bestätigt einen technisch fehlgeschlagenen Abgleich nicht und setzt ihn nach Besitzerwechsel fort (anderes Fenster offen: %s)',
  async (offen) => {
    const n = startaufgabenGrenze();
    n.dateien.set(kurzbefehlpfad, kurzbefehle);
    let gesperrt = true;
    n.vorBefehl((_label, name) => {
      if (gesperrt && name === 'gesetz_dateistempel_lesen') throw new Error('Ordner gesperrt');
      return undefined;
    });
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const a = await n.kontext('main');
      const b = offen ? await n.kontext('zweites') : undefined;
      const e = anmelden(a.start);
      await e.bereit;
      if (b) await anmelden(b.start).bereit;
      await vi.waitFor(() =>
        expect(protokoll).toHaveBeenCalledWith(
          'App-Startaufgaben fehlgeschlagen:',
          expect.any(Error),
        ),
      );
      expect(n.schritt).toBe(1);
      expect(n.dateien.get(kurzbefehlpfad)).toBe(kurzbefehle);
      expect(
        n.protokoll.some((p) => p.name === 'datei_sperre_erwerben' && p.pfad === kurzbefehlpfad),
      ).toBe(false);
      gesperrt = false;
      await e.abmelden();
      n.zerstoeren('main');
      if (!b) await anmelden((await n.kontext('neues')).start).bereit;
      await vi.waitFor(() => expect(n.schritt).toBe(5));
      expect(
        n.protokoll.filter((p) => p.name === 'startaufgaben_abschliessen').map((p) => p.schritt),
      ).toEqual([0, 1, 2, 3, 4]);
      expect(n.dateien.get(kurzbefehlpfad)).not.toContain('Fehlt');
    } finally {
      protokoll.mockRestore();
    }
  },
);
it('legt Hintergrundtitel ohne XML-Laden an und zeigt sie danach im anderen bereits geladenen Fenster', async () => {
  const n = startaufgabenGrenze();
  for (const titel of ['A', 'B']) n.dateien.set(`gesetze/${titel}_de-bund.xml`, xml(titel));
  const a = await n.kontext('main');
  await a.persistenz.gleicheSuchverzeichnisAb();
  const b = await n.kontext('zweites');
  const bestand = b.laden.erzeugeGeladeneGesetze();
  try {
    await bestand.bereit;
    expect((await bestand.ladeGesetz({ kurztitel: 'B', normgeber: 'de-bund' })).status).toBe(
      'geladen',
    );
    for (const titel of ['A', 'B'])
      n.dateien.set(
        `resources/nichtamtliche-titel/de-bund/${titel}.xml`,
        `<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">${titel}</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Hintergrundtitel</titel></norm></inhalt></nichtamtlicheTitel>`,
      );
    const prueflesen = sperre();
    n.vorLesen((_label, pfad) =>
      pfad === 'gesetze/A_de-bund.xml' ? prueflesen.warten : undefined,
    );
    n.protokoll.length = 0;
    await anmelden(a.start).bereit;
    // Die unveränderte Markierungsprüfung darf unabhängig lesen. Der Titelabgleich
    // selbst muss abschließen können, obwohl deren Gesetzeslesen noch blockiert ist.
    try {
      await vi.waitFor(() => expect(n.schritt).toBeGreaterThanOrEqual(3));
      expect(n.dateien.has('nichtamtliche-titel/A_de-bund-nichtamtliche-titel.xml')).toBe(true);
    } finally {
      prueflesen.fertig();
    }
    await vi.waitFor(() => expect(n.schritt, JSON.stringify(n.protokoll.slice(-12))).toBe(5));
    expect(n.dateien.has('nichtamtliche-titel/A_de-bund-nichtamtliche-titel.xml')).toBe(true);
    await vi.waitFor(() => {
      const norm = bestand
        .holeGeladenes({ kurztitel: 'B', normgeber: 'de-bund' })
        ?.elemente.find((el) => el.typ === 'norm');
      expect(norm?.typ === 'norm' && norm.data.titel).toBe('Hintergrundtitel');
    });
  } finally {
    bestand.beenden();
  }
});
it.each([false, true])(
  'meldet das Hauptfenster erst nach dem echten Restore-Versuch für gemeinsame Aufgaben an (Anzeigefehler: %s)',
  async (fehler) => {
    const n = startaufgabenGrenze();
    const erreicht = sperre();
    const weiter = sperre();
    n.anzeigen(async () => {
      erreicht.fertig();
      await weiter.warten;
      if (fehler) throw new Error('Anzeigen gesperrt');
    });
    await n.kontext('main');
    const { act, createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useAppTabs } = await import('@/hooks/tabs/useAppTabs');
    const { useFensterRestore } = await import('@/hooks/fenster/useFensterRestore');
    const { useFensterstartInitialisierung } =
      await import('@/hooks/useFensterstartInitialisierung');
    function Fenster() {
      const tabs = useAppTabs();
      const fensterRestore = useFensterRestore(
        tabs.tabs,
        tabs.aktiverTabId,
        tabs.tabsRef,
        tabs.aktiverTabIdRef,
        tabs.verlaufLesen,
        tabs.verlaufSetzen,
        tabs.uebernehmeTabGesetz,
      );
      useFensterstartInitialisierung({
        ...tabs,
        // Dieser Start fordert keine Tabwiederöffnung an.
        tabWiederherstellen: () => {},
        fensterRestore,
        leseAppStartZiel: async () => null,
        oeffneTiefenLinkZiel: () => {},
      });
      return null;
    }
    const root = createRoot(document.createElement('div'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    try {
      await act(async () => root.render(createElement(Fenster)));
      await erreicht.warten;
      expect(n.protokoll.some((p) => p.name === 'startaufgaben_anmelden')).toBe(false);
      expect(n.protokoll.some((p) => p.pfad?.startsWith('resources/importindizes/'))).toBe(false);
      await act(async () => weiter.fertig());
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(n.schritt, JSON.stringify(n.protokoll.slice(-10))).toBe(5);
      });
    } finally {
      weiter.fertig();
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
it('beendet auch im anderen Fenster die Suchvorbereitung nach dem Abgleich eines leeren Bestands', async () => {
  const n = startaufgabenGrenze();
  const a = await n.kontext('main');
  await n.kontext('zweites');
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useSuchverzeichnis } = await import('@/hooks/useSuchverzeichnis');
  function Suche() {
    return createElement(
      'output',
      null,
      useSuchverzeichnis().wirdVorbereitet ? 'warten' : 'bereit',
    );
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  try {
    await act(async () => root.render(createElement(Suche)));
    expect(host.textContent).toBe('warten');
    await anmelden(a.start).bereit;
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(host.textContent).toBe('bereit');
    });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it('beendet die Importindex-Vorbereitung auch bei unlesbarer einzelner Bundle-Datei gemäß bestehendem Abgleichvertrag', async () => {
  const n = startaufgabenGrenze();
  const fehler = new Error('Startindizes unlesbar');
  n.vorLesen((_label, pfad) =>
    pfad === 'resources/importindizes/de-bund.xml' ? Promise.reject(fehler) : undefined,
  );
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const a = await n.kontext('main');
    const bereit = vi.fn();
    const fehlgeschlagen = vi.fn();
    const e = a.start.empfangeAppStartAufgaben(bereit, fehlgeschlagen);
    empfaenger.push(e);
    await e.bereit;
    await vi.waitFor(() => expect(n.schritt).toBe(5));
    expect(bereit).toHaveBeenCalled();
    expect(fehlgeschlagen).not.toHaveBeenCalled();
    expect(protokoll).toHaveBeenCalledWith(expect.stringContaining('de-bund'), fehler);
  } finally {
    protokoll.mockRestore();
  }
});
it.each(['A', 'B'])(
  'setzt nach einem Titelkopierfehler für %s die übrigen Titel und strenge Prüfung fort und meldet genau einmal',
  async (fehlerName) => {
    const n = startaufgabenGrenze();
    for (const name of ['A', 'B']) {
      n.dateien.set(`gesetze/${name}_de-bund.xml`, xml(name));
      n.dateien.set(
        `resources/nichtamtliche-titel/de-bund/${name}.xml`,
        `<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">${name}</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Titel ${name}</titel></norm></inhalt></nichtamtlicheTitel>`,
      );
    }
    n.vorBefehl((_label, name, pfad) =>
      name === 'atomar_datei_schreiben' &&
      pfad === `nichtamtliche-titel/${fehlerName}_de-bund-nichtamtliche-titel.xml`
        ? Promise.reject(new Error('Kopieren gesperrt'))
        : undefined,
    );
    const weiter = sperre();
    n.vorLesen((_label, pfad) =>
      n.schritt === 2 && pfad.startsWith('gesetze/') ? weiter.warten : undefined,
    );
    const a = await n.kontext('main');
    await anmelden(a.start).bereit;
    try {
      await vi.waitFor(() => expect(n.schritt).toBeGreaterThanOrEqual(3));
      expect(
        n.dateien.has(`nichtamtliche-titel/${fehlerName}_de-bund-nichtamtliche-titel.xml`),
      ).toBe(false);
      const anderer = fehlerName === 'A' ? 'B' : 'A';
      expect(
        n.dateien.get(`nichtamtliche-titel/${anderer}_de-bund-nichtamtliche-titel.xml`),
      ).toContain(`Titel ${anderer}`);
      expect(
        a.banner.getSnapshot().filter((b) => b.text.includes(`Titel für „${fehlerName}“`)),
      ).toHaveLength(1);
    } finally {
      weiter.fertig();
    }
    await vi.waitFor(() => expect(n.schritt).toBe(5));
    expect(n.protokoll.some((p) => p.schritt === 3 && p.name === 'pruefvorgang_abfragen')).toBe(
      true,
    );
  },
);
