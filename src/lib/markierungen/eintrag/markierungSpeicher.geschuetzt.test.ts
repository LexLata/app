// Integration des Markierungsschreibers mit dem echten geschützten Lader und
// Versionshinweis. Nur native Dateioperationen und Fensternachrichten sind ersetzt.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import { BeschaedigteMarkierungsdateiFehler } from './eintrag.index';
import {
  ladeEintraege,
  ladeEintraegeFuerPruefung,
  leseMarkierungsXMLFuerPruefung,
} from './markierungSpeicher.lesen';
import {
  aendereEintraege,
  ersetzeMarkierungsXML,
  loescheMarkierungsDatei,
  schreibeEintraege,
} from './markierungSpeicher.aendern';
import type { MarkierungsEintrag } from './markierungSpeicher';
import { mitMarkierungsQuelle } from './markierungSpeicher';
import {
  beiMarkierungGeaendert,
  beiMarkierungenBulkGeaendert,
} from './markierungSpeicher.ereignisse';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { hinzufuegenMarkierung } from './markierungSpeicher.hinzufuegen';
import { fuehreRueckgaengigAus, fuehreWiederholenAus } from './markierungSpeicher.undo';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const { dateien, invoke, zeigeBanner, emitTo } = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  zeigeBanner: vi.fn(),
  emitTo: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (pfad: string) => {
    const inhalt = dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  }),
  exists: vi.fn(async (pfad: string) => dateien.has(pfad.replace('/daten/LexLata/', ''))),
  mkdir: vi.fn(),
  remove: vi.fn(),
  readDir: async (ordner: string) =>
    [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(ordner.replace('/daten/LexLata/', '') + '/'))
      .map((pfad) => ({ name: pfad.split('/').at(-1), isDirectory: false })),
}));

const vormerken = vi.fn(async () => 'markierungs-vorgang');
const abschliessen = vi.fn(async () => {});
const empfaenger = { vormerken, abschliessen };

beforeEach(() => {
  registrierePruefpflichtigeAenderung(empfaenger);
  vi.clearAllMocks();
  dateien.clear();
  emitTo.mockResolvedValue(undefined);
  invoke.mockImplementation(
    async (befehl: string, argumente: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'atomar_datei_schreiben')
        dateien.set(argumente.relativerPfad, argumente.inhalt);
      else if (befehl === 'datei_sperre_erwerben') return 'markierungstoken';
      else if (befehl === 'datei_sperre_freigeben') return;
      else throw new Error(`Unerwarteter nativer Aufruf: ${befehl}`);
    },
  );
});

it.each(['1', '2'])(
  'lädt geschriebene Markierungen bei Version %s ohne Archivierung weiter',
  async (version) => {
    const eintrag = markierungsEintrag({
      typ: 'unterstreichung' as const,
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
        bezugstext: 'Text',
      },
    });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag]);
    const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
    const geschrieben = dateien.get(pfad)!;
    expect(() => pruefeXmlWohlgeformtheit(geschrieben)).not.toThrow();
    dateien.set(
      pfad,
      geschrieben.replace('<markierungen version="1">', `<markierungen version="${version}">`),
    );
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toMatchObject([eintrag]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(zeigeBanner).not.toHaveBeenCalled();
    if (version === '2') expect(emitTo).toHaveBeenCalledWith('main', expect.any(String));
    else expect(emitTo).not.toHaveBeenCalled();
  },
);

it('bricht bei gesichertem, nicht entferntem Original ohne Schreiben ab', async () => {
  const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
  dateien.set(pfad, '<beschaedigt>');
  invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'datei_sperre_erwerben') return 'markierungstoken';
    if (befehl === 'datei_sperre_freigeben') return;
    if (befehl === 'archiviere_beschaedigte_datei')
      return { status: 'gesichert_aber_nicht_entfernt', sicherungspfad: 'sicherung.xml' };
    throw new Error(`Unerwarteter Aufruf: ${befehl}`);
  });
  await expect(ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toThrow(
    'nicht entfernt',
  );
  expect(dateien.get(pfad)).toBe('<beschaedigt>');
  expect(invoke).toHaveBeenCalledWith(
    'archiviere_beschaedigte_datei',
    expect.objectContaining({ vorgang: 'markierungs-vorgang' }),
  );
});

