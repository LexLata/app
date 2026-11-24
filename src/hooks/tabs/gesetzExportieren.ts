// Exportiert ein Gesetz über seine Referenz am nativen Datei-Dialog.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import { dateiBasis } from '@/lib/persistenz/kern/kern.index';

export async function exportiereGesetz(gesetz: Gesetzesreferenz) {
  const { ladeGesetzesXML } = await import('@/lib/persistenz/gesetz/gesetz.index');
  const xml = await ladeGesetzesXML(referenzVon(gesetz));
  if (!xml) return;
  const dateiname = dateiBasis(gesetz);
  try {
    const { waehleExportZiel } = await import('@/lib/import-export/import-export.index');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const pfad = await waehleExportZiel(`${dateiname}.xml`, {
      name: 'XML',
      extensions: ['xml'],
    });
    if (pfad) await writeTextFile(pfad, xml);
  } catch (fehler) {
    console.error('Datei konnte nicht exportiert werden:', fehler);
    const { zeigeBanner } = await import('@/lib/banner/banner.index');
    zeigeBanner({
      art: 'systemfehler',
      text: 'Die Datei konnte nicht exportiert werden.',
      typ: 'fehler',
    });
  }
}
