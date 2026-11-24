// europaImportFixtures.ts
// Synthetischer, stabiler EU-Bestand für Import- und Suchverhalten; unabhängig von Ressourcenpflege.
export const kuratierteEuropaFixture = [
  { celex: '12016M/TXT', kurztitel: 'EUV', langtitel: 'Vertrag über die Europäische Union' },
  {
    celex: '12016E/TXT',
    kurztitel: 'AEUV',
    langtitel: 'Vertrag über die Arbeitsweise der Europäischen Union',
  },
  { celex: '12016P/TXT', kurztitel: 'GRCh', alternativen: ['Charta-Test'], langtitel: 'Charta' },
  {
    celex: '32016R0679',
    kurztitel: 'DSGVO',
    alternativen: ['Datenschutz-Test'],
    langtitel: 'Datenschutz',
  },
];
export const emrkFixture =
  '<gesetz><infos><normgeber>europarat</normgeber><kurztitel>EMRK</kurztitel><langtitel>Konvention</langtitel></infos><inhalt/></gesetz>';
export function importindexFixture(
  normgeber = 'eu',
  inhalt = '<gesetz typ="verordnung"><kurztitel>VO 2016/679</kurztitel><langtitel>Datenschutz</langtitel><abrufkennung>32016R0679</abrufkennung></gesetz>',
) {
  return `<importindex version="1"><infos><verarbeitungszeit herkunft="standard">2026-10-01T00:00:00.000Z</verarbeitungszeit><normgeber>${normgeber}</normgeber><datenquelle/></infos><inhalt>${inhalt}</inhalt></importindex>`;
}
export function europaRessourceFixture(pfad: string): string {
  if (pfad.endsWith('europaKuratiert.json')) return JSON.stringify(kuratierteEuropaFixture);
  if (pfad.endsWith('EMRK_europarat.xml')) return emrkFixture;
  if (pfad.endsWith('de-bund.xml'))
    return importindexFixture(
      'de-bund',
      '<gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>bgb</abrufkennung></gesetz>',
    );
  if (pfad.endsWith('de-bw.xml'))
    return importindexFixture(
      'de-bw',
      '<gesetz><kurztitel>PolG</kurztitel><langtitel>Polizeigesetz</langtitel><abrufkennung>polg</abrufkennung></gesetz>',
    );
  if (pfad.endsWith('eu.xml')) return importindexFixture();
  throw new Error(`Unbekannte Testressource: ${pfad}`);
}
