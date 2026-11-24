// pruefeEuropaKuratiertAuswertung.test.ts
// Diagnoseverhalten mit synthetischen Beständen statt veränderlicher Produktionsdaten.
import { expect, it, vi } from 'vitest';
import * as oeffnen from '@/lib/domain/app/oeffnen/oeffnen.index';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import { werteEuropaKuratiertAus } from './pruefeEuropaKuratiertAuswertung';
const liste = JSON.stringify([
  { celex: '12016E/TXT', kurztitel: 'Vertrag', langtitel: 'Vertrag' },
  { celex: '32024R0001', kurztitel: 'Test', alternativen: ['VO 2016/679'], langtitel: 'Test' },
]);
it('meldet fehlende CELEX und Namenskollisionen, nimmt Verträge aus', () => {
  const bericht = werteEuropaKuratiertAus(
    liste,
    importindexFixture(),
    importindexFixture(
      'de-bund',
      '<gesetz><kurztitel> test </kurztitel><abrufkennung>x</abrufkennung></gesetz>',
    ),
    importindexFixture(
      'de-bw',
      '<gesetz><kurztitel>VERTRAG</kurztitel><abrufkennung>y</abrufkennung></gesetz>',
    ),
  );
  expect(bericht).toContain('32024R0001: aufgehoben?');
  expect(bericht).not.toContain('12016E/TXT: aufgehoben?');
  expect(bericht).toContain('Kollision Bund: Test');
  expect(bericht).toContain('Kollision BW: Vertrag');
  expect(bericht).toContain('Kollision abgeleiteter EU-Name: VO 2016/679');
  expect(bericht).toContain('Parser: gültig');
  expect(bericht).toContain('EU-Startindex Format: gültig');
});
it('meldet Parser- und Formatfehler verständlich', () => {
  const bericht = werteEuropaKuratiertAus(
    '{}',
    '<falsch/>',
    importindexFixture('de-bund'),
    importindexFixture('de-bw'),
  );
  expect(bericht).toContain('Parser: FEHLER');
  expect(bericht).toContain('EU-Startindex Format: FEHLER');
});
it('meldet kollisionsfreie eigene abgeleitete Namen nicht', () => {
  const bericht = werteEuropaKuratiertAus(
    JSON.stringify([
      { celex: '32016R0679', kurztitel: 'Test', alternativen: ['VO 2016/679'], langtitel: 'Test' },
    ]),
    importindexFixture(),
    importindexFixture('de-bund', ''),
    importindexFixture('de-bw', ''),
  );
  expect(bericht).not.toContain('Kollision');
  expect(bericht).not.toContain('aufgehoben?');
});

it('prüft jeden Kurztitel und jede Alternative durch die echte Suche nach Überlagerung', () => {
  const bericht = werteEuropaKuratiertAus(
    liste,
    importindexFixture(),
    importindexFixture('de-bund', ''),
    importindexFixture('de-bw', ''),
  );
  expect(bericht).toContain('Suchprüfung: 3 Namen geprüft, 0 Fehler');
  expect(bericht).not.toContain('Suchprüfung FEHLER');
});

function diagnoseMitTeiltreffer() {
  return werteEuropaKuratiertAus(
    JSON.stringify([{ celex: '32024R0001', kurztitel: 'Test', langtitel: 'Test' }]),
    importindexFixture(
      'eu',
      '<gesetz><kurztitel>VO 2024/2</kurztitel><langtitel>Ein Test im Langtitel</langtitel><abrufkennung>32024R0002</abrufkennung></gesetz>',
    ),
    importindexFixture('de-bund', ''),
    importindexFixture('de-bw', ''),
  );
}

it('erlaubt zusätzliche Teiltreffer hinter dem exakten Rechtsakt', () => {
  expect(diagnoseMitTeiltreffer()).toContain('Suchprüfung: 1 Namen geprüft, 0 Fehler');
});

it('meldet einen erwarteten Rechtsakt hinter einem bloßen Teiltreffer als Fehler', () => {
  const echteSuche = oeffnen.berechneTreffer;
  const suche = vi.spyOn(oeffnen, 'berechneTreffer').mockImplementation((...args) => {
    const treffer = echteSuche(...args);
    // Simuliert eine Regression: Der richtige Kurztitel bleibt auffindbar,
    // steht aber nur noch hinter einem gewöhnlichen Titelteiltreffer.
    return args[0] === 'Test' ? [...treffer.slice(1), ...treffer.slice(0, 1)] : treffer;
  });
  try {
    const bericht = diagnoseMitTeiltreffer();
    expect(bericht).toContain('Suchprüfung FEHLER: Test');
    expect(bericht).toContain('Vorrang exakter Treffer verletzt');
    expect(bericht).toContain('Suchprüfung: 1 Namen geprüft, 1 Fehler');
  } finally {
    suche.mockRestore();
  }
});

it.each(['Test', 'EUV'])(
  'prüft den Normgebervorrang bei namensgleichen Angeboten für %s',
  (name) => {
    const bericht = werteEuropaKuratiertAus(
      JSON.stringify([{ celex: '12016E/TXT', kurztitel: name, langtitel: name }]),
      importindexFixture(
        'eu',
        '<gesetz><kurztitel>Vertrag</kurztitel><abrufkennung>12016E/TXT</abrufkennung></gesetz>',
      ),
      importindexFixture(
        'de-bund',
        `<gesetz><kurztitel>${name}</kurztitel><abrufkennung>bund</abrufkennung></gesetz>`,
      ),
      importindexFixture(
        'de-bw',
        `<gesetz><kurztitel>${name}</kurztitel><abrufkennung>bw</abrufkennung></gesetz>`,
      ),
    );
    expect(bericht).toContain('Suchprüfung: 1 Namen geprüft, 0 Fehler');
  },
);
