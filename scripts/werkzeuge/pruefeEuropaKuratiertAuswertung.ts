// pruefeEuropaKuratiertAuswertung.ts
// Reine Bestandsdiagnose: dieselben Parser wie die App, ohne Dateien zu verändern.
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  legeKuratierteListeUeber,
  parseKuratierteListe,
} from '@/lib/import/importindex/europaKuratiert';
import {
  parseImportindex,
  validiereImportindex,
} from '@/lib/import/importindex/importindexValidierung';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindexVertrag.types';

export function werteEuropaKuratiertAus(
  liste: string,
  euXml: string,
  bundXml: string,
  bwXml: string,
): string {
  const zeilen: string[] = [];
  let kuratiert: ReturnType<typeof parseKuratierteListe> = [];
  let eu: ImportindexSucheEintrag[] = [];
  try {
    kuratiert = parseKuratierteListe(liste);
    zeilen.push(`Parser: gültig (${kuratiert.length} Einträge)`);
  } catch (fehler) {
    zeilen.push(`Parser: FEHLER ${String(fehler)}`);
  }
  try {
    validiereImportindex(euXml, 'eu');
    eu = parseImportindex(euXml);
    zeilen.push(`EU-Startindex Format: gültig (${eu.length} Einträge)`);
  } catch (fehler) {
    zeilen.push(`EU-Startindex Format: FEHLER ${String(fehler)}`);
  }
  const celex = new Set(eu.map((e) => e.abrufkennung));
  for (const eintrag of kuratiert) {
    if (eintrag.celex.startsWith('3') && !celex.has(eintrag.celex))
      zeilen.push(`${eintrag.celex}: aufgehoben? (${eintrag.kurztitel})`);
  }
  const quellen: [string, ImportindexSucheEintrag[]][] = [['abgeleiteter EU-Name', eu]];
  for (const [quelle, xml] of [
    ['Bund' /* normgeber-anzeige: Anzeigename der Herkunft, keine Gesetzesreferenz. */, bundXml],
    ['BW' /* normgeber-anzeige: Anzeigename der Herkunft, keine Gesetzesreferenz. */, bwXml],
  ] as const) {
    try {
      quellen.push([quelle, parseImportindex(xml)]);
    } catch (fehler) {
      zeilen.push(`${quelle}: FEHLER ${String(fehler)}`);
    }
  }
  for (const [quelle, kandidaten] of quellen) {
    zeilen.push(...findeKollisionen(kuratiert, quelle, kandidaten));
  }
  const indizes = {
    eu: legeKuratierteListeUeber(eu, kuratiert),
    'de-bund':
      quellen.find(
        ([quelle]) =>
          quelle ===
          'Bund' /* normgeber-anzeige: Anzeigename der Herkunft, keine Gesetzesreferenz. */,
      )?.[1] ?? [],
    'de-bw':
      quellen.find(
        ([quelle]) =>
          quelle ===
          'BW' /* normgeber-anzeige: Anzeigename der Herkunft, keine Gesetzesreferenz. */,
      )?.[1] ?? [],
  };
  zeilen.push(...pruefeNamen(kuratiert, indizes));
  return zeilen.join('\n');
}

