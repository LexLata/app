import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
// Speichergrenze und ihre fachlichen Aufrufer mit echter XML-/Speicherlogik;
// ersetzt sind ausschließlich native Dateioperationen, Gesetzesladen und Fenster-I/O.
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  speichereVerweismarkierung,
  speichereKommentar,
} from '@/lib/markierungen/markierungen.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  aendereEintraege,
  aktualisiereKommentar,
  beiMarkierungGeaendert,
  beiMarkierungenBulkGeaendert,
  ersetzeMarkierungsXML,
  fuehreRueckgaengigAus,
  fuehreWiederholenAus,
  ladeEintraege,
} from './eintrag.index';
import { baueXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { zusammenfuehrenMarkierungen } from '@/lib/markierungen/dateiimport/dateiimport.index';
import {
  loescheAlleMitKonflikten,
  pruefeMarkierungenSelektiv,
} from '@/lib/markierungen/markierungskonflikte/markierungskonflikte.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const native = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  sperren: new Set<string>(),
  listen: vi.fn(),
  invoke: vi.fn(),
  lesen: vi.fn(),
  gesetze: vi.fn(),
  titel: vi.fn(),
  beimErwerb: vi.fn(),
  beimSchreiben: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (befehl: string, ...argumente: unknown[]) =>
    befehl === 'gesetz_dateistempel_lesen'
      ? Promise.resolve(gesetzDateistempelAttrappe(native.dateien))
      : native.invoke(befehl, ...argumente),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => {}), listen: native.listen }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: native.listen }),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'hilfe' }) }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...t: string[]) => t.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (pfad: string) => native.lesen(pfad.replace('/daten/LexLata/', '')),
  exists: async (pfad: string) => native.dateien.has(pfad.replace('/daten/LexLata/', '')),
  mkdir: vi.fn(),
  readDir: async (pfad: string) =>
    [...native.dateien.keys()]
      .filter((name) => name.startsWith(pfad.replace('/daten/LexLata/', '') + '/'))
      .map((name) => ({ name: name.split('/').at(-1), isDirectory: false })),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetzeFuerPruefung: native.gesetze,
  existierenNichtamtlicheTitelFuerPruefung: native.titel,
  beiSpeicherBatchAbgeschlossen: vi.fn(),
  beiNichtamtlicheTitelGeschrieben: vi.fn(),
}));

const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
const konfliktPfad = 'markierungskonflikte.xml';
function eintrag(werte: Parameters<typeof markierungsEintrag>[0] = {}): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 10,
      },
      bezugstext: 'Text',
    },

    ...werte,
  });
}
function bestand(eintraege: MarkierungsEintrag[]) {
  native.dateien.set(pfad, baueXML(gesetz, eintraege));
}
function schreibaufrufe() {
  return native.invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben');
}

const empfaenger = { vormerken: async () => 'markierungs-vorgang', abschliessen: async () => {} };
beforeEach(() => {
  registrierePruefpflichtigeAenderung(empfaenger);
  vi.clearAllMocks();
  native.listen.mockReset().mockResolvedValue(() => {});
  native.dateien.clear();
  native.sperren.clear();
  native.beimErwerb.mockImplementation(() => {});
  native.beimSchreiben.mockImplementation(() => {});
  native.gesetze.mockResolvedValue([]);
  native.titel.mockResolvedValue(new Set());
  native.lesen.mockImplementation(async (p: string) => {
    if (!native.dateien.has(p)) throw new Error('fehlt');
    return native.dateien.get(p);
  });
  native.invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; token: string; inhalt: string }) => {
      if (befehl === 'datei_sperre_erwerben') {
        expect(native.sperren.has(args.relativerPfad)).toBe(false);
        await native.beimErwerb(args.relativerPfad);
        native.sperren.add(args.relativerPfad);
        return args.relativerPfad;
      }
      if (befehl === 'datei_sperre_freigeben') {
        native.sperren.delete(args.token);
        return;
      }
      if (befehl === 'datei_sperre_unterbrechen') {
        native.sperren.delete(args.token);
        return;
      }
      if (befehl === 'datei_sperre_fortsetzen') {
        native.sperren.add(args.token);
        return true;
      }
      if (befehl.startsWith('pruefvorgang_')) {
        const konfliktToken = (args as unknown as { konfliktToken: string }).konfliktToken;
        expect(konfliktToken).toBe(konfliktPfad);
        expect(native.sperren.has(konfliktPfad)).toBe(true);
        // Diese Fehlerphase hat ihren automatischen Versuch bereits verbraucht.
        if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return false;
        return {
          offeneQuellen: 0,
          offenePruefungen: 0,
          vollbedarf: befehl !== 'pruefvorgang_vollpruefung_abschliessen',
        };
      }
      expect(native.sperren.has(args.relativerPfad)).toBe(true);
      expect(args.token).toBe(args.relativerPfad);
      if (befehl === 'atomar_datei_schreiben') {
        await native.beimSchreiben(args.relativerPfad);
        native.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (befehl === 'app_daten_loeschen') {
        native.dateien.delete(args.relativerPfad);
        return;
      }
      throw new Error(`Unerwarteter Aufruf: ${befehl}`);
    },
  );
});

