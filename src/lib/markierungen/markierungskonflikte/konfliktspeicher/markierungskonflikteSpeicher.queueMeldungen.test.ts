import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
// Echte Prüfqueue und Quellen-/Konfliktdateiketten; nur native I/O-Grenzen ersetzt.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  unlesbar: new Set<string>(),
  invoke: vi.fn(),
  emit: vi.fn(),
  banner: vi.fn(),
  sperrfehler: undefined as unknown,
  schreibfehler: undefined as unknown,
  vollbedarf: false,
  wiederholen: false,
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (befehl: string, ...argumente: unknown[]) =>
    befehl === 'gesetz_dateistempel_lesen'
      ? Promise.resolve(gesetzDateistempelAttrappe(io.dateien))
      : io.invoke(befehl, ...argumente),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: io.emit }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: io.banner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
const relativ = (pfad: string) => pfad.replace('/daten/LexLata/', '');
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    if (io.unlesbar.has(relativ(pfad))) throw Error('Zugriff verweigert');
    const xml = io.dateien.get(relativ(pfad));
    if (xml === undefined) throw Error('Datei fehlt');
    return xml;
  },
  exists: async (pfad: string) => io.dateien.has(relativ(pfad)),
  mkdir: async () => {},
  readDir: async (pfad: string) =>
    [...io.dateien.keys()]
      .filter((datei) => datei.startsWith(relativ(pfad) + '/'))
      .map((datei) => ({ name: datei.split('/').at(-1), isDirectory: false })),
}));
const ref = gesetzesreferenz({ kurztitel: 'BGB' });
const konfliktdatei = 'markierungskonflikte.xml';
const gesetzdatei = 'gesetze/BGB_de-bund.xml';
const titeldatei = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
const markierungsdatei = 'markierungen/BGB_de-bund-markierungen.xml';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  io.dateien.clear();
  io.unlesbar.clear();
  io.sperrfehler = undefined;
  io.schreibfehler = undefined;
  io.vollbedarf = false;
  io.wiederholen = false;
  io.dateien.set(konfliktdatei, '<markierungskonflikte pruefstatus="aktuell"/>');
  io.dateien.set(
    gesetzdatei,
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>',
  );
  io.dateien.set(
    markierungsdatei,
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
  );
  io.emit.mockResolvedValue(undefined);
  io.invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad?: string; inhalt?: string } = {}) => {
      if (befehl === 'datei_sperre_erwerben') {
        if (io.sperrfehler) throw io.sperrfehler;
        return 'token';
      }
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'atomar_datei_schreiben') {
        if (io.schreibfehler) throw io.schreibfehler;
        io.dateien.set(args.relativerPfad!, args.inhalt!);
        return;
      }
      if (befehl === 'archiviere_beschaedigte_datei') {
        io.dateien.delete(args.relativerPfad!);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      if (befehl === 'pruefvorgang_registrieren') return 'quelle';
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
        const uebernommen = io.wiederholen;
        io.wiederholen = false;
        return uebernommen;
      }
      if (befehl === 'pruefvorgang_vollpruefung_abschliessen') io.vollbedarf = false;
      if (befehl === 'pruefvorgang_fehler' || befehl === 'pruefvorgang_vollbedarf')
        io.vollbedarf = true;
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: io.vollbedarf };
    },
  );
});

async function pruefer() {
  return ladeSpeicherMitKette();
}

it.each(['wartefrist', 'IPC'])('Queue meldet Sperrfehler %s ausdrücklich', async (fehler) => {
  const speicher = await pruefer();
  io.sperrfehler = fehler;
  const empfangen = vi.fn();
  await expect(
    speicher.reiheInPruefungsKetteEin(async () => {}, true, false, false, false, empfangen),
  ).rejects.toBe(fehler);
  expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'dateisperre' }));
  expect(io.banner).not.toHaveBeenCalled();
});

