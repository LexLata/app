// Ladebefunde eines Gesetzes erreichen Vorgangsempfänger mit Grund, Datei und
// Detail – nach derselben Zuordnung wie die Sammelmeldungen der Gesetzliste.
import { expect, it, vi } from 'vitest';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import { gesetzBefundAlsMeldung, meldeGesetzBefundeAnEmpfaenger } from './gesetzSpeicher.befunde';

it.each([
  [
    { status: 'unlesbar', dateiBasis: 'ABC', fehler: 'Zugriff verweigert' },
    { grund: 'nichtLesbar', betroffen: 'ABC.xml', detail: 'Zugriff verweigert' },
  ],
  [
    { status: 'fehlt', dateiBasis: 'GHI' },
    { grund: 'dateiFehlt', betroffen: 'GHI.xml' },
  ],
  [
    { status: 'leer', dateiBasis: 'JKL' },
    { grund: 'dateiLeer', betroffen: 'JKL.xml' },
  ],
  [
    { status: 'ordner_unlesbar', fehler: 'Ordner fehlt' },
    { grund: 'nichtLesbar', betroffen: 'Gesetzordner', detail: 'Ordner fehlt' },
  ],
] as const)('meldet %o gegliedert wie die Sammelmeldung', (befund, erwartet) => {
  const meldungen: AktionsMeldung[] = [];
  meldeGesetzBefundeAnEmpfaenger([befund], (meldung) => meldungen.push(meldung));
  expect(meldungen).toEqual([
    expect.objectContaining({ ...erwartet, art: 'fehler', aenderungsstand: 'keine' }),
  ]);
  expect(gesetzBefundAlsMeldung(befund)).toMatchObject(erwartet);
  expect(meldungen[0]?.text).toBe(gesetzBefundAlsMeldung(befund).text);
});

it('meldet bereits am Sicherungsort gemeldete Befunde nicht erneut', () => {
  const empfangen = vi.fn();
  meldeGesetzBefundeAnEmpfaenger(
    [
      { status: 'archiviert', dateiBasis: 'A', sicherungspfad: 'gesetze/A.sicherung' },
      { status: 'gesichert_aber_nicht_entfernt', dateiBasis: 'B', sicherungspfad: 'gesetze/B.s' },
      { status: 'sicherung_fehlgeschlagen', dateiBasis: 'C', fehler: 'Voll' },
    ],
    empfangen,
  );
  expect(empfangen).not.toHaveBeenCalled();
});
