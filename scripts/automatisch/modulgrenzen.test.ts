import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Direktimport {
  von: string;
  nach: string;
}

interface Modul {
  pfad: string;
}

interface Regel {
  name: string;
  from: { path?: string[]; pathNot?: string[] };
  to: { path: string[]; pathNot: string[] };
}

const require = createRequire(import.meta.url);
const { MODULE, DIREKTIMPORTE, modulRegeln } = require('./modulgrenzen.cjs') as {
  MODULE: Modul[];
  DIREKTIMPORTE: Direktimport[];
  modulRegeln: (module: Modul[], direktimporte: Direktimport[]) => Regel[];
};

const regeln = modulRegeln(MODULE, DIREKTIMPORTE);

describe('präzise Modulgrenzen-Ausnahmen', () => {
  it('schützt Markierungen auch gegenüber App.tsx ohne Direktimport-Ausnahme', () => {
    expect(DIREKTIMPORTE.filter((eintrag) => eintrag.von === 'src/App.tsx')).toEqual([]);
    const markierungsRegel = regeln.find(
      (regel) => regel.name === 'nur-markierungen-index-darf-von-aussen-genutzt-werden',
    );
    expect(markierungsRegel).toBeDefined();
    expect(markierungsRegel!.from.pathNot).not.toContain('^src/App\\.tsx$');
    expect(markierungsRegel!.to.pathNot).toEqual([
      '^src/lib/markierungen/markierungen\\.index\\.ts$',
    ]);
  });

  it('schützt private Messung auch gegenüber dem Einstellungshook', () => {
    expect(
      DIREKTIMPORTE.filter(
        (eintrag) => eintrag.von === 'src/hooks/einstellungen/useTextDarstellung.ts',
      ),
    ).toEqual([]);
    const regel = regeln.find(
      (regel) => regel.name === 'nur-gesetzestextansicht-index-darf-von-aussen-genutzt-werden',
    );
    expect(regel!.to.pathNot).toEqual([
      '^src/components/gesetzestextansicht/gesetzestextansicht\\.index\\.ts$',
    ]);
  });
});

it('schützt die Fassade der Darstellung ohne Direktimport-Ausnahme', () => {
  const pfad = 'src/lib/darstellung';
  expect(MODULE.some((eintrag) => eintrag.pfad === pfad)).toBe(true);
  const regel = regeln.find(
    (eintrag) => eintrag.name === 'nur-darstellung-index-darf-von-aussen-genutzt-werden',
  )!;
  expect(regel.from.pathNot).toEqual([`^${pfad}/`]);
  expect(DIREKTIMPORTE.filter((eintrag) => eintrag.nach.startsWith(`${pfad}/`))).toEqual([]);
});

describe('verschachtelte Ansichtssteuerungsgrenzen', () => {
  const basis = 'src/components/gesetzestextansicht/ansichtssteuerung';
  it.each(['ansichtssteuerung', 'struktur', 'scrollen'])(
    'schützt die Fassade von %s ohne Direktimport-Ausnahme',
    (modul) => {
      const pfad = modul === 'ansichtssteuerung' ? basis : `${basis}/${modul}`;
      expect(MODULE.some((eintrag) => eintrag.pfad === pfad)).toBe(true);
      const regel = regeln.find(
        (eintrag) => eintrag.name === `nur-${modul}-index-darf-von-aussen-genutzt-werden`,
      )!;
      expect(regel.from.pathNot).toEqual([`^${pfad}/`]);
      expect(regel.to.pathNot).toEqual([`^${pfad}/${modul}\\.index\\.ts$`]);
      expect(DIREKTIMPORTE.filter((eintrag) => eintrag.nach.startsWith(`${pfad}/`))).toEqual([]);
    },
  );
  it('lässt Hauptkomponente und Baum ausschließlich durch die gemeinsame äußere Fassade', () => {
    const regel = regeln.find(
      (eintrag) => eintrag.name === 'nur-ansichtssteuerung-index-darf-von-aussen-genutzt-werden',
    )!;
    for (const quelle of [
      'src/components/gesetzestextansicht/Gesetzestextansicht.tsx',
      'src/components/gesetzestextansicht/baum/Gesetzestextansicht.bausteine.tsx',
    ]) {
      expect(regel.from.pathNot!.some((regex) => new RegExp(regex).test(quelle))).toBe(false);
      expect(
        regel.to.pathNot.some((regex) =>
          new RegExp(regex).test(`${basis}/scrollen/scrollen.index.ts`),
        ),
      ).toBe(false);
      expect(
        regel.to.pathNot.some((regex) =>
          new RegExp(regex).test(`${basis}/ansichtssteuerung.index.ts`),
        ),
      ).toBe(true);
    }
  });
});

