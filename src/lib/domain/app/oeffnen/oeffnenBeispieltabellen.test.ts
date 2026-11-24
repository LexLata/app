import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// Vollständige Beispieltabellen des abgestimmten Plans über die öffentliche Suche.
import { expect, it } from 'vitest';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { artikelkontextGesetz } from '@/test/gesetz/artikelkontext';
import { berechneTreffer } from './oeffnen.index';
const gesetz = (kurztitel: string, bezeichnungen: string[]) =>
  gesetzMitNormen(bezeichnungen, {
    kurztitel,
    langtitel: kurztitel,
    kennung: (i) => `${kurztitel}-${i}`,
  });
const lbo = gesetz('LBO', ['Anlage 1', '§ 1', '§ 2', 'Anhang 1']);
const g2 = gesetz('G2', ['§ 7', 'Anlage 1', 'Anhang 1']);
const g3 = gesetz('G3', ['Art. 1', 'Anlage 1']);
const g4 = gesetz('G4', ['§ 9']);
const cic = gesetz('CIC', ['Can. 1']);
const bestand = [lbo, g2, g3, g4, cic];
it.each([
  ['1', lbo, ['LBO: § 1', 'LBO: Anlage 1', 'LBO: Anhang 1']],
  ['1 LBO', g4, ['LBO: § 1', 'LBO: Anlage 1', 'LBO: Anhang 1']],
  ['§ 1', lbo, ['LBO: § 1']],
  ['Art. 1', lbo, ['LBO: § 1']],
  ['1', g4, ['LBO: § 1', 'G2: Anlage 1', 'G3: Art. 1', 'CIC: Can. 1']],
  ['§ 1', g4, ['LBO: § 1']],
  ['Art. 1', g4, ['G3: Art. 1']],
  ['§ 1 CIC', g4, ['CIC: Can. 1']],
  ['1 l', g4, ['LBO: § 1']],
  ['e1', g4, []],
  ['229 3', g4, []],
] as const)('erste Tabelle: %s bei aktivem %s', (eingabe, aktiv, erwartet) => {
  const ergebnis = berechneTreffer(eingabe, alsSuchverzeichniseintraege(bestand), aktiv, null).map(
    (t) =>
      t.art === 'installiert'
        ? `${t.gesetzesreferenz.kurztitel}: ${t.norm?.bezeichnung}`
        : 'Import',
  );
  // Gesetzesranking bleibt unabhängig von der fachlichen Reihenfolge dieser Tabelle.
  expect(ergebnis.sort()).toEqual([...erwartet].sort());
});
it.each([
  ['§ 3', false, null, []],
  ['Art. 3', false, null, ['3']],
  ['3', false, null, ['3']],
  ['§ 3 EG', false, null, ['3']],
  ['229 3', false, null, ['229-3']],
  ['§ 4', true, '246a-3', ['246a-4']],
  ['§ 4', true, 'unterhalb', ['246a-4']],
  ['§ 4', true, 'gleichrangig', ['4']],
  ['§ 4', true, 'hoeherrangig', ['4']],
  ['§ 4', true, '229', ['4']],
  ['4', true, '246a-3', ['4']],
] as const)('zweite Tabelle: %s mit Kontext %s/%s', (eingabe, aktiv, id, erwartet) => {
  const eg = artikelkontextGesetz();
  expect(
    berechneTreffer(
      eingabe,
      alsSuchverzeichniseintraege([eg, g4]),
      aktiv ? eg : g4,
      null,
      false,
      undefined,
      id,
    ).map((t) => (t.art === 'installiert' ? t.norm?.xmlId : 'Import')),
  ).toEqual(erwartet);
});