it('liest erst unter Sperre den inzwischen geänderten Bestand und gibt das fachliche Ergebnis zurück', async () => {
  bestand([eintrag()]);
  const inzwischen = eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') });
  native.beimErwerb.mockImplementationOnce(() => bestand([inzwischen]));
  expect(
    await aendereEintraege(gesetz, (aktuell) => {
      expect(native.sperren.has(pfad)).toBe(true);
      expect(aktuell).toMatchObject([inzwischen]);
      return { art: 'unveraendert', ergebnis: 'aktuell' };
    }),
  ).toBe('aktuell');
  expect(schreibaufrufe()).toHaveLength(0);
  expect(native.sperren.size).toBe(0);
});

it('No-op schreibt und meldet nichts', async () => {
  bestand([eintrag()]);
  const einzel = vi.fn();
  const bulk = vi.fn();
  const ab1 = beiMarkierungGeaendert(einzel);
  const ab2 = beiMarkierungenBulkGeaendert(bulk);
  try {
    await aendereEintraege(gesetz, () => ({ art: 'unveraendert', ergebnis: undefined }));
    expect(schreibaufrufe()).toHaveLength(0);
    expect(einzel).not.toHaveBeenCalled();
    expect(bulk).not.toHaveBeenCalled();
  } finally {
    ab1();
    ab2();
  }
});

it.each(['liste', 'xml'] as const)(
  '%s: Schreibfehler erhält Datei und meldet keine Änderung',
  async (art) => {
    const alt = eintrag();
    bestand([alt]);
    const vorher = native.dateien.get(pfad);
    const fehler = new Error('Schreiben verweigert');
    native.beimSchreiben.mockRejectedValueOnce(fehler);
    const einzel = vi.fn();
    const bulk = vi.fn();
    const ab1 = beiMarkierungGeaendert(einzel);
    const ab2 = beiMarkierungenBulkGeaendert(bulk);
    try {
      const aktion =
        art === 'xml'
          ? ersetzeMarkierungsXML(gesetz, '<markierungen><erweiterung/></markierungen>')
          : aendereEintraege(gesetz, () => ({
              art: 'geaendert',
              eintraege: [],
              ergebnis: undefined,
            }));
      await expect(aktion).rejects.toBe(fehler);
      expect(native.dateien.get(pfad)).toBe(vorher);
      expect(native.sperren.size).toBe(0);
      expect(einzel).not.toHaveBeenCalled();
      expect(bulk).not.toHaveBeenCalled();
    } finally {
      ab1();
      ab2();
    }
  },
);

it('ersetzt geprüftes Raw-XML einschließlich unbekannter Erweiterungen mit eigener Wurzelversion', async () => {
  const xml =
    '<markierungen version="2"><unbekannt wert="x"/><inhalt/><erweiterung>Text</erweiterung></markierungen>';
  const bulk = vi.fn();
  const ab = beiMarkierungenBulkGeaendert(bulk);
  try {
    await ersetzeMarkierungsXML(gesetz, xml);
    expect(native.dateien.get(pfad)).toBe(xml.replace('version="2"', 'version="1"'));
    expect(bulk).toHaveBeenCalledExactlyOnceWith(gesetz, 'markierungs-vorgang');
  } finally {
    ab();
  }
});