it.each([konfliktdatei, gesetzdatei, titeldatei, markierungsdatei])(
  'Vollprüfung erhält Lesebefund aus %s',
  async (pfad) => {
    const speicher = await pruefer();
    if (pfad === titeldatei) io.dateien.set(pfad, '<nichtamtlicheTitel/>');
    io.unlesbar.add(pfad);
    const empfangen = vi.fn();
    await expect(speicher.pruefeAlleMarkierungen(empfangen)).rejects.toThrow();
    await speicher.reiheInPruefungsKetteEin(async () => {});
    expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'lesen' }));
    expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'pruefabschluss' }));
    if (pfad === konfliktdatei) {
      // Unlesbare vorhandene Daten werden nicht durch einen leeren Ersatz überschrieben.
      expect(io.invoke).not.toHaveBeenCalledWith(
        'pruefvorgang_vollpruefung_abschliessen',
        expect.anything(),
      );
    } else expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="fehlgeschlagen"');
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it.each(['selektiv', 'einzeln', 'erforderlich'])(
  '%s prüft Quellen mit eigenem Empfänger',
  async (weg) => {
    const speicher = await pruefer();
    io.unlesbar.add(markierungsdatei);
    if (weg === 'erforderlich') io.vollbedarf = true;
    const empfangen = vi.fn();
    const auftrag =
      weg === 'selektiv'
        ? speicher.pruefeMarkierungenSelektiv([ref], {
            nurEigeneMarkierungen: true,
            meldungEmpfangen: empfangen,
          })
        : weg === 'einzeln'
          ? speicher.pruefeEineMarkierungSelektiv(ref, 'id', undefined, empfangen)
          : speicher.pruefeErforderlicheVollpruefung(empfangen);
    await auftrag.catch(() => {});
    await speicher.reiheInPruefungsKetteEin(async () => {});
    expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'lesen' }));
    expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="fehlgeschlagen"');
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it('Referenzscan meldet eine fremde unlesbare Markierungsquelle', async () => {
  const speicher = await pruefer();
  const fremd = 'markierungen/GG_de-bund-markierungen.xml';
  io.dateien.set(fremd, '<markierungen/>');
  io.unlesbar.add(fremd);
  const empfangen = vi.fn();
  await speicher.pruefeMarkierungenSelektiv([ref], { meldungEmpfangen: empfangen });
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ anlass: 'lesen', text: expect.stringContaining('GG') }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('Ergebnisschreiben meldet gespeicherten Stand trotz Benachrichtigungsfehler', async () => {
  const speicher = await pruefer();
  io.emit.mockRejectedValue(Error('Fenster weg'));
  const empfangen = vi.fn();
  await speicher.pruefeAlleMarkierungen(empfangen);
  expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="aktuell"');
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ anlass: 'synchronisation', aenderungsstand: 'vollstaendig' }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('automatische Wiederholung behält den auslösenden Empfänger', async () => {
  const speicher = await pruefer();
  io.unlesbar.add(gesetzdatei);
  io.wiederholen = true;
  const empfangen = vi.fn();
  await expect(speicher.pruefeAlleMarkierungen(empfangen)).rejects.toThrow();
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(empfangen.mock.calls.filter(([m]) => m.anlass === 'lesen').length).toBeGreaterThanOrEqual(
    2,
  );
  expect(
    io.invoke.mock.calls.filter(([b]) => b === 'pruefvorgang_wiederholung_uebernehmen'),
  ).toHaveLength(1);
  expect(io.banner).not.toHaveBeenCalled();
});

it('parallele Queueaufträge behalten ihre Befunde und setzen nach Fehler fort', async () => {
  const speicher = await pruefer();
  const a = vi.fn();
  const b = vi.fn();
  const original = io.invoke.getMockImplementation()!;
  let nummer = 0;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'datei_sperre_erwerben' && ++nummer === 1) throw 'wartefrist';
    return original(befehl, args);
  });
  io.emit.mockRejectedValue(Error('Sync'));
  const zuerst = speicher.reiheInPruefungsKetteEin(async () => {}, true, false, false, false, a);
  const danach = speicher.pruefeAlleMarkierungen(b);
  await expect(zuerst).rejects.toBe('wartefrist');
  await danach;
  expect(a.mock.calls.map(([m]) => m.anlass)).toEqual(['dateisperre']);
  expect(b.mock.calls.map(([m]) => m.anlass)).toEqual(['synchronisation']);
  expect(io.banner).not.toHaveBeenCalled();
});

