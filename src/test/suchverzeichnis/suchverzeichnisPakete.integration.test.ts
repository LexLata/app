// @vitest-environment jsdom
// Angehaltenes Abgleichpaket gegen echte konkurrierende Persistenzwege; nur native Grenzen ersetzt.
import { startaufgabenGrenze } from '@/test/start/startaufgabenNativeGrenze';
import { expect, it, vi } from 'vitest';
const xml = (name: string, text = 'Alt') =>
  `<gesetz><infos><kurztitel>${name}</kurztitel><normgeber>de-bund</normgeber><langtitel>${text}</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Text</absatz></text></norm></inhalt></gesetz>`;
function tor() {
  let fertig = () => {};
  const warten = new Promise<void>((r) => {
    fertig = r;
  });
  return { warten, fertig: () => fertig() };
}
it.each(['speichern', 'löschen'] as const)(
  'lässt beim Paketabschluss zwischenzeitliches %s gewinnen und setzt danach frisch fort',
  async (aktion) => {
    const n = startaufgabenGrenze();
    for (const name of ['A', 'B', 'C']) n.dateien.set(`gesetze/${name}_de-bund.xml`, xml(name));
    const erreicht = tor();
    const weiter = tor();
    n.vorLesen((label, pfad) => {
      if (label === 'main' && pfad === 'gesetze/C_de-bund.xml') {
        erreicht.fertig();
        return weiter.warten;
      }
      return undefined;
    });
    const a = await n.kontext('main');
    const lauf = a.persistenz.gleicheSuchverzeichnisAb();
    await erreicht.warten;
    // A ist veröffentlicht; B bereits gelesen, aber im noch offenen Paket.
    expect((await a.persistenz.leseSuchverzeichnis()).eintraege.map((e) => e.kurztitel)).toEqual([
      'A',
    ]);
    const b = await n.kontext('anderes');
    const ref = { kurztitel: 'B', normgeber: 'de-bund' };
    if (aktion === 'speichern')
      await b.persistenz.speichereGesetz(ref, xml('B', 'Frisch gespeichert'));
    else await b.persistenz.loescheGesetz(ref);
    await b.persistenz.warteAufSpeicherBatchAbschluss();
    weiter.fertig();
    const ergebnis = await lauf;
    // Eine geänderte Datei liest der Lauf gezielt nach; eine entfernte bereinigt
    // der Abschluss. Beide Male bleibt der Stand vollständig.
    expect(ergebnis.abgeglichen).toBe(true);
    const eintrag = ergebnis.eintraege.find((e) => e.kurztitel === 'B');
    if (aktion === 'speichern')
      expect(eintrag).toMatchObject({ status: 'in-ordnung', langtitel: 'Frisch gespeichert' });
    else expect(eintrag).toBeUndefined();
    const erneut = await b.persistenz.gleicheSuchverzeichnisAb();
    expect(erneut.abgeglichen).toBe(true);
    expect(erneut.eintraege.map((e) => e.kurztitel)).toEqual(
      aktion === 'speichern' ? ['A', 'B', 'C'] : ['A', 'C'],
    );
  },
);

it('bewahrt den vollständigen Suchstand über Programmläufe ohne Vorbereitung oder Gesetzeszugriffe', async () => {
  const n = startaufgabenGrenze();
  for (let i = 0; i < 500; i++) n.dateien.set(`gesetze/G${i}_de-bund.xml`, xml(`G${i}`));
  const erster = await n.kontext('erster-lauf');
  await erster.laden.bereiteSuchverzeichnisVor();
  const gespeichert = n.dateien.get('cache/suchverzeichnis.json');
  expect(JSON.parse(gespeichert ?? '').abgeglichen).toBe(true);
  for (const label of ['zweiter-lauf', 'dritter-lauf']) {
    const neu = await n.kontext(label);
    const staende: unknown[] = [];
    const abmelden = neu.laden.beiSuchverzeichnisVorbereitung(() => {
      staende.push(neu.laden.holeSuchverzeichnisFortschritt());
    });
    await neu.laden.bereiteSuchverzeichnisVor();
    abmelden();
    expect(staende).toEqual([]);
    expect(n.dateien.get('cache/suchverzeichnis.json')).toBe(gespeichert);
    expect(
      n.protokoll.filter(
        (e) => e.label === label && e.name === 'lesen' && e.pfad?.startsWith('gesetze/'),
      ),
    ).toHaveLength(0);
    expect(
      n.protokoll.filter(
        (e) =>
          e.label === label &&
          e.name === 'atomar_datei_schreiben' &&
          e.pfad === 'cache/suchverzeichnis.json',
      ),
    ).toHaveLength(0);
    expect(
      n.protokoll.filter((e) => e.label === label && e.name === 'gesetz_dateistempel_lesen'),
    ).toHaveLength(1);
  }
}, 10_000);