it('verhindert Bearbeitung bei nicht entferntem Original und gibt die Sperre frei', async () => {
  {
    const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
    dateien.set(pfad, '<beschaedigt>');
    invoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'datei_sperre_erwerben') return 'markierungstoken';
      if (befehl === 'datei_sperre_freigeben') return;
      if (befehl === 'archiviere_beschaedigte_datei')
        return { status: 'gesichert_aber_nicht_entfernt', sicherungspfad: 'sicherung.xml' };
      throw new Error(`Unerwarteter Aufruf: ${befehl}`);
    });
    const einzel = vi.fn();
    const bulk = vi.fn();
    const bearbeiten = vi.fn();
    const abmelden1 = beiMarkierungGeaendert(einzel);
    const abmelden2 = beiMarkierungenBulkGeaendert(bulk);
    try {
      const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
      const aktion = aendereEintraege(gesetz, bearbeiten);
      await expect(aktion).rejects.toThrow('nicht entfernt');
      expect(bearbeiten).not.toHaveBeenCalled();
      expect(einzel).not.toHaveBeenCalled();
      expect(bulk).not.toHaveBeenCalled();
      expect(dateien.get(pfad)).toBe('<beschaedigt>');
      expect(invoke).toHaveBeenCalledWith('archiviere_beschaedigte_datei', {
        relativerPfad: pfad,
        erwarteterInhalt: '<beschaedigt>',
        token: 'markierungstoken',
        vorgang: 'markierungs-vorgang',
      });
      expect(invoke).toHaveBeenLastCalledWith('datei_sperre_freigeben', {
        token: 'markierungstoken',
      });
    } finally {
      abmelden1();
      abmelden2();
    }
  }
});

it('verhindert ohne Pflichtempfänger das Schreiben vor jeder Quelldateisperre', async () => {
  const einzel = vi.fn();
  const abmelden = beiMarkierungGeaendert(einzel);
  try {
    vi.resetModules();
    const { aendereEintraege: ohneEmpfaenger } = await import('./markierungSpeicher.aendern');
    await expect(
      ohneEmpfaenger(gesetzesreferenz({ kurztitel: 'BGB' }), () => ({
        art: 'geaendert',
        eintraege: [],
        ergebnis: undefined,
      })),
    ).rejects.toThrow('nicht initialisiert');
    expect(invoke).not.toHaveBeenCalled();
    expect(einzel).not.toHaveBeenCalled();
  } finally {
    abmelden();
  }
});

it.each(['liste', 'rohtext'] as const)(
  'liest beschädigte Quellen im Prüfweg %s ohne Archivierung',
  async (art) => {
    const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
    const inhalt = '<beschaedigt>';
    dateien.set('markierungen/BGB_de-bund-markierungen.xml', inhalt);
    const aktion =
      art === 'liste' ? ladeEintraegeFuerPruefung(gesetz) : leseMarkierungsXMLFuerPruefung(gesetz);
    await expect(aktion).rejects.toMatchObject({
      name: 'BeschaedigteMarkierungsdateiFehler',
      gesetz,
      inhalt,
    });
    await expect(aktion).rejects.toBeInstanceOf(BeschaedigteMarkierungsdateiFehler);
    expect(vormerken).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  },
);

it('schließt erfolgreiche Quellen erst nach Sperrfreigabe ab und meldet die native Referenz', async () => {
  const bulk = vi.fn();
  const abmelden = beiMarkierungenBulkGeaendert(bulk);
  abschliessen.mockImplementationOnce(async () => {
    expect(invoke).toHaveBeenLastCalledWith('datei_sperre_freigeben', expect.any(Object));
    expect(bulk).not.toHaveBeenCalled();
  });
  try {
    await aendereEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), () => ({
      art: 'geaendert',
      eintraege: [
        markierungsEintrag({
          bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
          typ: 'kommentar',
          ausgangsstelle: normAusgangsstelle('§ 1'),
          kommentarText: 'Neu',
        }),
      ],
      ergebnis: true,
    }));
    expect(invoke).toHaveBeenCalledWith(
      'atomar_datei_schreiben',
      expect.objectContaining({ token: 'markierungstoken', vorgang: 'markierungs-vorgang' }),
    );
    expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'geaendert');
    expect(bulk).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'markierungs-vorgang',
    );
  } finally {
    abmelden();
  }
});