it('Queuefehlerabschluss meldet Fehlerstatus und bewahrt ursprüngliche Ursache', async () => {
  const speicher = await pruefer();
  const original = Error('Berechnung');
  const empfangen = vi.fn();
  await expect(
    speicher.reiheInPruefungsKetteEin(
      async () => {
        throw original;
      },
      true,
      false,
      false,
      true,
      empfangen,
    ),
  ).rejects.toBe(original);
  expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="fehlgeschlagen"');
  expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'pruefabschluss' }));
  expect(io.banner).not.toHaveBeenCalled();
});

it.each(['laden', 'berechnen'])(
  'Zusätzlicher nativer Fehlerabschluss verdeckt %s-Fehler nicht',
  async (weg) => {
    const speicher = await pruefer();
    const original = Error('Ursprüngliche Berechnung');
    const nativ = io.invoke.getMockImplementation()!;
    io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
      if (befehl === 'pruefvorgang_fehler') throw Error('Nativer Fehlerabschluss');
      return nativ(befehl, args);
    });
    if (weg === 'laden') io.unlesbar.add(konfliktdatei);
    const empfangen = vi.fn();
    const auftrag = speicher.reiheInPruefungsKetteEin(
      async () => {
        throw original;
      },
      true,
      false,
      false,
      true,
      empfangen,
    );
    if (weg === 'laden') await expect(auftrag).rejects.toThrow('Zugriff verweigert');
    else await expect(auftrag).rejects.toBe(original);
    expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'pruefabschluss' }));
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it.each([Error('Quellenwarten'), 'Quellenwarten'])(
  'Quellenwarten erhält seine Ursache und meldet Fehlerabschluss ausdrücklich: %s',
  async (original) => {
    const speicher = await pruefer();
    const nativ = io.invoke.getMockImplementation()!;
    io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
      if (befehl === 'pruefvorgang_abfragen')
        return { offeneQuellen: 1, offenePruefungen: 0, vollbedarf: true };
      if (befehl === 'pruefvorgang_quellen_abwarten') throw original;
      return nativ(befehl, args);
    });
    const empfangen = vi.fn();
    const lauf = vi.fn();
    await expect(
      speicher.reiheInPruefungsKetteEin(lauf, true, true, false, false, empfangen),
    ).rejects.toBe(original);
    expect(lauf).not.toHaveBeenCalled();
    expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'pruefabschluss' }));
    expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="fehlgeschlagen"');
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it('Nach Quellenwarten geht der frisch geladene Archivierungsbefund an den Auftrag', async () => {
  const speicher = await pruefer();
  const nativ = io.invoke.getMockImplementation()!;
  let offen = true;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'pruefvorgang_abfragen')
      return { offeneQuellen: offen ? 1 : 0, offenePruefungen: 0, vollbedarf: true };
    if (befehl === 'pruefvorgang_quellen_abwarten') {
      offen = false;
      io.dateien.set(konfliktdatei, '<fremd/>');
    }
    return nativ(befehl, args);
  });
  const empfangen = vi.fn();
  const lauf = vi.fn(async () => {});
  await speicher.reiheInPruefungsKetteEin(lauf, true, true, false, false, empfangen);
  expect(lauf).toHaveBeenCalledOnce();
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ anlass: 'sicherung', aenderungsstand: 'teilweise' }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('Gespeichertes Prüfergebnis mit nativem Abschlussfehler bleibt als Hinweis erkennbar', async () => {
  const speicher = await pruefer();
  const nativ = io.invoke.getMockImplementation()!;
  const original = Error('Vollabschluss');
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'pruefvorgang_vollpruefung_abschliessen') throw original;
    return nativ(befehl, args);
  });
  const empfangen = vi.fn();
  await expect(speicher.pruefeAlleMarkierungen(empfangen)).rejects.toBe(original);
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'pruefabschluss',
      art: 'hinweis',
      aenderungsstand: 'vollstaendig',
    }),
  );
  expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="fehlgeschlagen"');
  expect(io.banner).not.toHaveBeenCalled();
});