it.each([true, false])(
  'Import mehrerer teilweise überlappender Partner, bestehende behalten: %s',
  async (behalten) => {
    const alt = [
      eintrag({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 4,
          },
          bezugstext: '',
        },
      }),
      eintrag({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 6,
            zeichenbereichEnde: 20,
          },
          bezugstext: '',
        },
      }),
    ];
    const neu = eintrag({
      typ: 'hervorhebung',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 2,
          zeichenbereichEnde: 8,
        },
        bezugstext: '',
      },
    });
    bestand(alt);
    const bulk = vi.fn();
    const ab = beiMarkierungenBulkGeaendert(bulk);
    try {
      await zusammenfuehrenMarkierungen(gesetz, [neu], behalten);
      expect(await ladeEintraege(gesetz)).toMatchObject(behalten ? alt : [neu]);
      expect(schreibaufrufe()).toHaveLength(behalten ? 0 : 1);
      expect(bulk).toHaveBeenCalledTimes(behalten ? 0 : 1);
      if (!behalten)
        expect(schreibaufrufe()[0]![1]).toMatchObject({ relativerPfad: pfad, token: pfad });
    } finally {
      ab();
    }
  },
);

it('Import erhält angrenzende Bereiche, andere Textpfade und andere Normen', async () => {
  const alt = [
    eintrag({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 2,
        },
        bezugstext: '',
      },
    }),
    eintrag({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 8,
          zeichenbereichEnde: 12,
        },
        bezugstext: '',
      },
    }),
    eintrag({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(2)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 10,
        },
        bezugstext: '',
      },
    }),
    eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') }),
  ];
  const neu = eintrag({
    typ: 'hervorhebung',
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 2,
        zeichenbereichEnde: 8,
      },
      bezugstext: '',
    },
  });
  bestand(alt);
  await zusammenfuehrenMarkierungen(gesetz, [neu], false);
  const gelesen = await ladeEintraege(gesetz);
  expect(gelesen).toHaveLength(5);
  for (const erwartet of [...alt, neu])
    expect(gelesen).toContainEqual(expect.objectContaining(erwartet));
  expect(schreibaufrufe()).toHaveLength(1);
});

it.each([true, false])(
  'Importliste wird sequenziell verarbeitet, bestehende behalten: %s',
  async (behalten) => {
    const erster = eintrag();
    const zweiter = eintrag({
      typ: 'hervorhebung',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 5,
          zeichenbereichEnde: 15,
        },
        bezugstext: '',
      },
    });
    await zusammenfuehrenMarkierungen(gesetz, [erster, zweiter], behalten);
    expect(await ladeEintraege(gesetz)).toMatchObject([behalten ? erster : zweiter]);
    expect(schreibaufrufe()).toHaveLength(1);
  },
);

it.each(['kommentar', 'verweismarkierung'] as const)(
  'allgemeine %s-Duplikate ersetzen alle Partner, andere Inhalte bleiben',
  async (typ) => {
    const allgemein = (text: string) =>
      eintrag({
        typ,
        bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
        kommentarText: typ === 'kommentar' ? text : undefined,
        verweisinhalt:
          typ === 'verweismarkierung'
            ? {
                verweistext: text,
                verweisziele: [
                  verweisziel({
                    typ: 'zielnormOhneElementstand',
                    bezeichnung: '2',
                    verweistextZeichenbereich: [0, 3],
                  }),
                ],
              }
            : undefined,
      });
    const gleich = allgemein('gleich');
    const anders = allgemein('anders');
    bestand([gleich, gleich, anders]);
    await zusammenfuehrenMarkierungen(gesetz, [gleich], true);
    expect(schreibaufrufe()).toHaveLength(0);
    await zusammenfuehrenMarkierungen(gesetz, [gleich], false);
    // Vollständiger Bestand; pauschale Einträge besitzen keine Pfad-/Grenzfelder.
    expect(await ladeEintraege(gesetz)).toEqual([anders, gleich]);
    expect(schreibaufrufe()).toHaveLength(1);
  },
);

it('Sammellöschung prüft nach freigegebenen Quellsperren auch zwischenzeitliche GG-Konflikte neu', async () => {
  bestand([eintrag()]);
  native.dateien.set(
    konfliktPfad,
    '<markierungskonflikte><gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>',
  );
  native.beimErwerb.mockImplementationOnce(async () => {
    const gg = { kurztitel: 'GG', normgeber: 'de-bund' };
    native.dateien.set('markierungen/GG_de-bund-markierungen.xml', baueXML(gg, [eintrag()]));
    await pruefeMarkierungenSelektiv([gg]);
    expect(native.dateien.get(konfliktPfad)).toContain('kurztitel="GG"');
  });
  native.gesetze.mockImplementation(async () => {
    // Die Prüfung liest Quellen ohne gehaltene Konfliktsperre.
    expect([...native.sperren]).toEqual([]);
    return [];
  });
  await loescheAlleMitKonflikten([{ gesetz, fehlendesGesetz: true, eintraege: [] }]);
  expect(native.dateien.has(pfad)).toBe(false);
  expect(native.dateien.get(konfliktPfad)).toContain('kurztitel="GG"');
  expect(native.dateien.get(konfliktPfad)).not.toContain('kurztitel="BGB"');
  expect(native.sperren.size).toBe(0);
});