it('schließt einen gesperrt festgestellten No-op ohne Nachhermeldung ab', async () => {
  const bulk = vi.fn();
  const abmelden = beiMarkierungenBulkGeaendert(bulk);
  try {
    await aendereEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), () => ({
      art: 'unveraendert',
      ergebnis: false,
    }));
    expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'unveraendert');
    expect(bulk).not.toHaveBeenCalled();
    expect(invoke.mock.calls.some(([befehl]) => befehl === 'atomar_datei_schreiben')).toBe(false);
  } finally {
    abmelden();
  }
});

it('verhindert bei Vorabfehler auch Archivierung und Änderungen vor nativem I/O', async () => {
  dateien.set('markierungen/BGB_de-bund-markierungen.xml', '<beschaedigt>');
  const fehler = new Error('Vorabbedarf nicht gespeichert');
  vormerken.mockRejectedValueOnce(fehler);
  await expect(ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toBe(fehler);
  expect(invoke).not.toHaveBeenCalled();
  expect(abschliessen).not.toHaveBeenCalled();
});

it('nutzt eine vor dem Sperrerwerb reparierte Quelle und archiviert nichts', async () => {
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
  dateien.set(pfad, '<beschaedigt>');
  vormerken.mockImplementationOnce(async () => {
    dateien.set(
      pfad,
      '<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
    );
    return 'markierungs-vorgang';
  });
  expect(await ladeEintraege(gesetz)).toEqual([]);
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'unveraendert');
  expect(invoke.mock.calls.some(([befehl]) => befehl === 'archiviere_beschaedigte_datei')).toBe(
    false,
  );
});

it('meldet nach erfolgreichem Schreiben bei Abschlussfehler weiterhin Erfolg, ohne erneut zu schreiben', async () => {
  const bulk = vi.fn();
  const abmelden = beiMarkierungenBulkGeaendert(bulk);
  const fehlerausgabe = vi.spyOn(console, 'error').mockImplementation(() => {});
  abschliessen.mockRejectedValueOnce(new Error('Abschluss nicht bestätigt'));
  try {
    await expect(
      ersetzeMarkierungsXML(gesetzesreferenz({ kurztitel: 'BGB' }), '<markierungen/>'),
    ).resolves.toBeUndefined();
    expect(
      invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben'),
    ).toHaveLength(1);
    expect(bulk).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'markierungs-vorgang',
    );
  } finally {
    abmelden();
    fehlerausgabe.mockRestore();
  }
});

it('löscht die Quelle mit derselben Vorgangsreferenz und meldet erst nach Freigabe', async () => {
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  dateien.set('markierungen/BGB_de-bund-markierungen.xml', '<vorhanden/>');
  invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'datei_sperre_erwerben') return 'markierungstoken';
    if (befehl === 'datei_sperre_freigeben' || befehl === 'app_daten_loeschen') return;
    throw new Error(befehl);
  });
  await loescheMarkierungsDatei(gesetz);
  expect(invoke).toHaveBeenCalledWith(
    'app_daten_loeschen',
    expect.objectContaining({ token: 'markierungstoken', vorgang: 'markierungs-vorgang' }),
  );
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'geaendert');
});

it.each(['normal', 'liste', 'rohtext'] as const)(
  'gibt echte Lesefehler im Weg %s unverändert weiter',
  async (art) => {
    const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
    dateien.set('markierungen/BGB_de-bund-markierungen.xml', '<vorhanden/>');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const fehler = new Error('Leserecht fehlt');
    vi.mocked(readTextFile).mockRejectedValueOnce(fehler);
    const aktion =
      art === 'normal'
        ? ladeEintraege(gesetz)
        : art === 'liste'
          ? ladeEintraegeFuerPruefung(gesetz)
          : leseMarkierungsXMLFuerPruefung(gesetz);
    await expect(aktion).rejects.toBe(fehler);
    expect(vormerken).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  },
);