it('Ergebnisschreibfehler bleibt ein Fehler ohne behauptete Speicherung', async () => {
  const speicher = await pruefer();
  io.schreibfehler = Error('Schreiben');
  const empfangen = vi.fn();
  await expect(speicher.pruefeAlleMarkierungen(empfangen)).rejects.toBe(io.schreibfehler);
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ anlass: 'pruefabschluss', art: 'fehler', aenderungsstand: 'keine' }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('Hauptfensterstandard bleibt beim Queuefehler ohne Empfänger erhalten', async () => {
  const speicher = await pruefer();
  io.sperrfehler = 'wartefrist';
  await expect(speicher.pruefeAlleMarkierungen()).rejects.toBe('wartefrist');
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(io.banner).toHaveBeenCalledWith(expect.objectContaining({ typ: 'warnung' }));
});

async function sammlung() {
  const { erzeugeAktionsMeldungsSammlung } = await import('@/lib/domain/app/aktionsMeldung');
  return erzeugeAktionsMeldungsSammlung();
}

function wartenderLauf() {
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  return { warten, freigeben };
}

it('registrierter Quellabschluss erfasst die späte Folgeprüfung ohne auf die Queue zu warten', async () => {
  const speicher = await pruefer();
  speicher.initialisiereMarkierungen();
  const { schliessePruefpflichtigeQuelleAb } = await import('@/lib/persistenz/kern/kern.index');
  const vorgang = await sammlung();
  const gate = wartenderLauf();
  const davor = speicher.reiheInPruefungsKetteEin(async () => gate.warten);
  io.vollbedarf = true;
  io.emit.mockRejectedValue(Error('späte Synchronisation'));
  expect(
    await schliessePruefpflichtigeQuelleAb('quelle', 'unveraendert', vorgang.meldungEmpfangen),
  ).toBe(true);
  const standVorFolge = io.dateien.get(konfliktdatei);
  expect(await vorgang.warteAufAbschluss(0)).toBe('wartefrist');
  gate.freigeben();
  await davor;
  expect(await vorgang.warteAufAbschluss(1000)).toBe('abgeschlossen');
  expect(vorgang.meldungen()).toEqual(
    expect.arrayContaining([expect.objectContaining({ anlass: 'synchronisation' })]),
  );
  expect(standVorFolge).toContain('pruefstatus="ausstehend"');
  expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="aktuell"');
  expect(io.banner).not.toHaveBeenCalled();
});

it('Vollwiederholung hält Prüfauftrag und ursprünglichen Vorgang bis zur Spätmeldung offen', async () => {
  const speicher = await pruefer();
  const vorgang = await sammlung();
  const gate = wartenderLauf();
  io.unlesbar.add(gesetzdatei);
  io.wiederholen = true;
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
      await gate.warten;
      io.unlesbar.clear();
      io.emit.mockRejectedValue(Error('spät'));
    }
    return original(befehl, args);
  });
  const pruefung = speicher.pruefeAlleMarkierungen(vorgang.meldungEmpfangen);
  await vi.waitFor(() =>
    expect(io.invoke).toHaveBeenCalledWith(
      'pruefvorgang_wiederholung_uebernehmen',
      expect.anything(),
    ),
  );
  expect(await vorgang.warteAufAbschluss(0)).toBe('wartefrist');
  gate.freigeben();
  await expect(pruefung).resolves.toBeUndefined();
  expect(await vorgang.warteAufAbschluss(1000)).toBe('abgeschlossen');
  expect(vorgang.meldungen()).toEqual(
    expect.arrayContaining([expect.objectContaining({ anlass: 'synchronisation' })]),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('parallele registrierte Quellabschlüsse behalten ihre eigenen späten Befunde', async () => {
  const speicher = await pruefer();
  speicher.initialisiereMarkierungen();
  const { schliessePruefpflichtigeQuelleAb } = await import('@/lib/persistenz/kern/kern.index');
  const a = await sammlung();
  const b = await sammlung();
  const gate = wartenderLauf();
  const davor = speicher.reiheInPruefungsKetteEin(async () => gate.warten);
  io.vollbedarf = true;
  io.emit.mockRejectedValue(Error('Sync'));
  // Die echte Konfliktsperre serialisiert die beiden Quellabschlüsse. Beide
  // Vorgänge samt Folgeläufen bleiben dabei gleichzeitig offen.
  await schliessePruefpflichtigeQuelleAb('a', 'unveraendert', a.meldungEmpfangen);
  await schliessePruefpflichtigeQuelleAb('b', 'unveraendert', b.meldungEmpfangen);
  expect(await a.warteAufAbschluss(0)).toBe('wartefrist');
  expect(await b.warteAufAbschluss(0)).toBe('wartefrist');
  gate.freigeben();
  await davor;
  await Promise.all([a.warteAufAbschluss(1000), b.warteAufAbschluss(1000)]);
  // Beide Quellabschlüsse schreiben selbst; nur der erste Folgelauf berechnet
  // vollständig neu. Kein Vorgang bekommt die Befunde des anderen Auftrags.
  expect(a.meldungen().filter((m) => m.anlass === 'synchronisation')).toHaveLength(2);
  expect(b.meldungen().filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
  expect(io.banner).not.toHaveBeenCalled();
});

it('echte Titelquellheilung schließt ihre Quelle innerhalb der Queue ohne Selbstawait ab', async () => {
  const speicher = await pruefer();
  speicher.initialisiereMarkierungen();
  const vorgang = await sammlung();
  io.dateien.set(titeldatei, '<defekt');
  io.emit.mockRejectedValue(Error('Synchronisation nach Quellheilung'));
  await speicher.pruefeAlleMarkierungen(vorgang.meldungEmpfangen);
  expect(await vorgang.warteAufAbschluss(1000)).toBe('abgeschlossen');
  expect(io.invoke).toHaveBeenCalledWith('pruefvorgang_registrieren', expect.anything());
  expect(io.invoke).toHaveBeenCalledWith('pruefvorgang_quelle_abschliessen', expect.anything());
  expect(io.invoke).toHaveBeenCalledWith(
    'archiviere_beschaedigte_datei',
    expect.objectContaining({ relativerPfad: titeldatei }),
  );
  expect(vorgang.meldungen()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ anlass: 'sicherung' }),
      expect.objectContaining({ anlass: 'synchronisation' }),
    ]),
  );
  expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="aktuell"');
  expect(io.banner).not.toHaveBeenCalled();
});

