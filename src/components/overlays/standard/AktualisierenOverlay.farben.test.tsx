import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
// Prüft sichtbare Statusfarben über die echte Kandidatenliste des Overlays.
import { act } from 'react';
import { assert, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { KandidatenListe } from './AktualisierenOverlay.inhalt';
const dom = domTestWurzel();
it('unterscheidet keine Neuerungen von Aktualisiert in der Haupttextfarbe', async () => {
  const kandidaten = ['BGB', 'GG'].map((kurztitel) =>
    gesetzDarstellung({ kurztitel, normgeber: 'de-bund' }),
  );
  await act(async () =>
    dom.root.render(
      <KandidatenListe
        kandidaten={alsSuchverzeichniseintraege(kandidaten)}
        zustaende={{
          [gesetzesreferenzSchluessel({ normgeber: 'de-bund', kurztitel: 'BGB' })]: {
            kategorie: 'unveraendert',
          },
          [gesetzesreferenzSchluessel({ normgeber: 'de-bund', kurztitel: 'GG' })]: {
            kategorie: 'aktualisiert',
          },
        }}
        irgendwasLaedt={false}
        wirdErmittelt={false}
        zuletztAktualisiert={null}
        onEinzeln={() => {}}
        onAlle={() => {}}
      />,
    ),
  );
  const texte = [...dom.host.querySelectorAll<HTMLElement>('*')];
  const unveraendert = texte.find(
    (element) => element.textContent === 'Keine Neuerungen' && element.style.color,
  );
  const aktualisiert = texte.find(
    (element) => element.textContent === '✓ Aktualisiert' && element.style.color,
  );
  assert(unveraendert && aktualisiert);
  expect(aktualisiert.style.color).toBe('var(--text-primaer)');
  expect(unveraendert.style.color).not.toBe(aktualisiert.style.color);
});
