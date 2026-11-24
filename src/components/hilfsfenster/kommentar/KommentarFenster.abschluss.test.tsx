// Gespeicherte Kommentare dürfen beim Übertragungsabschluss nicht erneut geschrieben werden.
import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KommentarFenster from './KommentarFenster';
import KommentarFormular from './KommentarFormular';
import VerweismarkierungFenster from '@/components/hilfsfenster/verweismarkierung/VerweismarkierungFenster';
import VerweismarkierungFormular from '@/components/hilfsfenster/verweismarkierung/VerweismarkierungFormular';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

type VorSchliessen = Parameters<
  typeof import('@/hooks/fenster/useFensterSchliessenAbsichern').useFensterSchliessenAbsichern
>[3];

const test = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  index: 0,
  effekte: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  schreiben: vi.fn(),
  listen: vi.fn(),
  emitTo: vi.fn(),
  speichern: vi.fn(),
  importieren: vi.fn(),
  retry: vi.fn(),
  verwerfen: vi.fn(),
  close: vi.fn(),
  dialog: vi.fn(),
  geaendert: false,
  vor: undefined as undefined | (() => Promise<boolean>),
  speichernDialog: undefined as undefined | (() => Promise<boolean>),
  shortcut: undefined as undefined | (() => Promise<void>),
  pruefHinweise: undefined as
    undefined | ((meldungen: AktionsMeldung[], oeffner: string) => Promise<void>),
  hinweis: vi.fn(),
  wartePruefung: vi.fn(),
  pruefFehler: null as string | null,
}));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', async (original) => ({
  ...(await original<
    typeof import('@/lib/plattform/fensterkommunikation/fensterkommunikation.index')
  >()),
  sendeHauptfensterHinweis: test.hinweis,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (wert: unknown) => {
    const i = test.index++;
    if (!(i in test.states)) test.states[i] = wert;
    return [
      test.states[i],
      (neu: unknown) => {
        test.states[i] = neu;
      },
    ];
  },
  useRef: (wert: unknown) => (test.refs[test.index++] ??= { current: wert }),
  useEffect: (effekt: () => void | (() => void)) => {
    if (!test.cleanups.length) test.effekte.push(effekt);
  },
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  speichereVerweismarkierung: test.speichern,
  speichereKommentar: test.speichern,
  versucheFehlendeGesetzeImportieren: test.importieren,
  wiederholeMarkierungsUebertragung: test.retry,
  verwerfeMarkierungsUebertragung: test.verwerfen,
  kommentarKontextAbholen: async () => new Promise(() => undefined),
  verweismarkierungKontextAbholen: async () => new Promise(() => undefined),
}));
// Flüchtiger Dateibestand; das Schreiben der Markierungsdatei bleibt zeitlich steuerbar.
const dateien = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  sicherstelleOrdner: async () => {},
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('token'),
  mitDateiSperren: async (
    pfade: string[],
    aktion: (tokens: Map<string, string>) => Promise<unknown>,
  ) => aktion(new Map(pfade.map((pfad) => [pfad, 'token']))),
  appDatenExistiert: async (pfad: string) => dateien.has(pfad),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenLesen: async (pfad: string) => {
    const inhalt = dateien.get(pfad);
    if (inhalt === undefined) throw new Error('Datei fehlt');
    return inhalt;
  },
  appDatenLesenOhneHinweis: async (pfad: string) => dateien.get(pfad) ?? '',
  appDatenLesenOderNull: async (pfad: string) => dateien.get(pfad) ?? null,
  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    if (pfad.startsWith('markierungen/')) await test.schreiben(pfad, inhalt);
    dateien.set(pfad, inhalt);
  },
}));
// Prüfbedarf-Empfänger des Hauptfensters fehlt in diesem Hilfsfenstertest.
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: async () => 'vorgang',
  schliessePruefpflichtigeQuelleAb: async () => true,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  warteAufSpeicherBatchAbschluss: async () => {},
}));
vi.mock('@/lib/import/import.index', () => ({
  baueAktualisierungsNachricht: vi.fn(),
  ladeGesetzeskandidaten: async () => [],
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: test.listen, emitTo: test.emitTo }));
vi.mock('@/hooks/fenster/useSchliessenAnfrageSchliesstFenster', () => ({
  useSchliessenAnfrageSchliesstFenster: (fn: typeof test.shortcut) => {
    test.shortcut = fn;
  },
}));
vi.mock('@/hooks/fenster/useFensterSichtbarMachen', () => ({ useFensterSichtbarMachen: vi.fn() }));
vi.mock('@/hooks/einstellungen/useAppAkzentfarbe', () => ({ useAppAkzentfarbe: vi.fn() }));
vi.mock('@/hooks/fenster/useFensterEnterTaste', () => ({ useFensterEnterTaste: vi.fn() }));
vi.mock('@/hooks/fenster/useFensterSchliessenAbsichern', async (original) => ({
  ...(await original<typeof import('@/hooks/fenster/useFensterSchliessenAbsichern')>()),
  useFensterSchliessenAbsichern: (
    geaendert: boolean,
    _fehler: unknown,
    speichern: typeof test.speichernDialog,
    vor: VorSchliessen,
  ) => {
    test.geaendert = geaendert;
    const pruefen = vor && (() => vor((dialog) => dialog()));
    test.vor = pruefen;
    test.speichernDialog = speichern;
    return {
      bereit: true,
      schliessvorgangAktiv: false,
      istSchliessvorgangAktiv: () => false,
      bewusstSchliessen: async (close: () => Promise<boolean>) =>
        (await pruefen?.()) === false ? false : close(),
    };
  },
}));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ listen: test.listen }) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: test.close, label: 'hilfe' }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: test.dialog }));

