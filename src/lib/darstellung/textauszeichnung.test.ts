// Prüft die getrennten Quellen der Textauszeichnung und ihre gemeinsame Überlagerung.
import { getaggterVerweis } from '@/test/gesetz/textauszeichnungFabrik';
import { unterstreichung } from '@/test/markierungen/markierungsFabriken';
import type { GetaggterVerweis } from '@/lib/domain/gesetzTypes';
import type { Textauszeichnung } from './textauszeichnung';
import { expect, it } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';

it('liefert die Position des getaggten Verweises ausschließlich als textstelle', () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>T</kurztitel><langtitel>Test</langtitel></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung><text><satz zahl="1">Vor <verweis norm="§ 2">Ziel</verweis>.</satz></text></norm></inhalt></gesetz>',
  );
  const element = gesetz?.elemente[0];
  const verweis = element?.typ === 'norm' ? element.data.getaggteVerweise?.[0] : undefined;
  expect(verweis).toMatchObject({
    textstelle: {
      pfad: { typ: 'normtext', satz: 1 },
      zeichenbereichStart: 4,
      zeichenbereichEnde: 8,
    },
    zielBezeichnung: '§ 2',
    bezugstext: 'Ziel',
  });
  expect(verweis).not.toHaveProperty('zeichenbereichStart');
  expect(verweis).not.toHaveProperty('satz');
});

it('schließt lose Positionen und Markierungen im Quellenverweisfall aus', () => {
  const verweis = {
    ...getaggterVerweis(),
    // @ts-expect-error – Die Position gehört vollständig zur textstelle.
    zeichenbereichStart: 0,
  } satisfies GetaggterVerweis;
  const auszeichnung = {
    typ: 'getaggterVerweis',
    // @ts-expect-error – Der Quellenverweisfall trägt keine gespeicherte Markierung.
    markierung: unterstreichung(),
  } satisfies Textauszeichnung;
  expect(verweis.textstelle.pfad.typ).toBe('normtext');
  expect(auszeichnung.typ).toBe('getaggterVerweis');
});
