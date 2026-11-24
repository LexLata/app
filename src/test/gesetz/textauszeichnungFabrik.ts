// Fabriken für vollständige Textauszeichnungen mit gezielt gesetzten Zeichenbereichen.
import type { GetaggterVerweis } from '@/lib/domain/gesetzTypes';
import type { Textauszeichnung } from '@/lib/darstellung/darstellung.index';
import type { MarkierungsTyp, VerweisInhalt } from '@/lib/markierungen/markierungen.index';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

export function getaggterVerweis(angaben: Partial<GetaggterVerweis> = {}): GetaggterVerweis {
  return {
    textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 0, zeichenbereichEnde: 5 },
    bezugstext: '',
    zielBezeichnung: '§ 1',
    ...angaben,
  };
}

export interface AuszeichnungsAngaben {
  typ: MarkierungsTyp | 'getaggterVerweis';
  zeichenbereichStart: number;
  zeichenbereichEnde: number;
  verweisinhalt?: VerweisInhalt;
  kommentarText?: string;
  verweis?: GetaggterVerweis;
}

export function textauszeichnung(angaben: AuszeichnungsAngaben): Textauszeichnung {
  const textstelle = {
    pfad: { typ: 'normtext' as const },
    zeichenbereichStart: angaben.zeichenbereichStart,
    zeichenbereichEnde: angaben.zeichenbereichEnde,
  };
  if (angaben.typ === 'getaggterVerweis') {
    return {
      typ: 'getaggterVerweis',
      verweis: angaben.verweis ?? getaggterVerweis({ textstelle }),
    };
  }
  return {
    typ: 'markierung',
    markierung: markierungsEintrag({
      typ: angaben.typ,
      textstelle,
      verweisinhalt: angaben.verweisinhalt,
      kommentarText: angaben.kommentarText,
    }),
  };
}
