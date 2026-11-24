// markierungsBausteine.test.tsx
// Geschützte Zitatteile müssen im DOM zusammenbleiben; Zeichen und Klickbereiche bleiben erhalten.
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { expect, expectTypeOf, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  geschuetzterBlatttext,
  mitUmbruchschutz,
  mitFixierterLeerzeichenbreite,
  GetaggterVerweisText,
  VerweisAnzeige,
} from './markierung.index';
import { type GeschuetzterDarstellungstext } from './darstellungstext';

it.each([
  ['A  B\tC', 'A  B\tC'],
  ['A  B\tC § 9999 Abs. 1', 'A  B\tC §\u00a09999 Abs.\u00a01'],
])('erhält Zeichen und Abstandsboxen bei unterstrichenem Text: %s', (original, erwartet) => {
  const doc = new DOMParser().parseFromString(
    '<html><body>' +
      renderToStaticMarkup(
        <>
          {mitFixierterLeerzeichenbreite(geschuetzterBlatttext(original), {
            textDecoration: 'underline',
          })}
        </>,
      ) +
      '</body></html>',
    'text/html',
  );
  expect(doc.body.textContent).toBe(erwartet);
  expect(doc.body.textContent!.length).toBe(original.length);
  const abstaende = [...doc.querySelectorAll('span')].filter((el) =>
    /white-space-collapse:preserve(?:;|$)/.test(el.getAttribute('style') ?? ''),
  );
  expect(abstaende.map((el) => el.textContent)).toEqual(['  ', '\t']);
});

it('hält § und Nummer trotz eigener Leerzeichenbox zusammen', () => {
  const doc = new DOMParser().parseFromString(
    '<html><body>' +
      renderToStaticMarkup(
        <>{mitFixierterLeerzeichenbreite(geschuetzterBlatttext('§\u00a01 Abs.\u00a0II'))}</>,
      ) +
      '</body></html>',
    'text/html',
  );
  const gruppen = [...doc.querySelectorAll('span')].filter((el) =>
    el.getAttribute('style')?.includes('white-space:nowrap'),
  );
  expect(gruppen.map((el) => el.textContent)).toEqual(['§\u00a01', 'Abs.\u00a0II']);
  expect(doc.body.textContent).toBe('§\u00a01 Abs.\u00a0II');
});
it('schützt Zitattext auch wenn der Klickbereich hinter dem § beginnt', () => {
  const doc = new DOMParser().parseFromString(
    '<html><body>' +
      renderToStaticMarkup(
        <VerweisAnzeige
          verweisinhalt={{
            verweistext: '§ 1',
            verweisziele: [
              verweisziel({
                typ: 'zielnormOhneElementstand',
                bezeichnung: '§ 1',
                verweistextZeichenbereich: [1, 3],
              }),
            ],
          }}
        />,
      ) +
      '</body></html>',
    'text/html',
  );
  expect(doc.body.textContent).toBe(' §\u00a01');
  const gruppe = [...doc.querySelectorAll('span')].find((el) =>
    el.getAttribute('style')?.includes('white-space:nowrap'),
  );
  expect(gruppe?.textContent).toBe('§\u00a01');
});

it('bindet bei einem alleinstehenden geschützten Leerzeichen keine ganze Textpassage zusammen', () => {
  const text = 'Freier Text \u00a0 Weiterer Text';
  const doc = new DOMParser().parseFromString(
    '<html><body>' +
      renderToStaticMarkup(<>{mitFixierterLeerzeichenbreite(geschuetzterBlatttext(text))}</>) +
      '</body></html>',
    'text/html',
  );
  expect(doc.body.textContent).toBe(text);
  expect(
    [...doc.querySelectorAll('span')].some((el) =>
      el.getAttribute('style')?.includes('white-space:nowrap'),
    ),
  ).toBe(false);
});