it.each(['lesen', 'berechnen', 'schreiben'] as const)(
  'Sammellöschung: %s-Fehler erhält letzten Befund und wird weitergegeben',
  async (art) => {
    const vorher =
      '<markierungskonflikte><gesetz kurztitel="Alt" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>';
    native.dateien.set(konfliktPfad, vorher);
    const fehler = new Error(art);
    if (art === 'lesen')
      native.lesen.mockImplementation(async (p: string) => {
        if (p === konfliktPfad) throw fehler;
        throw new Error('fehlt');
      });
    if (art === 'berechnen') native.titel.mockRejectedValueOnce(fehler);
    if (art === 'schreiben') {
      native.dateien.set(
        'markierungen/GG_de-bund-markierungen.xml',
        baueXML({ kurztitel: 'GG', normgeber: 'de-bund' }, [eintrag()]),
      );
      native.beimSchreiben.mockRejectedValueOnce(fehler);
    }
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(loescheAlleMitKonflikten([])).rejects.toBe(fehler);
      if (art === 'berechnen') {
        const alt = new DOMParser().parseFromString(vorher, 'application/xml').documentElement;
        const neu = new DOMParser().parseFromString(
          native.dateien.get(konfliktPfad)!,
          'application/xml',
        ).documentElement;
        expect(neu.getAttribute('pruefstatus')).toBe('fehlgeschlagen');
        expect(new XMLSerializer().serializeToString(neu.children[0]!)).toBe(
          new XMLSerializer().serializeToString(alt.children[0]!),
        );
      } else expect(native.dateien.get(konfliktPfad)).toBe(vorher);
      // Die öffentliche Fehlerweitergabe wartet nicht auf den nachfolgenden Retryauftrag.
      await vi.waitFor(() => expect(native.sperren.size).toBe(0));
      expect(native.sperren.size).toBe(0);
    } finally {
      protokoll.mockRestore();
    }
  },
);

