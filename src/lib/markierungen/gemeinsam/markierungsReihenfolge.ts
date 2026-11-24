// Gemeinsame Schreibreihenfolge für MarkierungsXML und MarkierungskonflikteXML.
import { bezeichnungAusgangsstelle, type Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import { vergleicheBezeichnung } from '@/lib/domain/norm/norm.index';
import { vergleicheTextpfad, type Textstelle } from '@/lib/domain/textpfad/textpfad.index';

/** Überschriften zuerst; danach gelten volle Bezeichnung und Textposition. */
export function vergleicheMarkierungsposition(
  a: { ausgangsstelle: Ausgangsstelle; textstelle?: Textstelle },
  b: { ausgangsstelle: Ausgangsstelle; textstelle?: Textstelle },
): number {
  const links = a.ausgangsstelle;
  const rechts = b.ausgangsstelle;
  const gruppe = Number(rechts.typ === 'ueberschrift') - Number(links.typ === 'ueberschrift');
  if (gruppe) return gruppe;
  const kennung =
    links.typ === 'ueberschrift' && rechts.typ === 'ueberschrift'
      ? links.gliederungskennzahl < rechts.gliederungskennzahl
        ? -1
        : links.gliederungskennzahl > rechts.gliederungskennzahl
          ? 1
          : 0
      : vergleicheBezeichnung(bezeichnungAusgangsstelle(links), bezeichnungAusgangsstelle(rechts));
  return (
    kennung ||
    vergleicheTextpfad(
      a.textstelle?.pfad ?? { typ: 'normtext' },
      b.textstelle?.pfad ?? { typ: 'normtext' },
    ) ||
    (a.textstelle?.zeichenbereichStart ?? -1) - (b.textstelle?.zeichenbereichStart ?? -1)
  );
}
