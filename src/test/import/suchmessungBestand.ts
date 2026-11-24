// suchmessungBestand.ts
// Deterministischer synthetischer Suchbestand; Größen sind Messannahmen, keine Quellenstatistik.
import type { GesetzDarstellung, DarstellungsElement } from '@/lib/domain/gesetzTypes';
import type { ImportindexSucheEintrag } from '@/lib/domain/importindexSucheEintrag';

export function erzeugeSuchmessungBestand(
  groessen = { gesetze: 300, bund: 7000, bw: 1200, eu: 1500 },
) {
  let zustand = 20261028;
  const zufall = () => {
    zustand = (Math.imul(zustand, 1664525) + 1013904223) >>> 0;
    return zustand / 4294967296;
  };
  const gesetze: GesetzDarstellung[] = Array.from({ length: groessen.gesetze }, (_, i) => {
    const art = i % 20;
    const ohne = art === 0;
    const gliederung = art === 1;
    const artikel = art >= 2 && art <= 4;
    const anzahl = i % 50 === 5 ? 2500 : i % 10 === 6 ? 600 : 10 + Math.floor(zufall() * 141);
    const elemente: DarstellungsElement[] = [];
    for (let n = 1; n <= (ohne ? 1 : anzahl); n++) {
      elemente.push(erzeugeNorm(n, ohne, gliederung, artikel));
    }
    ergaenzeBesondereNormen(elemente, ohne, gliederung, artikel);
    return {
      kurztitel: i === 0 ? 'PKHB 2012' : i === 5 ? 'BGB' : `MessG ${i}`,
      langtitel:
        i % 7 === 0 ? 'Gesetz über Datenschutz' : 'Gesetz über allgemeine Rechtsverhältnisse',
      normgeber: artikel ? 'eu' : 'de-bund',
      hatGliederungsartikel: gliederung,
      elemente,
    };
  });
  const index = (anzahl: number, normgeber: string): ImportindexSucheEintrag[] =>
    Array.from({ length: anzahl }, (_, i) => ({
      kurztitel: normgeber === 'eu' ? `VO 2026/${i + 1}` : `Angebot ${normgeber} ${i}`,
      langtitel:
        i % 7 === 0 ? 'Gesetz über Datenschutz' : 'Gesetz über allgemeine Rechtsverhältnisse',
      abrufkennung:
        normgeber === 'eu' ? `32026R${String(i + 1).padStart(4, '0')}` : `messgesetz-${i}`,
      normgeber,
      praefixstruktur: normgeber === 'eu' ? 'artikel' : 'paragraph',
      ...(normgeber === 'eu'
        ? {
            alternativen: [`Europäischer Datenschutz ${i}`],
            typ: i % 3 === 0 ? 'durchfuehrungsverordnung' : 'verordnung',
          }
        : {}),
    }));
  return {
    gesetze,
    importindex: {
      'de-bund': index(groessen.bund, 'de-bund'),
      'de-bw': index(groessen.bw, 'de-bw'),
      eu: index(groessen.eu, 'eu'),
    },
  };
}

function erzeugeNorm(
  n: number,
  ohne: boolean,
  gliederung: boolean,
  artikel: boolean,
): DarstellungsElement {
  const nummer = n === 7 ? '3 bis 6' : n === 8 ? '20 und 23' : n === 312 ? '312a' : String(n);
  const xmlId = ohne ? 'einzig' : gliederung ? `229-${n}` : String(n);
  return {
    typ: 'norm',
    data: {
      art: 'normal',
      id: xmlId,
      xmlId,
      bezeichnung: ohne ? '' : `${artikel ? 'Art.' : n === 7 || n === 8 ? '§§' : '§'} ${nummer}`,
      titel: 'Rechte und Pflichten',
      absaetze: [
        {
          id: 'absatz',
          saetze: [
            {
              id: 'satz',
              text: 'Der Schutz personenbezogener Daten gilt für alle Beteiligten.',
              eintraege: [],
            },
          ],
        },
      ],
    },
  };
}

function ergaenzeBesondereNormen(
  elemente: DarstellungsElement[],
  ohne: boolean,
  gliederung: boolean,
  artikel: boolean,
) {
  if (gliederung)
    elemente.unshift({
      typ: 'norm',
      data: {
        art: 'gliederungsartikel',
        id: '229',
        xmlId: '229',
        bezeichnung: 'Art. 229',
        gliederungsEbene: 1,
        ueberschriftartig: true,
        absaetze: [],
      },
    });
  if (artikel)
    for (let n = 1; n <= 30; n++)
      elemente.unshift({
        typ: 'norm',
        data: {
          art: 'erwaegungsgrund',
          id: `e${n}`,
          xmlId: `e${n}`,
          bezeichnung: `E${n}`,
          absaetze: [],
        },
      });
  if (!ohne)
    elemente.push({
      typ: 'norm',
      data: {
        art: 'normal',
        id: 'anhang-1',
        xmlId: 'anhang-1',
        bezeichnung: 'Anhang 1',
        absaetze: [],
      },
    });
}