it('Sammellöschung erhält fachlich nicht ausgewählte Markierungen und speichert konfliktfreien Bestand mit Prüfstatus', async () => {
  const ausgewaehlt = eintrag();
  const titel = eintrag({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: bereichPfad('nichtamtlicherTitel'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 10,
      },
      bezugstext: '',
    },
  });
  const behalten = eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') });
  bestand([ausgewaehlt, titel, behalten]);
  native.gesetze.mockResolvedValue([
    { ...gesetz, langtitel: 'BGB', hatGliederungsartikel: false, elemente: [] },
  ]);
  native.dateien.set(
    konfliktPfad,
    '<markierungskonflikte><gesetz kurztitel="Alt" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>',
  );
  await loescheAlleMitKonflikten([
    {
      gesetz,
      nichtamtlicheTitelXmlFehlt: true,
      eintraege: [
        {
          schluessel: identitaetsSchluessel(ausgewaehlt),
          markierungstyp: 'unterstreichung',
          bezeichnungAnzeige: '§ 1',
          ausgangsstelle: normAusgangsstelle('§ 1'),
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
        },
      ],
    },
  ]);
  expect(await ladeEintraege(gesetz)).toMatchObject([behalten]);
  // Die verbliebene Markierung kann mangels Norm einen Konflikt ergeben; kein Altblock überlebt.
  expect(native.dateien.get(konfliktPfad) ?? '').not.toContain('kurztitel="Alt"');
  await aendereEintraege(gesetz, () => ({ art: 'geaendert', eintraege: [], ergebnis: undefined }));
  await loescheAlleMitKonflikten([]);
  expect(native.dateien.get(konfliktPfad)).toContain('pruefstatus="aktuell"');
  expect(native.dateien.get(konfliktPfad)).not.toContain('<gesetz ');
  expect(native.sperren.size).toBe(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('gibt Datei- und Konfliktsperren vor dem Warten auf die Historienbestätigung frei', async () => {
  native.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung></norm></inhalt></gesetz>',
  );
  const gesetzSpeicher = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.spyOn(gesetzSpeicher, 'ladeAlleGesetze').mockResolvedValueOnce([
    gesetzDarstellung({
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: 'n', xmlId: 'n', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    }),
  ]);
  vi.useFakeTimers();
  vi.stubGlobal('window', {
    __TAURI_INTERNALS__: {
      transformCallback: () => 1,
      invoke: async (befehl: string) => {
        if (befehl === 'plugin:event|listen') {
          await native.listen();
          return 1;
        }
        if (befehl === 'plugin:event|emit_to' || befehl === 'plugin:event|unlisten') return;
        throw new Error(befehl);
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
  const controller = new AbortController();
  const runde = speichereKommentar(
    {
      gesetz,
      openerLabel: 'main',
      ausgangsstelle: normAusgangsstelle('§ 1'),
    },
    markierungsEinzelzugriffFuerTest,
    'Gespeichert',
    false,
    controller.signal,
  );
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(50);
  expect(native.listen).toHaveBeenCalledOnce();
  expect(schreibaufrufe()).toHaveLength(1);
  expect([...native.sperren]).toEqual([]);
  // Ein anderer fachlicher Schreibweg kann abschließen, während die Runde noch wartet.
  const [gespeichert] = await ladeEintraege(gesetz);
  expect(gespeichert).toBeDefined();
  expect(
    await aendereEintraege(gesetz, (alle) => ({
      art: 'geaendert',
      eintraege: alle.map((e) => markierungsEintrag({ ...e, kommentarText: 'Zweiter' })),
      ergebnis: true,
    })),
  ).toBe(true);
  expect(schreibaufrufe()).toHaveLength(2);
  expect([...native.sperren]).toEqual([]);
  controller.abort();
  await expect(runde).resolves.toMatchObject({ art: 'uebertragungOffen' });
  expect(vi.getTimerCount()).toBe(0);
});

it('Bulk-Kopien mit geänderter Reihenfolge zählen nicht als Änderung und melden nichts', async () => {
  const alle = [eintrag(), eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') })];
  bestand(alle);
  const bulk = vi.fn();
  const ab = beiMarkierungenBulkGeaendert(bulk);
  try {
    expect(
      await aendereEintraege(gesetz, (aktuell) => ({
        art: 'geaendert',
        eintraege: [...aktuell].reverse().map((e) => markierungsEintrag({ ...e })),
        ergebnis: 'unverändert',
      })),
    ).toBe('unverändert');
    expect(schreibaufrufe()).toHaveLength(0);
    expect(bulk).not.toHaveBeenCalled();
  } finally {
    ab();
  }
});

it('unveränderte Kommentar-Bearbeitung schließt ohne Schreiben oder Historienauftrag ab', async () => {
  const alt = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar' as const,
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'gleich',
  });
  bestand([alt]);
  const meldung = vi.fn();
  const ab = beiMarkierungGeaendert(meldung);
  try {
    expect(
      await speichereKommentar(
        {
          gesetz,
          openerLabel: 'main',
          ausgangsstelle: normAusgangsstelle('§ 1'),
          bearbeiten: {
            kommentarText: 'gleich',
            vorher: { kommentarText: 'gleich', elementstand: alt.bezug.elementstand },
          },
        },
        markierungsEinzelzugriffFuerTest,
        'gleich',
        false,
      ),
    ).toEqual({ art: 'erfolg', unveraendert: true });
    expect(schreibaufrufe()).toHaveLength(0);
    expect(meldung).not.toHaveBeenCalled();
    expect(native.listen).not.toHaveBeenCalled();
  } finally {
    ab();
  }
});

it('unveränderte Aktualisierung und Undo/Redo unterscheiden sich von fehlendem Eintrag', async () => {
  const alt = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar' as const,
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'gleich',
  });
  bestand([alt]);
  expect(
    await aktualisiereKommentar(gesetz, alt, 'gleich', { elementstand: alt.bezug.elementstand }),
  ).toBe('unveraendert');
  expect(
    await aktualisiereKommentar(gesetz, { ...alt, kommentarText: 'fehlt' }, 'gleich', {}),
  ).toBe('nichtGefunden');
  const aktion = {
    art: 'kommentarBearbeiten' as const,
    gesetz,
    ziel: { ausgangsstelle: normAusgangsstelle('§ 1') },
    vorher: { kommentarText: 'gleich', elementstand: alt.bezug.elementstand },
    nachher: { kommentarText: 'gleich', elementstand: alt.bezug.elementstand },
  };
  expect(await fuehreRueckgaengigAus(aktion)).toBe(true);
  expect(await fuehreWiederholenAus(aktion)).toBe(true);
  expect(schreibaufrufe()).toHaveLength(0);
});

it('identischer Inhalt bleibt auch beim Sekundenwechsel ohne Schreiben und Meldung', async () => {
  const alt = eintrag();
  bestand([alt]);
  const OriginalDate = Date;
  let nummer = 0;
  class WechselDate extends OriginalDate {
    constructor() {
      super(1700000000000 + nummer++ * 1000);
    }
  }
  vi.stubGlobal('Date', WechselDate);
  const meldung = vi.fn();
  const ab = beiMarkierungGeaendert(meldung);
  try {
    await aendereEintraege(gesetz, (alle) => ({
      art: 'geaendert',
      eintraege: alle.map((e) => markierungsEintrag({ ...e })),
      ergebnis: undefined,
    }));
    expect(schreibaufrufe()).toHaveLength(0);
    expect(meldung).not.toHaveBeenCalled();
  } finally {
    ab();
    vi.unstubAllGlobals();
  }
});

it('unlesbare Ausgangsquelle erhält den vorhandenen Kommentar-Elementstand ohne Schreiben', async () => {
  const alt = markierungsEintrag({
    typ: 'kommentar' as const,
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'alt',
    bezug: { typ: 'pauschal' as const, elementstand: { titel: 'amtlich', textlaenge: 42 } },
  });
  bestand([alt]);
  const vorher = native.dateien.get(pfad);
  native.dateien.set('gesetze/BGB_de-bund.xml', 'vorhandene Quelle');
  native.lesen.mockImplementation(async (p: string) => {
    if (p.startsWith('gesetze/')) throw new Error('Quelle unlesbar');
    return native.dateien.get(p) ?? null;
  });
  await expect(
    speichereKommentar(
      {
        gesetz,
        openerLabel: 'main',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bearbeiten: {
          kommentarText: 'alt',
          vorher: { kommentarText: 'alt', elementstand: alt.bezug.elementstand },
        },
      },
      markierungsEinzelzugriffFuerTest,
      'neu',
      false,
    ),
  ).rejects.toThrow();
  expect(native.dateien.get(pfad)).toBe(vorher);
  expect(schreibaufrufe()).toHaveLength(0);
  expect(native.listen).not.toHaveBeenCalled();
});

it('Verweis-No-op beendet auch den vollständigen Speichern-Aufruf ohne Historienübertragung', async () => {
  const gesetzModul = await import('@/test/tabs/gesetzSpeicherTestzugang');
  const laden = vi.spyOn(gesetzModul, 'ladeAlleGesetze').mockResolvedValue([
    {
      ...gesetz,

      langtitel: 'BGB',
      hatGliederungsartikel: false,
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: '1', xmlId: '1', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    },
  ]);
  const verweisinhalt = {
    verweistext: '§ 1',
    verweisziele: [
      verweisziel({
        typ: 'zielnorm',
        bezeichnung: '§ 1',

        elementstand: testElementstand(),
        verweistextZeichenbereich: [0, 3] as [number, number],
      }),
    ],
  };
  const elementstand = testElementstand();
  bestand([
    markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt,
      bezug: { typ: 'pauschal' as const, elementstand: elementstand },
    }),
  ]);
  try {
    const ergebnis = await speichereVerweismarkierung(
      {
        gesetz,
        openerLabel: 'main',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bearbeiten: { zitatText: '§ 1', vorher: { verweisinhalt, elementstand } },
      },
      markierungsEinzelzugriffFuerTest,
      '§ 1',
      false,
      false,
      new Map(),
    );
    expect(ergebnis).toEqual({ art: 'erfolg', unveraendert: true });
    expect(schreibaufrufe()).toHaveLength(0);
    expect(native.listen).not.toHaveBeenCalled();
  } finally {
    laden.mockRestore();
  }
});

