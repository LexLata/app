// Gesetzestextansicht.weitergabe.test.tsx
// Produktionsanschluss des lokalen Darstellungsmodells an die Steuerung.
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/Gesetzestextansicht';
import { GesetzTextScreen } from '@/mobile/screens/GesetzTextScreen';
import type { AnsichtssteuerungOptionen } from '@/components/gesetzestextansicht/ansichtssteuerung/Ansichtssteuerung.types';
import { berechneTitelEinzug } from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import {
  erstelleItemKeyFunktion,
  ermittleHoehenIdentitaet,
  type HoehenKontext,
} from './virtualizer';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import {
  BLOCKSATZ_DEFAULT,
  ZEILENABSTAND_DEFAULT,
  UI_SCHRIFT_FALLBACK,
} from '@/lib/stil/gesetzTextDarstellung';

const ermittleItemKey = (el: DarstellungsElement, kontext: HoehenKontext, schrift: number) =>
  erstelleItemKeyFunktion(
    [el],
    kontext.eingeklappteUeberschriften,
    kontext.eingeklappteNormen,
    ermittleHoehenIdentitaet(kontext, schrift),
  )(0);

const erfasst = vi.hoisted(() => [] as AnsichtssteuerungOptionen[]);
vi.mock(
  '@/components/gesetzestextansicht/ansichtssteuerung/ansichtssteuerung.index',
  async (importOriginal) => {
    const echt =
      await importOriginal<
        typeof import('@/components/gesetzestextansicht/ansichtssteuerung/ansichtssteuerung.index')
      >();
    return {
      ...echt,
      useAnsichtssteuerung(optionen: AnsichtssteuerungOptionen) {
        erfasst.push(optionen);
        return echt.useAnsichtssteuerung(optionen);
      },
    };
  },
);
beforeEach(() => {
  erfasst.length = 0;
});
const gesetz = gesetzDarstellung({
  kurztitel: 'G',
  langtitel: 'Gesetz',
  hatGliederungsartikel: false,
  elemente: [],
});

it('zwei Hauptansichten reichen tatsächliche Werte und gemeinsame CSS-/Canvasfamilie getrennt weiter', () => {
  const html = renderToStaticMarkup(
    <>
      <Gesetzestextansicht
        gesetz={gesetz}
        schriftgroesse={22}
        schriftart="serif"
        zeilenabstand={1.8}
        randInline={88}
        blocksatz={false}
        silbentrennungAktiviert={false}
        satzNeuZeile={false}
        strukturKontextLeisteGroesse={0.7}
      />
      <Gesetzestextansicht
        gesetz={{ ...gesetz, sprache: 'zz' }}
        schriftgroesse={14}
        schriftart="sans"
        zeilenabstand={1.2}
        randInline={24}
        blocksatz
        minimalistischerModus
        strukturKontextLeisteGroesse={1}
      />
    </>,
  );
  expect(erfasst[0]).toMatchObject({
    schriftgroesse: 22,
    randInline: 88,
    zeilenabstand: 1.8,
    textAlign: 'left',
    hyphens: 'none',
    lang: 'de',
    satzNeuZeile: false,
    inhaltEinzug: berechneTitelEinzug(false, 22),
    strukturKontextLeisteGroesse: 0.7,
  });
  expect(erfasst[1]).toMatchObject({
    schriftgroesse: 14,
    randInline: 24,
    zeilenabstand: 1.2,
    textAlign: 'justify',
    hyphens: 'none',
    lang: 'zz',
    satzNeuZeile: true,
    inhaltEinzug: 9,
    strukturKontextLeisteGroesse: 1,
  });
  for (const einstellung of erfasst) {
    expect(html).toContain(
      `font-family:${einstellung.messung.schriftFamilie.replaceAll("'", '&#x27;')}`,
    );
    expect(html).toContain(
      `--text-align:${einstellung.textAlign};--hyphens:${einstellung.hyphens}`,
    );
  }
});

it('Mobile-Hülle reicht Größe/Rand durch und erhält wirksame Desktopdefaults', () => {
  renderToStaticMarkup(
    <GesetzTextScreen
      gesetz={gesetz}
      schriftgroesse={19}
      randInline={16}
      seitenleistenGroesse={12}
      onZurueckZuOeffnen={() => {}}
      onEinstellungenOeffnen={() => {}}
      onAnderesGesetzOeffnen={() => {}}
    />,
  );
  expect(erfasst[0]).toMatchObject({
    schriftgroesse: 19,
    randInline: 16,
    zeilenabstand: ZEILENABSTAND_DEFAULT,
    textAlign: BLOCKSATZ_DEFAULT ? 'justify' : 'left',
    hyphens: 'auto',
    lang: 'de',
    satzNeuZeile: true,
    inhaltEinzug: 22,
    strukturKontextLeisteGroesse: 0.85,
  });
  expect(erfasst[0]!.messung.schriftFamilie).toBe(UI_SCHRIFT_FALLBACK);
});

it('berücksichtigt den unterschiedlichen Einzug beider Modi im Höhenkey', () => {
  const key = (minimalistischerModus: boolean) => {
    renderToStaticMarkup(
      <Gesetzestextansicht gesetz={gesetz} minimalistischerModus={minimalistischerModus} />,
    );
    const o = erfasst.at(-1)!;
    return ermittleItemKey(
      { typ: 'norm', data: normaleNorm({ id: 'n', xmlId: 'n', bezeichnung: '§ 1', absaetze: [] }) },
      {
        messung: o.messung,
        eingeklappteNormen: new Set(),
        eingeklappteUeberschriften: new Set(),
        unterArtikelIds: new Set(),
        zeilenabstand: o.zeilenabstand!,
        textSpalteBreite: 720,
        inhaltEinzug: o.inhaltEinzug,
        satzNeuZeile: o.satzNeuZeile,
        textAlign: o.textAlign,
        hyphens: o.hyphens,
        lang: o.lang,
      },
      o.schriftgroesse!,
    );
  };
  expect(key(true)).not.toBe(key(false));
});

it('reicht die Aktivierungsmeldung unverändert an die Ansichtssteuerung weiter', () => {
  const onAktivierung = vi.fn();
  renderToStaticMarkup(<Gesetzestextansicht gesetz={gesetz} onAktivierung={onAktivierung} />);
  expect(erfasst[0]?.onAktivierung).toBe(onAktivierung);
});