describe('lokale Textdarstellungsgrenze', () => {
  it.each([false, true])(
    'verwehrt direkte Wert-, Typ- und dynamische Importe, erlaubt Fassade und modulinterne Messung (Basispfad verlinkt: %s)',
    async (verlinkt) => {
      const { cruise } = await import('dependency-cruiser');
      const { mkdtemp, mkdir, writeFile, symlink, realpath, rm } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const basis = 'src/components/gesetzestextansicht/text-darstellung';
      expect(MODULE.some((modul) => modul.pfad === basis)).toBe(true);
      const regel = regeln.find(
        (eintrag) => eintrag.name === 'nur-text-darstellung-index-darf-von-aussen-genutzt-werden',
      )!;
      expect(regel.from.pathNot).toEqual([
        `^${basis}/`,
        '^scripts/automatisch/absatz-wiederholung\\.integration\\.test\\.ts$',
      ]);
      expect(regel.to.pathNot).toEqual([`^${basis}/text-darstellung\\.index\\.ts$`]);
      const temporaer = await mkdtemp(join(tmpdir(), 'lexlata-textdarstellung-grenze-'));
      const ordner = join(temporaer, 'dateien');
      const basispfad = verlinkt ? join(temporaer, 'verknuepfung') : ordner;
      try {
        await mkdir(join(ordner, basis), { recursive: true });
        // Junction funktioniert unter Windows ohne Rechte für symbolische Links.
        if (verlinkt) await symlink(ordner, basispfad, 'junction');
        await writeFile(
          join(ordner, basis, 'messung.ts'),
          'export const messen = 1; export type Messung = number;',
        );
        await writeFile(
          join(ordner, basis, 'text-darstellung.index.ts'),
          "export { messen } from './messung'; export type { Messung } from './messung';",
        );
        await writeFile(
          join(ordner, basis, 'modell.ts'),
          "import { messen } from './messung'; export const modell = messen;",
        );
        const aussen = 'src/components/gesetzestextansicht';
        const importe = {
          wert: "import { messen } from './text-darstellung/messung'; export const wert = messen;",
          typ: "import type { Messung } from './text-darstellung/messung'; export type Wert = Messung;",
          dynamisch: "export const lade = () => import('./text-darstellung/messung');",
          fassade:
            "import { messen } from './text-darstellung/text-darstellung.index'; export const wert = messen;",
        };
        for (const [name, inhalt] of Object.entries(importe)) {
          await writeFile(join(ordner, aussen, `${name}.ts`), inhalt);
        }
        const ergebnis = await cruise(['src'], {
          // Resolver löst Links auf; dieselbe Basis verhindert abweichende Relativpfade
          // insbesondere bei macOS-Tempverzeichnissen unter /var → /private/var.
          baseDir: await realpath(basispfad),
          tsPreCompilationDeps: true,
          outputType: 'json',
          validate: true,
          ruleSet: { forbidden: [{ ...regel, severity: 'error' }] },
        });
        const bericht = JSON.parse(String(ergebnis.output)) as {
          summary: { violations: { from: string; to: string; rule: { name: string } }[] };
        };
        expect(bericht.summary.violations.map((verstoss) => verstoss.from).sort()).toEqual(
          ['dynamisch', 'typ', 'wert'].map((name) => `${aussen}/${name}.ts`),
        );
        expect(
          bericht.summary.violations.every((verstoss) => verstoss.rule.name === regel.name),
        ).toBe(true);
      } finally {
        await rm(temporaer, { recursive: true, force: true });
      }
    },
  );
});