it.each([
  ['kommentar', true],
  ['kommentar', false],
  ['verweismarkierung', true],
  ['verweismarkierung', false],
] as const)(
  '%s (Textbezug=%s): echte Speicherung erhält Ausgangsdaten und Undo/Redo samt Restkonflikt',
  async (typ, hatTextbezug) => {
    const { ladeAlleGesetze } = await import('@/test/tabs/gesetzSpeicherTestzugang');
    const uebertragung =
      await import('@/lib/markierungen/hilfsfenster-aktionen/hilfsfenster-aktionen.index');
    const { registriereMarkierungsHistorienEmpfang } = uebertragung;
    const { pruefeMarkierung } = await import('@/lib/markierungen/gemeinsam/gemeinsam.index');
    const textbezug = hatTextbezug
      ? {
          bezugstext: '§ 9',
          textstelle: {
            pfad: bereichPfad('bezeichnung' as const),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 3,
          },
        }
      : undefined;
    const elementstand = hatTextbezug ? undefined : { titel: 'Gespeichert', textlaenge: 123 };
    const pfad = hatTextbezug ? bereichPfad('bezeichnung') : normtextPfad({});
    const vorherAusgang = { elementstand };
    const restkonflikt = hatTextbezug ? 'bezugstextFehltOderUnpassend' : 'pauschalerBezugFehlt';
    const alt: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 9'),

      ...textbezug,
      ...vorherAusgang,
      ...(typ === 'kommentar'
        ? { kommentarText: 'Alt' }
        : {
            verweisinhalt: {
              verweistext: '§ 9',
              verweisziele: [
                verweisziel({
                  typ: 'zielnorm',
                  bezeichnung: '§ 9',

                  elementstand: testElementstand(),
                  verweistextZeichenbereich: [0, 3],
                }),
              ],
            },
          }),
    });
    bestand([alt]);
    // GesetzesXML, Parser, strikte Ausgangsauflösung und Speicher bleiben echt.
    native.dateien.set(
      'gesetze/BGB_de-bund.xml',
      '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber><langtitel>BGB</langtitel></infos><inhalt><norm id="90"><bezeichnung>§ 90</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
    );
    const quellGesetze = await ladeAlleGesetze();
    expect(quellGesetze).toHaveLength(1);
    native.gesetze.mockResolvedValue(quellGesetze);
    let aktion: import('./eintrag.index').MarkierungsAktion | undefined;
    // Reales Historienprotokoll mit Bestätigung, nur native Zustellung ersetzt.
    const callbacks = new Map<string, (event: { payload: unknown }) => void>();
    native.listen.mockImplementation(async (name, callback) => {
      callbacks.set(name, callback);
      return () => callbacks.delete(name);
    });
    const ipc = await import('@tauri-apps/api/event');
    const senden = vi.mocked(ipc.emitTo).mockImplementation(async (_label, name, payload) => {
      callbacks.get(name)?.({ payload });
    });
    const abmelden = await registriereMarkierungsHistorienEmpfang((empfangen) => {
      aktion = empfangen;
    });
    const basis = {
      gesetz,
      openerLabel: 'hilfe',
      ausgangsstelle: normAusgangsstelle('§ 9'),
    };
    try {
      const ergebnis =
        typ === 'kommentar'
          ? await speichereKommentar(
              {
                ...basis,
                bearbeiten: {
                  kommentarText: 'Alt',
                  vorher: { kommentarText: 'Alt', ...vorherAusgang },
                  textbezug: textbezug
                    ? {
                        textstelle: {
                          pfad,
                          zeichenbereichStart: textbezug.textstelle.zeichenbereichStart,
                          zeichenbereichEnde: textbezug.textstelle.zeichenbereichEnde,
                        },
                        bezugstext: textbezug.bezugstext,
                      }
                    : undefined,
                },
              },
              markierungsEinzelzugriffFuerTest,
              'Neu',
              false,
            )
          : await speichereVerweismarkierung(
              {
                ...basis,
                bearbeiten: {
                  zitatText: '§ 9',
                  vorher: { verweisinhalt: alt.verweisinhalt!, ...vorherAusgang },
                  textbezug: textbezug
                    ? {
                        textstelle: {
                          pfad,
                          zeichenbereichStart: textbezug.textstelle.zeichenbereichStart,
                          zeichenbereichEnde: textbezug.textstelle.zeichenbereichEnde,
                        },
                        bezugstext: textbezug.bezugstext,
                      }
                    : undefined,
                },
              },
              markierungsEinzelzugriffFuerTest,
              '§ 90',
              false,
              false,
              new Map(),
            );
      expect(ergebnis).toEqual({ art: 'erfolg' });
      expect(aktion).toBeDefined();
      const neu = (await ladeEintraege(gesetz))[0]!;
      expect({
        ...neu,
        kommentarText: alt.kommentarText,
        verweisinhalt: alt.verweisinhalt,
      }).toEqual({
        ...alt,
        geaendert: expect.any(String),
        kommentarText: alt.kommentarText,
        verweisinhalt: alt.verweisinhalt,
      });
      expect(
        pruefeMarkierung(neu, quellGesetze[0]!, quellGesetze, new Set())[0]!.eigenerKonflikt,
      ).toBe(restkonflikt);
      await pruefeMarkierungenSelektiv([gesetz]);
      expect(native.dateien.get(konfliktPfad)).toContain(
        hatTextbezug ? 'bezugstext-fehlt-oder-unpassend' : 'pauschaler-bezug-fehlt',
      );
      await fuehreRueckgaengigAus(aktion!);
      expect(await ladeEintraege(gesetz)).toEqual([alt]);
      await fuehreWiederholenAus(aktion!);
      expect(await ladeEintraege(gesetz)).toEqual([neu]);
      await pruefeMarkierungenSelektiv([gesetz]);
      expect(native.dateien.get(konfliktPfad)).toContain(
        hatTextbezug ? 'bezugstext-fehlt-oder-unpassend' : 'pauschaler-bezug-fehlt',
      );
    } finally {
      abmelden();
      senden.mockReset();
    }
  },
);

