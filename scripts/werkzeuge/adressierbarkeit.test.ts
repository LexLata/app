// adressierbarkeit.test.ts
// Prüft die Messkategorien am produktiven Parser und aktuellen Auflösungsweg.
import { expect, it } from 'vitest';
import { messeGesetz, messeQuellen, erstelleBericht } from './adressierbarkeit';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const norm = (id: string, bezeichnung: string, attribute = '') =>
  `<norm id="${id}" ${attribute}><bezeichnung>${bezeichnung}</bezeichnung></norm>`;
const gesetz = (inhalt: string) =>
  `<gesetz><infos><kurztitel>Probe</kurztitel><normgeber>de-bund</normgeber></infos><inhalt>${inhalt}</inhalt></gesetz>`;

it('zählt eindeutige Normen, doppelte Bezeichnungen und Überschriften', () => {
  const messung = messeGesetz(
    gesetz(
      norm('a', '§ 1') +
        norm('b', '§ 2') +
        norm('c', '§ 2') +
        '<gliederung gliederungskennzahl="001"><bezeichnung>Teil 1</bezeichnung></gliederung>',
    ),
  );
  expect(messung.summen).toMatchObject({
    normen: 3,
    ueberschriften: 1,
    eindeutig: 2,
    mehrdeutig: 2,
    nichtAuffindbar: 0,
  });
  expect(messung.stellen.filter((s) => s.anzahlTreffer === 2)).toHaveLength(2);
});

it('unterscheidet fehlende Präfixe und Erwägungsgründe und erlaubt eigene Präfixtexte', () => {
  const messung = messeGesetz(
    gesetz(norm('a', '1') + norm('b', 'E2', 'typ="erwaegungsgrund"') + norm('c', 'Regel 3')),
  );
  expect(messung.summen).toMatchObject({
    ohnePraefix: 2,
    erwaegungsgruendeOhnePraefix: 1,
    unbekannterPraefix: 0,
    eindeutig: 3,
    nichtAuffindbar: 0,
  });
});

it('erhält Präfixlisten unter römischen Gliederungsartikeln', () => {
  const messung = messeGesetz(
    gesetz(norm('a', 'Artikel I', 'gliederungskennzahl="001"') + norm('b', '§ 3')),
  );
  expect(messung.summen.praefixlisteVerworfen).toBe(0);
  expect(messung.stellen.find((s) => s.bezeichnung === '§ 3')).toMatchObject({
    anzahlTreffer: 1,
    praefixlisteVerworfen: false,
  });
});

it('zählt mehrdeutige Gliederungskennzahlen', () => {
  const messung = messeGesetz(
    gesetz('<gliederung gliederungskennzahl="001"/><gliederung gliederungskennzahl="001"/>'),
  );
  expect(messung.summen).toMatchObject({
    ueberschriften: 2,
    mehrdeutig: 2,
    gliederungskennzahlMehrdeutig: 2,
  });
});

it.each(['§', 'Art.', 'Artikel', 'Canon', 'Anhang', 'Anlage'])(
  'erkennt den bekannten Präfix %s ohne kopierte Normalisierungsregel',
  (praefix) => {
    expect(messeGesetz(gesetz(norm('a', `${praefix} 1`))).summen).toMatchObject({
      eindeutig: 1,
      unbekannterPraefix: 0,
    });
  },
);

it('misst nur GesetzesXML und berichtet Mengen, Beispiele und fehlende Quellen', async () => {
  const ordner = await mkdtemp(join(tmpdir(), 'lexlata-adressierbarkeit-'));
  try {
    await writeFile(join(ordner, 'gesetz.xml'), gesetz(norm('a', 'Regel 1')));
    await writeFile(join(ordner, 'index.xml'), '<importindex/>');
    const ergebnis = await messeQuellen([
      { name: 'Probe', ordner },
      { name: 'Fehlend', ordner: join(ordner, 'fehlt') },
    ]);
    expect(ergebnis.messungen).toHaveLength(1);
    expect(ergebnis.quellenbericht.join(' ')).toContain('1 Gesetze aus 2 XML-Dateien');
    expect(ergebnis.quellenbericht.join(' ')).toContain('Fehlend: fehlt');
    const bericht = erstelleBericht(ergebnis);
    expect(bericht).toContain('| de-bund | 1 | 1 | 0 |');
    expect(bericht).toContain('Keine nicht eindeutigen oder nicht auffindbaren Stellen');
    expect(bericht).toContain('## Zählung je Gesetz');
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
});

it('zählt eine ganz fehlende Kennung nicht als wegen Länge verworfene Präfixliste', () => {
  expect(messeGesetz(gesetz(norm('leer', ''))).summen).toMatchObject({
    nichtAuffindbar: 1,
    praefixlisteVerworfen: 0,
  });
});