function pruefeNamen(
  kuratiert: ReturnType<typeof parseKuratierteListe>,
  indizes: {
    eu: ImportindexSucheEintrag[];
    'de-bund': ImportindexSucheEintrag[];
    'de-bw': ImportindexSucheEintrag[];
  },
): string[] {
  const zeilen: string[] = [];
  let namenAnzahl = 0;
  let fehlerAnzahl = 0;
  for (const eintrag of kuratiert) {
    for (const name of [eintrag.kurztitel, ...(eintrag.alternativen ?? [])]) {
      namenAnzahl++;
      const alleTreffer = berechneTreffer(name, [], null, indizes);
      // Unabhängig vom Suchpfad bestimmen, welche vollständigen Namen vor
      // sämtlichen Teiltreffern stehen müssen. Namensgleiche Bund-/BW-Angebote
      // bleiben erlaubt und unterliegen dem bestehenden Normgebervorrang.
      const normalisiert = name.trim().toLowerCase();
      const exakteAngebote = (['de-bund', 'eu', 'de-bw'] as const)
        .flatMap((quelle) =>
          indizes[quelle]
            .filter((kandidat) =>
              [
                kandidat.kurztitel,
                ...(quelle === 'eu'
                  ? [...(kandidat.alternativen ?? []), kandidat.abgeleiteterKurztitel ?? '']
                  : []),
              ].some((n) => n.trim().toLowerCase() === normalisiert),
            )
            .map((kandidat) => ({ quelle, eintrag: kandidat })),
        )
        .sort((a, b) => {
          const normgeberA = a.eintrag.normgeber ?? a.quelle;
          const normgeberB = b.eintrag.normgeber ?? b.quelle;
          return (
            erwarteterNormgeberrang(normalisiert, normgeberA) -
              erwarteterNormgeberrang(normalisiert, normgeberB) ||
            normgeberA.localeCompare(normgeberB, 'de', { sensitivity: 'base' })
          );
        });
      const exakterVorrang = exakteAngebote.every((angebot, i) => {
        const treffer = alleTreffer[i];
        return (
          treffer?.art === 'index' &&
          treffer.quelle === angebot.quelle &&
          treffer.eintrag.abrufkennung === angebot.eintrag.abrufkennung
        );
      });
      const treffer = alleTreffer.filter(
        (t) => t.art === 'index' && t.quelle === 'eu' && t.eintrag.abrufkennung === eintrag.celex,
      );
      const erwartet = name === eintrag.kurztitel ? undefined : name;
      if (!exakterVorrang || treffer.length !== 1 || treffer[0]?.gefundenUeber !== erwartet) {
        fehlerAnzahl++;
        zeilen.push(
          `Suchprüfung FEHLER: ${name} (${eintrag.celex}), Trefferzahl ${treffer.length}, Anzeige ${treffer[0]?.gefundenUeber ?? 'Kurztitel'}, Vorrang exakter Treffer ${exakterVorrang ? 'korrekt' : 'verletzt'}`,
        );
      }
    }
  }
  zeilen.push(`Suchprüfung: ${namenAnzahl} Namen geprüft, ${fehlerAnzahl} Fehler`);
  return zeilen;
}

function findeKollisionen(
  kuratiert: ReturnType<typeof parseKuratierteListe>,
  quelle: string,
  kandidaten: ImportindexSucheEintrag[],
): string[] {
  const normalisiere = (name: string) => name.trim().toLowerCase();
  const nachName = new Map<string, ImportindexSucheEintrag[]>();
  for (const kandidat of kandidaten) {
    const name = normalisiere(kandidat.kurztitel);
    nachName.set(name, [...(nachName.get(name) ?? []), kandidat]);
  }
  const zeilen: string[] = [];
  for (const eintrag of kuratiert) {
    for (const name of [eintrag.kurztitel, ...(eintrag.alternativen ?? [])]) {
      const treffer = (nachName.get(normalisiere(name)) ?? []).filter(
        (kandidat) => quelle !== 'abgeleiteter EU-Name' || kandidat.abrufkennung !== eintrag.celex,
      );
      zeilen.push(
        ...treffer.map(
          (kandidat) =>
            `Kollision ${quelle}: ${name} (${eintrag.celex}) ↔ ${kandidat.kurztitel} (${kandidat.abrufkennung})`,
        ),
      );
    }
  }
  return zeilen;
}

// Unabhängiger Prüfmaßstab: Bund vor EU vor BW; bei EUV hat die EU Vorrang.
function erwarteterNormgeberrang(name: string, normgeber: string): number {
  const reihenfolge = name === 'euv' ? ['eu', 'de-bund', 'de-bw'] : ['de-bund', 'eu', 'de-bw'];
  const rang = reihenfolge.indexOf(normgeber);
  return rang === -1 ? reihenfolge.length : rang;
}
