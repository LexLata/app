// Prüft sichtbare React-Ausgaben und die tatsächliche Herkunft erlaubter Anzeigewege.
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const regel = require('../../eslint-rules/textanzeige-verbindlich.cjs');
const wurzel = join(import.meta.dirname, '../..');
const anzeigeImport =
  "import { TextAnzeige as Text, TextAttributElement as Attribut } from '@/components/textanzeige/textanzeige.index';";
const reactImport = "import React, { createElement as erzeuge, type ReactElement } from 'react';";
function lintInstanz(cwd = wurzel, allowInlineConfig = true) {
  return new ESLint({
    cwd,
    allowInlineConfig,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { lexlata: { rules: { 'textanzeige-verbindlich': regel } } },
      rules: { 'lexlata/textanzeige-verbindlich': 'error' },
    },
  });
}
const eslint = lintInstanz();
async function fehler(code: string, datei = 'src/components/Beispiel.tsx') {
  const [ergebnis] = await eslint.lintText(code, { filePath: join(wurzel, datei) });
  expect(ergebnis?.fatalErrorCount).toBe(0);
  return ergebnis!.messages;
}

describe('Verbindliche Textanzeige: React', () => {
  it.each([
    `${reactImport} interface Props { children: ReactElement; label: ReactElement } function Layout({children, label}: Props) {return <div>{label}{children}</div>}`,
    `${reactImport} type Props = { children: ReactElement | ReactElement[] }; function Layout({children}: Props) {return <div>{children}</div>}`,
    `${reactImport} type Props = UnbekannteProps & { children: ReactElement | ReactElement[] }; function Layout({children}: Props) {return <div>{children}</div>}`,
    'interface Props { kategorien: readonly {id:string}[] } function Liste({kategorien}: Props) {return <nav>{kategorien.map(k => <Icon key={k.id}/>)}</nav>}',
    `${anzeigeImport} function Select({children, dangerouslySetInnerHTML, ...props}) {void dangerouslySetInnerHTML; return <Attribut {...props} element="select"><Text text="Art. 1" element="option"/></Attribut>}`,
  ])(
    'belegt benannte Elementslots und von Textkindern bereinigte Select-Restprops: %s',
    async (code) => {
      expect(await fehler(code)).toEqual([]);
    },
  );

  it.each([
    `${reactImport} interface Props { children: React.ReactNode } function Layout({children}: Props) {return <div>{children}</div>}`,
    "import type { ReactElement } from './fremd'; interface Props { children: ReactElement } function Layout({children}: Props) {return <div>{children}</div>}",
    `${reactImport} type Props = UnbekannteProps & { children: string }; function Layout({children}: Props) {return <div>{children}</div>}`,
    `${reactImport} interface Basis { children: string } interface Props extends Basis {} function Layout({children}: Props) {return <div>{children}</div>}`,
    'interface Props { kategorien: unknown } function Liste({kategorien}: Props) {return <nav>{kategorien.map(k => <Icon/>)}</nav>}',
    `${anzeigeImport} function Select({children, ...props}) {return <Attribut {...props} element="select"/>}`,
    `${anzeigeImport} function Select({dangerouslySetInnerHTML, ...props}) {return <Attribut {...props} element="select"/>}`,
    `${anzeigeImport} function Select({children, dangerouslySetInnerHTML, ...props}) {props.children = text; return <Attribut {...props} element="select"/>}`,
    `${anzeigeImport} function Select({children, dangerouslySetInnerHTML, ...props}) {return <Attribut element="select" {...props}/>}`,
    `${anzeigeImport} function Select({children, dangerouslySetInnerHTML, ...props}) {return <select {...props}/>}`,
    `${anzeigeImport} function Select({children, dangerouslySetInnerHTML, ...props}) {return <Attribut element="input" type="button" {...props}/>}`,
  ])('beanstandet offene oder veränderte Slot-/Restprops weiterhin: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });

  it.each([
    `${anzeigeImport} const ausgabe = <Text {...unbekannt}/>;`,
    `${anzeigeImport} const ausgabe = <Text {...{element: "input", type: "button", value: text}}/>;`,
    `${anzeigeImport} const ausgabe = <Text element={traeger} value={text} text={text}/>;`,
    `${reactImport} ${anzeigeImport} erzeuge(Text, {element: "input", type: "submit", value: text});`,
    `${reactImport} ${anzeigeImport} erzeuge(Text, {element: traeger, value: text, text: text});`,
    `${anzeigeImport} const ausgabe = <Text text={text} {...{...unbekannt}}/>;`,
    `${anzeigeImport} const ausgabe = <Text {...{children: text}}/>;`,
    `${anzeigeImport} const ausgabe = <Text {...{dangerouslySetInnerHTML: {__html: text}}}/>;`,
    `${reactImport} ${anzeigeImport} erzeuge(Text, unbekannt);`,
    `${reactImport} ${anzeigeImport} erzeuge(Text, {...unbekannt});`,
    `${reactImport} ${anzeigeImport} erzeuge(Text, {children: text});`,
    `${reactImport} ${anzeigeImport} erzeuge(Text, {dangerouslySetInnerHTML: {__html: text}});`,
  ])('verwehrt unbekannte oder rohe TextAnzeige-Props: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });

  it.each([
    `${anzeigeImport} const props = {className: "layout", id: "technisch", title: titel}; const ausgabe = <Text text={text} {...props}/>;`,
    `${anzeigeImport} const props = {title: titel}; const ausgabe = <Text text={text} {...{...props, className: "layout"}}/>;`,
    `${reactImport} ${anzeigeImport} const props = {text: text, title: titel, className: "layout"}; erzeuge(Text, props);`,
  ])('erlaubt nachgewiesene TextAnzeige-Props: %s', async (code) => {
    expect(await fehler(code)).toEqual([]);
  });

  it.each([
    '<span>Hallo</span>',
    '<span>{wert}</span>',
    '<span>{42}</span>',
    '<span>{`Art. ${zahl}`}</span>',
    '<span>{"Art. " + zahl}</span>',
    '<span>{ok ? "Hallo" : null}</span>',
    '<span>{ok && "Hallo"}</span>',
    '<option value="daten">Beschriftung</option>',
    '<span>{[<Icon />, "Hallo"]}</span>',
    '<span>{teile.map(x => x.text)}</span>',
    '<span>{children}</span>',
    'function falsch(undefined: string) {return <span>{undefined}</span>}',
    '<span>{schuetzeLeerzeichen(text)}</span>',
    '<span>{0 && <Icon />}</span>',
    '<div>{unbekannt.map(x => <Icon/>)}</div>',
    '<input {...{type: "submit", value: "Hallo"}}/>',
    `${anzeigeImport} const ausgabe = <Attribut {...{element: "input", type: "button", value: "Hallo"}}/>;`,
    `${anzeigeImport} const ausgabe = <Attribut element={typ} value={text}/>;`,
    'const props = {...props}; const ausgabe = <div {...props}/>;',
    'const props = {className: "x"}; props.title = text; const ausgabe = <div {...props}/>;',
    'const props = {className: "x"}; Object.assign(props, unbekannt); const ausgabe = <div {...props}/>;',
    'const props = {className: "x"}; const alias = props; alias.title = text; const ausgabe = <div {...props}/>;',
    `${anzeigeImport} const ausgabe = <Attribut element="span" {...unbekannt}/>;`,
    `${anzeigeImport} const ausgabe = <Attribut element="input" {...unbekannt}/>;`,
    '<span dangerouslySetInnerHTML={{__html: text}} />',
    '<span>{...texte}</span>',
  ])('meldet rohe oder unklare Textblätter: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });

  it.each([
    '<div><Icon /><span /></div>',
    '<span> × </span>',
    '<span>{"→"}</span>',
    '<span>{null}{false}{true}{undefined}</span>',
    'function Layout({flag}: {flag: boolean}) { return <div>{flag}</div>; }',
    '<span>{ok ? <Icon /> : <Anderes />}</span>',
    '<span>{[<Icon />, <Anderes />]}</span>',
    `${reactImport} function Layout({inhalt}: {inhalt: React.ReactElement}) { return <div>{inhalt}</div>; }`,
    'function Liste({teile}: {teile: {id: string}[]}) { return <div>{teile.map(x => <Icon key={x.id} />)}</div>; }',
    'const element = <Icon />; const ausgabe = <div>{element}</div>;',
    `${reactImport} function Layout({inhalt}: {inhalt: ReactElement}) { return <div>{inhalt}</div>; }`,
    `${reactImport} function Layout({inhalt}: {inhalt: ReactElement[]}) { return <div>{inhalt}</div>; }`,
    'function Layout({ok}: {ok: boolean}) { return <div>{ok && <Icon />}</div>; }',
    '<svg viewBox="0 0 10 10"><path d="M0 0" /></svg>',
    '<input value={zustand} defaultValue="Art. 1" readOnly disabled />',
    '<textarea value={zustand} defaultValue="Art. 1" disabled />',
    '<div className="Art. 1" id="Art. 1" data-text="Art. 1" onClick={aktion} />',
    `${anzeigeImport} const ausgabe = <Text text={wert} title={titel} />;`,
    `${anzeigeImport} const ausgabe = <Attribut element="button" title={titel}><Text text={wert}/></Attribut>;`,
    `${anzeigeImport} const ausgabe = <Attribut element="input" {...{placeholder: text, value: wert}}/>;`,
  ])('erlaubt belegte Elemente, Symbole und Eingabewerte: %s', async (code) => {
    expect(await fehler(code)).toEqual([]);
  });

  it.each([
    '<span title="Hallo" />',
    '<input placeholder={text} />',
    '<img alt={text} />',
    '<button aria-label={text} />',
    '<div {...props} />',
    '<div {...{title: text}} />',
    'const props = {title: "Hallo"}; const ausgabe = <div {...props}/>;',
    '<div {...{children: text}}/>',
    '<input type="submit" value="Art. 1" />',
    '<input type={typ} value={wert} />',
    '<TextAnzeige text={wert} title="Hallo" />',
    `${anzeigeImport} const ausgabe = <Attribut element="span">Hallo</Attribut>;`,
    `${anzeigeImport} const ausgabe = <Attribut element="input" type="button" value="Hallo"/>;`,
    '<svg><text>Hallo</text></svg>',
    '<span>§</span>',
    '<span>.</span>',
    `${reactImport} function Layout({inhalt}: {inhalt: React.ReactNode}) { return <div>{inhalt}</div>; }`,
    "import type { ReactElement } from './fremd'; function Layout({inhalt}: {inhalt: ReactElement}) { return <div>{inhalt}</div>; }",
    'let element = <Icon />; element = "Hallo"; const ausgabe = <div>{element}</div>;',
  ])('meldet Attribute, Spreads und unzulässige Ausnahmen: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });

  it.each([
    'function TextAnzeige() { return null; } const ausgabe = <TextAnzeige title="Hallo"/>;',
    "import { TextAnzeige as Text } from './fremd'; const ausgabe = <Text title='Hallo'/>;",
    `${anzeigeImport} function andere(Text: unknown) { return <Text title="Hallo"/>; }`,
    `${anzeigeImport} let Falsch = Text; Falsch = fremd; const ausgabe = <Falsch title="Hallo"/>;`,
    "import { TextAnzeige as Text } from '@/components/textanzeige/TextAnzeige'; const ausgabe = <Text title='Hallo'/>;",
  ])('verwehrt Herkunftstäuschung: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });

  it.each([
    `const { TextAnzeige: Text } = await import("@/components/textanzeige/textanzeige.index"); const ausgabe = <Text text={wert} title={titel}/>;`,
    `${anzeigeImport} const Alias = Text; const ausgabe = <Alias text={wert} title={titel}/>;`,
    "import * as Anzeige from '@/components/textanzeige/textanzeige.index'; const ausgabe = <Anzeige.TextAnzeige text={wert} title={titel}/>;",
    "import { TextAnzeige as Text } from '@/components/textanzeige/./textanzeige.index.ts'; const ausgabe = <Text text={wert} title={titel}/>;",
    `import { TextAnzeige as Text } from '${join(wurzel, 'src/components/textanzeige/textanzeige.index.ts')}'; const ausgabe = <Text text={wert} title={titel}/>;`,
  ])('erkennt aufgelöste öffentliche Import- und Bindungsaliase: %s', async (code) => {
    expect(await fehler(code)).toEqual([]);
  });

  it.each([
    'const { createElement: alias } = React; alias("span", null, text)',
    'const { createElement: alias } = await import("react"); alias("span", null, text)',
    'erzeuge("span", null, text)',
    'React.createElement("span", null, "Hallo")',
    'const alias = erzeuge; alias("span", null, 5)',
    'erzeuge("span", {title: text})',
    'erzeuge("div", props)',
    'erzeuge("div", {children: text})',
    'erzeuge("input", {placeholder: text, value: wert})',
    'erzeuge("input", {type: "button", value: text})',
    'erzeuge("input", {...{type: "submit"}, value: text})',
    'erzeuge(Attribut, props)',
    'erzeuge(Komponente, null, text)',
    'erzeuge("div", null, ...texte)',
  ])('kontrolliert React-createElement mit Alias: %s', async (code) => {
    expect((await fehler(`${reactImport} ${code}`)).length).toBeGreaterThan(0);
  });

  it.each([
    'erzeuge("div", null, <Icon />)',
    'erzeuge("div", undefined, <Icon />)',
    'React.createElement("span", null, "×")',
    'erzeuge("input", {value: text})',
    'erzeuge("div", {className: "Hallo"})',
    'const { createElement: alias } = React; alias("div", null, <Icon />)',
    'erzeuge(Text, {text: wert, title: titel})',
    'erzeuge(Attribut, {element: "span", title: titel}, erzeuge(Text, {text: wert}))',
  ])('erlaubt geschützte und belegte createElement-Ausgaben: %s', async (code) => {
    expect(await fehler(`${reactImport} ${anzeigeImport} ${code}`)).toEqual([]);
  });

  it('prüft den tatsächlich aufgelösten Alias statt seiner Schreibweise', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'lexlata-textanzeige-'));
    try {
      await mkdir(join(ordner, 'fremd/components/textanzeige'), { recursive: true });
      await writeFile(
        join(ordner, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { paths: { '@/*': ['./fremd/*'], react: ['./fremd/react.ts'] } },
        }),
      );
      await writeFile(
        join(ordner, 'fremd/components/textanzeige/textanzeige.index.ts'),
        'export const TextAnzeige = () => null;',
      );
      await writeFile(
        join(ordner, 'fremd/react.ts'),
        'export const createElement = () => "Hallo";',
      );
      const [ergebnis] = await lintInstanz(ordner).lintText(
        `${anzeigeImport} ${reactImport} const ausgabe = <Text title="Hallo"/>; const andere = <div>{erzeuge("span", null, text)}</div>;`,
        { filePath: join(ordner, 'Beispiel.tsx') },
      );
      expect(ergebnis?.fatalErrorCount).toBe(0);
      expect(ergebnis?.messages.map((m) => m.messageId)).toEqual(['attribut', 'text']);
    } finally {
      await rm(ordner, { recursive: true, force: true });
    }
  });

  it('liest boolesche Bedingungen auch aus Typen, die ein Modul-Interface weitergibt', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'lexlata-textanzeige-'));
    try {
      await mkdir(join(ordner, 'modul'), { recursive: true });
      await writeFile(join(ordner, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
      await writeFile(
        join(ordner, 'modul/speicher.ts'),
        'export interface Eintrag { laedt: boolean; anzahl: number }',
      );
      await writeFile(
        join(ordner, 'modul/modul.index.ts'),
        "export type { Eintrag } from './speicher';",
      );
      const code = (feld: string) =>
        `import type { Eintrag } from './modul/modul.index'; function Zeile({e}: {e: Eintrag}) { return <div>{e.${feld} && <Icon/>}</div>; }`;
      const lint = lintInstanz(ordner);
      const [erlaubt] = await lint.lintText(code('laedt'), {
        filePath: join(ordner, 'Beispiel.tsx'),
      });
      const [verboten] = await lint.lintText(code('anzahl'), {
        filePath: join(ordner, 'Beispiel.tsx'),
      });
      expect(erlaubt?.messages).toEqual([]);
      expect(verboten?.messages.length).toBeGreaterThan(0);
    } finally {
      await rm(ordner, { recursive: true, force: true });
    }
  });

  it('erlaubt ausschließlich die benannten transformierten Blätter des unteren TextAnzeige-Renderers', async () => {
    const datei = 'src/components/textanzeige/TextAnzeige.tsx';
    expect(await fehler(await readFile(join(wurzel, datei), 'utf8'), datei)).toEqual([]);
    expect(
      (await fehler('export function TextAnzeige() { return <span>{rohtext}</span>; }', datei))
        .length,
    ).toBeGreaterThan(0);
  });

  it('erlaubt keine ganzen Fach- oder Implementierungsdateien', async () => {
    for (const datei of [
      'src/mobile/Beispiel.tsx',
      'src/lib/Beispiel.tsx',
      'src/components/textanzeige/TextAnzeige.tsx',
    ]) {
      expect((await fehler('<div>Hallo</div>', datei)).length).toBeGreaterThan(0);
    }
  });
});

