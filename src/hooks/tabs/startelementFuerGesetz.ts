// Bestimmt die stabile XML-ID der beim erstmaligen Zeigen aktiven Stelle.
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { ladeAktivierungXmlId } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';

export function startelementFuerGesetz(
  gesetz: GesetzDarstellung,
  ziel?: string,
): string | undefined {
  if (ziel) return ziel;
  const gespeichert = ladeAktivierungXmlId(gesetz);
  return (
    gesetz.elemente.find((element) => element.data.xmlId === gespeichert)?.data.xmlId ??
    gesetz.elemente[0]?.data.xmlId
  );
}