it('gibt Fehler der Existenzprüfung weiter und archiviert nichts', async () => {
  const { exists } = await import('@tauri-apps/plugin-fs');
  const fehler = new Error('Existenz nicht prüfbar');
  vi.mocked(exists).mockRejectedValueOnce(fehler);
  await expect(ladeEintraegeFuerPruefung(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toBe(
    fehler,
  );
  expect(invoke).not.toHaveBeenCalled();
});

it('benennt Parsingfehler samt vollständiger Referenz und gelesenem Inhalt', async () => {
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  const inhalt =
    '<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt></markierungen>';
  dateien.set('markierungen/BGB_de-bund-markierungen.xml', inhalt);
  await expect(ladeEintraegeFuerPruefung(gesetz)).rejects.toMatchObject({
    name: 'BeschaedigteMarkierungsdateiFehler',
    gesetz,
    inhalt,
  });
  expect(invoke).not.toHaveBeenCalled();
});

it.each(['bearbeiten', 'schreiben'] as const)(
  'schließt nach erfolgreicher Archivierung und anschließendem %s-Fehler fehlgeschlagen ab',
  async (fehlerstelle) => {
    const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
    const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
    const inhalt = '<beschaedigt>';
    const fehler = new Error('Fehler nach erfolgreicher Archivierung');
    dateien.set(pfad, inhalt);
    invoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'datei_sperre_erwerben') return 'markierungstoken';
      if (befehl === 'datei_sperre_freigeben') return;
      if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.delete(pfad);
        dateien.set('sicherung.xml', inhalt);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      if (befehl === 'atomar_datei_schreiben') throw fehler;
      throw new Error(`Unerwarteter nativer Aufruf: ${befehl}`);
    });
    const bulk = vi.fn();
    const abmelden = beiMarkierungenBulkGeaendert(bulk);
    abschliessen.mockImplementationOnce(async () => {
      expect(invoke).toHaveBeenLastCalledWith('datei_sperre_freigeben', {
        token: 'markierungstoken',
      });
      expect(bulk).not.toHaveBeenCalled();
    });
    try {
      await expect(
        aendereEintraege(gesetz, () => {
          if (fehlerstelle === 'bearbeiten') throw fehler;
          return {
            art: 'geaendert',
            eintraege: [
              markierungsEintrag({
                bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
                typ: 'kommentar',
                ausgangsstelle: normAusgangsstelle('§ 1'),
                kommentarText: 'Neu',
              }),
            ],
            ergebnis: undefined,
          };
        }),
      ).rejects.toBe(fehler);
      expect(abschliessen).toHaveBeenCalledExactlyOnceWith('markierungs-vorgang', 'fehlgeschlagen');
      expect(bulk).toHaveBeenCalledExactlyOnceWith(gesetz, 'markierungs-vorgang');
      expect(dateien.has(pfad)).toBe(false);
      expect(dateien.get('sicherung.xml')).toBe(inhalt);
      expect(
        invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben'),
      ).toHaveLength(fehlerstelle === 'schreiben' ? 1 : 0);
    } finally {
      abmelden();
    }
  },
);

it('behält die Bulkprüfung nach Archivierung und nachfolgender Einzeländerung', async () => {
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  const bulk = vi.fn();
  const einzel = vi.fn();
  const abmeldenBulk = beiMarkierungenBulkGeaendert(bulk);
  const abmeldenEinzel = beiMarkierungGeaendert(einzel);
  try {
    await mitMarkierungsQuelle(gesetz, async (_token, _vorgang, geaendert) => {
      geaendert();
      geaendert('einzelner-schluessel');
    });
    expect(bulk).toHaveBeenCalledExactlyOnceWith(gesetz, 'markierungs-vorgang');
    expect(einzel).not.toHaveBeenCalled();
  } finally {
    abmeldenBulk();
    abmeldenEinzel();
  }
});

