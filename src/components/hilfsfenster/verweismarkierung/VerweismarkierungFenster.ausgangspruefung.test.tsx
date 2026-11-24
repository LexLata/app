// @vitest-environment jsdom
// Echtes Verweisformular mit Ausgangsstellenprüfung, Gesetz-/Titellader und Hinweisabschluss.
// Ersetzt ausschließlich native Grenzen und unabhängige Fensterdarstellungs-Effekte.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import {
  bereiteMarkierungsFensterDateienVor,
  markierungsFensterBedienung,
  markierungsFensterNativeAttrappe,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import VerweismarkierungFenster from './VerweismarkierungFenster';
import type { VerweismarkierungKontext } from '@/lib/markierungen/markierungen.index';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

vi.mock('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse', async (original) => ({
  ...(await original<typeof import('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse')>()),
  useDynamischeFensterGroesse: vi.fn(),
}));
const m = markierungsFensterNativeAttrappe<VerweismarkierungKontext>();
const dom = domTestWurzel();
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
const { feld, knopf, schreibaufrufe, hinweise } = markierungsFensterBedienung(() => dom.host);
async function starten() {
  await act(async () => dom.root.render(<VerweismarkierungFenster />));
}
async function erwarteText(text: string) {
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(dom.host.textContent).toContain(text);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const attrappe of [m.invoke, m.lesen, m.vormerken, m.abschliessen, m.close, m.hinweise])
    attrappe.mockReset();
  m.dateien.clear();
  m.label = 'verweismarkierung-1';
  m.kontext = {
    gesetz,
    openerLabel: 'fenster-1',
    ausgangsstelle: normAusgangsstelle('§ 1'),

    bearbeiten: {
      zitatText: '§ 1 BGB',
      vorher: {
        elementstand: testElementstand(),
        verweisinhalt: { verweistext: '§ 1 BGB', verweisziele: [] },
      },
    },
  };
  bereiteMarkierungsFensterDateienVor();
});
afterEach(() => vi.useRealTimers());
it.each(['wartefrist', 'ipc'])('zeigt Sperrfehler %s der Ausgangsquelle lokal', async (fehler) => {
  m.dateien.set('gesetze/BGB_de-bund.xml', 'defekt');
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'datei_sperre_erwerben') throw fehler;
    return nativ(befehl, args);
  });
  await starten();
  await erwarteText(
    fehler === 'wartefrist'
      ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
      : 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
  );
  expect(feld().value).toBe('§ 1 BGB');
  expect(m.close).not.toHaveBeenCalled();
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.banner).not.toHaveBeenCalled();
});
it('zeigt optionalen Titellesefehler im Formular ohne die Zuordenbarkeit umzudeuten', async () => {
  m.dateien.set(titelPfad, 'defekt');
  const lesen = m.lesen.getMockImplementation()!;
  m.lesen.mockImplementation(async (pfad) => {
    if (pfad.endsWith('-nichtamtliche-titel.xml')) throw new Error('Lesen');
    return lesen(pfad);
  });
  await starten();
  await erwarteText('Titeldatei');
  expect(dom.host.textContent).not.toContain('nicht zuverlässig gelesen');
  expect(feld().value).toBe('§ 1 BGB');
  expect(hinweise()).toHaveLength(0);
  expect(m.banner).not.toHaveBeenCalled();
});
it('übergibt Sicherung und offenen Quellabschluss vor Schließen ohne Verweisspeicherung', async () => {
  m.dateien.set(titelPfad, 'defekt');
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  let annehmen!: () => void;
  let meldeHinweisuebergabe = () => {};
  const hinweisUebergeben = new Promise<void>((resolve) => {
    meldeHinweisuebergabe = resolve;
  });
  m.hinweise.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        annehmen = resolve;
        meldeHinweisuebergabe();
      }),
  );
  await starten();
  await act(async () => knopf('Abbrechen').click());
  // Schließen wartet auf die echte Quellenprüfung und erst danach auf native Annahme.
  await act(async () => hinweisUebergeben);
  expect(m.close).not.toHaveBeenCalled();
  // Ein Hinweis je Vorgang, der alle Meldungen trägt.
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0]?.hinweis.meldungen).toHaveLength(2);
  expect(
    hinweise()
      .map((h) => h.hinweis.text)
      .join(' '),
  ).toContain('Eine Quelldatei wurde geändert.');
  expect(
    hinweise()
      .map((h) => h.hinweis.text)
      .join(' '),
  ).not.toContain('Verweismarkierung wurde gespeichert');
  expect(schreibaufrufe()).toHaveLength(0);
  await act(async () => annehmen());
  expect(m.close).toHaveBeenCalledOnce();
  expect(m.banner).not.toHaveBeenCalled();
});
it('wartet beim Schließen auch auf eine noch laufende Ausgangsquellenladung', async () => {
  let meldeLesebeginn = () => {};
  const begonnen = new Promise<void>((resolve) => {
    meldeLesebeginn = resolve;
  });
  let lesenFertig!: (text: string) => void;
  const xml = m.dateien.get('gesetze/BGB_de-bund.xml')!;
  m.lesen.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        lesenFertig = resolve;
        meldeLesebeginn();
      }),
  );
  await starten();
  await act(async () => begonnen);
  await act(async () => knopf('Abbrechen').click());
  expect(m.close).not.toHaveBeenCalled();
  await act(async () => lesenFertig(xml));
  expect(m.close).toHaveBeenCalledOnce();
  expect(schreibaufrufe()).toHaveLength(0);
});
it('bündelt gleichzeitige Fokusprüfungen und zeigt den aktuellen Lesefehler', async () => {
  let meldeLesebeginn = () => {};
  const begonnen = new Promise<void>((resolve) => {
    meldeLesebeginn = resolve;
  });
  let ablehnen!: (fehler: Error) => void;
  m.lesen.mockImplementationOnce(
    () =>
      new Promise<string>((_resolve, reject) => {
        ablehnen = reject;
        meldeLesebeginn();
      }),
  );
  await starten();
  await act(async () => begonnen);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(dom.host.textContent).not.toContain('nicht zuverlässig gelesen');
  await act(async () => ablehnen(new Error('Alter Lesefehler')));
  await erwarteText('nicht zuverlässig gelesen');
  expect(m.banner).not.toHaveBeenCalled();
});
it('beendet einen endgültigen Hinweisfehler ohne zweiten lokalen fachlichen Fehler', async () => {
  m.dateien.set(titelPfad, 'defekt');
  m.hinweise.mockRejectedValue(new Error('Fensterstart'));
  await starten();
  await act(async () => knopf('Abbrechen').click());
  await vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(m.close).toHaveBeenCalledOnce();
  expect(dom.host.textContent).not.toContain('Fensterstart');
  expect(dom.host.textContent).not.toContain('konnte nicht gespeichert');
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.banner).not.toHaveBeenCalled();
});
it('begrenzt eine ausbleibende Hinweisannahme vor Schließen auf die bestehende Frist', async () => {
  m.dateien.set(titelPfad, 'defekt');
  let meldeHinweisbeginn = () => {};
  const hinweisBegonnen = new Promise<void>((resolve) => {
    meldeHinweisbeginn = resolve;
  });
  m.hinweise.mockImplementation(() => {
    meldeHinweisbeginn();
    return new Promise(() => {});
  });
  vi.useFakeTimers();
  await starten();
  await act(async () => knopf('Abbrechen').click());
  await hinweisBegonnen;
  expect(m.close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(29_999));
  expect(m.close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(m.close).toHaveBeenCalledOnce();
  expect(hinweise()).toHaveLength(1);
  expect(schreibaufrufe()).toHaveLength(0);
  expect(dom.host.textContent).not.toContain('konnte nicht gespeichert');
  expect(m.banner).not.toHaveBeenCalled();
});
it.each(['lesen', 'sicherung', 'pruefbedarf'])(
  'erhält den Ausgangsquellenfehler %s lokal ohne Speicherung',
  async (fall) => {
    const pfad = 'gesetze/BGB_de-bund.xml';
    m.dateien.set(pfad, 'defekt');
    const lesen = m.lesen.getMockImplementation()!;
    const nativ = m.invoke.getMockImplementation()!;
    if (fall === 'lesen')
      m.lesen.mockImplementation(async (absolut) => {
        if (absolut.endsWith(pfad)) throw new Error('Lesen');
        return lesen(absolut);
      });
    if (fall === 'sicherung')
      m.invoke.mockImplementation(async (befehl, args) => {
        if (befehl === 'archiviere_beschaedigte_datei') throw new Error('Sichern');
        return nativ(befehl, args);
      });
    if (fall === 'pruefbedarf') m.vormerken.mockRejectedValue(new Error('Bedarf'));
    await starten();
    await erwarteText(
      fall === 'lesen'
        ? 'konnte nicht gelesen'
        : fall === 'sicherung'
          ? 'nicht gesichert'
          : 'Prüfbedarf konnte nicht vorgemerkt',
    );
    expect(feld().value).toBe('§ 1 BGB');
    expect(schreibaufrufe()).toHaveLength(0);
    expect(m.close).not.toHaveBeenCalled();
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it('erhält eine gesicherte aber nicht entfernte Ausgangsquelle mit getrenntem Abschlussbefund', async () => {
  const pfad = 'gesetze/BGB_de-bund.xml';
  m.dateien.set(pfad, 'defekt');
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei')
      return { status: 'gesichert_aber_nicht_entfernt', sicherungspfad: 'kopie' };
    return nativ(befehl, args);
  });
  await starten();
  expect(m.dateien.get(pfad)).toBe('defekt');
  await erwarteText('Prüfabschluss konnte nicht bestätigt werden');
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0].hinweis.text).toContain('nicht entfernt');
  expect(hinweise()[0].hinweis.text).not.toContain('gespeichert');
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.banner).not.toHaveBeenCalled();
});