describe('Menügrenze', () => {
  it('verbietet statische und dynamische Direktimporte und erlaubt Fassade sowie interne Zugriffe', async () => {
    const { cruise } = await import('dependency-cruiser');
    const { mkdtemp, mkdir, writeFile, realpath, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const basis = 'src/lib/plattform/menu';
    expect(MODULE.some((modul) => modul.pfad === basis)).toBe(true);
    expect(DIREKTIMPORTE.filter(({ nach }) => nach.startsWith(`${basis}/`))).toEqual([]);
    const regel = regeln.find(
      (eintrag) => eintrag.name === 'nur-menu-index-darf-von-aussen-genutzt-werden',
    )!;
    const temporaer = await mkdtemp(join(tmpdir(), 'lexlata-menu-grenze-'));
    try {
      await mkdir(join(temporaer, basis), { recursive: true });
      const dateien = {
        [`${basis}/menuAktivZustandStore.ts`]: 'export const istAktiv = () => true;',
        [`${basis}/menu.index.ts`]: "export { istAktiv } from './menuAktivZustandStore';",
        [`${basis}/menueZustandSync.ts`]:
          "import { istAktiv } from './menuAktivZustandStore'; export const status = istAktiv();",
        'src/statisch.ts':
          "import { istAktiv } from './lib/plattform/menu/menuAktivZustandStore'; export const status = istAktiv();",
        'src/dynamisch.ts':
          "export const lade = () => import('./lib/plattform/menu/menuAktivZustandStore');",
        'src/fassade.ts':
          "import { istAktiv } from './lib/plattform/menu/menu.index'; export const status = istAktiv();",
      };
      for (const [pfad, inhalt] of Object.entries(dateien)) {
        await writeFile(join(temporaer, pfad), inhalt);
      }
      const ergebnis = await cruise(['src'], {
        baseDir: await realpath(temporaer),
        tsPreCompilationDeps: true,
        outputType: 'json',
        validate: true,
        ruleSet: { forbidden: [{ ...regel, severity: 'error' }] },
      });
      const bericht = JSON.parse(String(ergebnis.output)) as {
        summary: { violations: { from: string; rule: { name: string } }[] };
      };
      expect(bericht.summary.violations.map((verstoss) => verstoss.from).sort()).toEqual([
        'src/dynamisch.ts',
        'src/statisch.ts',
      ]);
      expect(
        bericht.summary.violations.every((verstoss) => verstoss.rule.name === regel.name),
      ).toBe(true);
    } finally {
      await rm(temporaer, { recursive: true, force: true });
    }
  });
});

describe('verschachtelte Hilfsfenstergrenzen', () => {
  it('schützt beide Grenzen bei statischen und dynamischen Importen', async () => {
    const { cruise } = await import('dependency-cruiser');
    const { mkdtemp, mkdir, writeFile, realpath, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const basis = 'src/components/hilfsfenster';
    const innen = `${basis}/einstellungsfenster`;
    const grenzen = [basis, innen].map((pfad) => {
      expect(MODULE.some((modul) => modul.pfad === pfad)).toBe(true);
      return regeln.find(
        (regel) =>
          regel.name === `nur-${pfad.split('/').pop()}-index-darf-von-aussen-genutzt-werden`,
      )!;
    });
    expect(
      DIREKTIMPORTE.filter(({ nach }) => nach.startsWith(`${basis}/`)).map(({ von, nach }) => ({
        von,
        nach,
      })),
    ).toEqual([
      {
        von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
        nach: `${basis}/markierungskonflikte/MarkierungskonfliktFenster.helpers.ts`,
      },
      {
        von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
        nach: `${basis}/markierungskonflikte/konfliktTexte.ts`,
      },
    ]);
    const temporaer = await mkdtemp(join(tmpdir(), 'lexlata-hilfsfenster-grenze-'));
    try {
      await mkdir(join(temporaer, innen), { recursive: true });
      const dateien = {
        [`${basis}/VerweismarkierungFenster.ts`]: 'export const Wurzel = 1;',
        [`${innen}/EinstellungenFenster.ts`]: 'export const EinstellungenFenster = 1;',
        [`${innen}/einstellungsfenster.index.ts`]:
          "export { EinstellungenFenster } from './EinstellungenFenster';",
        [`${basis}/hilfsfenster.index.ts`]:
          "export const lade = () => import('./einstellungsfenster/einstellungsfenster.index');",
        [`${basis}/intern-erlaubt.ts`]:
          "import { EinstellungenFenster } from './einstellungsfenster/einstellungsfenster.index'; export const wurzel = EinstellungenFenster;",
        [`${basis}/intern-statisch.ts`]:
          "import { EinstellungenFenster } from './einstellungsfenster/EinstellungenFenster'; export const wurzel = EinstellungenFenster;",
        [`${basis}/intern-dynamisch.ts`]:
          "export const lade = () => import('./einstellungsfenster/EinstellungenFenster');",
        'src/statisch.ts':
          "import { Wurzel } from './components/hilfsfenster/VerweismarkierungFenster'; export const wurzel = Wurzel;",
        'src/dynamisch.ts':
          "export const lade = () => import('./components/hilfsfenster/VerweismarkierungFenster');",
        'src/fassade.ts':
          "export const lade = () => import('./components/hilfsfenster/hilfsfenster.index');",
        'src/innere-fassade-statisch.ts':
          "import { EinstellungenFenster } from './components/hilfsfenster/einstellungsfenster/einstellungsfenster.index'; export const wurzel = EinstellungenFenster;",
        'src/innere-fassade-dynamisch.ts':
          "export const lade = () => import('./components/hilfsfenster/einstellungsfenster/einstellungsfenster.index');",
      };
      for (const [pfad, inhalt] of Object.entries(dateien))
        await writeFile(join(temporaer, pfad), inhalt);
      const ergebnis = await cruise(['src'], {
        baseDir: await realpath(temporaer),
        tsPreCompilationDeps: true,
        outputType: 'json',
        validate: true,
        ruleSet: { forbidden: grenzen.map((regel) => ({ ...regel, severity: 'error' })) },
      });
      const bericht = JSON.parse(String(ergebnis.output)) as {
        summary: { violations: { from: string; rule: { name: string } }[] };
      };
      expect(bericht.summary.violations.map(({ from, rule }) => [from, rule.name]).sort()).toEqual(
        [
          [`${basis}/intern-dynamisch.ts`, grenzen[1]!.name],
          [`${basis}/intern-statisch.ts`, grenzen[1]!.name],
          ['src/dynamisch.ts', grenzen[0]!.name],
          ['src/statisch.ts', grenzen[0]!.name],
          ['src/innere-fassade-statisch.ts', grenzen[0]!.name],
          ['src/innere-fassade-dynamisch.ts', grenzen[0]!.name],
        ].sort(),
      );
    } finally {
      await rm(temporaer, { recursive: true, force: true });
    }
  });
});

describe('Fensterkommunikationsgrenze', () => {
  it('prüft aufgelöste Wert-, Typ-, dynamische, Reexport- und interne Rückimporte', async () => {
    const { cruise } = await import('dependency-cruiser');
    const { mkdtemp, mkdir, writeFile, realpath, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const basis = 'src/lib/plattform/fensterkommunikation';
    expect(MODULE.some((modul) => modul.pfad === basis)).toBe(true);
    expect(DIREKTIMPORTE.filter(({ nach }) => nach.startsWith(`${basis}/`))).toEqual([]);
    const grenzen = regeln.filter(
      (regel) =>
        regel.name === 'nur-fensterkommunikation-index-darf-von-aussen-genutzt-werden' ||
        regel.name === 'kein-interner-fassadenimport-src-lib-plattform-fensterkommunikation',
    );
    expect(grenzen).toHaveLength(2);
    const temporaer = await mkdtemp(join(tmpdir(), 'lexlata-kommunikation-grenze-'));
    try {
      await mkdir(join(temporaer, basis), { recursive: true });
      const intern = './lib/plattform/fensterkommunikation/ereignisAnbindung';
      const fassade = './lib/plattform/fensterkommunikation/fensterkommunikation.index';
      const dateien = {
        [`${basis}/ereignisAnbindung.ts`]:
          'export const empfang = 1; export type Nutzlast = string;',
        [`${basis}/fensterkommunikation.index.ts`]:
          "export { empfang } from './ereignisAnbindung'; export type { Nutzlast } from './ereignisAnbindung';",
        [`${basis}/intern.ts`]:
          "import { empfang } from './ereignisAnbindung'; export const wert = empfang;",
        [`${basis}/rueckimport.ts`]: "export { empfang } from './fensterkommunikation.index';",
        [`${basis}/schnittstelle.test.ts`]:
          "import { empfang } from './fensterkommunikation.index'; export const test = empfang;",
        'src/wert.ts': `import { empfang } from '${intern}'; export const wert = empfang;`,
        'src/typ.ts': `import type { Nutzlast } from '${intern}'; export type Typ = Nutzlast;`,
        'src/dynamisch.ts': `export const lade = () => import('${intern}');`,
        'src/reexport.ts': `export { empfang } from '${intern}';`,
        'src/fassade.ts': `export { empfang } from '${fassade}'; export type { Nutzlast } from '${fassade}';`,
        'src/fassade-dynamisch.ts': `export const lade = () => import('${fassade}');`,
      };
      for (const [pfad, inhalt] of Object.entries(dateien))
        await writeFile(join(temporaer, pfad), inhalt);
      const ergebnis = await cruise(['src'], {
        baseDir: await realpath(temporaer),
        tsPreCompilationDeps: true,
        outputType: 'json',
        validate: true,
        ruleSet: { forbidden: grenzen.map((regel) => ({ ...regel, severity: 'error' })) },
      });
      const bericht = JSON.parse(String(ergebnis.output)) as {
        summary: { violations: { from: string; rule: { name: string } }[] };
      };
      expect(bericht.summary.violations.map(({ from, rule }) => [from, rule.name]).sort()).toEqual(
        [
          ...['wert', 'typ', 'dynamisch', 'reexport'].map((name) => [
            `src/${name}.ts`,
            grenzen.find((r) => r.name.startsWith('nur-'))!.name,
          ]),
          [`${basis}/rueckimport.ts`, grenzen.find((r) => r.name.startsWith('kein-'))!.name],
        ].sort(),
      );
    } finally {
      await rm(temporaer, { recursive: true, force: true });
    }
  });
});

describe('Bannergrenze', () => {
  it('weist direkte und dynamische Importe, Weiterexport und eine Zwischenschaltung zurück', async () => {
    const { cruise } = await import('dependency-cruiser');
    const { mkdtemp, mkdir, writeFile, realpath, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join, dirname } = await import('node:path');
    const regel = require('./dependency-cruiser.cjs').forbidden.find(
      (eintrag: { name: string }) => eintrag.name === 'bannerhost-nur-im-hauptfenstereinstieg',
    );
    expect(regel).toBeDefined();
    const temporaer = await mkdtemp(join(tmpdir(), 'lexlata-bannergrenze-'));
    try {
      const dateien = {
        'src/components/hauptfenster/BannerHost.tsx': 'export const BannerHost = () => null;',
        'src/App.tsx':
          "import { BannerHost } from './components/hauptfenster/BannerHost'; export const App = BannerHost;",
        'src/mobile/MobileApp.tsx':
          "import { BannerHost } from '../components/hauptfenster/BannerHost'; export const MobileApp = BannerHost;",
        'src/mobile/screens/Beliebig.tsx':
          "import { BannerHost } from '../../components/hauptfenster/BannerHost'; export const Screen = BannerHost;",
        'src/components/hauptfenster/BannerHost.test.tsx':
          "import { BannerHost } from './BannerHost'; export const pruefung = BannerHost;",
        'src/components/hauptfenster/BannerHost.grenze.test.tsx':
          "import { BannerHost } from './BannerHost'; export const pruefung = BannerHost;",
        'src/components/hilfsfenster/Direkt.tsx':
          "import { BannerHost } from '../hauptfenster/BannerHost'; export const Fenster = BannerHost;",
        'src/components/hilfsfenster/Dynamisch.tsx':
          "export const lade = () => import('../hauptfenster/BannerHost');",
        'src/components/hauptfenster/weiterexport.ts': "export { BannerHost } from './BannerHost';",
        'src/components/hauptfenster/Zwischen.tsx':
          "import { BannerHost } from './BannerHost'; export const Zwischen = BannerHost;",
        'src/components/hilfsfenster/Indirekt.tsx':
          "import { Zwischen } from '../hauptfenster/Zwischen'; export const Fenster = Zwischen;",
        'src/components/hauptfenster/Beliebig.test.tsx':
          "import { BannerHost } from './BannerHost'; export const pruefung = BannerHost;",
      };
      for (const [pfad, inhalt] of Object.entries(dateien)) {
        await mkdir(dirname(join(temporaer, pfad)), { recursive: true });
        await writeFile(join(temporaer, pfad), inhalt);
      }
      const ergebnis = await cruise(['src'], {
        baseDir: await realpath(temporaer),
        tsPreCompilationDeps: true,
        outputType: 'json',
        validate: true,
        ruleSet: { forbidden: [regel] },
      });
      const bericht = JSON.parse(String(ergebnis.output));
      expect(bericht.summary.violations.map((v: { from: string }) => v.from).sort()).toEqual(
        [
          'src/components/hauptfenster/Beliebig.test.tsx',
          'src/components/hauptfenster/Zwischen.tsx',
          'src/components/hauptfenster/weiterexport.ts',
          'src/components/hilfsfenster/Direkt.tsx',
          'src/components/hilfsfenster/Dynamisch.tsx',
          'src/mobile/screens/Beliebig.tsx',
        ].sort(),
      );
    } finally {
      await rm(temporaer, { recursive: true, force: true });
    }
  });
});

it('begrenzt Direktimporte auf die einzeln freigegebenen Dateien', () => {
  expect(DIREKTIMPORTE.map(({ von, nach }) => ({ von, nach }))).toEqual([
    {
      von: 'src/test/import/dateiImportTesthilfe.ts',
      nach: 'src/lib/import-export/datei-import/gesetzDateiImport.ts',
    },
    {
      von: 'src/components/gesetzestextansicht/baum/ueberschriftText.integration.test.tsx',
      nach: 'src/lib/import/basis/basis.index.ts',
    },
    {
      von: 'src/test/suchverzeichnis/oeffnenMessung.test.ts',
      nach: 'src/components/overlays/suche/VolltextSucheOverlay.helpers.ts',
    },
    {
      von: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.pruefung.ts',
      nach: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.ts',
    },
    {
      von: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.ts',
      nach: 'src/lib/markierungen/gemeinsam/markierungSpeicher.types.ts',
    },
    {
      von: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.pruefung.ts',
      nach: 'src/lib/markierungen/gemeinsam/markierungSpeicher.types.ts',
    },
    {
      von: 'src/lib/plattform/praefixlaufAuftrag.ts',
      nach: 'src/lib/import/importindex/importindexVertrag.types.ts',
    },
    {
      von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
      nach: 'src/components/gesetzestextansicht/text-darstellung/text-darstellung.index.ts',
    },
    {
      von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
      nach: 'src/lib/markierungen/markierungs-xml/markierungs-xml.index.ts',
    },
    {
      von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
      nach: 'src/lib/markierungen/gemeinsam/gemeinsam.index.ts',
    },
    {
      von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
      nach: 'src/lib/import/importabschluss/importabschluss.index.ts',
    },
    {
      von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      nach: 'src/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige.ts',
    },
    {
      von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      nach: 'src/lib/markierungen/markierungs-xml/markierungs-xml.index.ts',
    },
    {
      von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      nach: 'src/lib/markierungen/gemeinsam/markierungskonfliktPruefung.ts',
    },
    {
      von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      nach: 'src/lib/import/dispatch/gesetzDateiVerarbeitung.ts',
    },
    {
      von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      nach: 'src/lib/import-export/datei-import/formatErkennung.ts',
    },
    {
      von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      nach: 'src/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers.ts',
    },
    {
      von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      nach: 'src/components/hilfsfenster/markierungskonflikte/konfliktTexte.ts',
    },
    {
      von: 'scripts/werkzeuge/praefixdiagnoseAuswertung.ts',
      nach: 'src/lib/import/praefixstruktur/praefixstrukturXml.ts',
    },
    {
      von: 'scripts/werkzeuge/praefixdiagnoseAuswertung.test.ts',
      nach: 'src/lib/import/praefixstruktur/praefixstrukturXml.ts',
    },
    { von: 'scripts/werkzeuge/adressierbarkeit.ts', nach: 'src/lib/domain/norm/normAufloesung.ts' },
    {
      von: 'scripts/werkzeuge/adressierbarkeit.ts',
      nach: 'src/lib/markierungen/gemeinsam/markierungskonfliktPruefung.ts',
    },
    {
      von: 'scripts/werkzeuge/pruefeEuropaKuratiertAuswertung.ts',
      nach: 'src/lib/import/importindex/importindexVertrag.types.ts',
    },
    {
      von: 'scripts/werkzeuge/pruefeEuropaKuratiertAuswertung.ts',
      nach: 'src/lib/import/importindex/importindexValidierung.ts',
    },
    {
      von: 'scripts/werkzeuge/pruefeEuropaKuratiertAuswertung.ts',
      nach: 'src/lib/import/importindex/europaKuratiert.ts',
    },
    {
      von: 'scripts/werkzeuge/grundbestand.ts',
      nach: 'src/lib/import/importindex/importindexValidierung.ts',
    },
    {
      von: 'scripts/werkzeuge/grundbestand.ts',
      nach: 'src/lib/import/importindex/europaKuratiert.ts',
    },
  ]);
});
