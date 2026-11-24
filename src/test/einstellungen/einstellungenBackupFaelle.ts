// Gemeinsame XML-Fälle für lokale Prüfung, RelaxNG und Wiederherstellungsablehnung.
const ZEIT = '<verarbeitungszeit>2026-10-16T12:00:00Z</verarbeitungszeit>';
const xml = (inhalt = ZEIT, attribute = 'version="1"') =>
  `<einstellungen ${attribute}>${inhalt}</einstellungen>`;
export const BACKUP_SCHEMA_FAELLE: [string, string, boolean][] = [
  ['leer', xml(), true],
  ...['original', 'konsolidiert', 'ungueltig', ''].map((wert): [string, string, boolean] => [
    `EU-Fassung ${wert}`,
    xml(ZEIT + `<euFassung>${wert}</euFassung>`),
    ['original', 'konsolidiert'].includes(wert),
  ]),
  ...['true', 'false', 'ja', ''].map((wert): [string, string, boolean] => [
    `Durchführungsaktsuche ${wert}`,
    xml(ZEIT + `<euDurchfuehrungsaktSuche>${wert}</euDurchfuehrungsaktSuche>`),
    ['true', 'false'].includes(wert),
  ]),
  ['EU-Fassung Attribut', xml(ZEIT + '<euFassung x="1">original</euFassung>'), false],
  [
    'Durchführungsaktsuche Attribut',
    xml(ZEIT + '<euDurchfuehrungsaktSuche x="1">true</euDurchfuehrungsaktSuche>'),
    false,
  ],
  [
    'Erweiterungen',
    xml(
      ZEIT + '<neu a="1">Text<x xmlns="urn:x"><y/></x></neu><neu/>',
      'version="1" xmlns:z="urn:z" z:a="2"',
    ),
    true,
  ],
  ['rohe Werte', xml(ZEIT + '<schriftgroesse foo="bar">beliebig</schriftgroesse>'), true],
  ['Version fehlt', xml(ZEIT, ''), false],
  ['Version falsch', xml(ZEIT, 'version="2"'), false],
  ['Version normalisiert', xml(ZEIT, 'version=" 1 "'), true],
  ['Zeit fehlt', xml(''), false],
  ['Zeit ungültig', xml('<verarbeitungszeit>2026-02-30T12:00:00Z</verarbeitungszeit>'), false],
  ['Zeit doppelt', xml(ZEIT + ZEIT), false],
  ['Einstellung doppelt', xml(ZEIT + '<farbschema/><farbschema/>'), false],
  ['Kindstruktur', xml(ZEIT + '<farbschema><x/></farbschema>'), false],
  ['Wurzelnamensraum', xml(ZEIT, 'version="1" xmlns="urn:x"'), false],
  [
    'Erweiterung mit bekanntem lokalen Namen',
    xml(ZEIT + '<x:farbschema xmlns:x="urn:x"><x:kind/></x:farbschema>'),
    true,
  ],
  [
    'Nachbereitung ungültig',
    xml(ZEIT + '<nachbereitungBeiImport>ja</nachbereitungBeiImport>'),
    false,
  ],
  [
    'Nachbereitung Attribut',
    xml(ZEIT + '<nachbereitungBeiImport x="1">aus</nachbereitungBeiImport>'),
    false,
  ],
  [
    'Nachbereitung normalisiert',
    xml(ZEIT + '<nachbereitungBeiImport> aus </nachbereitungBeiImport>'),
    true,
  ],
  ['Text an Wurzel', xml(ZEIT + 'Text'), false],
  ['defekt', '<einstellungen>', false],
  ...['2024-02-29T24:00:00Z', '-0001-01-01T00:00:00', '12345-12-31T23:59:59.123+14:00'].map(
    (zeit): [string, string, boolean] => [
      zeit,
      xml(`<verarbeitungszeit>${zeit}</verarbeitungszeit>`),
      true,
    ],
  ),
  ...[
    '0000-01-01T00:00:00Z',
    '2026-01-01T00:00:00+14:01',
    '2026-01-01T24:00:01Z',
    '2026-01-01T00:00:60Z',
  ].map((zeit): [string, string, boolean] => [
    zeit,
    xml(`<verarbeitungszeit>${zeit}</verarbeitungszeit>`),
    false,
  ]),
];
