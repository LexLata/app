// Zahlformen und tatsächliche Änderungszahlen in den Verknüpfungsrückmeldungen.
import { expect, it } from 'vitest';
import {
  entfernungsBeschriftung,
  entfernungsBestaetigung,
  formatiereEinzelVerknuepfung,
  formatiereVerknuepfungsBericht,
  verknuepfungsBeschriftung,
} from './konfliktTexte';

it.each([
  [1, 'Norm', 'Verknüpfung', 'Zielnorm', 'Markierung', 'Elementstand'],
  [2, 'Normen', 'Verknüpfungen', 'Zielnormen', 'Markierungen', 'Elementstände'],
] as const)(
  'verwendet für %s Änderungen durchgehend die passende Zahlform',
  (n, norm, verknuepfung, ziel, markierung, ausgang) => {
    expect(verknuepfungsBeschriftung(n)).toBe(
      `Mit ${n === 1 ? 'aktueller' : 'aktuellen'} ${norm} verknüpfen`,
    );
    expect(entfernungsBeschriftung(n)).toBe(`${verknuepfung} entfernen`);
    const dialog = entfernungsBestaetigung(n);
    expect(dialog.titel).toBe(`${verknuepfung} entfernen`);
    expect(dialog.text).toContain(`${verknuepfung} wirklich entfernen?`);
    const zahlen = { elementstaende: n, verweisziele: n, markierungen: n };
    const ergebnis = { status: 'geaendert' as const, ergebnis: zahlen };
    expect(formatiereEinzelVerknuepfung(ergebnis, 'ziel')).toEqual({
      meldung: `${n} ${ziel} in ${n} ${markierung} neu verknüpft.`,
      fehler: null,
    });
    expect(formatiereEinzelVerknuepfung(ergebnis, 'entfernen')).toEqual({
      meldung: `${verknuepfung} zu ${n} ${ziel} in ${n} ${markierung} entfernt.`,
      fehler: null,
    });
    expect(formatiereEinzelVerknuepfung(ergebnis, 'ausgang').meldung).toBe(
      `${n} ${ausgang} in ${n} ${markierung} neu verknüpft.`,
    );
    expect(
      formatiereVerknuepfungsBericht({ zahlen, gesetze: [], fehler: [], unbearbeiteteGesetze: [] })
        .meldung,
    ).toBe(`${n} ${ausgang} und ${n} ${ziel} in ${n} ${markierung} neu verknüpft.`);
  },
);
it('überspringt unveränderte Ziele und behält Speicher- sowie Nachfehler', () => {
  const zahlen = { elementstaende: 0, verweisziele: 0, markierungen: 0 };
  expect(
    formatiereEinzelVerknuepfung({ status: 'unveraendert', ergebnis: zahlen }, 'ziel').meldung,
  ).toContain('Keine Verknüpfung geändert');
  expect(
    formatiereVerknuepfungsBericht({ zahlen, gesetze: [], fehler: [], unbearbeiteteGesetze: [] })
      .meldung,
  ).toContain('Keine Verknüpfung geändert');
  expect(
    formatiereEinzelVerknuepfung({ status: 'fehlgeschlagen', fehler: new Error() }, 'ziel'),
  ).toMatchObject({ meldung: null, fehler: expect.stringContaining('nicht gespeichert') });
  expect(
    formatiereEinzelVerknuepfung(
      {
        status: 'geaendert',
        ergebnis: { ...zahlen, verweisziele: 1, markierungen: 1 },
        nachgelagerterFehler: new Error(),
      },
      'ziel',
    ),
  ).toMatchObject({
    meldung: '1 Zielnorm in 1 Markierung neu verknüpft.',
    fehler: expect.stringContaining('Bereits gespeicherte Änderungen bleiben erhalten'),
  });
});
