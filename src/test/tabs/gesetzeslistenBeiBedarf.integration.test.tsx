// @vitest-environment jsdom
// Desktoplisten und Bereinigung verwenden echte Persistenz ohne geladenen Fensterbestand.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { beforeEach, expect, it } from 'vitest';
import {
  speichereGesetz,
  warteAufSpeicherBatchAbschluss,
  leseSuchverzeichnis,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { bereinigeGesetzeskurzbefehleNachAbgleich } from '@/lib/gesetz-laden/gesetz-laden.index';
import {
  ladeAlleGesetzeskurzbefehle,
  speichereGesetzeskurzbefehl,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';

const gehalteneSperren = new Map<string, string>();
const sperrpfade = new Map<string, string>();
const wartende = new Map<string, Array<() => void>>();
const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  gehalteneSperren.clear();
  sperrpfade.clear();
  wartende.clear();
  const nativ = io.invoke.getMockImplementation();
  let token = 0;
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'datei_sperre_erwerben') {
      const pfad = String(args.relativerPfad);
      while (gehalteneSperren.has(pfad))
        await new Promise<void>((resolve) => {
          const wartend = wartende.get(pfad) ?? [];
          wartend.push(resolve);
          wartende.set(pfad, wartend);
        });
      const kennung = `sperre-${++token}`;
      gehalteneSperren.set(pfad, kennung);
      sperrpfade.set(kennung, pfad);
      return kennung;
    }
    if (name === 'datei_sperre_freigeben') {
      const pfad = sperrpfade.get(String(args.token));
      if (pfad) {
        gehalteneSperren.delete(pfad);
        sperrpfade.delete(String(args.token));
        for (const fortsetzen of wartende.get(pfad) ?? []) fortsetzen();
        wartende.delete(pfad);
      }
      return;
    }
    if (name === 'archiviere_beschaedigte_datei') {
      io.dateien.set(args.relativerPfad + '.bak', args.erwarteterInhalt);
      io.dateien.delete(args.relativerPfad);
      return { status: 'archiviert', sicherungspfad: args.relativerPfad + '.bak' };
    }
    return nativ?.(name, args);
  });
  await speichereGesetzeskurzbefehl(referenz, {
    taste: 'b',
    meta: true,
    ctrl: false,
    alt: true,
    shift: false,
  });
});
it.each(['fehlend', 'unabgeglichen', 'ungueltig', 'vorhanden', 'unbekannt', 'geloescht'])(
  'bereinigt konservativ bei %s',
  async (fall) => {
    if (fall !== 'fehlend')
      io.dateien.set(
        'cache/suchverzeichnis.json',
        fall === 'ungueltig'
          ? '{kaputt'
          : JSON.stringify({ version: 1, abgeglichen: fall !== 'unabgeglichen', eintraege: [] }),
      );
    if (fall === 'vorhanden') io.dateien.set('gesetze/BGB_de-bund.xml', 'unlesbar');
    if (fall === 'unbekannt') {
      const nativ = io.invoke.getMockImplementation();
      io.invoke.mockImplementation(async (...args) => {
        if (args[0] === 'gesetz_dateistempel_lesen') throw new Error('Ordner unlesbar');
        return nativ?.(...args);
      });
    }
    const nativ = io.invoke.getMockImplementation();
    io.invoke.mockImplementation(async (name, args) => {
      if (name === 'archiviere_beschaedigte_datei') {
        io.dateien.set(args.relativerPfad + '.bak', args.erwarteterInhalt);
        io.dateien.delete(args.relativerPfad);
        return { status: 'archiviert', sicherungspfad: args.relativerPfad + '.bak' };
      }
      return nativ?.(name, args);
    });
    await bereinigeGesetzeskurzbefehleNachAbgleich();
    expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toHaveLength(
      fall === 'geloescht' ? 0 : 1,
    );
  },
);

it('bewahrt Kurzbefehle nach einer durch Pflegefehler entwerteten Verzeichnisdatei', async () => {
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') throw new Error('Ordner nicht lesbar');
    return nativ?.(name, args);
  });
  await speichereGesetz(
    { kurztitel: 'ZPO', normgeber: 'de-bund' },
    '<gesetz><infos><kurztitel>ZPO</kurztitel><normgeber>de-bund</normgeber></infos><inhalt /></gesetz>',
    { inhaltGeaendert: false },
  );
  await warteAufSpeicherBatchAbschluss();
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(false);
  io.invoke.mockImplementation(async (...args) => nativ?.(...args));
  await bereinigeGesetzeskurzbefehleNachAbgleich();
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toHaveLength(1);
});

