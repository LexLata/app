// Verweiserkennung über die öffentliche Importabschlussfassade; nur native Datei-/Tauri-Grenzen ersetzt.
import { it, expect } from 'vitest';
import { io, xml } from '@/test/suchverzeichnis/suchverzeichnisNativeAttrappe';
import { warteAufSpeicherBatchAbschluss } from '@/lib/persistenz/gesetz/gesetz.index';
it('verwendet beim Verweistagging den abgeglichenen Stand ohne fremde XML und sieht den Abschluss eines Folgeimports', async () => {
  const { gleicheSuchverzeichnisAb } = await import('@/lib/persistenz/gesetz/gesetz.index');
  const { mitGesetzDateiImport } = await import('@/lib/import/import.index');
  const { taggeGesetzesXML } = await import('@/lib/import/importabschluss/importabschluss.index');
  io.dateien.set('gesetze/Probe_de-bund.xml', xml);
  io.dateien.set('gesetze/Fremd_de-bund.xml', xml.replaceAll('Probe', 'Fremd'));
  await gleicheSuchverzeichnisAb();
  io.lesen.mockClear();
  const neu = xml.replaceAll('Probe', 'Neu').replace('Inhalt', 'Siehe § 1 Probe.');
  expect(await taggeGesetzesXML(neu, 'Neu', 'de-bund')).toContain('gesetz="Probe"');
  expect(io.lesen.mock.calls.filter(([pfad]) => pfad.startsWith('gesetze/'))).toEqual([]);
  const vorher = io.invoke.getMockImplementation();
  if (!vorher) throw Error('Native Ausgangsattrappe fehlt');
  io.invoke.mockImplementation(async (name, args) =>
    name === 'gesetz_import_sperre_versuchen_zu_erhalten' ? true : vorher(name, args),
  );
  expect(
    await mitGesetzDateiImport((importiereDatei) => importiereDatei('kanonisch-xml', neu)),
  ).toMatchObject({ art: 'neu' });
  await warteAufSpeicherBatchAbschluss();
  // Die ausdrücklich unveränderte strenge Markierungsprüfung darf beim Speicherabschluss Vollbedarf bearbeiten.
  // Die folgende Verweiserkennung muss anschließend wieder allein mit dem veröffentlichten Verzeichnis auskommen.
  io.lesen.mockClear();
  expect(
    await taggeGesetzesXML(
      xml.replaceAll('Probe', 'Weiter').replace('Inhalt', 'Siehe § 1 Neu.'),
      'Weiter',
      'de-bund',
    ),
  ).toContain('gesetz="Neu"');
  expect(io.lesen.mock.calls.filter(([pfad]) => pfad.startsWith('gesetze/'))).toEqual([]);
});
