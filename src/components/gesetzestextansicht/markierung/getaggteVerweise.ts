// Kennzeichnet abgeleitete Quellenverweise für die gemeinsame Textdarstellung.
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import type { Textauszeichnung } from '@/lib/darstellung/darstellung.index';

export function getaggteVerweiseAlsTextauszeichnungen(
  norm: Pick<NormDarstellung, 'getaggteVerweise'>,
): Textauszeichnung[] {
  return (norm.getaggteVerweise ?? []).map((verweis) => ({ typ: 'getaggterVerweis', verweis }));
}
