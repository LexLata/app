// Späte Meldungen nach Ende eines Vorgangs: Dateibefunde ins Dateibefund-Banner,
// die übrigen nach Ende aller Folgeläufe zusammen in genau ein Vorgangsergebnis.
import { beforeEach, describe, expect, it } from 'vitest';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import {
  alleBannerSchliessen,
  erzeugeBannerMeldungsSammlung,
  erzeugeSpaeteMeldungen,
  getSnapshot,
} from './banner.index';

function meldung(text: string, weiteres: Partial<AktionsMeldung> = {}): AktionsMeldung {
  return {
    text,
    typ: 'warnung',
    art: 'hinweis',
    anlass: 'pruefbedarf',
    aenderungsstand: 'vollstaendig',
    ...weiteres,
  };
}

const dateibefund = (datei: string) =>
  meldung(`${datei} konnte nicht gelesen werden.`, { grund: 'nichtLesbar', betroffen: datei });

function offenerLauf() {
  let beenden!: () => void;
  const lauf = new Promise<void>((resolve) => (beenden = resolve));
  return { lauf, beenden };
}

const arten = () => getSnapshot().map((b) => b.art);
const warteAufMikroaufgaben = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => alleBannerSchliessen());

describe('erzeugeBannerMeldungsSammlung', () => {
  it('liefert die Meldungen bis zum Abschluss zurück, ohne selbst ein Banner zu zeigen', () => {
    const sammlung = erzeugeBannerMeldungsSammlung();
    const vorher = meldung('Vorher.');
    sammlung.meldungEmpfangen(vorher);
    expect(sammlung.abschliessen()).toEqual([vorher]);
    expect(sammlung.abschliessen()).toEqual([vorher]);
    expect(getSnapshot()).toEqual([]);
  });

  it('zeigt mehrere späte Meldungen erst nach Ende der Folgeläufe in genau einem Banner', async () => {
    const sammlung = erzeugeBannerMeldungsSammlung();
    const { lauf, beenden } = offenerLauf();
    sammlung.meldungEmpfangen.folgelaufErfassen?.(lauf);
    sammlung.abschliessen();
    sammlung.meldungEmpfangen(meldung('Erste späte Meldung.'));
    sammlung.meldungEmpfangen(meldung('Zweite späte Meldung.'));
    await warteAufMikroaufgaben();
    expect(getSnapshot()).toEqual([]);
    beenden();
    await warteAufMikroaufgaben();
    expect(arten()).toEqual(['vorgangsergebnis']);
    expect(getSnapshot()[0]?.text).toContain('Erste späte Meldung.');
    expect(getSnapshot()[0]?.text).toContain('Zweite späte Meldung.');
  });

  it('gibt späte Dateibefunde an das Dateibefund-Banner statt an das Vorgangsergebnis', async () => {
    const sammlung = erzeugeBannerMeldungsSammlung();
    const { lauf, beenden } = offenerLauf();
    sammlung.meldungEmpfangen.folgelaufErfassen?.(lauf);
    sammlung.abschliessen();
    sammlung.meldungEmpfangen(dateibefund('a.xml'));
    sammlung.meldungEmpfangen(dateibefund('b.xml'));
    sammlung.meldungEmpfangen(meldung('Sonstiges.'));
    beenden();
    await warteAufMikroaufgaben();
    expect([...arten()].sort()).toEqual(['dateibefunde', 'vorgangsergebnis']);
    const [befunde] = getSnapshot().filter((b) => b.art === 'dateibefunde');
    const namen = befunde?.gliederung?.kategorien.flatMap((k) =>
      k.gruppen.flatMap((g) => g.namen.map((n) => n.name)),
    );
    expect(namen).toEqual(['a.xml', 'b.xml']);
    expect(getSnapshot().find((b) => b.art === 'vorgangsergebnis')?.text).not.toContain('a.xml');
  });

  it('zeigt ohne späte Meldungen kein Banner', async () => {
    const sammlung = erzeugeBannerMeldungsSammlung();
    const { lauf, beenden } = offenerLauf();
    sammlung.meldungEmpfangen(meldung('Vorher.'));
    sammlung.meldungEmpfangen.folgelaufErfassen?.(lauf);
    sammlung.abschliessen();
    beenden();
    await warteAufMikroaufgaben();
    expect(getSnapshot()).toEqual([]);
  });
});

describe('erzeugeSpaeteMeldungen', () => {
  it('fasst nach dem Schließen späte Meldungen aus Quelle und ohne Quelle nach aller Nacharbeit zusammen', async () => {
    const spaete = erzeugeSpaeteMeldungen();
    const gesehen = meldung('Im Bericht gesehen.');
    const quelle = { meldungen: [gesehen] };
    const { lauf, beenden } = offenerLauf();
    spaete.melde(meldung('Vor dem Schließen.'));
    spaete.verfolge(lauf);
    spaete.schliesse([quelle]);
    quelle.meldungen.push(meldung('Spät am Eintrag.'));
    spaete.melde(meldung('Spät ohne Eintrag.'));
    await warteAufMikroaufgaben();
    expect(getSnapshot()).toEqual([]);
    beenden();
    await warteAufMikroaufgaben();
    expect(arten()).toEqual(['vorgangsergebnis']);
    const text = getSnapshot()[0]?.text ?? '';
    expect(text).toContain('Spät am Eintrag.');
    expect(text).toContain('Spät ohne Eintrag.');
    expect(text).not.toContain('Im Bericht gesehen.');
    expect(text).not.toContain('Vor dem Schließen.');
  });
});
