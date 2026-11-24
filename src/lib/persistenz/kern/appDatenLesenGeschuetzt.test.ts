// Der geschützte Lader trennt fehlende, leere und gültige Dateien von
// beschädigten Inhalten. Die nativen Ergebnisse werden hier nur an der
// TypeScript-Grenze geprüft; die Dateisystemgarantien prüft Rust.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import vertraege from '@/test/plattform/native-vertraege.json';

const appDatenLesen = vi.fn<(pfad: string) => Promise<string>>();
const appDatenExistiert = vi.fn<(pfad: string) => Promise<boolean>>();
const invoke = vi.fn();
const zeigeBanner = vi.fn();

vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenLesen: (...args: [string]) => appDatenLesen(...args),
  appDatenExistiert: (...args: [string]) => appDatenExistiert(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: (...args: unknown[]) => zeigeBanner(...args),
  // Dateibefunde ohne Empfänger gehen in das gemeinsame Dateibefund-Banner;
  // derselbe Spy erfasst beide Bannerwege.
  meldeDateibefund: (...args: unknown[]) => zeigeBanner(...args),
}));

const PFAD = 'markierungen/BGB-markierungen.xml';
const WURZEL = 'markierungen';

async function lade(pfad = PFAD, wurzel = WURZEL) {
  const { appDatenLesenGeschuetzt } = await import('./kern.index');
  return appDatenLesenGeschuetzt(pfad, wurzel);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('appDatenLesenGeschuetzt', () => {
  it('liefert null, wenn eine nicht lesbare Datei fehlt', async () => {
    appDatenLesen.mockRejectedValue(new Error('fehlt'));
    appDatenExistiert.mockResolvedValue(false);

    await expect(lade()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it('zeigt bei einer nicht lesbaren vorhandenen Datei Banner A und reicht den Fehler durch', async () => {
    const fehler = new Error('Zugriff verweigert');
    appDatenLesen.mockRejectedValue(fehler);
    appDatenExistiert.mockResolvedValue(true);

    await expect(lade()).rejects.toThrow(fehler);
    expect(invoke).not.toHaveBeenCalled();
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: 'fehler',
        grund: 'nichtLesbar',
        betroffen: 'BGB-markierungen.xml',
      }),
    );
  });

  it.each(['<markierungen></markierungen>', '<markierungen version="1">Inhalt</markierungen>'])(
    'liefert gültigen Inhalt ohne Sicherung zurück',
    async (inhalt) => {
      appDatenLesen.mockResolvedValue(inhalt);

      await expect(lade()).resolves.toBe(inhalt);
      expect(invoke).not.toHaveBeenCalled();
      expect(zeigeBanner).not.toHaveBeenCalled();
    },
  );

  it.each(['', ' \n\t '])('behandelt leeren Inhalt als fehlende Datei', async (inhalt) => {
    appDatenLesen.mockResolvedValue(inhalt);

    await expect(lade()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it.each(['Text', '<markierungen>'])(
    'archiviert nicht leeren beschädigten Inhalt',
    async (inhalt) => {
      appDatenLesen.mockResolvedValue(inhalt);
      invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: `${PFAD}.bak` });

      await expect(lade()).resolves.toBeNull();
      expect(invoke).toHaveBeenCalledWith('archiviere_beschaedigte_datei', {
        relativerPfad: PFAD,
        erwarteterInhalt: inhalt,
      });
      expect(zeigeBanner).toHaveBeenCalledWith(
        expect.objectContaining({
          typ: 'warnung',
          grund: 'imDatenordnerGesichert',
          betroffen: 'BGB-markierungen.xml',
        }),
      );
    },
  );

  it('zeigt bei einem Sicherungsfehler Banner B und reicht den Fehler durch', async () => {
    const fehler = new Error('Sicherung nicht möglich');
    appDatenLesen.mockResolvedValue('defekt');
    invoke.mockRejectedValue(fehler);

    await expect(lade()).rejects.toThrow(fehler);
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: 'fehler',
        grund: 'sicherungFehlgeschlagen',
        betroffen: 'BGB-markierungen.xml',
      }),
    );
  });

  it('zeigt bei gesicherter, aber nicht entfernter Datei Banner D', async () => {
    appDatenLesen.mockResolvedValue('defekt');
    invoke.mockResolvedValue({
      status: 'gesichert_aber_nicht_entfernt',
      sicherungspfad: `${PFAD}.bak`,
    });

    const lauf = lade();
    await expect(lauf).rejects.toThrow('nicht entfernt');
    // Sicherungspfad weder im geworfenen Fehler noch im Meldungstext.
    await expect(lauf).rejects.not.toThrow(`${PFAD}.bak`);
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: 'warnung',
        grund: 'gesichertNichtEntfernt',
        betroffen: 'BGB-markierungen.xml',
        sicherung: `${PFAD}.bak`,
        text: expect.not.stringContaining(`${PFAD}.bak`),
      }),
    );
  });

  it('behandelt ein beim nativen Vergleich fehlendes Original als fehlende Datei', async () => {
    appDatenLesen.mockResolvedValue('defekt');
    invoke.mockResolvedValue({ status: 'fehlt', sicherungspfad: null });

    await expect(lade()).resolves.toBeNull();
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it('liest nach einer Veränderung erneut und liefert dann gültigen Inhalt', async () => {
    appDatenLesen
      .mockResolvedValueOnce('defekt')
      .mockResolvedValueOnce('<markierungen></markierungen>');
    invoke.mockResolvedValue({ status: 'veraendert', sicherungspfad: null });

    await expect(lade()).resolves.toBe('<markierungen></markierungen>');
    expect(appDatenLesen).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('archiviert nach einer Veränderung den erneut gelesenen beschädigten Inhalt', async () => {
    appDatenLesen.mockResolvedValueOnce('defekt-1').mockResolvedValueOnce('defekt-2');
    invoke
      .mockResolvedValueOnce({ status: 'veraendert', sicherungspfad: null })
      .mockResolvedValueOnce({ status: 'archiviert', sicherungspfad: `${PFAD}.bak` });

    await expect(lade()).resolves.toBeNull();
    expect(invoke).toHaveBeenLastCalledWith('archiviere_beschaedigte_datei', {
      relativerPfad: PFAD,
      erwarteterInhalt: 'defekt-2',
    });
  });

  it('wirft nach drei Veränderungen und liefert nie null für die vorhandene Datei', async () => {
    appDatenLesen.mockResolvedValue('defekt');
    invoke.mockResolvedValue({ status: 'veraendert', sicherungspfad: null });

    await expect(lade()).rejects.toThrow('hat sich während der Sicherung dreimal verändert');
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: 'fehler',
        grund: 'nichtLesbar',
        betroffen: 'BGB-markierungen.xml',
      }),
    );
  });

  it('zeigt bei zwei gleichzeitigen Ladevorgängen höchstens ein Erfolg-Banner', async () => {
    let lesen = 0;
    appDatenLesen.mockImplementation(async () => {
      lesen += 1;
      return lesen === 1 ? 'defekt' : '<markierungen></markierungen>';
    });
    invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: `${PFAD}.bak` });

    await expect(Promise.all([lade(), lade()])).resolves.toEqual([
      null,
      '<markierungen></markierungen>',
    ]);
    expect(zeigeBanner).toHaveBeenCalledTimes(1);
  });

  it('erkennt beliebige nicht leere Inhalte ohne Wurzel-Tag-Paar als beschädigt', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (inhalt) => {
        fc.pre(inhalt.trim().length > 0);
        fc.pre(!new RegExp(`<${WURZEL}(?:\\s|>)[\\s\\S]*</${WURZEL}>`).test(inhalt));
        appDatenLesen.mockResolvedValue(inhalt);
        invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: `${PFAD}.bak` });

        await expect(lade()).resolves.toBeNull();
        expect(invoke).toHaveBeenLastCalledWith('archiviere_beschaedigte_datei', {
          relativerPfad: PFAD,
          erwarteterInhalt: inhalt,
        });
      }),
    );
  });

  it('sichert beliebige Inhalte mit korrektem Wurzel-Tag-Paar nie', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (vorne, innen) => {
        const inhalt = `${vorne}<${WURZEL}>${innen}</${WURZEL}>`;
        appDatenLesen.mockResolvedValue(inhalt);

        await expect(lade()).resolves.toBe(inhalt);
        expect(invoke).not.toHaveBeenCalled();
      }),
    );
  });
});