it.each(['fehlgeschlagen', 'Abschlussfehler'])(
  'registrierter Quellabschluss %s erfasst seinen Wiederholungsauftrag',
  async (ausgang) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { schliessePruefpflichtigeQuelleAb } = await import('@/lib/persistenz/kern/kern.index');
    const vorgang = await sammlung();
    const gate = wartenderLauf();
    const davor = speicher.reiheInPruefungsKetteEin(async () => gate.warten);
    io.wiederholen = true;
    const original = io.invoke.getMockImplementation()!;
    io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
      if (ausgang === 'Abschlussfehler' && befehl === 'pruefvorgang_quelle_abschliessen')
        throw Error('Quelle');
      return original(befehl, args);
    });
    io.emit.mockRejectedValue(Error('spät'));
    expect(
      await schliessePruefpflichtigeQuelleAb(
        'quelle',
        ausgang === 'fehlgeschlagen' ? 'fehlgeschlagen' : 'geaendert',
        vorgang.meldungEmpfangen,
      ),
    ).toBe(ausgang === 'fehlgeschlagen');
    expect(await vorgang.warteAufAbschluss(0)).toBe('wartefrist');
    gate.freigeben();
    await davor;
    expect(await vorgang.warteAufAbschluss(1000)).toBe('abgeschlossen');
    expect(vorgang.meldungen()).toEqual(
      expect.arrayContaining([expect.objectContaining({ anlass: 'synchronisation' })]),
    );
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it('fehlgeschlagene echte Quellheilung registriert Folgeaufträge ohne Queue-Selbstblockierung', async () => {
  const speicher = await pruefer();
  speicher.initialisiereMarkierungen();
  const vorgang = await sammlung();
  const erfassen = vi.spyOn(vorgang.meldungEmpfangen, 'folgelaufErfassen');
  io.dateien.set(titeldatei, '<defekt');
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'archiviere_beschaedigte_datei') throw Error('Sicherung fehlgeschlagen');
    return original(befehl, args);
  });
  await expect(speicher.pruefeAlleMarkierungen(vorgang.meldungEmpfangen)).rejects.toThrow();
  expect(await vorgang.warteAufAbschluss(1000)).toBe('abgeschlossen');
  // Die Quellheilung startet aus der laufenden Queue einen eigenen Folgelauf;
  // der öffentliche fehlgeschlagene Prüfeinstieg registriert seine Wiederholung.
  expect(erfassen.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(io.invoke).toHaveBeenCalledWith(
    'pruefvorgang_fehler',
    expect.objectContaining({ vorgaenge: ['quelle'] }),
  );
  expect(vorgang.meldungen()).toEqual(
    expect.arrayContaining([expect.objectContaining({ anlass: 'sicherung', art: 'fehler' })]),
  );
  expect(io.dateien.get(titeldatei)).toBe('<defekt');
  expect(io.dateien.get(konfliktdatei)).toContain('pruefstatus="fehlgeschlagen"');
  expect(io.banner).not.toHaveBeenCalled();
});