const quellwege = ['live', 'kombinieren', 'splitten', 'undo', 'redo'] as const;
const quellgesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const quelleintrag: MarkierungsEintrag = markierungsEintrag({
  typ: 'unterstreichung',
  ausgangsstelle: normAusgangsstelle('§ 1'),
  bezug: {
    typ: 'bezugstext' as const,
    textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 8 },
    bezugstext: 'abcdefgh',
  },
});

function bereiteGesetzVor() {
  dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz>abcdefghij</absatz></text></norm></inhalt></gesetz>',
  );
}
async function bereiteQuellwegVor(weg: (typeof quellwege)[number]) {
  bereiteGesetzVor();
  if (weg === 'kombinieren' || weg === 'splitten')
    await schreibeEintraege(quellgesetz, [quelleintrag]);
  vi.clearAllMocks();
  return () => {
    if (weg === 'undo')
      return fuehreRueckgaengigAus({
        art: 'entfernen',
        gesetz: quellgesetz,
        eintrag: quelleintrag,
      });
    if (weg === 'redo')
      return fuehreWiederholenAus({
        art: 'hinzufuegen',
        gesetz: quellgesetz,
        eintrag: quelleintrag,
      });
    const eintrag =
      weg === 'live'
        ? quelleintrag
        : markierungsEintrag({
            ...quelleintrag,
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({}),
                zeichenbereichStart: weg === 'splitten' ? 2 : 6,
                zeichenbereichEnde: weg === 'splitten' ? 4 : 10,
              },
              bezugstext: weg === 'splitten' ? 'cd' : 'ghij',
            },
          });
    return hinzufuegenMarkierung(quellgesetz, eintrag);
  };
}

it.each(quellwege)('%s merkt vor I/O vor und meldet erst nach Quellfreigabe', async (weg) => {
  const ausfuehren = await bereiteQuellwegVor(weg);
  const einzel = vi.fn();
  const bulk = vi.fn();
  const abmeldenEinzel = beiMarkierungGeaendert(einzel);
  const abmeldenBulk = beiMarkierungenBulkGeaendert(bulk);
  abschliessen.mockImplementationOnce(async () => {
    expect(invoke).toHaveBeenLastCalledWith('datei_sperre_freigeben', {
      token: 'markierungstoken',
    });
    expect(einzel).not.toHaveBeenCalled();
    expect(bulk).not.toHaveBeenCalled();
  });
  try {
    await ausfuehren();
    expect(vormerken).toHaveBeenCalledTimes(1);
    expect(vormerken.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]!);
    expect(abschliessen).toHaveBeenCalledExactlyOnceWith('markierungs-vorgang', 'geaendert');
    expect(invoke).toHaveBeenCalledWith(
      'atomar_datei_schreiben',
      expect.objectContaining({
        relativerPfad: 'markierungen/BGB_de-bund-markierungen.xml',
        token: 'markierungstoken',
        vorgang: 'markierungs-vorgang',
      }),
    );
    if (weg === 'kombinieren' || weg === 'splitten') {
      expect(bulk).toHaveBeenCalledExactlyOnceWith(quellgesetz, 'markierungs-vorgang');
      expect(einzel).not.toHaveBeenCalled();
    } else {
      expect(einzel).toHaveBeenCalledExactlyOnceWith(
        quellgesetz,
        identitaetsSchluessel(quelleintrag),
        'markierungs-vorgang',
      );
      expect(bulk).not.toHaveBeenCalled();
    }
  } finally {
    abmeldenEinzel();
    abmeldenBulk();
  }
});

it.each(quellwege)('%s bricht bei Vorabfehler ohne Quell-I/O und Meldung ab', async (weg) => {
  const ausfuehren = await bereiteQuellwegVor(weg);
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const fehler = new Error('Vormerken fehlgeschlagen');
  vormerken.mockRejectedValueOnce(fehler);
  const meldung = vi.fn();
  const abmeldenEinzel = beiMarkierungGeaendert(meldung);
  const abmeldenBulk = beiMarkierungenBulkGeaendert(meldung);
  const vorher = [...dateien];
  try {
    await expect(ausfuehren()).rejects.toBe(fehler);
    expect(invoke).not.toHaveBeenCalled();
    expect(readTextFile).not.toHaveBeenCalled();
    expect(abschliessen).not.toHaveBeenCalled();
    expect(meldung).not.toHaveBeenCalled();
    expect([...dateien]).toEqual(vorher);
  } finally {
    abmeldenEinzel();
    abmeldenBulk();
  }
});