it('reicht den Sperrtoken bei der Archivierung beschädigter Inhalte weiter', async () => {
  appDatenLesen.mockResolvedValue('kaputt');
  invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: 'kopie' });
  const { appDatenLesenGeschuetzt } = await import('./kern.index');
  await appDatenLesenGeschuetzt(PFAD, WURZEL, 'token');
  expect(invoke).toHaveBeenCalledWith('archiviere_beschaedigte_datei', {
    relativerPfad: PFAD,
    erwarteterInhalt: 'kaputt',
    token: 'token',
  });
});

describe('sichereBeiUngueltigemInhalt', () => {
  async function sichere(inhalt: string | null, optionen = {}) {
    const { sichereBeiUngueltigemInhalt } = await import('./kern.index');
    return sichereBeiUngueltigemInhalt(PFAD, inhalt, (text) => text === 'gültig', optionen);
  }

  it.each([
    ['gültig', { status: 'gueltig', inhalt: 'gültig' }],
    [null, { status: 'fehlt' }],
    [' \n ', { status: 'leer' }],
  ])('prüft den übergebenen Inhalt ohne Dateizugriff: %s', async (inhalt, ergebnis) => {
    await expect(sichere(inhalt as string | null)).resolves.toEqual(ergebnis);
    expect(appDatenLesen).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it.each(['archiviert', 'gesichert_aber_nicht_entfernt'])(
    'liefert %s samt Sicherungspfad',
    async (status) => {
      invoke.mockResolvedValue({ status, sicherungspfad: 'kopie' });
      await expect(sichere('defekt')).resolves.toEqual({ status, sicherungspfad: 'kopie' });
      expect(zeigeBanner).toHaveBeenCalledWith(expect.objectContaining({ typ: 'warnung' }));
    },
  );

  it.each([true, false])(
    'wirft bei fehlendem nativen Sicherungspfad (Banner: %s)',
    async (bannerAnzeigen) => {
      invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: null });
      await expect(sichere('defekt', { bannerAnzeigen })).rejects.toThrow('keinen Sicherungspfad');
      expect(zeigeBanner).toHaveBeenCalledTimes(bannerAnzeigen ? 1 : 0);
      if (bannerAnzeigen) {
        expect(zeigeBanner).toHaveBeenCalledWith(expect.objectContaining({ typ: 'fehler' }));
      }
    },
  );

  it('liefert fehlt beim nativen Vergleich ohne Erfolgsmeldung', async () => {
    invoke.mockResolvedValue({ status: 'fehlt', sicherungspfad: null });
    await expect(sichere('defekt')).resolves.toEqual({ status: 'fehlt' });
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it.each([
    ['gültig', { status: 'gueltig', inhalt: 'gültig' }],
    [' ', { status: 'leer' }],
  ])('prüft nach Veränderung den neuen Inhalt: %s', async (inhalt, ergebnis) => {
    invoke.mockResolvedValue({ status: 'veraendert', sicherungspfad: null });
    appDatenLesen.mockResolvedValue(inhalt);
    await expect(sichere('defekt')).resolves.toEqual(ergebnis);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('liefert fehlt, wenn die Datei nach Veränderung verschwindet', async () => {
    invoke.mockResolvedValue({ status: 'veraendert', sicherungspfad: null });
    appDatenLesen.mockRejectedValue(new Error('fehlt'));
    appDatenExistiert.mockResolvedValue(false);
    await expect(sichere('defekt')).resolves.toEqual({ status: 'fehlt' });
  });

  it('sichert den erneut gelesenen Inhalt und reicht den Token bei jedem Versuch durch', async () => {
    invoke
      .mockResolvedValueOnce({ status: 'veraendert', sicherungspfad: null })
      .mockResolvedValueOnce({ status: 'archiviert', sicherungspfad: 'kopie' });
    appDatenLesen.mockResolvedValue('neu defekt');
    await sichere('defekt', { token: 'token' });
    expect(invoke.mock.calls.map((aufruf) => aufruf[1])).toEqual([
      { relativerPfad: PFAD, erwarteterInhalt: 'defekt', token: 'token' },
      { relativerPfad: PFAD, erwarteterInhalt: 'neu defekt', token: 'token' },
    ]);
  });

  it('verwendet den abweichenden Erfolgstext nur bei erfolgreicher Archivierung', async () => {
    invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: 'kopie' });
    await sichere('defekt', { erfolgstext: 'Titel passten nicht.' });
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({ typ: 'warnung', text: 'Titel passten nicht.' }),
    );
    zeigeBanner.mockClear();
    invoke.mockResolvedValue({ status: 'gesichert_aber_nicht_entfernt', sicherungspfad: 'kopie' });
    await sichere('defekt', { erfolgstext: 'Titel passten nicht.' });
    expect(zeigeBanner).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Titel passten nicht.' }),
    );
  });

  it.each(['archiviert', 'gesichert_aber_nicht_entfernt'])(
    'unterdrückt im Sammelmodus auch %s-Banner',
    async (status) => {
      invoke.mockResolvedValue({ status, sicherungspfad: 'kopie' });
      await sichere('defekt', { bannerAnzeigen: false });
      expect(zeigeBanner).not.toHaveBeenCalled();
    },
  );

  it('wirft Sicherungsfehler auch ohne Banner', async () => {
    const fehler = new Error('Sicherung gescheitert');
    invoke.mockRejectedValue(fehler);
    await expect(sichere('defekt', { bannerAnzeigen: false })).rejects.toBe(fehler);
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it('wirft Lesefehler nach Veränderung auch ohne Banner', async () => {
    const fehler = new Error('Lesen gescheitert');
    invoke.mockResolvedValue({ status: 'veraendert', sicherungspfad: null });
    appDatenLesen.mockRejectedValue(fehler);
    appDatenExistiert.mockResolvedValue(true);
    await expect(sichere('defekt', { bannerAnzeigen: false })).rejects.toBe(fehler);
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it('wirft nach genau drei Vergleichen ohne vierten Leseversuch, auch ohne Banner', async () => {
    invoke.mockResolvedValue({ status: 'veraendert', sicherungspfad: null });
    appDatenLesen.mockResolvedValue('defekt');
    await expect(sichere('defekt', { token: 'token', bannerAnzeigen: false })).rejects.toThrow(
      'dreimal verändert',
    );
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(appDatenLesen).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.every((aufruf) => aufruf[1].token === 'token')).toBe(true);
    expect(zeigeBanner).not.toHaveBeenCalled();
  });
});

it('reicht den Vorgangsverweis auch bei erneutem Inhaltsvergleich bis zur Archivierung', async () => {
  const { sichereBeiUngueltigemInhalt } = await import('./appDatenLesenGeschuetzt');
  invoke
    .mockResolvedValueOnce({ status: 'veraendert', sicherungspfad: null })
    .mockResolvedValueOnce({ status: 'archiviert', sicherungspfad: 'backup' });
  appDatenLesen.mockResolvedValue('weiterhin defekt');
  await sichereBeiUngueltigemInhalt(PFAD, 'defekt', () => false, {
    vorgang: 'v1',
    token: 't1',
    bannerAnzeigen: false,
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'archiviere_beschaedigte_datei', {
    relativerPfad: PFAD,
    erwarteterInhalt: 'weiterhin defekt',
    token: 't1',
    vorgang: 'v1',
  });
});

it('reicht den Verweis aus dem geschützten Lader durch und bewahrt native Fehler', async () => {
  const { appDatenLesenGeschuetzt } = await import('./appDatenLesenGeschuetzt');
  appDatenLesen.mockResolvedValue('defekt');
  invoke.mockRejectedValue(new Error('Vorgang ist ungültig'));
  await expect(appDatenLesenGeschuetzt(PFAD, WURZEL, undefined, 'v2')).rejects.toThrow(
    'Vorgang ist ungültig',
  );
  expect(invoke).toHaveBeenCalledWith('archiviere_beschaedigte_datei', {
    relativerPfad: PFAD,
    erwarteterInhalt: 'defekt',
    vorgang: 'v2',
  });
});

it.each(vertraege.archivierung.ungueltig)(
  'verwirft abweichenden nativen Archivierungsvertrag %j',
  async (antwort) => {
    const { sichereBeiUngueltigemInhalt } = await import('./appDatenLesenGeschuetzt');
    invoke.mockResolvedValueOnce(antwort);
    await expect(
      sichereBeiUngueltigemInhalt('markierungen/BGB.xml', 'beschaedigt', () => false, {
        bannerAnzeigen: false,
      }),
    ).rejects.toThrow('Archivierungs');
  },
);
it.each(vertraege.archivierung.ergebnisse)(
  'empfängt tatsächlichen Archivierungsvertrag %j',
  async (antwort) => {
    const { sichereBeiUngueltigemInhalt } = await import('./appDatenLesenGeschuetzt');
    invoke.mockResolvedValueOnce(antwort);
    appDatenLesen.mockResolvedValue('<gueltig/>');
    const ergebnis = await sichereBeiUngueltigemInhalt(
      'markierungen/BGB.xml',
      'beschaedigt',
      (text) => text === '<gueltig/>',
      { token: 'token', vorgang: 'vorgang', bannerAnzeigen: false },
    );
    expect(invoke).toHaveBeenCalledWith(
      vertraege.archivierung.command,
      vertraege.archivierung.argumente,
    );
    expect(ergebnis.status).toBe(antwort.status === 'veraendert' ? 'gueltig' : antwort.status);
  },
);

it.each(['archiviert', 'gesichert_aber_nicht_entfernt'])(
  'bewahrt ausgeführte Sicherung %s vor nachfolgendem Schreibfehler im Vorgang',
  async (status) => {
    const { mitDateiSperre, appDatenLesenGeschuetzt } = await import('./kern.index');
    appDatenLesen.mockResolvedValue('defekt');
    invoke.mockImplementation(async (befehl: string) =>
      befehl === 'datei_sperre_erwerben'
        ? 'token'
        : befehl === 'archiviere_beschaedigte_datei'
          ? { status, sicherungspfad: 'kopie' }
          : undefined,
    );
    const meldungen: unknown[] = [];
    const meldungEmpfangen = (meldung: unknown) => {
      meldungen.push(meldung);
    };
    const schreibfehler = new Error('Schreiben gescheitert');
    const schreiben = vi.fn(() => {
      throw schreibfehler;
    });
    const lauf = mitDateiSperre(
      PFAD,
      async (token) => {
        await appDatenLesenGeschuetzt(PFAD, WURZEL, token, 'v1', meldungEmpfangen);
        schreiben();
      },
      meldungEmpfangen,
    );
    if (status === 'archiviert') await expect(lauf).rejects.toBe(schreibfehler);
    else {
      await expect(lauf).rejects.toThrow('nicht entfernt');
      expect(schreiben).not.toHaveBeenCalled();
    }
    expect(meldungen).toEqual([
      expect.objectContaining({
        anlass: 'sicherung',
        art: 'hinweis',
        aenderungsstand: 'teilweise',
        grund: status === 'archiviert' ? 'imDatenordnerGesichert' : 'gesichertNichtEntfernt',
      }),
    ]);
    expect(zeigeBanner).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenLastCalledWith('datei_sperre_freigeben', { token: 'token' });
  },
);
it.each(['lesen', 'sicherung'])(
  'meldet %s-Fehler lokal ohne Verlust des ursprünglichen Fehlers',
  async (anlass) => {
    const { appDatenLesenGeschuetzt } = await import('./kern.index');
    const fehler = new Error(anlass);
    if (anlass === 'lesen') {
      appDatenLesen.mockRejectedValue(fehler);
      appDatenExistiert.mockResolvedValue(true);
    } else {
      appDatenLesen.mockResolvedValue('defekt');
      invoke.mockRejectedValue(fehler);
    }
    const meldungEmpfangen = vi.fn();
    await expect(
      appDatenLesenGeschuetzt(PFAD, WURZEL, undefined, undefined, meldungEmpfangen),
    ).rejects.toBe(fehler);
    expect(meldungEmpfangen).toHaveBeenCalledWith(
      expect.objectContaining({ anlass, art: 'fehler', aenderungsstand: 'keine' }),
    );
    expect(zeigeBanner).not.toHaveBeenCalled();
  },
);
it('bewahrt die erfolgreiche Archivierung auch bei defektem ausdrücklichem Empfänger', async () => {
  const { sichereBeiUngueltigemInhalt } = await import('./kern.index');
  invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: 'kopie' });
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(
    sichereBeiUngueltigemInhalt(PFAD, 'defekt', () => false, {
      meldungEmpfangen: () => {
        throw new Error('Empfänger');
      },
    }),
  ).resolves.toEqual({ status: 'archiviert', sicherungspfad: 'kopie' });
  expect(protokoll).toHaveBeenCalled();
  expect(zeigeBanner).not.toHaveBeenCalled();
  protokoll.mockRestore();
});

it.each(['archiviert', 'gesichert_aber_nicht_entfernt'] as const)(
  'nennt bei %s den Sicherungspfad nur in der Konsole, nicht in der Meldung',
  async (status) => {
    const { sichereBeiUngueltigemInhalt } = await import('./kern.index');
    const sicherungspfad = 'sicherungen/abweichender-ort/Bestand-2026.xml';
    invoke.mockResolvedValue({ status, sicherungspfad });
    const konsole = vi.spyOn(console, 'info').mockImplementation(() => {});
    const meldungEmpfangen = vi.fn();
    await sichereBeiUngueltigemInhalt(PFAD, 'defekt', () => false, {
      meldungEmpfangen,
      erfolgstext: 'Eigener Sicherungshinweis.',
    });
    expect(meldungEmpfangen).toHaveBeenCalledExactlyOnceWith(
      // Der Pfad steht nur im Feld für „Datenordner öffnen“, nicht im Text.
      expect.objectContaining({ anlass: 'sicherung', sicherung: sicherungspfad }),
    );
    expect(
      JSON.stringify(meldungEmpfangen.mock.calls, (k, v) => (k === 'sicherung' ? undefined : v)),
    ).not.toContain(sicherungspfad);
    expect(konsole).toHaveBeenCalledWith(expect.stringContaining(sicherungspfad));
    expect(zeigeBanner).not.toHaveBeenCalled();
    konsole.mockRestore();
  },
);