it('lässt einen Zitatanhang innerhalb einer Basistext-Schutzgruppe zwischen seinen eigenen Gruppen umbrechen', () => {
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <span style={{ whiteSpace: 'nowrap' }}>
        <VerweisAnzeige
          verweisinhalt={{
            verweistext: 'Art. 1 Abs. 2 GG',
            verweisziele: [
              verweisziel({
                typ: 'zielnormOhneElementstand',
                bezeichnung: 'Art. 1',
                verweistextZeichenbereich: [0, 16],
              }),
            ],
          }}
        />
      </span>,
    ),
    'text/html',
  );
  expect(doc.querySelector('[data-zitatanhang]')?.getAttribute('style')).toContain(
    'white-space:pre-wrap',
  );
  const gruppen = [...doc.querySelector('[data-zitatanhang]')!.querySelectorAll('span')].filter(
    (el) => el.getAttribute('style')?.includes('white-space:nowrap'),
  );
  expect(gruppen.map((el) => el.textContent)).toEqual(['Art.\u00a01', 'Abs.\u00a02']);
  expect(doc.querySelector('[data-zitatanhang]')?.textContent).toBe(' Art.\u00a01 Abs.\u00a02 GG');
});

it('verlangt an den öffentlichen Renderereingängen den exportierten geschützten Typ', () => {
  expectTypeOf(mitFixierterLeerzeichenbreite)
    .parameter(0)
    .toEqualTypeOf<GeschuetzterDarstellungstext>();
  expectTypeOf(mitUmbruchschutz).parameter(0).toEqualTypeOf<GeschuetzterDarstellungstext>();
  expectTypeOf<GetaggterVerweisTextProps['text']>().toEqualTypeOf<GeschuetzterDarstellungstext>();
  expectTypeOf<
    Parameters<Parameters<typeof mitUmbruchschutz>[1]>[0]
  >().toEqualTypeOf<GeschuetzterDarstellungstext>();

  const ausgetauscht = { ...geschuetzterBlatttext('§ 1'), text: '§ 2' };
  expectTypeOf<string>().not.toMatchTypeOf<Parameters<typeof mitFixierterLeerzeichenbreite>[0]>();
  expectTypeOf(ausgetauscht).not.toMatchTypeOf<
    Parameters<typeof mitFixierterLeerzeichenbreite>[0]
  >();
  expectTypeOf<string>().not.toMatchTypeOf<Parameters<typeof mitUmbruchschutz>[0]>();
  expectTypeOf(ausgetauscht).not.toMatchTypeOf<Parameters<typeof mitUmbruchschutz>[0]>();
  expectTypeOf<string>().not.toMatchTypeOf<GetaggterVerweisTextProps['text']>();
  expectTypeOf(ausgetauscht).not.toMatchTypeOf<GetaggterVerweisTextProps['text']>();
});

type GetaggterVerweisTextProps = Parameters<typeof GetaggterVerweisText>[0];

it('schützt römische Zitatkurzformen am vollständigen Original vor den Zielgrenzen', () => {
  const verweisinhalt = {
    verweistext: '😀 § 9999 I 2 Abs. 1',
    verweisziele: [
      verweisziel({
        typ: 'zielnormOhneElementstand',
        bezeichnung: '§ 9999',
        verweistextZeichenbereich: [0, 11] as [number, number],
      }),
      verweisziel({
        typ: 'zielnormOhneElementstand',
        bezeichnung: '§ 9999',
        verweistextZeichenbereich: [11, 20] as [number, number],
      }),
    ],
  };
  const original = structuredClone(verweisinhalt);
  const doc = new DOMParser().parseFromString(
    '<html><body>' +
      renderToStaticMarkup(<VerweisAnzeige verweisinhalt={verweisinhalt} />) +
      '</body></html>',
    'text/html',
  );
  expect(doc.body.textContent).toBe(' 😀 §\u00a09999 I\u00a02 Abs.\u00a01');
  const gruppen = [...doc.querySelectorAll('span')].filter((el) =>
    el.getAttribute('style')?.includes('white-space:nowrap'),
  );
  expect(gruppen.map((el) => el.textContent)).toEqual(['§\u00a09999', 'I\u00a02', 'Abs.\u00a01']);
  expect(verweisinhalt).toEqual(original);
});