it.each(quellwege)('%s bleibt trotz Abschlussfehler gespeichert und erfolgreich', async (weg) => {
  const ausfuehren = await bereiteQuellwegVor(weg);
  abschliessen.mockRejectedValueOnce(new Error('Abschluss fehlgeschlagen'));
  const konsolenFehler = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const ergebnis = await ausfuehren();
    expect(typeof ergebnis === 'boolean' ? ergebnis : ergebnis.erfolgreich).toBe(true);
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('wurde gespeichert') }),
    );
    expect(
      invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben'),
    ).toHaveLength(1);
  } finally {
    konsolenFehler.mockRestore();
  }
});

it.each(['duplikat', 'ueberlappung'] as const)(
  'schließt Live-No-op %s ohne Meldung und Undo-Aktion ab',
  async (art) => {
    bereiteGesetzVor();
    const kommentar: MarkierungsEintrag = markierungsEintrag({
      ...quelleintrag,
      typ: 'kommentar',
      kommentarText: 'Kommentar',
      ...(art === 'duplikat'
        ? { bezug: { typ: 'pauschal' as const, elementstand: testElementstand() } }
        : {}),
    });
    await schreibeEintraege(quellgesetz, [kommentar]);
    const vorher = [...dateien];
    vi.clearAllMocks();
    const meldung = vi.fn();
    const abmeldenEinzel = beiMarkierungGeaendert(meldung);
    const abmeldenBulk = beiMarkierungenBulkGeaendert(meldung);
    try {
      expect(await hinzufuegenMarkierung(quellgesetz, kommentar)).toEqual({
        erfolgreich: false,
        ablehnungsgrund: art,
      });
      expect([...dateien]).toEqual(vorher);
      expect(abschliessen).toHaveBeenCalledExactlyOnceWith('markierungs-vorgang', 'unveraendert');
      expect(meldung).not.toHaveBeenCalled();
      expect(
        invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben'),
      ).toHaveLength(0);
    } finally {
      abmeldenEinzel();
      abmeldenBulk();
    }
  },
);

it.each(['live', 'undo', 'redo'] as const)(
  '%s archiviert mit Vorgangsreferenz und behält Bulkprüfung',
  async (weg) => {
    const ausfuehren = await bereiteQuellwegVor(weg);
    const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
    dateien.set(pfad, '<beschaedigt>');
    const bisherigerInvoke = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (befehl, argumente) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.set('sicherung.xml', dateien.get(pfad) ?? '');
        dateien.delete(pfad);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      return bisherigerInvoke(befehl, argumente);
    });
    const einzel = vi.fn();
    const bulk = vi.fn();
    const abmeldenEinzel = beiMarkierungGeaendert(einzel);
    const abmeldenBulk = beiMarkierungenBulkGeaendert(bulk);
    try {
      await ausfuehren();
      expect(invoke).toHaveBeenCalledWith(
        'archiviere_beschaedigte_datei',
        expect.objectContaining({ token: 'markierungstoken', vorgang: 'markierungs-vorgang' }),
      );
      expect(bulk).toHaveBeenCalledExactlyOnceWith(quellgesetz, 'markierungs-vorgang');
      expect(einzel).not.toHaveBeenCalled();
      expect(await ladeEintraegeFuerPruefung(quellgesetz)).toEqual([
        weg === 'live' ? { ...quelleintrag, erstellt: expect.any(String) } : quelleintrag,
      ]);
    } finally {
      abmeldenEinzel();
      abmeldenBulk();
    }
  },
);