it.each(['unterbrochen', 'parallel'] as const)(
  'setzt einen %s laufenden Teilstand ohne erneutes Lesen fertiger Gesetze fort',
  async (zustand) => {
    const n = startaufgabenGrenze();
    for (const name of ['A', 'B', 'C']) n.dateien.set(`gesetze/${name}_de-bund.xml`, xml(name));
    const erreicht = tor();
    const weiter = tor();
    n.vorLesen((label, pfad) => {
      if (label === 'alt' && pfad === 'gesetze/C_de-bund.xml') {
        erreicht.fertig();
        return weiter.warten;
      }
      return undefined;
    });
    const alt = await n.kontext('alt');
    const lauf = alt.laden.bereiteSuchverzeichnisVor();
    await erreicht.warten;
    const teilstand = JSON.parse(n.dateien.get('cache/suchverzeichnis.json') ?? '');
    expect(teilstand.abgeglichen).toBe(false);
    expect(teilstand.eintraege.map((e: { kurztitel: string }) => e.kurztitel)).toEqual(['A']);
    const neu = await n.kontext('neu');
    await neu.laden.bereiteSuchverzeichnisVor();
    expect((await neu.persistenz.leseSuchverzeichnis()).abgeglichen).toBe(true);
    expect(
      n.protokoll
        .filter((e) => e.label === 'neu' && e.name === 'lesen' && e.pfad?.startsWith('gesetze/'))
        .map((e) => e.pfad),
    ).toEqual(['gesetze/B_de-bund.xml', 'gesetze/C_de-bund.xml']);
    if (zustand === 'parallel') {
      weiter.fertig();
      await lauf;
    }
    // Unterbrochen: der alte Webview setzt die offene native Leseantwort nicht fort.
    expect((await neu.persistenz.leseSuchverzeichnis()).eintraege.map((e) => e.kurztitel)).toEqual([
      'A',
      'B',
      'C',
    ]);
  },
  10_000,
);

it('gleicht nach externer Änderung nur das geänderte Gesetz erneut ab', async () => {
  const n = startaufgabenGrenze();
  for (const name of ['A', 'B']) n.dateien.set(`gesetze/${name}_de-bund.xml`, xml(name));
  const alt = await n.kontext('alt');
  await alt.laden.bereiteSuchverzeichnisVor();
  n.dateien.set('gesetze/B_de-bund.xml', xml('B', 'Extern geändert'));
  const neu = await n.kontext('neu');
  await neu.laden.bereiteSuchverzeichnisVor();
  expect(
    n.protokoll
      .filter((e) => e.label === 'neu' && e.name === 'lesen' && e.pfad?.startsWith('gesetze/'))
      .map((e) => e.pfad),
  ).toEqual(['gesetze/B_de-bund.xml']);
  expect(
    (await neu.persistenz.leseSuchverzeichnis()).eintraege.find((e) => e.kurztitel === 'B'),
  ).toMatchObject({ langtitel: 'Extern geändert' });
});

it('ergänzt eine von außen hinzugefügte Gesetzesdatei nach vollständigem Cache und liest beim nächsten Start keine GesetzesXML', async () => {
  const n = startaufgabenGrenze();
  n.dateien.set('gesetze/Alpha_de-bund.xml', xml('Alpha'));
  const alt = await n.kontext('alt');
  await alt.laden.bereiteSuchverzeichnisVor();
  expect(await alt.persistenz.leseSuchverzeichnis()).toMatchObject({
    abgeglichen: true,
    eintraege: [{ kurztitel: 'Alpha', status: 'in-ordnung' }],
  });

  // Externe Änderung an der nativen Grenze, ohne App-Speicherweg oder Cachepflege.
  n.dateien.set('gesetze/Beta_de-bund.xml', xml('Beta'));
  const neu = await n.kontext('neu');
  await neu.laden.bereiteSuchverzeichnisVor();
  const stand = await neu.persistenz.leseSuchverzeichnis();
  expect(stand.abgeglichen).toBe(true);
  expect(stand.eintraege.map((e) => e.kurztitel)).toEqual(['Alpha', 'Beta']);
  expect(
    n.protokoll
      .filter((e) => e.label === 'neu' && e.name === 'lesen' && e.pfad?.startsWith('gesetze/'))
      .map((e) => e.pfad),
  ).toEqual(['gesetze/Beta_de-bund.xml']);
  const { berechneTreffer } = await import('@/lib/domain/app/oeffnen/oeffnen.index');
  for (const kurztitel of ['Alpha', 'Beta'])
    expect(berechneTreffer(`1 ${kurztitel}`, stand.eintraege, null, null)).toMatchObject([
      { art: 'installiert', gesetzesreferenz: { kurztitel }, norm: { xmlId: 'p1' } },
    ]);

  const gespeichert = n.dateien.get('cache/suchverzeichnis.json');
  const danach = await n.kontext('danach');
  await danach.laden.bereiteSuchverzeichnisVor();
  expect(await danach.persistenz.leseSuchverzeichnis()).toEqual(stand);
  expect(n.dateien.get('cache/suchverzeichnis.json')).toBe(gespeichert);
  expect(
    n.protokoll.filter(
      (e) => e.label === 'danach' && e.name === 'lesen' && e.pfad?.startsWith('gesetze/'),
    ),
  ).toHaveLength(0);
});

it('entwertet bei nicht lesbaren Dateistempeln auch einen zuvor vollständigen Stand', async () => {
  const n = startaufgabenGrenze();
  n.dateien.set('gesetze/A_de-bund.xml', xml('A'));
  const alt = await n.kontext('alt');
  await alt.laden.bereiteSuchverzeichnisVor();
  n.vorBefehl((_label, name) => {
    if (name === 'gesetz_dateistempel_lesen') throw new Error('Ordner nicht lesbar');
    return undefined;
  });
  const neu = await n.kontext('neu');
  const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await neu.laden.bereiteSuchverzeichnisVor();
    expect((await neu.persistenz.leseSuchverzeichnis()).abgeglichen).toBe(false);
    expect(
      neu.banner
        .getSnapshot()
        .some((b) =>
          b.gliederung?.kategorien.some((k) =>
            k.gruppen.some(
              (g) =>
                g.schluessel === 'nichtLesbar' && g.namen.some((n) => n.name === 'Gesetzordner'),
            ),
          ),
        ),
    ).toBe(true);
  } finally {
    fehler.mockRestore();
  }
});
