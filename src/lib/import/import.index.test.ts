// import.index.test.ts
//
// Prüft benennbare Fassadenverträge, Quellenaggregation und transitive
// Ladegrenzen. Datei-/Indexverhalten wird in den jeweiligen Integrationstests geprüft.

import { describe, it, expect, expectTypeOf, vi } from 'vitest';
import type { importiereVomInternetEU } from './eu/eu.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type {
  AktualisierungsErgebnis,
  aktualisiereGesetzeAutomatisch,
  ImportEinzelErgebnis,
  ImportFehler,
} from './import.index';
import type { GesetzAktualisierungsErgebnis } from './importVertrag.types';
import type {
  AktualisierungsErgebnis as AbschlussAktualisierungsErgebnis,
  ImportEinzelErgebnis as AbschlussImportEinzelErgebnis,
} from '@/lib/import/importVertrag.types';

type AutomatischeAktualisierungErgebnis = Awaited<
  ReturnType<typeof aktualisiereGesetzeAutomatisch>
>;

describe('öffentliche Importverträge', () => {
  it('liefert beim EU-Import das gemeinsame Einzelergebnis des Importvertrags', () => {
    expectTypeOf<
      Awaited<ReturnType<typeof importiereVomInternetEU>>
    >().toEqualTypeOf<ImportEinzelErgebnis>();
  });
  it('schließt Erfolge ohne Gesetz und Fehler ohne Grund aus', () => {
    expectTypeOf<{ art: 'erfolg' }>().not.toMatchTypeOf<ImportEinzelErgebnis>();
    expectTypeOf<{
      art: 'fehler';
      fehler: { meldung: string };
    }>().not.toMatchTypeOf<ImportEinzelErgebnis>();
    expectTypeOf<{
      art: 'erfolg';
      gesetz: GesetzDarstellung;
    }>().toMatchTypeOf<ImportEinzelErgebnis>();
    expectTypeOf<{
      art: 'erfolg';
      gesetz: GesetzDarstellung;
    }>().not.toMatchTypeOf<AktualisierungsErgebnis>();
    expectTypeOf<Extract<AktualisierungsErgebnis, { art: 'fehler' }>>()
      .toHaveProperty('fehler')
      .toMatchTypeOf<ImportFehler>();
    expectTypeOf<AbschlussImportEinzelErgebnis>().toEqualTypeOf<ImportEinzelErgebnis>();
    expectTypeOf<AbschlussAktualisierungsErgebnis>().toEqualTypeOf<AktualisierungsErgebnis>();
  });

  it('hält Sammelergebnisse eindeutig', () => {
    expectTypeOf<GesetzAktualisierungsErgebnis>()
      .toHaveProperty('fehlgeschlagene')
      .toMatchTypeOf<
        { gesetz: Pick<GesetzDarstellung, 'kurztitel' | 'normgeber'>; fehler: ImportFehler }[]
      >();
    expectTypeOf<Extract<AutomatischeAktualisierungErgebnis, { art: 'ausgefuehrt' }>>()
      .toHaveProperty('ergebnis')
      .toEqualTypeOf<GesetzAktualisierungsErgebnis>();
  });
});

// Quellenaggregation und Teilfehler werden mit echten Modulen über Dateisystem-
// Doubles in importindexZwischenspeicher.integration.test.ts geprüft.

import type { GesetzDateiImport as AussenGesetzDateiImport } from './import.index';
import type { GesetzDateiErgebnis as AussenGesetzDateiErgebnis } from './import.index';
import type { GesetzReparaturZiel as AussenGesetzReparaturZiel } from './import.index';
import type { GesetzReparaturErgebnis as AussenGesetzReparaturErgebnis } from './import.index';
import type { ImportindexStatus as AussenIndexStatus } from './import.index';
import type { GesetzImportEingabe as VertragGesetzImportEingabe } from './importVertrag.types';
import type { GesetzDateiImport as VertragGesetzDateiImport } from './importVertrag.types';
import type { GesetzDateiErgebnis as VertragGesetzDateiErgebnis } from './importVertrag.types';
import type { GesetzReparaturZiel as VertragGesetzReparaturZiel } from './importVertrag.types';
import type { GesetzReparaturErgebnis as VertragGesetzReparaturErgebnis } from './importVertrag.types';
import type { GesetzImportErgebnis as VertragGesetzImportErgebnis } from './importVertrag.types';
import type { ImportindexStatus as VertragIndexStatus } from './importindex/importindex.index';
import type { GesetzImportEingabe as dispatchGesetzImportEingabe } from './importVertrag.types';
import type { GesetzDateiImport as dispatchGesetzDateiImport } from './importVertrag.types';
import type { GesetzDateiErgebnis as dispatchGesetzDateiErgebnis } from './importVertrag.types';
import type { GesetzReparaturZiel as dispatchGesetzReparaturZiel } from './importVertrag.types';
import type { GesetzReparaturErgebnis as dispatchGesetzReparaturErgebnis } from './importVertrag.types';
import type { GesetzImportErgebnis as dispatchGesetzImportErgebnis } from './importVertrag.types';
import type { GesammelteNorm } from './basis/basis.index';
import type { GesetzInfosFuerXML } from '@/lib/domain/gesetzInfos';