describe('Verbindliche Textanzeige: native und DOM-Grenzen', () => {
  it.each([
    "import {confirm as frage} from '@tauri-apps/plugin-dialog'; frage(text)",
    "const {message: meldung} = await import('@tauri-apps/plugin-dialog'); meldung(text)",
    "import * as D from '@tauri-apps/plugin-dialog'; D.open({title: text})",
    "import {save} from '@tauri-apps/plugin-dialog'; const alias = save; alias(optionen)",
    "import {MenuItem as Blatt} from '@tauri-apps/api/menu'; Blatt.new({text})",
    "const {Submenu} = await import('@tauri-apps/api/menu'); Submenu.new({...optionen})",
    "import {IconMenuItem} from '@tauri-apps/api/menu'; IconMenuItem.new({text})",
    "import {Menu} from '@tauri-apps/api/menu'; Menu.new({items: [{text}]})",
    "function bauen(Blatt: typeof import('@tauri-apps/api/menu').MenuItem) { Blatt.new(optionen) }",
    "import {invoke as ruf} from '@tauri-apps/api/core'; ruf('kommentar_fenster_oeffnen', {titel})",
    "const {invoke} = await import('@tauri-apps/api/core'); invoke(befehl, daten)",
    "import {getCurrentWindow} from '@tauri-apps/api/window'; const fenster = getCurrentWindow(); const titel = fenster.setTitle; titel(text)",
    'fenster.setTitle(text)',
    'document.createTextNode(text)',
    'const ausgabe = document.createElement("span"); ausgabe.textContent = text',
    'ausgabe.innerText = text',
    'ausgabe.innerHTML = text',
    'ausgabe.setAttribute("title", text)',
    'ausgabe.setAttribute(name, text)',
    'ausgabe.insertAdjacentText("beforeend", text)',
    'ausgabe.insertAdjacentHTML("beforeend", text)',
    'document.write(text)',
    'ctx.fillText(text, 0, 0)',
    'ctx.strokeText(text, 0, 0)',
    'const {fillText: zeichne} = ctx; zeichne(text, 0, 0)',
    'const xml = new DOMParser().parseFromString(text, "text/html"); xml.documentElement.textContent = text',
  ])('meldet direkte oder unklare Ausgaben: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });

  it.each([
    "import {nativeMeldung as zeige} from '@/lib/plattform/tauriHelpers'; zeige(text)",
    "const {nativeBestaetigung: frage} = await import('@/lib/plattform/tauriHelpers'); frage(text)",
    "import {Menu, MenuItem} from '@tauri-apps/api/menu'; const items = [await MenuItem.new({text})]; Menu.new({items})",
    "import {invoke} from '@tauri-apps/api/core'; invoke('daten_lesen', {titel: daten})",
    'const text = ausgabe.textContent; ctx.measureText(text)',
    'ausgabe.setAttribute("data-id", text)',
    'eingabe.value = text',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); const knoten = xml.documentElement; knoten.textContent = text; xml.createTextNode(text)',
  ])('trennt gemeinsame Übergaben von direkt ausgegebenen Daten: %s', async (code) => {
    const meldungen = await fehler(code);
    // Ressourcencontainer und XML-Arbeitskopien benötigen jetzt lokale Ausnahmen.
    expect(meldungen.length).toBe(
      code.includes('MenuItem.new') ? 2 : code.includes('const xml') ? 2 : 0,
    );
  });

  it('nimmt weder lib noch Importdateien als DOM-Anzeigebereich aus', async () => {
    expect(
      (await fehler('document.body.textContent = text', 'src/lib/import/Beispiel.ts')).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    'src/lib/plattform/tauriHelpers.ts',
    'src/components/textanzeige/textanzeige.attribute.ts',
  ])('prüft die engen unteren Übergaben: %s', async (datei) => {
    const code = await readFile(join(wurzel, datei), 'utf8');
    expect(await fehler(code, datei)).toEqual([]);
    expect(
      (await fehler(`${code}\ndocument.body.textContent = rohtext;`, datei)).length,
    ).toBeGreaterThan(0);
    expect((await fehler(`${code}\nfenster.setTitle(rohtext);`, datei)).length).toBeGreaterThan(0);
  });
});

describe('Verbindliche Textanzeige: enge Implementierungs- und Herkunftsgrenzen', () => {
  it.each([
    'const {confirm: frage} = await import(pfad); frage(text)',
    'function falsch(confirm: any) {confirm(text)}',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); xml.fremderKnoten.textContent = text',
    "import {Menu} from '@tauri-apps/api/menu'; const items = []; items.push({text}); Menu.new({items})",
    'ausgabe.append(text)',
    'ausgabe.replaceChildren(text)',
    'const zeichne = ctx.fillText; zeichne(text, 0, 0)',
  ])('beanstandet weitere dynamische Umgehungen: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });
  it.each([
    "import {nativeMeldung as zeige} from './fremd'; zeige(text)",
    "import {nativeMeldung} from '@/lib/plattform/tauriHelpers'; function falsch(nativeMeldung: Function) {nativeMeldung(text)}",
    "import {confirm} from '@tauri-apps/plugin-dialog'; const alias = confirm; alias(text)",
    "import {MenuItem} from '@tauri-apps/api/menu'; function bauen(Blatt: typeof MenuItem) {Blatt.new(optionen)}",
    "import {Menu} from '@tauri-apps/api/menu'; Menu.new(optionen)",
    "import {Menu} from '@tauri-apps/api/menu'; Menu.new({items: [{text: 'Hallo', items: [{text}]}]})",
    'const xml = new DOMParser().parseFromString(text, "application/xml"); xml.documentElement.textContent = text; document.body.appendChild(xml.documentElement)',
    'function falsch(DOMParser: any) {const xml = new DOMParser().parseFromString(text, "application/xml"); xml.documentElement.textContent = text}',
    'const xml = fremdesXml as XMLDocument; xml.documentElement.textContent = text',
    'const xml = new DOMParser().parseFromString(text, mime); xml.documentElement.textContent = text',
  ])('beanstandet Täuschung und ungeprüfte Grenzen: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });

  it('gibt den noch umzustellenden spezialisierten Gesetztextrenderer nicht pauschal frei', async () => {
    const datei = 'src/components/gesetzestextansicht/baum/textBlatt.tsx';
    expect(
      (await fehler('export function TextBlatt() {return <span>{rohtext}</span>}', datei)).length,
    ).toBeGreaterThan(0);
  });
});

describe('Verbindliche Textanzeige: technische native Herkunft (0c.3a)', () => {
  const core = "import {invoke} from '@tauri-apps/api/core';";
  const menu =
    "const daten = [1, 2]; import {Menu} from '@tauri-apps/api/menu'; import {nativeMenuEintrag as geschuetzt} from '@/lib/plattform/tauriHelpers';";
  it.each([
    "window.open(url, '_blank')",
    "const browser = window; browser.open(url, '_blank')",
    `${core} function kontext(cmd: string) { invoke(cmd, {label, payload}); } kontext('kommentar_kontext_ablegen'); kontext('verweismarkierung_kontext_ablegen');`,
    `${core} function pruefen(aktion: 'abfragen' | 'vollbedarf') {invoke(\`pruefvorgang_\${aktion}\`, {konfliktToken, vorgaenge});}`,
    `${core} function laden(ruf: Function) {ruf('lade_landesrecht_dokumentseite', {url});} function weiter(ruf: Function) {laden(ruf);} weiter(invoke);`,
    `${menu} async function bauen(x: unknown) {return geschuetzt({text: x});} const items = await Promise.all(daten.map(x => bauen(x))); Menu.new({items});`,
    `${menu} async function bauen(x: unknown) {if(flag) return geschuetzt({text: x}); return geschuetzt({text: x});} const items = await Promise.all(daten.map(x => bauen(x))); Menu.new({items});`,
    `${menu} const items = []; for(const x of daten) {const item = await geschuetzt({text: x}); items.push(item);} Menu.new({items});`,
  ])('prüft dynamische Nichttextaufrufe und Ressourcen an der Ausgabegrenze: %s', async (code) => {
    expect((await fehler(code)).length).toBe(
      code.includes('window') || code.includes('function laden') ? 0 : 1,
    );
  });
  it.each([
    "function falsch(window: any) {window.open(url, '_blank')}",
    "import {window} from './fremd'; window.open(url, '_blank')",
    "import {open} from '@tauri-apps/plugin-dialog'; open({title: roh})",
    `${core} function kontext(cmd: string) {invoke(cmd, {payload});} kontext(unbekannt);`,
    `${core} function kontext(cmd: string) {invoke(cmd, {titel: roh});} kontext('kommentar_fenster_oeffnen');`,
    `${core} function kontext(cmd: string) {invoke(cmd, {payload});} kontext('unbekannter_befehl');`,
    `${core} function kontext(cmd: string) {cmd = unbekannt; invoke(cmd, {payload});} kontext('kommentar_kontext_ablegen');`,
    `${core} invoke('markierungskonflikte_fenster_oeffnen', {titel: roh});`,
    `${core} invoke('kommentar_kontext_ablegen', {...unbekannt});`,
    "const browser = window; browser.open = fremd; browser.open(url, '_blank');",

    `${core} export function kontext(cmd: string) {invoke(cmd, {payload});} kontext('kommentar_kontext_ablegen');`,
    `${core} function pruefen(aktion: string) {invoke(\`pruefvorgang_\${aktion}\`);}`,
    `${core} function pruefen(aktion: 'abfragen' | 'fenster_oeffnen') {invoke(\`pruefvorgang_\${aktion}\`);}`,
    `${core} function pruefen(aktion: string) {invoke(\`pruefvorgang_\${aktion as 'abfragen'}\`);}`,
    "import {invoke} from './fremd'; function laden(invoke: Function) {invoke('lade_landesrecht_dokumentseite', {url});} laden(invoke);",
    `${core} function laden(invoke: typeof import('@tauri-apps/api/core').invoke) {invoke('lade_landesrecht_dokumentseite', {url});}`,
    `${core} function laden(invoke: Function) {invoke('kommentar_fenster_oeffnen', {titel: roh});} laden(invoke);`,
    `${menu} const items = await Promise.all(daten.map(x => ({text: x}))); Menu.new({items});`,
    `${menu} async function bauen(x: unknown) {return flag ? geschuetzt({text: x}) : {text: x};} const items = await Promise.all(daten.map(x => bauen(x))); Menu.new({items});`,
    `${menu} const items = await Promise.all(daten.map(x => geschuetzt({text: x}))); items.push({text: roh}); Menu.new({items});`,
    `${menu} const items = []; for(const x of daten) items.push(await geschuetzt({text: x})); unbekannt(items); Menu.new({items});`,
    `${menu} const items = []; for(const x of daten) items.push({text: x}); Menu.new({items});`,
    `${menu} const items = [] as MenuItem[]; Menu.new({items: fremd as MenuItem[]});`,
    `${menu} const items = []; const alias = items; alias.push({text: roh}); Menu.new({items});`,
    `${menu} const items = []; for(const x of daten) items.push(await fremdeFactory(x)); Menu.new({items});`,
    `${menu} function bauen(Factory: typeof import('@tauri-apps/api/menu').PredefinedMenuItem) {return Factory.new({item: 'Separator'});} const items = await Promise.all(daten.map(x => bauen(fremdeFactory))); Menu.new({items});`,
    `${menu} const Factory: typeof import('@tauri-apps/api/menu').PredefinedMenuItem = fremdeFactory; const items = await Promise.all(daten.map(x => Factory.new({item: 'Separator'}))); Menu.new({items});`,

    `${menu} const items = await Promise.all(daten.map(x => geschuetzt({text: x}))); const alias = items; unbekannt(alias); Menu.new({items});`,
    `${menu} async function bauen(x: unknown) {const item = await geschuetzt({text: x}); unbekannt(item); return item;} const items = await Promise.all(daten.map(x => bauen(x))); Menu.new({items});`,
    `${menu} const items = []; for(const x of daten) {const item = await geschuetzt({text: x}); item.text = roh; items.push(item);} Menu.new({items});`,
    `${menu} const items = await Promise.all(unbekannteFactory().map(x => geschuetzt({text: x}))); Menu.new({items});`,
    `${menu} const items = await Promise.all(daten.map(x => geschuetzt({text: x}))); items[0] = {text: roh}; Menu.new({items});`,
    `${menu} const items = await Promise.all(daten.map(x => geschuetzt({text: x}))); items.forEach(unbekannt); Menu.new({items});`,
    `${menu} const items = await Promise.all(daten.map(x => geschuetzt({text: x}))); Object.assign(items, fremd); Menu.new({items});`,
    `${menu} function falsch(Promise: any) {const items = await Promise.all(daten.map(x => geschuetzt({text: x}))); Menu.new({items});}`,
    `${menu} async function bauen(x: unknown) {return geschuetzt({text: x});} const items = await Promise.all(daten.map(x => bauen(x))); bauen = fremdeFactory; Menu.new({items});`,
  ])('verwehrt unbewiesene, offene oder mutierte Herkunft: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });
  it.each([
    "import {createElement as invoke} from 'react'; function laden(invoke: Function) {invoke('kommentar_fenster_oeffnen', {titel: roh});} laden(invoke);",
    "type Invoke = typeof import('@tauri-apps/api/core').invoke; function laden(invoke: Invoke) {invoke('lade_landesrecht_dokumentseite', {url});}",
    "function laden(ruf: typeof import('@tauri-apps/api/core').invoke) {ruf('lade_landesrecht_dokumentseite', {url});}",
    `${core} function laden(ruf: typeof invoke) {ruf('lade_landesrecht_dokumentseite', {url});}`,
  ])('verwehrt aufgelöste Fremdimporte und reine Typverträge: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });
  it.each([
    'src/components/tableiste/hamburgerMenu.ts',
    'src/components/gesetzestextansicht/markierung/kontextMenu.tsx',
    'src/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster.ts',
    'src/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff.ts',
    'src/lib/import/bw/importindexErstellungBW.ts',
    'src/hooks/useTiefenLinks.ts',
    'src/components/overlays/suche/OeffnenOverlay.tsx',
  ])('bereinigt die nachgewiesenen nativen Bestandsfunde: %s', async (datei) => {
    const code = await readFile(join(wurzel, datei), 'utf8');
    expect((await fehler(code, datei)).filter((m) => m.messageId === 'nativ')).toEqual([]);
  });
});

describe('Provider prüfen ihre sichtbaren Textkinder', () => {
  it.each([
    '<C.Provider value={null}>{"§ 1 BGB"}</C.Provider>',
    '<C.Provider value={null} children="§ 1 BGB"/>',
    '<C.Provider value={null}>{wert}</C.Provider>',
    '<C.Provider value={null} children={wert}/>',
    '<C.Provider value={null} {...{children: "§ 1 BGB"}}/>',
    'createElement(C.Provider, {value: null}, "§ 1 BGB")',
    'createElement(C.Provider, {value: null}, wert)',
    'createElement(C.Provider, {value: null, children: "§ 1 BGB"})',
    'function Layout({children}: {children: ReactNode}) {return <C.Provider value={null}>{children}</C.Provider>}',
    'function Layout({children}: {children: ReactNode}) {return <C.Provider value={null} children={children}/>}',
    'function Layout({children}: {children: ReactNode}) {return createElement(C.Provider, {value: null}, children)}',
  ])('beanstandet rohe oder offene Kinder: %s', async (ausgabe) => {
    const meldungen = await fehler(
      `import {createContext, createElement, type ReactNode} from "react"; const C = createContext(null); ${ausgabe}`,
    );
    expect(meldungen.map((m) => m.messageId)).toEqual(['text']);
  });
});

describe('Regelmeldungen führen zur Orientierung', () => {
  it.each([
    ['<span>{wert}</span>', 'text'],
    ['<span title={wert}/>', 'attribut'],
    ['invoke("markierungskonflikte_fenster_oeffnen", {titel: wert})', 'nativ'],
    ['element.textContent = wert', 'dom'],
    ['<span {...props}/>', 'spread'],
  ])('verweist bei %s auf den Prüfweg', async (code, kennung) => {
    const meldungen = await fehler(`import {invoke} from "@tauri-apps/api/core"; ${code}`);
    expect(meldungen.find((m) => m.messageId === kennung)?.message).toContain(
      'Siehe docs/doku/umbruchschutz.md',
    );
  });
});

describe('Layout: lokale Rückgaben und echte React-Provider', () => {
  it.each([
    'function Layout({daten}: {daten: string[]}) {return <div>{daten.map(x => {const icon = <Icon/>; if (x) return icon; return null;})}</div>}',
    'function Layout({daten}: {daten: string[]}) {const renderSpalte = (teile: string[]) => teile.map(x => {if (x) return <Icon/>; return <Anderes/>}); return <div>{renderSpalte(daten)}</div>}',
    'function Layout({daten}: {daten: string[]}) {const anzahl = daten.filter(x => !!x).length; return <div>{daten.map(x => <Icon/>)}</div>}',
    'function lesen(daten: string[], i: number) {return daten[i];} function Layout({daten}: {daten: string[]}) {return <div>{daten.map((x, i) => <Icon data-wert={lesen(daten, i)}/>)}</div>}',
    'function bauen() {const inhalt = flag ? <Icon/> : null; return inhalt;} <div>{bauen()}</div>',
    'function bauen() {if (flag) return false; if (andere) return ""; return <Icon/>;} <div>{bauen()}</div>',
    'function Layout({name, ok}: {name?: string; ok: boolean}) {const namensSpalte = ok && name && <Icon/>; return <div>{namensSpalte}</div>}',
    'function Layout({absatz}: {absatz: {bezeichnung?: string}}) {return <div>{absatz.bezeichnung && <Icon/>}</div>}',
    'import type { AbsatzDarstellung } from "@/lib/domain/gesetzTypes"; function Layout({absatz}: {absatz: AbsatzDarstellung}) {return <div>{absatz.bezeichnung && <Icon/>}</div>}',
    'function Layout({reihen}: {reihen: string[][]}) {return <div>{reihen.map(reihe => <div>{reihe.map(z => <Icon/>)}</div>)}</div>}',
    'import { SONDERZEICHEN_REIHEN as reihen } from "@/mobile/components/CustomTastatur.layout"; <div>{reihen.map(reihe => <div>{reihe.map(z => <Icon/>)}</div>)}</div>',
    'import { createContext as context, type ReactElement } from "react"; const C = context(null); function Layout({children}: {children: ReactElement}) {return <C.Provider value={null}>{children}</C.Provider>}',
    'import React, {type ReactElement} from "react"; const C = React.createContext(null); const Alias = C; function Layout({children}: {children: ReactElement}) {return <Alias.Provider value={null} children={children}/>}',
    'import { createContext, createElement, type ReactElement } from "react"; const C = createContext(null); function Layout({children}: {children: ReactElement | ReactElement[]}) {return createElement(C.Provider, {value: null}, children)}',
  ])('erlaubt belegte Layoutpfade: %s', async (code) => {
    expect(await fehler(code)).toEqual([]);
  });
  it.each([
    'const daten = ["x"]; const elemente = daten.map(x => <Icon/>); elemente.push("Hallo"); <div>{elemente}</div>',
    'function bauen() {return [<Icon/>];} const elemente = bauen(); elemente[0] = "Hallo"; <div>{elemente}</div>',
    'function Layout({daten}: {daten: string[]}) {daten.map = fremd; return <div>{daten.map(x => <Icon/>)}</div>}',
    'function Layout({daten}: {daten: string[][]}) {return <div>{daten.map(reihe => {reihe.map = fremd; return <div>{reihe.map(x => <Icon/>)}</div>})}</div>}',
    'function bauen() {if (flag) return "Hallo"; return <Icon/>;} <div>{bauen()}</div>',
    'function bauen() {const inhalt = flag ? <Icon/> : "Hallo"; return inhalt;} <div>{bauen()}</div>',
    'function bauen() {function intern() {return <Icon/>} return roh;} <div>{bauen()}</div>',
    'async function bauen() {return <Icon/>;} <div>{bauen()}</div>',
    'function* bauen() {return <Icon/>;} <div>{bauen()}</div>',
    'function bauen() {return <Icon/>;} bauen = fremd; <div>{bauen()}</div>',
    'const daten = ["x"]; <div>{daten.map(x => {if(x) return "Hallo"; return <Icon/>})}</div>',
    'function Layout({anzahl}: {anzahl: number}) {return <div>{anzahl && <Icon/>}</div>}',
    'function Layout({name}: {name: string}) {return <div>{name || <Icon/>}</div>}',
    'function Layout({name}: {name: unknown}) {return <div>{name && <Icon/>}</div>}',
    'function Layout({name}: {name: string | number}) {return <div>{name && <Icon/>}</div>}',
    'function Layout({absatz}: {absatz: {bezeichnung: number}}) {return <div>{absatz.bezeichnung && <Icon/>}</div>}',
    'import {createContext, type ReactNode} from "react"; const C = createContext(null); function Layout({children}: {children: ReactNode}) {return <span>{children}</span>}',
    'function Provider({children}: {children: any}) {return <span>{children}</span>}',
    'const C = fremd(); <C.Provider>{children}</C.Provider>',
    'import {createContext} from "fremd"; const C = createContext(null); <C.Provider>{children}</C.Provider>',
    'import {createContext} from "react"; const C = createContext(null); C.Provider = fremd; <C.Provider>{children}</C.Provider>',
    'import {createContext} from "react"; const C = createContext(null); C.Provider._context = fremd; <C.Provider>{children}</C.Provider>',
    'import {createContext} from "react"; const C = createContext(null); const alias = C; alias.Provider = fremd; <C.Provider>{children}</C.Provider>',
    'import {createContext} from "react"; const C = createContext(null); unbekannt(C); <C.Provider>{children}</C.Provider>',
    'import {createContext} from "react"; const C = createContext(null); function falsch(C: any) {return <C.Provider>{children}</C.Provider>}',
    'import {createContext} from "react"; const C = createContext(null); <C.Provider title={titel}>{children}</C.Provider>',
    'import {createContext} from "react"; const C = createContext(null); <C.Provider {...offen}>{children}</C.Provider>',
  ])('beanstandet Textpfade und unbelegte Provider: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });
});

describe('Layout: konkrete Bestandsverträge', () => {
  it.each(['EinstellungenZeile', 'EinstellungenKategorieAbschnitt', 'EinstellungenSelect'])(
    'belegt die eingeengten Einstellungsslots und beanstandet erneut offene Textkinder in %s',
    async (name) => {
      const datei = `src/components/hilfsfenster/einstellungsfenster/${name}.tsx`;
      const code = await readFile(join(wurzel, datei), 'utf8');
      expect(await fehler(code, datei)).toEqual([]);
      const offen = code
        .replace('children: ReactElement | ReactElement[]', 'children: string')
        .replace('children: ReactElement', 'children: string');
      expect((await fehler(offen, datei)).some((m) => m.messageId === 'text')).toBe(true);
    },
  );

  it.each([
    ['src/components/seitenleisten/Seitenleiste.tsx', [79, 118, 132, 138]],
    ['src/components/gesetzestextansicht/baum/absatzBausteine.tsx', [106, 123, 199]],
    ['src/hooks/einstellungen/useUiGroesse.tsx', [90]],
    ['src/mobile/components/CustomTastatur.tsx', [218, 220, 235, 245, 246, 258]],
  ] as const)('belegt den lokalen Layoutpfad in %s', async (datei, zeilen) => {
    const code = await readFile(join(wurzel, datei), 'utf8');
    const meldungen = await fehler(code, datei);
    expect(
      meldungen.filter(
        (m) => m.messageId === 'text' && (zeilen as readonly number[]).includes(m.line),
      ),
    ).toEqual([]);
    if (datei.endsWith('absatzBausteine.tsx'))
      expect(
        (
          await fehler(
            code.replace('<TextAnzeige text={absatz.bezeichnung} />', '{absatz.bezeichnung}'),
            datei,
          )
        ).some((m) => m.messageId === 'text'),
      ).toBe(true);
  });
  it.each(['src/components/gesetzestextansicht/text-darstellung/textDarstellung.tsx'])(
    'beanstandet erneut geöffnete ReactNode-Slots in %s',
    async (datei) => {
      const code = await readFile(join(wurzel, datei), 'utf8');
      expect(
        (
          await fehler(
            code.replace('children: ReactElement | ReactElement[]', 'children: ReactNode'),
            datei,
          )
        ).some((m) => m.messageId === 'text'),
      ).toBe(true);
    },
  );
});

describe('App-/Overlayrahmen: verbindliche Anzeigegrenzen', () => {
  it.each([
    'src/App.tsx',
    'src/main.tsx',
    'src/components/hauptfenster/OverlayHost.tsx',
    'src/components/hauptfenster/Willkommensansicht.tsx',
    'src/components/overlays/OverlayRahmen.tsx',
    'src/components/overlays/OverlayTrennlinie.tsx',
    'src/components/overlays/standard/OverlayKopfzeile.tsx',
    'src/components/overlays/standard/OverlaySchliessenButton.tsx',
    'src/components/overlays/standard/LinuxTitelleistenAbfrage.tsx',
    'src/hooks/einstellungen/useUiGroesse.tsx',
    'src/hooks/useTiefenLinks.ts',
  ])('hat keinen offenen Anzeigepfad in %s', async (datei) => {
    expect(
      (await fehler(await readFile(join(wurzel, datei), 'utf8'), datei)).filter(
        (meldung) => meldung.ruleId === 'lexlata/textanzeige-verbindlich',
      ),
    ).toEqual([]);
  });
  it('beanstandet einen erneut geöffneten Textslot im OverlayRahmen', async () => {
    const datei = 'src/components/overlays/OverlayRahmen.tsx';
    const code = await readFile(join(wurzel, datei), 'utf8');
    const offen = code.replace(
      'children: React.ReactElement | React.ReactElement[]',
      'children: React.ReactNode',
    );
    expect((await fehler(offen, datei)).some((m) => m.messageId === 'text')).toBe(true);
  });
});

describe('DOM-Daten: enge Herkunftsbeweise', () => {
  it.each([
    'import { SaxesParser as Parser } from "saxes"; const p = new Parser(); const alias = p; alias.write(text)',
    'import * as sax from "saxes"; new sax.SaxesParser().write(text)',
    'const parser = new DOMParser(); const xml = parser.parseFromString(text, "application/xml"); function arbeite(el: Element) { el.textContent = text; el.ownerDocument.createTextNode(text); } arbeite(xml.documentElement)',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); function sammle(root: Element) { const daten = []; function besuche(node: Node) { daten.push({knoten: node}); Array.from(node.childNodes).forEach(besuche); } besuche(root); return daten; } const ziel = sammle(xml.documentElement).find(p => true); ziel.knoten.textContent = text',
    'function farbe(name: string) { document.documentElement.setAttribute(name, text); } farbe("data-app-akzent"); farbe("data-markierungsfarbe"); farbe("data-gesetzestext-akzent")',
  ])('prüft Datenzugriffe ohne XML- oder SAX-Herkunftsfreigabe: %s', async (code) => {
    expect((await fehler(code)).length).toBe(
      code.includes('function farbe') ? 0 : code.includes('function arbeite') ? 2 : 1,
    );
  });
  it.each([
    'import { SaxesParser } from "saxes"; const p = new SaxesParser(); p.write = document.write; p.write(text)',
    'const parser = new DOMParser(); parser.parseFromString = fremd; const xml = parser.parseFromString(text, "application/xml"); xml.documentElement.textContent = text',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); const obj = {knoten: xml.documentElement}; obj.knoten = document.body; obj.knoten.textContent = text',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); export function arbeite(el: Element) {el.textContent = text} arbeite(xml.documentElement)',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); function sammle() { const daten = []; daten.push({knoten: xml.documentElement}); daten.find(p => { p.knoten = document.body; return true; }); return daten; } const ziel = sammle().find(p => true); ziel.knoten.textContent = text',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); function sammle(root: Element) { const daten = []; function besuche(node: Node) { daten.push({knoten: node}); Array.from((offen ? document.body : node).childNodes).forEach(besuche); } besuche(root); return daten; } const ziel = sammle(xml.documentElement).find(p => true); ziel.knoten.textContent = text',
    'document.write(text)',
    'import { SaxesParser } from "fremder-parser"; new SaxesParser().write(text)',
    'class SaxesParser { write(text: string) {} } new SaxesParser().write(text)',
    'import { SaxesParser } from "saxes"; function unbekannt(p: SaxesParser) {p.write(text)}',
    'function arbeite(el: Element) {el.textContent = text} arbeite(document.body)',
    'export function arbeite(el: Element) {el.textContent = text}',
    'const xml = new DOMParser().parseFromString(text, "application/xml"); function arbeite(el: Element) {el.textContent = text} arbeite(xml.documentElement); document.body.appendChild(xml.documentElement)',
    'function farbe(name: string) { document.body.setAttribute(name, text); } farbe(offen)',
    ...['title', 'placeholder', 'aria-label', 'alt'].map(
      (name) =>
        `function farbe(name: string) { document.body.setAttribute(name, text); } farbe("${name}")`,
    ),
  ])('beanstandet fehlenden Beweis: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });
  it.each([
    [
      'farbe("data-app-akzent"); farbe("data-markierungsfarbe"); farbe("data-gesetzestext-akzent")',
      true,
    ],
    ['farbe("title")', true],
    ['farbe("placeholder")', true],
    ['farbe("aria-label")', true],
    ['farbe("alt")', true],
    ['farbe(offen)', true],
    ['fremd(farbe)', true],
    ['import {farbe as alias} from "./farbe"; alias("data-app-akzent")', true],
    ['import {farbe as alias} from "./farbe"; alias(offen); farbe("data-app-akzent")', true],
    ['const alias = farbe; alias("data-app-akzent")', true],
    [
      'import * as modul from "./farbe"; namespace Inner { import verborgen = modul.farbe; verborgen(offen); } farbe("data-app-akzent")',
      true,
    ],
    ['', true],
  ])(
    'gibt exportierte Attributparameter unabhängig von fremden Aufrufern nicht frei: %s',
    async (aufrufe, erwartet) => {
      const ordner = await mkdtemp(join(tmpdir(), 'lexlata-attribut-'));
      try {
        await writeFile(join(ordner, 'tsconfig.json'), JSON.stringify({ include: ['*.ts'] }));
        const code =
          'export function farbe(name: string) { document.body.setAttribute(name, text); }';
        await writeFile(join(ordner, 'farbe.ts'), code);
        await writeFile(join(ordner, 'aufrufer.ts'), `import {farbe} from "./farbe"; ${aufrufe}`);
        const [ergebnis] = await lintInstanz(ordner).lintText(code, {
          filePath: join(ordner, 'farbe.ts'),
        });
        expect(ergebnis?.fatalErrorCount).toBe(0);
        expect(ergebnis!.messages.length > 0).toBe(erwartet);
      } finally {
        await rm(ordner, { recursive: true, force: true });
      }
    },
  );
  it.each([
    'src/lib/import/importindex/europaVerzeichnis.ts',
    'src/lib/import/importindex/importindexErstellung.persistenz.ts',
    'src/lib/import/importindex/importindexValidierung.ts',
    'src/lib/import/importabschluss/gesetzesXMLNachbereiten.ts',
    'src/hooks/einstellungen/useFarbwahlEinstellung.ts',
  ])('erlaubt den belegten produktiven Herkunftsweg: %s', async (datei) => {
    expect(await fehler(await readFile(join(wurzel, datei), 'utf8'), datei)).toEqual([]);
  });
});

describe('Reine Ereignisprops aus belegten exportierten Factories', () => {
  const pointerImport =
    "import {baueTastenPointerHandler as bauen} from '@/mobile/components/CustomTastatur.pointer';";
  const inputImport = "import {useCustomTastatur as bauen} from '@/mobile/useCustomTastatur';";
  it.each([
    `${pointerImport} const props = bauen(ref, handler); <button {...props}/>;`,
    `${pointerImport} <button {...bauen(ref, handler)}/>;`,
    `${inputImport} const tastatur = bauen(optionen); <input {...tastatur.inputProps} value={wert}/>;`,
    `${inputImport} const tastatur = bauen(optionen); tastatur.tasteEingeben(zeichen); <input {...tastatur.inputProps}/>;`,
  ])(
    'verlangt auch für echte Ereignis-/Eingabefactories eine lokale Ausnahme: %s',
    async (code) => {
      expect((await fehler(code)).length).toBeGreaterThan(0);
    },
  );
  it.each([
    `${pointerImport} const props = bauen(ref, handler); props.title = text; <button {...props}/>;`,
    `${pointerImport} const props = bauen(ref, handler); Object.assign(props, fremd); <button {...props}/>;`,
    `${pointerImport} const props = bauen(ref, handler); const alias = props; alias.children = text; <button {...props}/>;`,
    `${pointerImport} <button {...bauen(ref, handler)} title={text}/>;`,
    `${inputImport} const tastatur = bauen(optionen); const props = tastatur.inputProps; props.title = text; <input {...tastatur.inputProps}/>;`,
    `${inputImport} const tastatur = bauen(optionen); tastatur.inputProps.title = text; <input {...tastatur.inputProps}/>;`,
    `${inputImport} const tastatur = bauen(optionen); Object.assign(tastatur.inputProps, fremd); <input {...tastatur.inputProps}/>;`,
    `function baueTastenPointerHandler() {return unbekannt;} <button {...baueTastenPointerHandler()}/>;`,
    `import {baueTastenPointerHandler} from './fremd'; <button {...baueTastenPointerHandler()}/>;`,
  ])('verwehrt fremde Herkunft und Überschreibung: %s', async (code) => {
    expect((await fehler(code)).length).toBeGreaterThan(0);
  });
});

describe('Mobile Messkopie an der Ausgabegrenze', () => {
  it('verlangt eine konkrete lokale Ausnahme und prüft benachbarten Rohtext', async () => {
    const pfad = 'src/mobile/screens/OeffnenScreen.tsx';
    const code = await readFile(join(wurzel, pfad), 'utf8');
    const zeile = code.split('\n').findIndex((l) => l.includes('{suchtext.slice')) + 1;
    expect((await fehler(code, pfad)).some((m) => m.line === zeile)).toBe(false);
    const offen = code.replace(
      '{suchtext.slice(0, tastatur.cursorPosition)}',
      '{suchtext.slice(0, tastatur.cursorPosition)}\n{neuerRohtext}',
    );
    expect(
      (await fehler(offen, pfad)).some((m) => m.line === zeile + 1 && m.messageId === 'text'),
    ).toBe(true);
  });
});

it('behandelt nur das bestehende Menüzeichen als reines Symbol', async () => {
  expect(await fehler('<button>☰</button>')).toEqual([]);
  expect((await fehler('<button>☰ Menü</button>')).length).toBeGreaterThan(0);
});

describe('Ausgabegrenzen ohne Implementierungsbeweis', () => {
  it.each([
    ['src/components/textanzeige/TextAnzeige.tsx', 'text', 2],
    ['src/components/textanzeige/textanzeige.attribute.ts', 'spread', 1],
    ['src/lib/plattform/tauriHelpers.ts', 'nativ', 9],
    ['src/lib/plattform/tauri-befehle/aufruf.ts', 'nativ', 1],
    ['src/hooks/einstellungen/useFarbwahlEinstellung.ts', 'dom', 1],
  ])('verlangt lokale Ausnahme an unterster Ausgabe in %s', async (datei, art, anzahl) => {
    const code = await readFile(join(wurzel, datei), 'utf8');
    const [ergebnis] = await lintInstanz(wurzel, false).lintText(code, {
      filePath: join(wurzel, datei),
    });
    expect(ergebnis?.fatalErrorCount).toBe(0);
    expect(ergebnis!.messages.filter((m) => m.messageId === art)).toHaveLength(anzahl);
  });
});

it.each([
  `${anzeigeImport} function falsch(Falsch: typeof Text) { return <Falsch title={text}/>; }`,
  `${anzeigeImport} const Falsch: typeof Text = fremd; <Falsch title={text}/>;`,
  "import {nativeMeldung as zeige} from '@/lib/plattform/tauriHelpers'; const falsch: typeof zeige = fremd; falsch(text);",
])('verwehrt alleinige Typbehauptung eines öffentlichen Anzeigewegs: %s', async (code) => {
  expect((await fehler(code)).length).toBeGreaterThan(0);
});

it.each([
  "import type {TextAnzeige as Text} from '@/components/textanzeige/textanzeige.index'; <Text title={text}/>;",
  "import {type TextAnzeige as Text} from '@/components/textanzeige/textanzeige.index'; <Text title={text}/>;",
  "import type {nativeMeldung as zeige} from '@/lib/plattform/tauriHelpers'; zeige(text);",
])('verlangt einen Wertimport statt eines reinen Typimports: %s', async (code) => {
  expect((await fehler(code)).length).toBeGreaterThan(0);
});

it.each([
  'const xml = new DOMParser().parseFromString(text, "application/xml"); xml.documentElement.textContent = text;',
  'import {SaxesParser} from "saxes"; const parser = new SaxesParser(); parser.write(text);',
  "import {Menu} from '@tauri-apps/api/menu'; import {nativeMenuEintrag} from '@/lib/plattform/tauriHelpers'; const items = [await nativeMenuEintrag({text})]; Menu.new({items});",
  "import {invoke} from '@tauri-apps/api/core'; function kontext(cmd: string) {invoke(cmd, {label, payload});} kontext('kommentar_kontext_ablegen');",
  "import {baueTastenPointerHandler} from '@/mobile/components/CustomTastatur.pointer'; <button {...baueTastenPointerHandler(ref, handler)}/>;",
  "import {useCustomTastatur} from '@/mobile/useCustomTastatur'; const tastatur = useCustomTastatur(optionen); <input {...tastatur.inputProps}/>;",
])('verlangt lokale Ausnahmen statt technischer Herkunftsbeweise: %s', async (code) => {
  expect((await fehler(code)).length).toBeGreaterThan(0);
});

it('prüft die ursprüngliche Messkopie ohne automatische Implementierungsfreigabe', async () => {
  const datei = 'src/mobile/screens/OeffnenScreen.tsx';
  const code = await readFile(join(wurzel, datei), 'utf8');
  const zeile = code.split('\n').findIndex((l) => l.includes('{suchtext.slice')) + 1;
  const [ergebnis] = await lintInstanz(wurzel, false).lintText(code, {
    filePath: join(wurzel, datei),
  });
  expect(ergebnis!.messages.some((m) => m.line === zeile && m.messageId === 'text')).toBe(true);
});

describe('Gesetzestext: gemeinsame Anzeige- und Elementwege', () => {
  it.each([
    'src/components/gesetzestextansicht/Gesetzestextansicht.tsx',
    'src/components/gesetzestextansicht/ansichtssteuerung/StrukturKontextLeiste.tsx',
    'src/components/gesetzestextansicht/baum/absatzBausteine.tsx',
    'src/components/gesetzestextansicht/baum/absatzVorschau.tsx',
    'src/components/gesetzestextansicht/baum/Gesetzestextansicht.bausteine.tsx',
    'src/components/gesetzestextansicht/baum/normBlock.tsx',
    'src/components/gesetzestextansicht/baum/satzEintragBausteine.tsx',
    'src/components/gesetzestextansicht/baum/ueberschriftZeile.tsx',
    'src/components/gesetzestextansicht/text-darstellung/textDarstellung.tsx',
  ])('verlangt Anzeigewege und erkennt benachbarte neue Rohanzeigen in %s', async (datei) => {
    const code = await readFile(join(wurzel, datei), 'utf8');
    expect(
      (await fehler(code, datei)).filter((m) => m.ruleId === 'lexlata/textanzeige-verbindlich'),
    ).toEqual([]);
    expect(
      (await fehler(code + '\nconst neueAnzeige = <span>Neu</span>;', datei)).some(
        (m) => m.messageId === 'text',
      ),
    ).toBe(true);
  });
});