it.each(['titel', 'sicherung'] as const)(
  'echte %s-Weiterleitung wartet außerhalb der Queue auf registrierte Prüfabschlussfolgen',
  async (quelle) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { speichereGesetz, ladeAlleGesetze } =
      await import('@/test/tabs/gesetzSpeicherTestzugang');
    const vorgang = await sammlung();
    const gate = wartenderLauf();
    const davor = speicher.reiheInPruefungsKetteEin(async () => gate.warten);
    io.vollbedarf = true;
    io.emit.mockRejectedValue(Error('Synchronisation'));
    const original = io.invoke.getMockImplementation()!;
    const gueltig = io.dateien.get(gesetzdatei)!;
    io.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        // Ein anderer Schreiber hat die Quelle während des Inhaltsvergleichs
        // repariert: Der echte Quellabschluss bleibt unverändert.
        io.dateien.set(gesetzdatei, gueltig);
        return { status: 'veraendert', sicherungspfad: null };
      }
      if (
        befehl === 'datei_sperre_erwerben' &&
        args.relativerPfad.startsWith('nichtamtliche-titel/')
      ) {
        // Die Titeldatei wurde nach der ersten Existenzprüfung bereits ergänzt.
        io.dateien.set(args.relativerPfad, '<nichtamtlicheTitel/>');
      }
      return original(befehl, args);
    });
    if (quelle === 'titel') {
      io.dateien.set('resources/nichtamtliche-titel/de-bund/GG.xml', '<nichtamtlicheTitel/>');
      // Nur die Titelquelle startet einen Quellabschluss; der unverpackte
      // Gesetzempfänger kann keine verlorene Folge verdecken.
      await speichereGesetz(
        { kurztitel: 'GG', normgeber: 'de-bund' },
        '<gesetz><infos><kurztitel>GG</kurztitel><normgeber>de-bund</normgeber></infos><inhalt/></gesetz>',
        { inhaltGeaendert: false, meldungEmpfangen: vorgang.meldungEmpfangen },
      );
    } else {
      io.dateien.set(gesetzdatei, '<kaputt/>');
      await ladeAlleGesetze(undefined, vorgang.meldungEmpfangen);
    }
    const vorher = vorgang.meldungen().length;
    expect(await vorgang.warteAufAbschluss(0)).toBe('wartefrist');
    gate.freigeben();
    await davor;
    expect(await vorgang.warteAufAbschluss(1000)).toBe('abgeschlossen');
    const spaet = vorgang.meldungen().slice(vorher);
    expect(spaet).toContainEqual(expect.objectContaining({ anlass: 'synchronisation' }));
    if (quelle === 'titel')
      expect(
        spaet.every((meldung) =>
          meldung.text.startsWith('Der Prüfzeitpunkt des Gesetzes wurde aktualisiert.'),
        ),
      ).toBe(true);
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it.each(['einzel', 'bulk', 'titel'] as const)(
  'ordnet die späte %s-Ereignisprüfung dem Auslöser zu',
  async (art) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const vorgang = await sammlung();
    const anderer = await sammlung();
    const gate = wartenderLauf();
    const davor = speicher.reiheInPruefungsKetteEin(async () => gate.warten);
    io.unlesbar.add(gesetzdatei);
    const eintraege = await import('@/lib/markierungen/eintrag/eintrag.index');
    const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
    if (art === 'titel') {
      io.dateien.set(titeldatei, '<defekt');
      await gesetz.ladeNichtamtlicheTitel(ref, vorgang.meldungEmpfangen);
    } else {
      const eintrag = markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'kommentar' as const,
        ausgangsstelle: normAusgangsstelle('§ 1'),
        kommentarText: 'Alt',
      });
      io.dateien.set(
        markierungsdatei,
        '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><kommentartext>Alt</kommentartext></kommentar></inhalt></markierungen>',
      );
      if (art === 'einzel')
        await eintraege.aktualisiereKommentar(
          ref,
          eintrag,
          'Neu',
          { elementstand: { textlaenge: 0 } },
          vorgang.meldungEmpfangen,
        );
      else
        await eintraege.aendereEintraege(
          ref,
          () => ({ art: 'geaendert', eintraege: [], ergebnis: undefined }),
          vorgang.meldungEmpfangen,
        );
    }
    expect(await vorgang.warteAufAbschluss(0)).toBe('wartefrist');
    gate.freigeben();
    await davor;
    expect(await vorgang.warteAufAbschluss(1000)).toBe('abgeschlossen');
    expect(vorgang.meldungen()).toEqual(
      expect.arrayContaining([expect.objectContaining({ anlass: 'lesen' })]),
    );
    expect(anderer.meldungen()).toEqual([]);
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it('hält beide Empfänger eines gemeinsamen Gesetzbatches bis zu ihren späten Prüfungen offen', async () => {
  const speicher = await pruefer();
  speicher.initialisiereMarkierungen();
  const erstes = await sammlung();
  const zweites = await sammlung();
  const gate = wartenderLauf();
  const davor = speicher.reiheInPruefungsKetteEin(async () => gate.warten);
  const { speichereGesetz } = await import('@/test/tabs/gesetzSpeicherTestzugang');
  await speichereGesetz(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>',
    { inhaltGeaendert: true, meldungEmpfangen: erstes.meldungEmpfangen },
  );
  await speichereGesetz(
    gesetzesreferenz({ kurztitel: 'GG' }),
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>GG</kurztitel></infos><inhalt/></gesetz>',
    { inhaltGeaendert: true, meldungEmpfangen: zweites.meldungEmpfangen },
  );

  expect(await erstes.warteAufAbschluss(0)).toBe('wartefrist');
  expect(await zweites.warteAufAbschluss(0)).toBe('wartefrist');
  io.unlesbar.add(gesetzdatei);
  // Den bestehenden Nachlauf abwarten, bevor die Prüfqueue freigegeben wird.
  await new Promise((resolve) => setTimeout(resolve, 220));
  expect(await erstes.warteAufAbschluss(0)).toBe('wartefrist');
  gate.freigeben();
  await davor;
  expect(await erstes.warteAufAbschluss(1000)).toBe('abgeschlossen');
  expect(await zweites.warteAufAbschluss(1000)).toBe('abgeschlossen');
  for (const vorgang of [erstes, zweites])
    expect(vorgang.meldungen()).toEqual(
      expect.arrayContaining([expect.objectContaining({ anlass: 'lesen' })]),
    );
  expect(io.banner).not.toHaveBeenCalled();
});