it.each([
  bereichPfad('amtlicherTitel' as const),
  normtextPfad({ absatz: '(1)', unterabsatz: '[2]', satz: 3 }),
  normtextPfad({
    absatz: '(1)',
    satz: 3,
    eintraege: [
      { ebene: 'nummer' as const, bezeichnung: '1' },
      { ebene: 'litera' as const, bezeichnung: 'a', wiederholung: 2 },
    ],
    satzInEintrag: 4,
  }),
])('legt den gebündelten Auswahlbezug vollständig im Speicher an: %j', async (textpfad) => {
  const text = textpfad.unterabsatz
    ? '<unterabsatz zahl="[2]"><satz zahl="3">xx A&#160;B</satz></unterabsatz>'
    : '<satz zahl="3"><nummer zahl="1"><litera buchstabe="a">Vorher</litera><litera buchstabe="a">Vorher</litera><litera buchstabe="a"><satz zahl="4">xx A&#160;B</satz></litera></nummer></satz>';
  native.dateien.set(
    'gesetze/BGB_de-bund.xml',
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><titel>xx A&#160;B</titel><text><absatz zahl="(1)">${text}</absatz></text></norm></inhalt></gesetz>`,
  );
  const gesetzModul = await import('@/test/tabs/gesetzSpeicherTestzugang');
  const laden = vi.spyOn(gesetzModul, 'ladeAlleGesetze').mockResolvedValue([
    gesetzDarstellung({
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({
            id: '1',
            xmlId: '1',
            bezeichnung: '§ 1',
            titel: 'xx A\u00a0B',
            absaetze: [],
          }),
        },
      ],
    }),
  ]);
  const callbacks = new Map<string, (event: { payload: unknown }) => void>();
  native.listen.mockImplementation(async (name, callback) => {
    callbacks.set(name, callback);
    return () => callbacks.delete(name);
  });
  const ipc = await import('@tauri-apps/api/event');
  vi.mocked(ipc.emitTo).mockImplementation(async (_label, name, payload) => {
    callbacks.get(name)?.({ payload });
  });
  const { registriereMarkierungsHistorienEmpfang } =
    await import('@/lib/markierungen/markierungen.index');
  const abmelden = await registriereMarkierungsHistorienEmpfang(() => {});
  try {
    const ergebnis = await speichereKommentar(
      {
        gesetz,
        openerLabel: 'hilfe',
        ausgangsstelle: normAusgangsstelle('§ 1'),

        auswahl: {
          textstelle: { pfad: textpfad, zeichenbereichStart: 2, zeichenbereichEnde: 6 },
          bezugstext: ' A\u00a0B',
        },
      },
      markierungsEinzelzugriffFuerTest,
      'Notiz',
      true,
    );
    expect(ergebnis).toEqual({ art: 'erfolg' });
    expect(await ladeEintraege(gesetz)).toEqual([
      {
        erstellt: expect.any(String),
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('§ 1'),

        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: textpfad, zeichenbereichStart: 2, zeichenbereichEnde: 6 },
          bezugstext: ' A\u00a0B',
        },
        kommentarText: 'Notiz',
      },
    ]);
  } finally {
    laden.mockRestore();
    abmelden();
    vi.mocked(ipc.emitTo).mockReset();
  }
});
