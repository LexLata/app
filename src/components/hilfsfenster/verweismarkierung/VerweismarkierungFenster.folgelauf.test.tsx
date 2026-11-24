// @vitest-environment jsdom
// Verweisformular: gemeinsame Folgelaufabnahme sowie Transport und Importübergabe.
import { warteAufMarkierungsAnzeige as warteAufAnzeige } from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { pruefeMarkierungsFensterFolgelauf } from '@/test/markierungen/markierungsFensterFolgelaufTestAufbau';
import { act } from 'react';
import { zipSync, strToU8 } from 'fflate';
import { beforeEach, expect, it, vi } from 'vitest';
import { importiereGesetzesreferenz } from '@/lib/import/import.index';

const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));
const {
  m,
  dom,
  feld,
  knopf,
  hinweise,
  starten,
  verzögerteFolge,
  markierungsSchreibaufrufe,
  warteTor,
  blockierePruefqueue,
} = pruefeMarkierungsFensterFolgelauf(
  true,
  async () => (await import('./VerweismarkierungFenster')).default,
);
const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
const prueftext =
  'Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden.';

it.each(['ausnahme', 'wartefrist'] as const)(
  'behält den gespeicherten Verweis bei Hinweisübergabe %s und wiederholt nur das Schließen',
  async (fehlerart) => {
    await starten();
    vi.useFakeTimers();
    const { tor, davor } = await verzögerteFolge();
    if (fehlerart === 'ausnahme') m.hinweise.mockRejectedValue(new Error('Hinweisannahme'));
    else m.hinweise.mockImplementation(() => new Promise(() => {}));
    m.close.mockRejectedValueOnce(new Error('Schließen'));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(hinweise()).toHaveLength(1);
    if (fehlerart === 'wartefrist') {
      expect(m.close).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(29_999));
      expect(m.close).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(1));
    }
    expect(m.close).toHaveBeenCalledOnce();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain('Das Fenster konnte nicht geschlossen werden.');
    });
    expect(dom.host.textContent).not.toContain(prueftext);
    expect(dom.host.textContent).not.toContain('konnte nicht gespeichert');
    await act(async () => knopf('Schließen').click());
    expect(m.close).toHaveBeenCalledTimes(2);
    expect(markierungsSchreibaufrufe()).toHaveLength(1);
    expect(m.historie.size).toBe(1);
    expect(hinweise()).toHaveLength(1);
    expect(m.banner).not.toHaveBeenCalled();
    await act(async () => {
      tor.freigeben();
      await davor;
    });
  },
);
it('erhält vorausgehende rohe Importbefunde im tatsächlichen Verweisabschluss mit registrierter Prüfkoordination', async () => {
  m.dateien.set(
    'importindizes/de-bund.xml',
    '<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>TestG</abrufkennung></gesetz></inhalt></importindex>',
  );
  netz.fetch.mockResolvedValue({
    ok: true,
    arrayBuffer: async () =>
      zipSync({
        'gesetz.xml': strToU8(
          '<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Text.</P></Content></text></textdaten></norm></dokumente>',
        ),
      }).buffer,
  });
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (name, args) => {
    if (name === 'import_aktualisierung_starten') return 'importvorgang';
    if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (name === 'gesetz_import_sperre_freigeben' || name === 'import_aktualisierung_beenden')
      return;
    return nativ(name, args);
  });
  await starten();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      feld(),
      '§ 1 TestG',
    );
    feld().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => knopf('Fertig').click());
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('ist nicht auf dem Gerät');
  });
  // Optionaler Ladefehler im ersten Importbestand: Der Importbutton übergibt
  // diesen Rohbefund an die folgende Speicherung, ohne ihn vorab lokal anzuzeigen.
  const lesen = m.lesen.getMockImplementation()!;
  let gelesen = false;
  m.lesen.mockImplementation(async (pfad) => {
    if (!gelesen && pfad.endsWith(titelPfad.replaceAll('BGB', 'TestG'))) {
      gelesen = true;
      throw Error('Erster Importbestand');
    }
    return lesen(pfad);
  });
  m.dateien.set(titelPfad.replaceAll('BGB', 'TestG'), '<defekt');
  await act(async () => knopf('Gesetz importieren').click());
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect(gelesen).toBe(true);
  const rohbefunde = hinweise().filter((h) => h.hinweis.text.includes('konnte nicht gelesen'));
  expect(rohbefunde).toHaveLength(1);
  expect(rohbefunde[0].hinweis.text).toContain('TestG wurde importiert.');
  expect(dom.host.textContent).not.toContain('konnte nicht gelesen');
  expect(m.close).toHaveBeenCalledOnce();
  expect(m.historie.size).toBe(1);
  expect(markierungsSchreibaufrufe()).toHaveLength(1);
  expect(m.banner).not.toHaveBeenCalled();
});