it.each([
  { anzahl: 1, syntaxfehler: false },
  { anzahl: 2, syntaxfehler: false },
  { anzahl: 2, syntaxfehler: true },
])(
  'verwirft bei Entwertung während Existenzprüfung $anzahl sämtliche Abwesenheitskandidaten (Syntaxfehler: $syntaxfehler)',
  async ({ anzahl, syntaxfehler }) => {
    if (anzahl === 2)
      await speichereGesetzeskurzbefehl(
        { kurztitel: 'ZPO', normgeber: 'de-bund' },
        { taste: 'z', meta: true, ctrl: false, alt: true, shift: false },
      );
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const nativ = io.invoke.getMockImplementation();
    let pruefungen = 0;
    let pflegefehler = false;
    let angehalten = () => {};
    const wartet = new Promise<void>((resolve) => {
      angehalten = resolve;
    });
    let freigeben = () => {};
    const freigabe = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    io.invoke.mockImplementation(async (name, args) => {
      if (name === 'gesetz_dateistempel_lesen') {
        if (pflegefehler) throw new Error('Tatsächlicher Pflegefehler');
        if (++pruefungen === anzahl) {
          angehalten();
          await freigabe;
          return [];
        }
      }
      return nativ?.(name, args);
    });
    const pfad = 'einstellungen/gesetzeskurzbefehle.xml';
    if (syntaxfehler)
      io.dateien.set(
        pfad,
        (io.dateien.get(pfad) ?? '').replace(
          '</inhalt>',
          '<gesetzeskurzbefehl><gesetz normgeber="de-bund">Ungültig</gesetz></gesetzeskurzbefehl></inhalt>',
        ),
      );
    const bereinigung = bereinigeGesetzeskurzbefehleNachAbgleich();
    await wartet;
    pflegefehler = true;
    await speichereGesetz(
      { kurztitel: 'StGB', normgeber: 'de-bund' },
      '<gesetz><infos><kurztitel>StGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt /></gesetz>',
      { inhaltGeaendert: false },
    );
    await warteAufSpeicherBatchAbschluss();
    expect((await leseSuchverzeichnis()).abgeglichen).toBe(false);
    pflegefehler = false;
    freigeben();
    await bereinigung;
    if (syntaxfehler) expect(io.dateien.get(pfad)).not.toContain('Ungültig');
    expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toHaveLength(anzahl);
  },
);

it('schützt den frischen Abschluss bis nach Sicherung und Schreiben und meldet erst nach Sperrfreigabe', async () => {
  const cachepfad = 'cache/suchverzeichnis.json';
  const kurzbefehlpfad = 'einstellungen/gesetzeskurzbefehle.xml';
  io.dateien.set(cachepfad, JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }));
  const nativ = io.invoke.getMockImplementation();
  const ablauf: string[] = [];
  let archivieren = () => {};
  const archiviert = new Promise<void>((resolve) => {
    archivieren = resolve;
  });
  let freigeben = () => {};
  const freigabe = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  let pflegeWartet = () => {};
  const pflegeAngefordert = new Promise<void>((resolve) => {
    pflegeWartet = resolve;
  });
  let pflegefehler = false;
  io.invoke.mockImplementation(async (name, args) => {
    if (
      name === 'datei_sperre_erwerben' &&
      args.relativerPfad === cachepfad &&
      gehalteneSperren.has(cachepfad)
    )
      pflegeWartet();
    if (name === 'gesetz_dateistempel_lesen' && pflegefehler) throw new Error('Pflegefehler');
    if (name === 'archiviere_beschaedigte_datei') {
      expect([...gehalteneSperren.keys()].sort()).toEqual([cachepfad, kurzbefehlpfad]);
      archivieren();
      await freigabe;
    }
    if (name === 'atomar_datei_schreiben' && args.relativerPfad === kurzbefehlpfad) {
      expect([...gehalteneSperren.keys()].sort()).toEqual([cachepfad, kurzbefehlpfad]);
      ablauf.push('geschrieben');
    }
    if (name === 'datei_sperre_freigeben')
      ablauf.push('frei:' + sperrpfade.get(String(args.token)));
    return nativ?.(name, args);
  });
  io.emitTo.mockImplementation(async (_ziel, name) => {
    if (name === 'gesetzeskurzbefehle-geaendert') {
      expect(gehalteneSperren.has(kurzbefehlpfad)).toBe(false);
      ablauf.push('gemeldet');
    }
  });
  const bereinigung = bereinigeGesetzeskurzbefehleNachAbgleich();
  await archiviert;
  pflegefehler = true;
  await speichereGesetz(
    { kurztitel: 'StGB', normgeber: 'de-bund' },
    '<gesetz><infos><kurztitel>StGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt /></gesetz>',
    { inhaltGeaendert: false },
  );
  const batch = warteAufSpeicherBatchAbschluss();
  await pflegeAngefordert;
  expect(io.dateien.get(kurzbefehlpfad)).toContain('BGB');
  freigeben();
  await Promise.all([bereinigung, batch]);
  expect(ablauf.indexOf('geschrieben')).toBeLessThan(ablauf.indexOf('frei:' + cachepfad));
  expect(ablauf.indexOf('frei:' + cachepfad)).toBeLessThan(
    ablauf.indexOf('frei:' + kurzbefehlpfad),
  );
  expect(ablauf.indexOf('frei:' + kurzbefehlpfad)).toBeLessThan(ablauf.indexOf('gemeldet'));
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(false);
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toHaveLength(0);
});