describe.each(['Kommentar', 'Verweis'] as const)('%s', (art) => {
  function render() {
    test.index = -3;
    test.states[-2] = { ladeGesetz: markierungsEinzelzugriffFuerTest };
    const kinder = (art === 'Kommentar' ? KommentarFenster() : VerweismarkierungFenster()).props
      .children;
    return (Array.isArray(kinder) ? kinder[0] : kinder).props;
  }
  function montieren() {
    for (const effekt of test.effekte.splice(0).slice(1)) {
      const cleanup = effekt();
      if (cleanup) test.cleanups.push(cleanup);
    }
  }
  const ref = { kennung: 'auftrag' };
  beforeEach(() => {
    vi.clearAllMocks();
    test.states = [
      {
        kurztitel: 'TestG',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        openerLabel: 'main',
      },
      'Inhalt',
      true,
      false,
      ...(art === 'Kommentar' ? [null] : [[], null, false]),
    ];
    test.refs = [];
    test.index = -3;
    test.effekte = [];
    test.cleanups = [];
    test.close.mockResolvedValue(undefined);
    test.retry.mockResolvedValue('bestaetigt');
    test.wartePruefung.mockResolvedValue(undefined);
    test.hinweis.mockResolvedValue(undefined);
    test.pruefFehler = null;
    test.speichern.mockResolvedValue({ art: 'uebertragungOffen', uebertragung: ref });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it.each(['wartet', 'spaetesSchreiben'] as const)(
    'Unmount beendet die erste echte Runde vor der Frist (%s)',
    async (fall) => {
      const facade = await vi.importActual<typeof import('@/lib/markierungen/markierungen.index')>(
        '@/lib/markierungen/markierungen.index',
      );
      vi.useFakeTimers();
      // Echte Tauri-Event-Wrapper und Mock-Wrapper nutzen dieselbe simulierte native Brücke.
      let naechsteId = 0;
      const abmeldungen = new Map<number, () => void>();
      vi.stubGlobal('window', {
        __TAURI_INTERNALS__: {
          transformCallback: (callback: unknown) => callback,
          invoke: async (
            befehl: string,
            args: {
              event: string;
              handler: unknown;
              eventId: number;
              target: { kind: 'Any' } | { kind: 'AnyLabel'; label: string };
              payload: unknown;
            },
          ) => {
            if (befehl === 'plugin:event|listen') {
              const id = ++naechsteId;
              abmeldungen.set(id, await test.listen(args.event, args.handler));
              return id;
            }
            if (befehl === 'plugin:event|unlisten') {
              abmeldungen.get(args.eventId)?.();
              return;
            }
            if (befehl === 'plugin:event|emit_to')
              return test.emitTo(args.target, args.event, args.payload);
            throw new Error(befehl);
          },
        },
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      });
      const unlisten = vi.fn();
      test.listen.mockReset().mockResolvedValue(unlisten);
      test.emitTo.mockReset().mockResolvedValue(undefined);
      dateien.clear();
      dateien.set(
        'gesetze/BGB_de-bund.xml',
        '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
      );
      let bestaetige!: (wert: unknown) => void;
      if (fall === 'wartet') test.schreiben.mockReset().mockResolvedValue(undefined);
      else
        test.schreiben.mockReset().mockImplementation(
          () =>
            new Promise((resolve) => {
              bestaetige = resolve;
            }),
        );
      test.speichern.mockImplementation(
        art === 'Kommentar' ? facade.speichereKommentar : facade.speichereVerweismarkierung,
      );
      test.states[0] = {
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        ausgangsstelle: normAusgangsstelle('§ 1'),
        openerLabel: 'main',
      };
      test.states[1] = art === 'Kommentar' ? 'Kommentar' : '§ 1';
      const lauf = render().onFertig();
      montieren();
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(50);
      expect(test.schreiben).toHaveBeenCalledOnce();
      const signal = test.speichern.mock.calls[0]![art === 'Kommentar' ? 4 : 7] as AbortSignal;
      expect(signal.aborted).toBe(false);
      if (fall === 'wartet') expect(test.listen).toHaveBeenCalledOnce();
      for (const cleanup of test.cleanups) cleanup();
      expect(signal.aborted).toBe(true);
      const nachUnmount = Object.assign([...test.states], test.states);
      if (fall === 'spaetesSchreiben') bestaetige(undefined);
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      await lauf;
      if (fall === 'wartet') expect(unlisten).toHaveBeenCalledOnce();
      else expect(test.listen).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(test.schreiben).toHaveBeenCalledOnce();
      expect(test.states).toEqual(nachUnmount);
      expect(test.close).not.toHaveBeenCalled();
    },
  );
  it('merkt gespeicherte Eingaben und sperrt das Formular bei offenem Abschluss', async () => {
    const original = 'Art.  1\tAbs. 1\n§ 9999';
    test.states[1] = original;
    await render().onFertig();
    expect(test.speichern.mock.calls[0]![2]).toBe(original);
    const formular = render();
    expect(formular.uebertragungOffen).toBe(true);
    expect(formular.gespeichert).toBe(true);
    expect(test.geaendert).toBe(false);
    if (art === 'Kommentar') formular.onKommentarTextChange('Neu');
    else formular.onZitatTextChange('Neu');
    formular.onTextbezugChange(false);
    expect(art === 'Kommentar' ? render().kommentarText : render().zitatText).toBe(original);
    expect(render().textbezug).toBe(true);
    expect(test.close).not.toHaveBeenCalled();
    expect(await test.speichernDialog!()).toBe(false);
    expect(test.speichern).toHaveBeenCalledOnce();
  });
  it('schreibt nach Erfolg und fehlgeschlagenem Schließen nie erneut', async () => {
    test.speichern.mockResolvedValue({ art: 'erfolg' });
    test.close.mockRejectedValueOnce(new Error('close'));
    await render().onFertig();
    await render().onFertig();
    expect(test.speichern).toHaveBeenCalledOnce();
    expect(test.close).toHaveBeenCalledTimes(2);
  });
  it('wiederholt ausschließlich die Übertragung; erneuter Schließfehler wiederholt auch diese nicht', async () => {
    await render().onFertig();
    test.close.mockRejectedValueOnce(new Error('close'));
    await render().onWiederholen();
    await render().onFertig();
    expect(test.retry).toHaveBeenCalledExactlyOnceWith(ref);
    expect(test.speichern).toHaveBeenCalledOnce();
    expect(test.close).toHaveBeenCalledTimes(2);
  });
  it('bleibt nach erfolgloser Wiederholung offen', async () => {
    await render().onFertig();
    test.retry.mockResolvedValue('offen');
    await render().onWiederholen();
    expect(render().uebertragungOffen).toBe(true);
    expect(test.close).not.toHaveBeenCalled();
    expect(test.speichern).toHaveBeenCalledOnce();
  });
  it('verwirft bewusst; weiterer Schließversuch schreibt nicht nochmals', async () => {
    await render().onFertig();
    test.close.mockRejectedValueOnce(new Error('close'));
    await render().onTrotzdemSchliessen();
    await render().onFertig();
    expect(test.verwerfen).toHaveBeenCalledExactlyOnceWith(ref);
    expect(test.retry).not.toHaveBeenCalled();
    expect(test.speichern).toHaveBeenCalledOnce();
    expect(test.close).toHaveBeenCalledTimes(2);
  });
  it.each(['native', 'abbrechen', 'shortcut'])(
    'führt %s über dieselbe Abschlussentscheidung',
    async (weg) => {
      await render().onFertig();
      const formular = render();
      test.dialog.mockResolvedValue('Abbrechen');
      if (weg === 'native') expect(await test.vor!()).toBe(false);
      if (weg === 'abbrechen') await formular.onAbbrechen();
      if (weg === 'shortcut') {
        // close() erzeugt in Tauri die vorhandene native Schließanfrage.
        test.close.mockImplementationOnce(() => test.vor!());
        await test.shortcut!();
      }
      expect(test.dialog).toHaveBeenCalledOnce();
      expect(test.close).toHaveBeenCalledTimes(weg === 'shortcut' ? 1 : 0);
    },
  );
  it('gibt der nativen Vorprüfung nach bestätigter Wiederholung nur die Schließfreigabe', async () => {
    await render().onFertig();
    render();
    test.dialog.mockResolvedValue('Erneut versuchen');
    expect(await test.vor!()).toBe(true);
    expect(test.close).not.toHaveBeenCalled();
    expect(test.retry).toHaveBeenCalledExactlyOnceWith(ref);
  });
  it('blockiert doppelte Speicherung und native Schließfreigabe vor dem nächsten Render', async () => {
    let fertig!: (wert: unknown) => void;
    test.speichern.mockImplementation(
      () =>
        new Promise((resolve) => {
          fertig = resolve;
        }),
    );
    const formular = render();
    const lauf = formular.onFertig();
    await formular.onFertig();
    expect(await test.vor!()).toBe(false);
    expect(test.speichern).toHaveBeenCalledOnce();
    fertig({ art: 'erfolg' });
    await lauf;
  });
  it('bricht einen bekannten Auftrag beim Unmount ab und ignoriert späte Wiederholung', async () => {
    await render().onFertig();
    montieren();
    let fertig!: (wert: string) => void;
    test.retry.mockImplementation(
      () =>
        new Promise((resolve) => {
          fertig = resolve;
        }),
    );
    const lauf = render().onWiederholen();
    for (const cleanup of test.cleanups) cleanup();
    const nachUnmount = Object.assign([...test.states], test.states);
    fertig('bestaetigt');
    await lauf;
    expect(test.verwerfen).toHaveBeenCalledWith(ref);
    expect(test.states).toEqual(nachUnmount);
    expect(test.close).not.toHaveBeenCalled();
  });

  it('zeigt den verbindlichen Hinweis und sperrt Eingabefeld sowie Textbezug', async () => {
    await render().onFertig();
    const props = render();
    props.kontext.auswahl = { bezugstext: 'Text' };
    const html = renderToStaticMarkup(
      art === 'Kommentar' ? (
        <KommentarFormular {...props} />
      ) : (
        <VerweismarkierungFormular {...props} />
      ),
    );
    expect(html).toContain(
      'Die Änderung wurde gespeichert. Die Übernahme für Rückgängig konnte nicht bestätigt werden.',
    );
    expect(html).toContain('Erneut versuchen');
    expect(html).toContain('Trotzdem schließen');
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(/<input[^>]*disabled/);
  });

  it('blockiert doppelte Wiederholung und Schließen während der Runde', async () => {
    await render().onFertig();
    let fertig!: (wert: string) => void;
    test.retry.mockImplementation(
      () =>
        new Promise((resolve) => {
          fertig = resolve;
        }),
    );
    const formular = render();
    const lauf = formular.onWiederholen();
    await formular.onWiederholen();
    await formular.onTrotzdemSchliessen();
    expect(await test.vor!()).toBe(false);
    expect(test.retry).toHaveBeenCalledOnce();
    expect(test.verwerfen).not.toHaveBeenCalled();
    expect(test.close).not.toHaveBeenCalled();
    fertig('offen');
    await lauf;
  });
  it('räumt einen erst nach Unmount zurückgelieferten offenen Verweis auf', async () => {
    let fertig!: (wert: unknown) => void;
    test.speichern.mockImplementation(
      () =>
        new Promise((resolve) => {
          fertig = resolve;
        }),
    );
    const lauf = render().onFertig();
    montieren();
    for (const cleanup of test.cleanups) cleanup();
    const nachUnmount = Object.assign([...test.states], test.states);
    fertig({ art: 'uebertragungOffen', uebertragung: ref });
    await lauf;
    expect(test.verwerfen).toHaveBeenCalledExactlyOnceWith(ref);
    expect(test.states).toEqual(nachUnmount);
    expect(test.close).not.toHaveBeenCalled();
  });
  it('gibt explizites Verwerfen auch über die native Vorprüfung frei', async () => {
    await render().onFertig();
    render();
    test.dialog.mockResolvedValue('Trotzdem schließen');
    expect(await test.vor!()).toBe(true);
    expect(test.verwerfen).toHaveBeenCalledExactlyOnceWith(ref);
    expect(test.close).not.toHaveBeenCalled();
  });

  if (art === 'Verweis') {
    it('verhindert nach Speicherung Import und Speichern ohne Elementstand', async () => {
      await render().onFertig();
      const formular = render();
      await formular.onImportVersuchen();
      await formular.onTrotzdemSpeichern();
      expect(test.importieren).not.toHaveBeenCalled();
      expect(test.speichern).toHaveBeenCalledOnce();
      test.retry.mockResolvedValueOnce('offen');
      await formular.onWiederholen();
      await render().onWiederholen();
      expect(test.retry).toHaveBeenCalledTimes(2);
      expect(test.speichern).toHaveBeenCalledOnce();
      expect(test.importieren).not.toHaveBeenCalled();
    });
    it.each([
      { art: 'keineAktion' },
      { art: 'fehler', fehler: [{ art: 'sonst', text: 'Fehler' }] },
    ])('lässt vor Speichererfolg Eingaben weiter bearbeiten: %j', async (ergebnis) => {
      test.speichern.mockResolvedValue(ergebnis);
      await render().onFertig();
      expect(render().gespeichert).toBe(false);
      render().onZitatTextChange('Neue Norm');
      expect(render().zitatText).toBe('Neue Norm');
      expect(test.close).not.toHaveBeenCalled();
      expect(test.retry).not.toHaveBeenCalled();
    });
    it('verarbeitet erfolgreichen Import vor Speicherung und sperrt parallele Importe', async () => {
      test.speichern.mockResolvedValueOnce({
        art: 'fehler',
        fehler: [{ art: 'gesetz', text: 'Fehlt', gesetz: gesetzesreferenz({ kurztitel: 'GG' }) }],
      });
      await render().onFertig();
      let fertig!: (wert: unknown) => void;
      test.importieren.mockImplementation(
        () =>
          new Promise((resolve) => {
            fertig = resolve;
          }),
      );
      const formular = render();
      const lauf = formular.onImportVersuchen();
      await formular.onImportVersuchen();
      await formular.onFertig();
      expect(test.importieren).toHaveBeenCalledOnce();
      expect(test.speichern).toHaveBeenCalledOnce();
      fertig({
        mindestensEinErfolg: true,
        bestandspruefung: { liste: [], befunde: [], ordnerLesbar: true },
        bestandsMeldungen: [],
        abschluesse: [],
        aktualisierungsHinweis: 'Importiert',
        neuFehlgeschlagen: [],
      });
      await lauf;
      expect(test.speichern).toHaveBeenCalledTimes(2);
      expect(render().uebertragungOffen).toBe(true);
    });
    it('behält den Mountschutz nach der StrictMode-Effektwiederholung', async () => {
      render();
      const effekte = [...test.effekte];
      montieren();
      for (const cleanup of test.cleanups) cleanup();
      for (const effekt of effekte) effekt();
      await render().onFertig();
      expect(render().uebertragungOffen).toBe(true);
      expect(test.speichern).toHaveBeenCalledOnce();
    });
  }
  {
    it('erhält Startbefunde neben einer bereits vorhandenen Formularmeldung', () => {
      test.states[4] =
        art === 'Kommentar'
          ? 'Der Kommentar konnte nicht gespeichert werden.'
          : [{ art: 'sonst', text: 'Der Verweis konnte nicht gespeichert werden.' }];
      test.pruefFehler = 'Die Titeldatei konnte nicht gelesen werden.';
      if (art === 'Kommentar')
        expect(render().fehler).toBe(
          'Der Kommentar konnte nicht gespeichert werden.\nDie Titeldatei konnte nicht gelesen werden.',
        );
      else
        expect(render().fehler).toEqual([
          { art: 'sonst', text: 'Der Verweis konnte nicht gespeichert werden.' },
          { art: 'sonst', text: 'Die Titeldatei konnte nicht gelesen werden.' },
        ]);
    });
    it('übergibt Hinweise der Startprüfung vor Schließen mit wahrem Quelldatei-Befund', async () => {
      render();
      await test.pruefHinweise!(
        [
          {
            anlass: 'pruefabschluss',
            art: 'hinweis',
            typ: 'fehler',
            aenderungsstand: 'vollstaendig',
            text: 'Die Änderung wurde gespeichert.',
          },
        ],
        'fenster-1',
      );
      expect(test.hinweis).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'Eine Quelldatei wurde geändert. Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.',
          typ: 'fehler',
          meldungen: [expect.objectContaining({ grund: 'konfliktpruefungOffen' })],
        }),
        'fenster-1',
      );
      expect(test.speichern).not.toHaveBeenCalled();
      expect(art === 'Kommentar' ? render().kommentarText : render().zitatText).toBe('Inhalt');
    });
    it('wartet beim bewussten Schließen auf die Startprüfung ohne Speicherung', async () => {
      let annehmen!: () => void;
      test.wartePruefung.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            annehmen = resolve;
          }),
      );
      const abschluss = render().onAbbrechen();
      expect(test.close).not.toHaveBeenCalled();
      annehmen();
      await abschluss;
      expect(test.close).toHaveBeenCalledOnce();
      expect(test.speichern).not.toHaveBeenCalled();
    });
    it('zeigt einen endgültigen Start-Hinweisfehler nicht als zweiten fachlichen Fehler', async () => {
      test.hinweis.mockRejectedValue(new Error('Transport'));
      render();
      await test.pruefHinweise!(
        [
          {
            anlass: 'sicherung',
            art: 'hinweis',
            typ: 'warnung',
            aenderungsstand: 'teilweise',
            text: 'Die Datei wurde gesichert.',
          },
        ],
        'fenster-1',
      );
      if (art === 'Kommentar') expect(render().fehler).toBeNull();
      else expect(render().fehler).toEqual([]);
      expect(render().gespeichert).toBe(false);
      expect(test.speichern).not.toHaveBeenCalled();
    });
  }
});

vi.mock('@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster', () => ({
  useMarkierungsAusgangsstellePruefung: (
    _kontext: unknown,
    _ladeGesetz: unknown,
    hinweise: typeof test.pruefHinweise,
  ) => {
    test.pruefHinweise = hinweise;
    return {
      bezugErhalten: false,
      bezugPruefungLaeuft: false,
      bezugPrueffehler: null,
      aktionsFehler: test.pruefFehler,
      warteAufAbschluss: test.wartePruefung,
    };
  },
}));

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: async () => [
    gesetzDarstellung({
      kurztitel: 'BGB',
      langtitel: 'BGB',
      hatGliederungsartikel: false,
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: 'norm', xmlId: '1', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    }),
  ],
}));