// Die native Titeldatei entsteht zwischen Existenzprüfung und Sperrerwerb durch
// einen anderen Schreiber. Ihr unveränderter Quellabschluss registriert die
// echte Vollprüfungsfolge, ohne die noch spätere Ereignis-/Batchstrecke zu ersetzen.
async function bereiteImportVor(gesetze = ['TestG'], aktualisieren = false) {
  await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
  let direktBeendet = warteTor();
  let beendet = 0;
  let aktualisierungsversuch = false;
  const sperren = new Map<string, Promise<void>>();
  const freigaben = new Map<string, () => void>();
  m.dateien.set(
    'importindizes/de-bund.xml',
    `<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt>${gesetze.map((titel) => `<gesetz><kurztitel>${titel}</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>${titel}</abrufkennung></gesetz>`).join('')}</inhalt></importindex>`,
  );
  netz.fetch.mockImplementation(async (url: string) => {
    const titel = gesetze.find((gesetz) => url.includes(gesetz.toLowerCase())) ?? gesetze[0]!;
    return {
      ok: true,
      arrayBuffer: async () =>
        zipSync({
          'gesetz.xml': strToU8(
            `<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>${titel}</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Text.</P></Content></text></textdaten></norm></dokumente>`,
          ),
        }).buffer,
    };
  });
  for (const titel of gesetze)
    m.dateien.set(
      `resources/nichtamtliche-titel/de-bund/${titel}.xml`,
      `<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">${titel}</gesetz></infos><inhalt/></nichtamtlicheTitel>`,
    );
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (name, args) => {
    if (name === 'import_aktualisierung_starten') {
      if (aktualisierungsversuch)
        m.dateien.delete('nichtamtliche-titel/TestG_de-bund-nichtamtliche-titel.xml');
      return 'importvorgang';
    }
    if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (name === 'import_aktualisierung_beenden') return;
    if (name === 'gesetz_import_sperre_freigeben') {
      if (++beendet === gesetze.length) direktBeendet.freigeben();
      return;
    }
    if (name === 'datei_sperre_freigeben') {
      freigaben.get(args.token)?.();
      freigaben.delete(args.token);
      return;
    }
    if (name === 'datei_sperre_erwerben') {
      const davor = sperren.get(args.relativerPfad);
      let freigeben!: () => void;
      sperren.set(
        args.relativerPfad,
        new Promise<void>((resolve) => {
          freigeben = resolve;
        }),
      );
      await davor;
      freigaben.set(args.relativerPfad, freigeben);
    }
    if (
      name === 'datei_sperre_erwerben' &&
      gesetze.some(
        (titel) =>
          args.relativerPfad === `nichtamtliche-titel/${titel}_de-bund-nichtamtliche-titel.xml`,
      )
    )
      m.dateien.set(
        args.relativerPfad,
        `<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">${gesetze.find((titel) => args.relativerPfad.includes(`${titel}_`))!}</gesetz></infos><inhalt/></nichtamtlicheTitel>`,
      );
    return nativ(name, args);
  });
  if (aktualisieren) {
    expect(
      await importiereGesetzesreferenz(
        { kurztitel: 'TestG', normgeber: 'de-bund' },
        undefined,
        () => {},
      ),
    ).toMatchObject({ art: 'erfolg' });
    await (await import('@/lib/markierungen/markierungen.index')).pruefeAlleMarkierungen(() => {});
    // Für den Aktualisierungsversuch entsteht die Titeldatei wieder erst unter
    // der Sperre; dessen Quellabschluss registriert eine eigene echte Folge.
    m.dateien.delete('nichtamtliche-titel/TestG_de-bund-nichtamtliche-titel.xml');
    direktBeendet = warteTor();
    beendet = 0;
    m.invoke.mockClear();
  }
  await starten();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      feld(),
      gesetze.map((titel) => `§ ${aktualisieren ? '999' : '1'} ${titel}`).join(', '),
    );
    feld().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => knopf('Fertig').click());
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      aktualisieren ? 'existiert nicht in TestG' : 'ist nicht auf dem Gerät',
    );
  });
  aktualisierungsversuch = aktualisieren;
  return async () =>
    act(async () => {
      knopf(
        aktualisieren
          ? 'Gesetz aktualisieren'
          : gesetze.length > 1
            ? 'Gesetze importieren'
            : 'Gesetz importieren',
      ).click();
      await direktBeendet.warten;
    });
}