it.each(['live', 'kombinieren', 'undo'] as const)(
  '%s liefert bei fehlerhaftem Nachherempfänger weiterhin Speichererfolg',
  async (weg) => {
    const ausfuehren = await bereiteQuellwegVor(weg);
    const konsolenFehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    const empfange = () => {
      throw new Error('Benachrichtigung fehlgeschlagen');
    };
    const abmeldenEinzel = beiMarkierungGeaendert(empfange);
    const abmeldenBulk = beiMarkierungenBulkGeaendert(empfange);
    try {
      const ergebnis = await ausfuehren();
      expect(typeof ergebnis === 'boolean' ? ergebnis : ergebnis.erfolgreich).toBe(true);
      expect(
        invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben'),
      ).toHaveLength(1);
      expect(konsolenFehler).toHaveBeenCalled();
    } finally {
      abmeldenEinzel();
      abmeldenBulk();
      konsolenFehler.mockRestore();
    }
  },
);

it('stellt Verweise samt Zielreferenz und Ausgangspräfix unverändert wieder her', async () => {
  const verweis: MarkierungsEintrag = markierungsEintrag({
    ...quelleintrag,
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle(
      ['Buch 1', bezeichnungAusgangsstelle(quelleintrag.ausgangsstelle).replace(/^\S+\s+/, '')]
        .filter(Boolean)
        .join(' '),
    ),
    verweisinhalt: {
      verweistext: '§ 3 StGB',
      verweisziele: [
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: { kurztitel: 'StGB', normgeber: 'de-bund' },
          bezeichnung: '§ 3',
          verweistextZeichenbereich: [0, 8],
        }),
      ],
    },
  });
  await fuehreRueckgaengigAus({ art: 'entfernen', gesetz: quellgesetz, eintrag: verweis });
  expect(await ladeEintraegeFuerPruefung(quellgesetz)).toEqual([verweis]);
});

it.each([
  '<markierungen><infos><gesetz normgeber="de-bund">GG</gesetz></infos><inhalt/></markierungen>',
  '<markierungen><infos><gesetz normgeber="Bund">BGB</gesetz></infos><inhalt/></markierungen>' /* normgeber-negativ: Ungültige Dateizuordnung wird gesichert. */,
  '<markierungen><inhalt></markierungen>',
])(
  'archiviert unlesbare oder falsch zugeordnete Markierungsdateien ohne Übernahme: %s',
  async (inhalt) => {
    const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
    dateien.set(pfad, inhalt);
    const bisherigerInvoke = invoke.getMockImplementation();
    if (!bisherigerInvoke) throw new Error('Native Attrappe fehlt.');
    invoke.mockImplementation(async (befehl, argumente) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.set('sicherung.xml', dateien.get(pfad) ?? '');
        dateien.delete(pfad);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      return bisherigerInvoke(befehl, argumente);
    });
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
    expect(dateien.get('sicherung.xml')).toBe(inhalt);
    expect(dateien.has(pfad)).toBe(false);
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
    expect(
      invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
    ).toHaveLength(1);
  },
);

it('erhält lesbare Nachbareinträge nach Sicherung eines Verweisziels mit ungültigem Normgeber', async () => {
  const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
  const original =
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand><kommentartext>Erhalten</kommentartext></kommentar><verweismarkierung><bezeichnung>§ 2</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand><verweisinhalt><verweistext>GG</verweistext><verweisziel><gesetz normgeber="A_B">GG</gesetz><verweistextZeichenbereich start="0" ende="2"/></verweisziel></verweisinhalt></verweismarkierung></inhalt></markierungen>';
  dateien.set(pfad, original);
  const bisher = invoke.getMockImplementation();
  if (!bisher) throw new Error('Native Dateigrenze fehlt.');
  invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei') {
      dateien.set('sicherung.xml', dateien.get(pfad) ?? '');
      dateien.delete(pfad);
      return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
    }
    return bisher(befehl, args);
  });
  expect(await ladeEintraege(quellgesetz)).toMatchObject([
    { typ: 'kommentar', kommentarText: 'Erhalten' },
  ]);
  expect(dateien.get('sicherung.xml')).toBe(original);
  expect(dateien.get(pfad)).not.toContain('A_B');
  expect(await ladeEintraege(quellgesetz)).toMatchObject([
    { typ: 'kommentar', kommentarText: 'Erhalten' },
  ]);
  expect(
    invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
});
