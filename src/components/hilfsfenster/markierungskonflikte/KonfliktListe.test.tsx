// @vitest-environment jsdom
// KonfliktListe.test.tsx
// Reale Liste und Anzeigewege: Schutzgruppen, Tooltips und unveränderte Fachdaten.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import '@/test/markierungen/markierungskonfliktListenStilMocks';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { GesetzZeile } from './KonfliktListe';
import { zeilenVonEintrag } from './MarkierungskonfliktFenster.helpers';
import type { AnzeigeKonfliktEintrag } from '@/lib/markierungen/markierungen.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

vi.mock('@/hooks/fenster/useInterneNavigation', () => ({ oeffneInternesZiel: vi.fn() }));

it.each(['§§ 1, 2 ZPO', 'Art. 229 § 3 EGBGB'])(
  'schützt Ausgangsstelle, mehrere Ziele und gemischte Konflikte in der echten Liste: %s',
  (bezeichnungAnzeige) => {
    const gesetz = gesetzesreferenz({ kurztitel: 'ZPO' });
    const eintrag: AnzeigeKonfliktEintrag = {
      schluessel: 'm',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezeichnungAnzeige,
      markierungstyp: 'verweismarkierung',
      bezugstext: 'Art. 1 Abs. III I 2',
      verweistext: 'Art. 1 Abs. III I 2',
      zielKonflikte: [
        {
          gesetz,
          typ: 'zielNormFehlt',
          bezeichnungenAnzeige: [{ bezeichnung: '§ 1' }, { bezeichnung: '§ 2' }],
        },
        {
          gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
          typ: 'zielNormUnpassend',
          bezeichnungenAnzeige: [{ bezeichnung: 'Art. 229 § 3' }],
        },
      ],
    };
    const vorher = structuredClone(eintrag);
    const zeile = zeilenVonEintrag(eintrag).find((z) => z.zielgesetz?.kurztitel === 'ZPO')!;
    expect(zeile.vorschauPunkt).toBe('§§ 1, 2 ZPO: Zielnormen fehlen');
    expect(zeile.erlaeuterung).toBe(
      'Die Zielnormen §§ 1, 2 ZPO, auf die sich der Verweis „Art. 1 Abs. III I 2“ bezieht, fehlen.',
    );
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <GesetzZeile
        gesetz={{ gesetz, eintraege: [eintrag] }}
        aufgeklappt
        ausgewaehlt={{ art: 'zeile', gesetz, eintrag, zeile }}
        onAufgeklapptAendern={vi.fn()}
        onAuswaehlen={vi.fn()}
      />,
    );
    expect(host.textContent).toContain('§§\u00a01, 2 ZPO');
    expect(host.textContent).toContain('Art.\u00a0229 §\u00a03 EGBGB');
    expect(host.textContent).toContain('Art.\u00a01 Abs.\u00a0III I 2');
    const meldung =
      'Die Zielnormen §§\u00a01, 2 ZPO, auf die sich der Verweis „Art.\u00a01 Abs.\u00a0III I 2“ bezieht, fehlen.';
    expect(host.textContent).toContain(meldung);
    expect([...host.querySelectorAll('[title]')].map((el) => el.getAttribute('title'))).toContain(
      meldung,
    );
    const gruppen = [...host.querySelectorAll('[style="white-space:nowrap"]')].map(
      (el) => el.textContent,
    );
    expect(gruppen).toContain('§§\u00a01,');
    expect(gruppen).toContain('Art.\u00a0229');
    expect(gruppen).toContain('§\u00a03');
    expect(gruppen.every((text) => !text?.includes('ZPO') && !text?.includes('EGBGB'))).toBe(true);
    expect(eintrag).toEqual(vorher);
    expect(zeilenVonEintrag(eintrag).find((z) => z.zielgesetz?.kurztitel === 'ZPO')).toEqual(zeile);
  },
);
