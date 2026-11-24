// gesetzInfos.test.ts
// Pflichtzusagen und gemeinsame Herkunft der Kopfangaben je Verarbeitungsstufe.
import { readFileSync } from 'node:fs';
import { expect, expectTypeOf, it } from 'vitest';
import ts from 'typescript';
import type { GesetzInfos, GesetzInfosFuerXML } from './gesetzInfos';
import type { GesetzDarstellung } from './gesetzTypes';
import type { leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetz.index';

it('verlangt den Kurztitel, lässt bislang nicht zugesagte Angaben optional', () => {
  expectTypeOf<{ kurztitel: string; normgeber: string }>().toExtend<GesetzInfos>();
  expectTypeOf<Omit<GesetzInfos, 'kurztitel'>>().not.toExtend<GesetzInfos>();
  expectTypeOf<GesetzInfos['langtitel']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<GesetzInfos['normgeber']>().toEqualTypeOf<string>();
  expectTypeOf<GesetzInfos['verarbeitungszeit']>().toEqualTypeOf<Date | undefined>();
  expectTypeOf<GesetzInfos['ausfertigung']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<ReturnType<typeof leseGesetzInfos>>().toEqualTypeOf<GesetzInfos | null>();
});

it('erhält die stärkeren Zusagen des XML-Bauers und Dateivergleichs', () => {
  expectTypeOf<GesetzInfos>().not.toExtend<GesetzInfosFuerXML>();
  expectTypeOf<'id'>().not.toExtend<keyof GesetzInfosFuerXML>();
  expectTypeOf<Omit<GesetzInfosFuerXML, 'langtitel'>>().not.toExtend<GesetzInfosFuerXML>();
  expectTypeOf<Omit<GesetzInfosFuerXML, 'normgeber'>>().not.toExtend<GesetzInfosFuerXML>();
  expectTypeOf<GesetzInfosFuerXML['langtitel']>().toEqualTypeOf<string>();
  expectTypeOf<GesetzInfosFuerXML['normgeber']>().toEqualTypeOf<string>();
  expectTypeOf<GesetzInfosFuerXML['hatGliederungsartikel']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<'id'>().not.toExtend<keyof GesetzInfos>();
  expectTypeOf<'id'>().not.toExtend<keyof GesetzDarstellung>();
});

it('definiert fachliche Felder nur im Grundvertrag und leitet stärkere Formen daraus ab', () => {
  const quelle = readFileSync(new URL('./gesetzInfos.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('gesetzInfos.ts', quelle, ts.ScriptTarget.Latest, true);
  const definitionen = ast.statements.filter(
    (knoten) => ts.isInterfaceDeclaration(knoten) || ts.isTypeAliasDeclaration(knoten),
  );
  const felder = definitionen.flatMap((definition) => {
    const ergebnis: string[] = [];
    function besuche(knoten: ts.Node) {
      if (ts.isPropertySignature(knoten)) ergebnis.push(knoten.name.getText(ast));
      ts.forEachChild(knoten, besuche);
    }
    besuche(definition);
    return ergebnis;
  });
  expect(felder.filter((name) => name === 'kurztitel')).toHaveLength(1);
  expect(felder.filter((name) => name === 'langtitel')).toHaveLength(1);
  expect(felder.filter((name) => name === 'normgeber')).toHaveLength(1);
  expect(felder.filter((name) => name === 'id')).toHaveLength(0);
  for (const name of ['GesetzInfosFuerXML']) {
    const definition = definitionen.find((knoten) => knoten.name.text === name);
    expect(definition?.getText(ast)).toMatch(/\bGesetzInfos\b/);
  }
});