describe('vollständige benennbare Fassadentypen', () => {
  it('liefert identische Eingabe- und Ergebnisverträge an der erlaubten Grenze', () => {
    expectTypeOf<AussenGesetzDateiImport>().toEqualTypeOf<VertragGesetzDateiImport>();
    expectTypeOf<AussenGesetzDateiErgebnis>().toEqualTypeOf<VertragGesetzDateiErgebnis>();
    expectTypeOf<AussenGesetzReparaturZiel>().toEqualTypeOf<VertragGesetzReparaturZiel>();
    expectTypeOf<AussenGesetzReparaturErgebnis>().toEqualTypeOf<VertragGesetzReparaturErgebnis>();
    expectTypeOf<AussenIndexStatus>().toEqualTypeOf<VertragIndexStatus>();
    expectTypeOf<dispatchGesetzImportEingabe>().toEqualTypeOf<VertragGesetzImportEingabe>();
    expectTypeOf<dispatchGesetzDateiImport>().toEqualTypeOf<VertragGesetzDateiImport>();
    expectTypeOf<dispatchGesetzDateiErgebnis>().toEqualTypeOf<VertragGesetzDateiErgebnis>();
    expectTypeOf<dispatchGesetzReparaturZiel>().toEqualTypeOf<VertragGesetzReparaturZiel>();
    expectTypeOf<dispatchGesetzReparaturErgebnis>().toEqualTypeOf<VertragGesetzReparaturErgebnis>();
    expectTypeOf<dispatchGesetzImportErgebnis>().toEqualTypeOf<VertragGesetzImportErgebnis>();
    expectTypeOf<GesetzInfosFuerXML>().toHaveProperty('normgeber').toEqualTypeOf<string>();
    expectTypeOf<GesammelteNorm>()
      .toHaveProperty('type')
      .toEqualTypeOf<'gliederung' | 'paragraph'>();
  });
});

// Echte transitive Laufzeitimporte prüfen; reine Typimporte bleiben aus dem Graphen.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

function laufzeitAbhaengigkeiten(einstieg: string, dynamisch = false): Set<string> {
  const besucht = new Set<string>();
  function besuche(datei: string) {
    if (besucht.has(datei)) return;
    besucht.add(datei);
    const ast = ts.createSourceFile(
      datei,
      readFileSync(datei, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const module = new Set<string>();
    function pruefe(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const klausel = node.importClause;
        const nurTypen =
          klausel?.isTypeOnly ||
          (!klausel?.name &&
            klausel?.namedBindings &&
            ts.isNamedImports(klausel.namedBindings) &&
            klausel.namedBindings.elements.every((element) => element.isTypeOnly));
        if (!nurTypen) module.add(node.moduleSpecifier.text);
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const nurTypen =
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.every((element) => element.isTypeOnly);
        if (!nurTypen) module.add(node.moduleSpecifier.text);
      }
      if (
        dynamisch &&
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        module.add(node.arguments[0].text);
      ts.forEachChild(node, pruefe);
    }
    pruefe(ast);
    for (const modul of module) {
      const basis = modul.startsWith('@/')
        ? resolve('src', modul.slice(2))
        : modul.startsWith('.')
          ? resolve(dirname(datei), modul)
          : undefined;
      if (!basis) continue;
      const ziel = [basis + '.ts', basis + '.tsx', basis + '/index.ts'].find(existsSync);
      if (ziel) besuche(ziel);
    }
  }
  besuche(resolve(einstieg));
  return besucht;
}

describe('transitive Ladegrenzen der Fassaden', () => {
  it('lädt die Außenfassade und Verzeichnisse ohne Quellenimplementierung', () => {
    for (const einstieg of [
      'src/lib/import/import.index.ts',
      'src/lib/import/importindex/importindex.index.ts',
    ]) {
      const dateien = [...laufzeitAbhaengigkeiten(einstieg)];
      expect(dateien.filter((datei) => /\/import\/(bund|bw|eu)\//.test(datei))).toEqual([]);
    }
  });
  it('Importabschluss importiert auch dynamisch keine Quellenimplementierung', () => {
    const dateien = [
      ...laufzeitAbhaengigkeiten('src/lib/import/importabschluss/importabschluss.index.ts', true),
    ];
    expect(dateien.filter((datei) => /\/import\/(bund|bw|eu)\//.test(datei))).toEqual([]);
  });
});

import type { AktualisierungsErgebnis as DispatchAktualisierungsErgebnis } from './importVertrag.types';

import type { GesetzAktualisierungsErgebnis as DispatchGesetzAktualisierungsErgebnis } from './importVertrag.types';

import type { AutomatischeAktualisierungErgebnis as DispatchAutomatischeAktualisierungErgebnis } from './importVertrag.types';

it('benennt sämtliche Aktualisierungsergebnisse auch am Dispatch', () => {
  expectTypeOf<DispatchAktualisierungsErgebnis>().toEqualTypeOf<AktualisierungsErgebnis>();
  expectTypeOf<DispatchGesetzAktualisierungsErgebnis>().toEqualTypeOf<GesetzAktualisierungsErgebnis>();
  expectTypeOf<DispatchAutomatischeAktualisierungErgebnis>().toEqualTypeOf<AutomatischeAktualisierungErgebnis>();
});

it('delegiert die EU-Aktualisierung an die EU-Quellenfassade', async () => {
  const erstellen = vi.fn().mockResolvedValue({ erfolg: true, anzahl: 17566 });
  vi.doMock('@/lib/import/eu/eu.index', () => ({ erstelleEuImportindex: erstellen }));
  const { aktualisiereImportindex } = await import('./import.index');
  await expect(aktualisiereImportindex('eu')).resolves.toEqual({ erfolg: true, anzahl: 17566 });
  expect(erstellen).toHaveBeenCalledOnce();
  vi.doUnmock('@/lib/import/eu/eu.index');
});
