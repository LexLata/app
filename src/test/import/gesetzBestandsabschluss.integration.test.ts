// @vitest-environment jsdom
// Der Importprüfvertrag liest gezielt; der strenge Bestandsweg behält seine vollständigen Befunde.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import * as dateisystem from '@tauri-apps/plugin-fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

import { importiereGesetzesreferenz } from '@/lib/import/import.index';
const referenz = { kurztitel: 'A', normgeber: 'de-bund' };
beforeEach(() => nativeAttrappeZuruecksetzen());
it('erhält die vollständigen Befunde im Bestandsweg und beschränkt den Import auf die betroffene Datei', async () => {
  io.dateien.set(
    'gesetze/A_de-bund.xml',
    '<gesetz><infos><kurztitel>A</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>',
  );
  io.dateien.set('gesetze/B_de-bund.xml', '');
  const importstand = (await importiereGesetzesreferenz(referenz)).bestandspruefung;
  expect(importstand).toMatchObject({
    status: 'geladen',
    gesetz: { ...referenz, elemente: [{ data: { xmlId: 'p1', titel: 'Titel' } }] },
    befunde: [],
  });
  expect(io.dateien.get('gesetze/B_de-bund.xml')).toBe('');
  const bestand = await ladeGesetzBestand();
  expect(bestand.liste).toHaveLength(1);
  expect(bestand.befunde).toEqual([{ status: 'leer', dateiBasis: 'B_de-bund' }]);
  expect(bestand.ordnerLesbar).toBe(true);
});

it('erhält einen fehlgeschlagenen Ordnerzugriff im strengen Bestandsweg und wertet ihn beim Import nicht als Abwesenheit', async () => {
  const vorher = io.invoke.getMockImplementation();
  if (!vorher) throw new Error('Native Ausgangsattrappe fehlt');
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') throw Error('Ordner gesperrt');
    return vorher(name, args);
  });
  const einzel = await importiereGesetzesreferenz(referenz);
  expect(einzel).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'laden' },
    bestandspruefung: { status: 'nicht-lesbar', befunde: [{ status: 'ordner_unlesbar' }] },
  });
  const ordner = vi.spyOn(dateisystem, 'readDir').mockRejectedValueOnce(Error('Ordner gesperrt'));
  const bestand = await ladeGesetzBestand();
  ordner.mockRestore();
  expect(bestand).toMatchObject({
    liste: [],
    ordnerLesbar: false,
    befunde: [{ status: 'ordner_unlesbar' }],
  });
});
