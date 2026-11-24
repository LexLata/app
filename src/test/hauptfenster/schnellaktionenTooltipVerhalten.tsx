// Tooltiptexte folgen dem Speicherzustand in beiden Leistenanordnungen und Plattformen.
import { schreibeSpeicherbareNorm } from '@/lib/domain/aktives-element/aktives-element.index';
import { act } from 'react';
import { expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import {
  Schnellaktionen,
  FavoritSchnellaktion,
} from '@/components/seitenleisten/seitenleisten.index';
const dom = domTestWurzel();
const nichts = () => {};
export function pruefeSchnellaktionenTooltips(istMac: boolean) {
  const kuerzel = istMac
    ? { oeffnen: '⌘O', favorit: '⇧⌘D', lesezeichen: '⌘D' }
    : { oeffnen: 'Strg+O', favorit: 'Strg+Umschalt+D', lesezeichen: 'Strg+D' };
  it('benennt Speichern und Entfernen mit Norm in jeder Anordnung', async () => {
    for (const leistenTauschen of [false, true]) {
      for (const gespeichert of [false, true]) {
        const gesetz = { normgeber: 'DE', kurztitel: 'BGB' };
        await act(async () =>
          schreibeSpeicherbareNorm({ gesetz, bezeichnung: '§ 4', istFavorit: gespeichert }),
        );
        await act(async () =>
          dom.root.render(
            <>
              <Schnellaktionen
                gesetzOffen
                leistenTauschen={leistenTauschen}
                favoritenleisteSichtbar
                onFavoritKlick={nichts}
                lesezeichen={gespeichert ? [{ gesetz, bezeichnung: '§ 4' }] : []}
                onLesezeichenKlick={nichts}
                kannZuklappen
                onZuklappenKlick={nichts}
                kannAufklappen
                onAufklappenKlick={nichts}
                onSucheKlick={nichts}
              />
              {!leistenTauschen && <FavoritSchnellaktion onFavoritKlick={nichts} />}
            </>,
          ),
        );

        const titel = Array.from(dom.host.querySelectorAll('button'), (b) =>
          b.title.replaceAll('\u202f', '').replaceAll('\u00a0', ' '),
        );
        expect(titel).toContain(`Gesetz oder Norm öffnen (${kuerzel.oeffnen})`);
        expect(titel).toContain(
          `§ 4 ${gespeichert ? 'aus Favoriten entfernen' : 'als Favorit speichern'} (${kuerzel.favorit})`,
        );
        expect(titel).toContain(
          `§ 4 ${gespeichert ? 'aus Lesezeichen entfernen' : 'als Lesezeichen speichern'} (${kuerzel.lesezeichen})`,
        );
      }
    }
  });
}