function erwarteVorhanden<T>(wert: T | null | undefined): T {
  if (wert === null || wert === undefined) throw new Error('Erwarteter Testwert fehlt.');
  return wert;
}

it.each(['vormerkung', 'quellabschluss', 'pruefstandschreiben', 'pruefstandabschluss'] as const)(
  'Dateiimport unterscheidet %s mit echter Prüfsteuerung vom bestätigten Speicherstand',
  async (phase) => {
    const speicher = await pruefer();
    speicher.initialisiereMarkierungen();
    const { baueXML } = await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
    const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
    io.dateien.delete(markierungsdatei);
    const xml = baueXML(ref, [
      markierungsEintrag({
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: { typ: 'pauschal', elementstand: { textlaenge: 0 } },
        kommentarText: 'Importiert',
      }),
    ]);
    io.dateien.set('Import.xml', xml);
    if (phase === 'pruefstandabschluss') io.vollbedarf = true;
    const original = erwarteVorhanden(io.invoke.getMockImplementation());
    io.invoke.mockImplementation(async (befehl, args = {}) => {
      if (
        (phase === 'vormerkung' && befehl === 'pruefvorgang_registrieren') ||
        (phase === 'quellabschluss' && befehl === 'pruefvorgang_quelle_abschliessen') ||
        (phase === 'pruefstandschreiben' &&
          befehl === 'atomar_datei_schreiben' &&
          args.relativerPfad === konfliktdatei &&
          io.dateien.has(markierungsdatei)) ||
        (phase === 'pruefstandabschluss' && befehl === 'pruefvorgang_vollpruefung_abschliessen')
      )
        throw Error(`Fehler ${phase}`);
      return original(befehl, args);
    });
    const ergebnis = await importierePfade(['/daten/LexLata/Import.xml']);
    if (phase === 'vormerkung') {
      expect(ergebnis.berichtEintraege).toHaveLength(0);
      expect(ergebnis.fehler).toMatchObject([{ grund: 'unerwartet', datei: 'Import.xml' }]);
      expect(ergebnis.fehler[0]?.detail).toContain('Prüfbedarf konnte nicht vorgemerkt');
      expect(io.dateien.has(markierungsdatei)).toBe(false);
    } else {
      expect(ergebnis.berichtEintraege[0]).toMatchObject({ quelle: 'Import.xml', aktion: 'neu' });
      expect(io.dateien.get(markierungsdatei)).toContain('Importiert');
      const texte = erwarteVorhanden(erwarteVorhanden(ergebnis.berichtEintraege[0]).meldungen)
        .map((m) => m.text)
        .join(' ');
      expect(texte).toContain(
        phase === 'quellabschluss'
          ? 'Prüfabschluss konnte nicht bestätigt'
          : phase === 'pruefstandschreiben'
            ? 'konnte nicht gespeichert'
            : 'wurde gespeichert. Der Prüfabschluss konnte jedoch nicht bestätigt',
      );
      if (phase === 'pruefstandabschluss') expect(io.vollbedarf).toBe(true);
      // Eine nachfolgende erfolgreiche Prüfung darf einen Quellabschlussfehler fachlich heilen.
      if (phase !== 'quellabschluss')
        expect(io.dateien.get(konfliktdatei)).not.toContain('pruefstatus="aktuell"');
    }
    expect(io.banner).not.toHaveBeenCalled();
  },
);

async function ladeSpeicherMitKette() {
  const [speicher, kette, selektiv] = await Promise.all([
    import('./markierungskonflikteSpeicher'),
    import('./markierungskonflikteSpeicher.pruefkette'),
    import('./markierungskonflikteSpeicher.selektiv'),
  ]);
  return {
    ...speicher,
    reiheInPruefungsKetteEin: kette.reiheInPruefungsKetteEin,
    pruefeEineMarkierungSelektiv: selektiv.pruefeEineMarkierungSelektiv,
  };
}
