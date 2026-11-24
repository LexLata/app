// @vitest-environment jsdom
// Hilfsfenster.formular.anzeige.test.tsx
// Bezugstext und Meldungen werden geschützt; Formularwerte bleiben Originaldaten.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { act, createRef } from 'react';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { expect, it, vi } from 'vitest';
import KommentarFormular from '@/components/hilfsfenster/kommentar/KommentarFormular';
import VerweismarkierungFormular from '@/components/hilfsfenster/verweismarkierung/VerweismarkierungFormular';
import { FensterLadeAnzeige } from './FensterLadeAnzeige';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('./hilfsfensterGroesse', () => ({
  useDynamischeFensterGroesse: () => {},
  useHilfsfensterAktionsZeilenStil: () => ({}),
}));
const dom = domTestWurzel();
const original = 'Art.  1\tAbs. 1\n§ 9999';
const bezugstext = 'Art. 1 Abs. 1';
const gemeinsam = () => ({
  kontext: {
    openerLabel: 'main',
    gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }),
    ausgangsstelle: normAusgangsstelle('§ 1'),
    auswahl: {
      textstelle: {
        pfad: normtextPfad({}),
        zeichenbereichStart: 0,
        zeichenbereichEnde: bezugstext.length,
      },
      bezugstext,
    },
  },
  textbezug: true,
  uebertragungOffen: false,
  onWiederholen: vi.fn(),
  onTrotzdemSchliessen: vi.fn(),
  inhaltRef: createRef<HTMLDivElement>(),
  onTextbezugChange: vi.fn(),
  onAbbrechen: vi.fn(),
  onFertig: vi.fn(),
  onEnter: vi.fn(),
});
it.each(['Kommentar', 'Verweis'] as const)(
  '%s schützt Bezugstext und Fehler ohne Eingaben in Bearbeitung, Laden oder Speicherabschluss zu verändern',
  async (art) => {
    const props = gemeinsam();
    const ref = createRef<HTMLTextAreaElement>();
    const change = vi.fn();
    for (const [laeuft, gespeichert] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      await act(async () =>
        dom.root.render(
          art === 'Kommentar' ? (
            <KommentarFormular
              {...props}
              kommentarText={original}
              kommentarTextRef={ref}
              onKommentarTextChange={change}
              fehler="§ 9999 ist nicht auffindbar."
              laeuft={laeuft!}
              gespeichert={gespeichert!}
            />
          ) : (
            <VerweismarkierungFormular
              {...props}
              zitatText={original}
              zitatTextRef={ref}
              onZitatTextChange={change}
              fehler={[
                {
                  art: 'norm',
                  gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }),
                  text: '§ 9999 ist nicht auffindbar.',
                },
              ]}
              laeuft={laeuft!}
              gespeichert={gespeichert!}
              schliessvorgangAktiv={false}
              importFehlgeschlagen={false}
              aktualisierungsHinweis="Art. 1 Abs. 1 aktualisiert."
              onTrotzdemSpeichern={vi.fn()}
              onImportVersuchen={vi.fn()}
            />
          ),
        ),
      );
      expect(ref.current!.value).toBe(original);
      expect(ref.current!.disabled).toBe(laeuft || gespeichert);
      expect(dom.host.querySelector('label')!.textContent).toBe(
        'Bezug auf markierten Text ("Art.\u00a01 Abs.\u00a01")',
      );
      if (!laeuft) expect(dom.host.textContent).toContain('§\u00a09999 ist nicht auffindbar.');
      expect(props.kontext.auswahl.bezugstext).toBe(bezugstext);
    }
  },
);
it('kürzt einen langen Bezugstext vor dem angebrochenen Wort auf höchstens 60 Zeichen', async () => {
  const props = gemeinsam();
  const lang =
    'Der Wohnsitz kann gleichzeitig an mehreren Orten bestehen. Weitere Sätze folgen hier.';
  props.kontext.auswahl.bezugstext = lang;
  await act(async () =>
    dom.root.render(
      <KommentarFormular
        {...props}
        kommentarText=""
        kommentarTextRef={createRef<HTMLTextAreaElement>()}
        onKommentarTextChange={vi.fn()}
        fehler={null}
        laeuft={false}
        gespeichert={false}
      />,
    ),
  );
  expect(dom.host.querySelector('label')?.textContent).toBe(
    'Bezug auf markierten Text ("Der Wohnsitz kann gleichzeitig an mehreren Orten bestehen.…")',
  );
});

it('schützt Fehler auch vor Empfang des Fensterkontexts', async () => {
  await act(async () => dom.root.render(<FensterLadeAnzeige fehler="Art. 1 Abs. 1 fehlt." />));
  expect(dom.host.textContent).toBe('Art.\u00a01 Abs.\u00a01 fehlt.');
  await act(async () => dom.root.render(<FensterLadeAnzeige />));
  expect(dom.host.textContent).toBe('Wird geladen …');
});

it('erklärt den erhaltenen Bezug und sperrt ausschließlich die Bezugsteuerung', async () => {
  const props = gemeinsam();
  const ref = createRef<HTMLTextAreaElement>();
  await act(async () =>
    dom.root.render(
      <KommentarFormular
        {...props}
        ausgangsPruefung={{
          bezugErhalten: true,
          bezugPruefungLaeuft: false,
          bezugPrueffehler: null,
        }}
        kommentarText="Änderbar"
        kommentarTextRef={ref}
        onKommentarTextChange={vi.fn()}
        fehler={null}
        laeuft={false}
        gespeichert={false}
      />,
    ),
  );
  expect(dom.host.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true);
  expect(ref.current!.disabled).toBe(false);
  expect(dom.host.textContent).toContain(
    'Die Ausgangsstelle ist nicht eindeutig zuordenbar. Der gespeicherte Bezug bleibt erhalten.',
  );
});