beforeEach(() => {
  netz.fetch.mockReset();
});

it('wartet im Importformular auf späte gesetzesbezogene Befunde und native Annahme vor der Verweisspeicherung', async () => {
  const importieren = await bereiteImportVor();
  vi.useFakeTimers();
  const { tor, davor } = await blockierePruefqueue();
  await importieren();
  expect(m.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', expect.anything());
  expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
  expect(markierungsSchreibaufrufe()).toHaveLength(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(feld().disabled).toBe(true);
  // Der Prüfstand bleibt auch nach der automatischen Wiederholung ungesichert.
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (name, args) => {
    if (name === 'atomar_datei_schreiben' && args.relativerPfad === 'markierungskonflikte.xml')
      throw Error('Später Importprüfstand');
    return nativ(name, args);
  });
  const annahme = warteTor();
  m.hinweise.mockImplementation(() => annahme.warten);
  await act(async () => {
    tor.freigeben();
    await davor;
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(hinweise().some((h) => h.hinweis.text.startsWith('TestG wurde importiert.'))).toBe(true);
  expect(markierungsSchreibaufrufe()).toHaveLength(0);
  expect(m.close).not.toHaveBeenCalled();
  // Nach Annahme ist die Folgeaktion weiterhin genau die bisherige Speicherung.
  m.invoke.mockImplementation(nativ);
  await act(async () => {
    annahme.freigeben();
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(markierungsSchreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(1);
  expect(m.close).toHaveBeenCalledOnce();
  expect(m.banner).not.toHaveBeenCalled();
});

it('bewahrt identische späte Änderungsbefunde paralleler Importgesetze getrennt', async () => {
  const importieren = await bereiteImportVor(['TestG', 'AnderG']);
  vi.useFakeTimers();
  const { tor, davor } = await blockierePruefqueue();
  await importieren();
  expect(m.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', expect.anything());
  expect(markierungsSchreibaufrufe()).toHaveLength(0);
  expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
  expect(m.dateien.has('gesetze/AnderG_de-bund.xml')).toBe(true);
  const befundeVerarbeitet = warteTor();
  const nativ = m.invoke.getMockImplementation()!;
  let fehlerOffen = 2;
  m.invoke.mockImplementation(async (name, args) => {
    if (
      fehlerOffen > 0 &&
      name === 'datei_sperre_erwerben' &&
      args.relativerPfad === 'markierungskonflikte.xml'
    ) {
      fehlerOffen--;
      throw Error('Gleiche späte Prüfsperre');
    }
    if (
      name === 'atomar_datei_schreiben' &&
      args.relativerPfad === 'markierungen/BGB_de-bund-markierungen.xml'
    )
      befundeVerarbeitet.freigeben();
    return nativ(name, args);
  });
  await act(async () => {
    tor.freigeben();
    await davor;
    await vi.advanceTimersByTimeAsync(200);
    // Das Formular beginnt die anschließende Verweisspeicherung erst nach
    // sämtlichen Importfolgen und deren angenommener Hinweisübergabe.
    await befundeVerarbeitet.warten;
  });
  const importHinweise = hinweise().filter((h) =>
    h.hinweis.text.includes(
      'Das Gesetz wurde gespeichert. Beim Ergänzen der nichtamtlichen Titel: Die Dateisperre',
    ),
  );
  expect(hinweise().map((h) => h.hinweis.text)).toEqual([expect.any(String), expect.any(String)]);
  expect(importHinweise).toHaveLength(2);
  expect(importHinweise[0].hinweis.text).toBe(importHinweise[1].hinweis.text);
  expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
  expect(m.dateien.has('gesetze/AnderG_de-bund.xml')).toBe(true);
  m.invoke.mockImplementation(nativ);
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(m.banner).not.toHaveBeenCalled();
});

it('wertet eine Importfolgelauffrist neutral aus und bricht die Prüfqueue nicht ab', async () => {
  const importieren = await bereiteImportVor();
  vi.useFakeTimers();
  const { tor, davor } = await blockierePruefqueue();
  await importieren();
  expect(m.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', expect.anything());
  expect(markierungsSchreibaufrufe()).toHaveLength(0);
  await act(async () => vi.advanceTimersByTimeAsync(29_999));
  expect(markierungsSchreibaufrufe()).toHaveLength(0);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(hinweise()).toHaveLength(0);
  expect(markierungsSchreibaufrufe()).toHaveLength(1);
  expect(m.close).not.toHaveBeenCalled();
  // Die anschließende Verweisspeicherung wartet jetzt auch auf ihren eigenen
  // Ereignisfolgelauf; dessen eigenständige Frist bestätigt keinen Prüferfolg.
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(hinweise().map((h) => h.hinweis.text)).toEqual([
    expect.stringContaining('Der Verweis wurde gespeichert.'),
  ]);
  expect(hinweise()[0].hinweis.text).toContain('Der Verweis wurde gespeichert.');
  expect(hinweise()[0].hinweis.text).toContain('nicht zuverlässig abgeschlossen');
  expect(hinweise()[0].hinweis.text).not.toContain('Quelldatei wurde geändert');
  expect(markierungsSchreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(1);
  expect(m.close).toHaveBeenCalledOnce();
  await act(async () => {
    tor.freigeben();
    await davor;
  });
  expect(m.dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="aktuell"');
  expect(hinweise()).toHaveLength(1);
  expect(m.banner).not.toHaveBeenCalled();
});

it('beendet einen erfolglosen Import ohne fremde Titelprüfung oder Änderungsbehauptung lokal', async () => {
  const importieren = await bereiteImportVor();
  vi.useFakeTimers();
  const { tor, davor } = await blockierePruefqueue();
  m.dateien.set(titelPfad, '<defekt');
  netz.fetch.mockResolvedValue({ ok: false, status: 503 });
  await importieren();
  expect(m.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', expect.anything());
  expect(feld().disabled).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('nicht von gesetze-im-internet.de heruntergeladen');
  });
  expect(dom.host.textContent).not.toContain('wurde importiert');
  expect(dom.host.textContent).not.toContain('wurde gespeichert');
  expect(dom.host.textContent).not.toContain('Quelldatei wurde geändert');
  expect(hinweise()).toHaveLength(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(markierungsSchreibaufrufe()).toHaveLength(0);
  expect(m.historie.size).toBe(0);
  expect(feld().value).toBe('§ 1 TestG');
  expect(feld().disabled).toBe(false);
  await act(async () => {
    tor.freigeben();
    await davor;
  });
  expect(m.dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="aktuell"');
  expect(hinweise()).toHaveLength(0);
  expect(m.banner).not.toHaveBeenCalled();
});

// Der Fehler wird erst nach dem direkten Importabschluss in die registrierte
// Prüfqueue eingebracht. Weder Aktionskern noch Einzelabschluss werden ersetzt.
function verweigereSpaetenPruefstand(nativerAbschluss = false) {
  const nativ = m.invoke.getMockImplementation()!;
  let ausstehend = true;
  m.invoke.mockImplementation(async (name, args) => {
    if (
      nativerAbschluss
        ? name === 'pruefvorgang_vollpruefung_abschliessen'
        : name === 'atomar_datei_schreiben' && args.relativerPfad === 'markierungskonflikte.xml'
    ) {
      ausstehend = false;
      throw Error('Später Importprüfstand der Gesamtabnahme');
    }
    return nativ(name, args);
  });
  return () => expect(ausstehend).toBe(false);
}
function pruefeOffenenImportabschluss(zitat: string) {
  expect(feld().value).toBe(zitat);
  expect(feld().disabled).toBe(false);
  expect(m.close).not.toHaveBeenCalled();
  expect(markierungsSchreibaufrufe()).toHaveLength(0);
  expect(m.historie.size).toBe(0);
  expect(m.banner).not.toHaveBeenCalled();
  expect(hinweise().some((h) => h.hinweis.text.includes('Verweis wurde gespeichert'))).toBe(false);
}

it('trennt nach eigener Importfolge den erfolgreichen Teilimport vom gescheiterten Einzelimport', async () => {
  const importieren = await bereiteImportVor(['TestG', 'AnderG']);
  const laden = netz.fetch.getMockImplementation()!;
  netz.fetch.mockImplementation((url: string) =>
    url.toLowerCase().includes('anderg') ? { ok: false, status: 503 } : laden(url),
  );
  vi.useFakeTimers();
  const { tor, davor } = await blockierePruefqueue();
  await importieren();
  expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
  expect(m.dateien.has('gesetze/AnderG_de-bund.xml')).toBe(false);
  expect(feld().disabled).toBe(true);
  const pruefeSpaetenFehler = verweigereSpaetenPruefstand();
  await act(async () => {
    tor.freigeben();
    await davor;
    await vi.advanceTimersByTimeAsync(200);
  });
  pruefeSpaetenFehler();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('AnderG');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('nicht von gesetze-im-internet.de heruntergeladen');
  });
  const texte = hinweise().map((h) => h.hinweis.text);
  expect(texte.some((text) => text.startsWith('TestG wurde importiert.'))).toBe(true);
  expect(texte.some((text) => text.includes('AnderG wurde importiert'))).toBe(false);
  pruefeOffenenImportabschluss('§ 1 TestG, § 1 AnderG');
});

it('nennt nach unveränderter Aktualisierung und eigener Folge ausschließlich die Prüfzeitpunktauffrischung', async () => {
  const importieren = await bereiteImportVor(['TestG'], true);
  vi.useFakeTimers();
  const { tor, davor } = await blockierePruefqueue();
  await importieren();
  const pruefeSpaetenFehler = verweigereSpaetenPruefstand();
  await act(async () => {
    tor.freigeben();
    await davor;
    await vi.advanceTimersByTimeAsync(200);
  });
  pruefeSpaetenFehler();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Keine Neuerungen.');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('§\u00a0999 existiert nicht in TestG.');
  });
  expect(hinweise().map((h) => h.hinweis.text)).toContainEqual(
    expect.stringContaining(
      'TestG ist inhaltlich unverändert; der Prüfzeitpunkt wurde aktualisiert.',
    ),
  );
  expect(hinweise().some((h) => h.hinweis.text.includes('TestG wurde importiert'))).toBe(false);
  const geschrieben = m.invoke.mock.calls.filter(
    ([name, args]) =>
      name === 'atomar_datei_schreiben' && args.relativerPfad === 'gesetze/TestG_de-bund.xml',
  );
  expect(geschrieben).toHaveLength(1);
  pruefeOffenenImportabschluss('§ 999 TestG');
});

it('erhält nach eigener Importfolge den Dateierfolg neben gescheiterter frischer Bestandsladung', async () => {
  const importieren = await bereiteImportVor();
  vi.useFakeTimers();
  const { tor, davor } = await blockierePruefqueue();
  const lesen = m.lesen.getMockImplementation()!;
  // Die Datei fehlt noch beim ersten Bestand. Erst die frische Bestandsladung
  // nach dem echten Dispatchschreiben trifft auf diesen nativen Lesefehler.
  m.lesen.mockImplementation((pfad) =>
    pfad.endsWith('gesetze/TestG_de-bund.xml')
      ? Promise.reject(Error('Frisch laden'))
      : lesen(pfad),
  );
  await importieren();
  const pruefeSpaetenFehler = verweigereSpaetenPruefstand();
  await act(async () => {
    tor.freigeben();
    await davor;
    await vi.advanceTimersByTimeAsync(200);
  });
  pruefeSpaetenFehler();
  expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Das Gesetz konnte nicht verlässlich geladen werden.');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('konnte nicht gelesen');
  });
  expect(hinweise().some((h) => h.hinweis.text.startsWith('TestG wurde importiert.'))).toBe(true);
  pruefeOffenenImportabschluss('§ 1 TestG');
});

it.each(['wartefrist', 'ipc'] as const)(
  'erhält nach eigener Importfolge den Dateierfolg neben abgewiesener Verweisspeicherung (%s)',
  async (fehler) => {
    const importieren = await bereiteImportVor();
    vi.useFakeTimers();
    const { tor, davor } = await blockierePruefqueue();
    await importieren();
    const pruefeSpaetenFehler = verweigereSpaetenPruefstand(true);
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (name, args) => {
      if (name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('markierungen/'))
        throw fehler;
      return nativ(name, args);
    });
    // Selbst der misslungene Hinweistransport löst keine zweite Speicherung aus.
    m.hinweise.mockRejectedValue(Error('Hinweisannahme'));
    await act(async () => {
      tor.freigeben();
      await davor;
      await vi.advanceTimersByTimeAsync(200);
    });
    pruefeSpaetenFehler();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain(
        fehler === 'wartefrist'
          ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
          : 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
      );
    });
    expect(m.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
    expect(
      hinweise().filter((h) => h.hinweis.text.startsWith('TestG wurde importiert.')),
    ).toHaveLength(1);
    expect(
      m.invoke.mock.calls.filter(
        ([name, args]) =>
          name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('markierungen/'),
      ),
    ).toHaveLength(1);
    pruefeOffenenImportabschluss('§ 1 TestG');
  },
);

vi.mock('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse', async (original) => ({
  ...(await original<typeof import('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse')>()),
  useDynamischeFensterGroesse: vi.fn(),
}));
