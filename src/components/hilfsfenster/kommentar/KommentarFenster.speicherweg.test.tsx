// @vitest-environment jsdom
// Echtes Kommentarformular, Ausgangslader, Markierungsspeicher und Historienabschluss.
// Ersetzt ausschließlich native Grenzen und unabhängige Fensterdarstellungs-Effekte.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import {
  bereiteMarkierungsFensterDateienVor,
  halteFensterHinweisAn,
  markierungsFensterBedienung,
  markierungsFensterNativeAttrappe,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { act } from 'react';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sicherungenImDatenordnerSatz } from '@/lib/domain/app/meldungsgruppen';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import KommentarFenster from './KommentarFenster';
import type { KommentarKontext } from '@/lib/markierungen/markierungen.index';
import {
  hinzufuegenMarkierung,
  ladeMarkierungen,
  speichereKommentar,
} from '@/lib/markierungen/markierungen.index';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

vi.mock('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse', async (original) => ({
  ...(await original<typeof import('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse')>()),
  useDynamischeFensterGroesse: vi.fn(),
}));
const m = markierungsFensterNativeAttrappe<KommentarKontext>();
const dom = domTestWurzel();
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const markierungsPfad = 'markierungen/BGB_de-bund-markierungen.xml';
const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
const pruefHinweis =
  'Der Kommentar wurde gespeichert. Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.';
const { feld, knopf, schreibaufrufe, hinweise, warteAufAbschluss, warteAufAnzeige } =
  markierungsFensterBedienung(() => dom.host);
async function eingeben(text = 'Mein Kommentar') {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      feld(),
      text,
    );
    feld().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function starten() {
  await act(async () => dom.root.render(<KommentarFenster />));
  await eingeben();
}
async function speichern(abschlussAbwarten = true) {
  await act(async () => knopf('Fertig').click());
  if (abschlussAbwarten) await warteAufAbschluss();
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const attrappe of [m.invoke, m.lesen, m.vormerken, m.abschliessen, m.close, m.hinweise])
    attrappe.mockReset();
  m.dateien.clear();
  m.empfang.clear();
  m.historie.clear();
  m.bestaetigen = true;
  m.label = 'kommentar-1';
  m.kontext = {
    gesetz,
    openerLabel: 'fenster-1',
    ausgangsstelle: normAusgangsstelle('§ 1'),
  };
  bereiteMarkierungsFensterDateienVor();
});
afterEach(() => vi.useRealTimers());
it.each(['wartefrist', 'ipc'])(
  'zeigt Sperrfehler %s im echten Formular und erhält Eingaben',
  async (fehler) => {
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'datei_sperre_erwerben') throw fehler;
      return nativ(befehl, args);
    });
    await starten();
    await speichern();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain(
        fehler === 'wartefrist'
          ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
          : 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
      );
    });
    expect(feld().value).toBe('Mein Kommentar');
    expect(feld().disabled).toBe(false);
    expect(m.close).not.toHaveBeenCalled();
    expect(schreibaufrufe()).toHaveLength(0);
    expect(m.historie.size).toBe(0);
    expect(m.banner).not.toHaveBeenCalled();
    expect(m.bannerHost).not.toHaveBeenCalled();
  },
);
it.each(['lesen', 'sicherung', 'pruefbedarf'])(
  'zeigt %s ohne Schreiben oder Historienübernahme lokal',
  async (fall) => {
    m.dateien.set(markierungsPfad, 'defekt');
    const nativ = m.invoke.getMockImplementation()!;
    const lesen = m.lesen.getMockImplementation()!;
    if (fall === 'lesen')
      m.lesen.mockImplementation(async (pfad) => {
        if (pfad.endsWith('-markierungen.xml')) throw new Error('Lesen');
        return lesen(pfad);
      });
    if (fall === 'sicherung')
      m.invoke.mockImplementation(async (befehl, args) => {
        if (befehl === 'archiviere_beschaedigte_datei') throw new Error('Sichern');
        return nativ(befehl, args);
      });
    if (fall === 'pruefbedarf') m.vormerken.mockRejectedValue(new Error('Bedarf'));
    await starten();
    await speichern();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain(
        fall === 'lesen'
          ? 'konnte nicht gelesen'
          : fall === 'sicherung'
            ? 'nicht bereinigt'
            : 'Prüfbedarf konnte nicht vorgemerkt',
      );
    });
    expect(feld().value).toBe('Mein Kommentar');
    expect(feld().disabled).toBe(false);
    expect(schreibaufrufe()).toHaveLength(0);
    expect(m.historie.size).toBe(0);
    expect(m.close).not.toHaveBeenCalled();
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it('erhält gespeicherten Kommentar und Historienaktion beim offenen Prüfabschluss', async () => {
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await starten();
  await speichern();
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect((await ladeMarkierungen(gesetz))[0]!.kommentarText).toBe('Mein Kommentar');
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0]).toMatchObject({ oeffner: 'fenster-1', hinweis: { text: pruefHinweis } });
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(1);
  expect(m.close).toHaveBeenCalledOnce();
  expect(m.banner).not.toHaveBeenCalled();
});
it('nimmt Sicherungshinweis vor Schließen an und verhindert weiteres Speichern während der Übergabe', async () => {
  m.dateien.set(markierungsPfad, 'defekt');
  const { begonnen, annehmen } = halteFensterHinweisAn();
  await starten();
  await speichern(false);
  await act(async () => begonnen);
  await warteAufAnzeige(() => expect(knopf('Schließen')).toBeDefined());
  expect(m.close).not.toHaveBeenCalled();
  expect(feld().disabled).toBe(true);
  expect(m.historie.size).toBe(1);
  await act(async () => knopf('Schließen').click());
  expect(schreibaufrufe()).toHaveLength(1);
  await act(async () => annehmen());
  await warteAufAnzeige(() => expect(m.close).toHaveBeenCalledOnce());
  expect(m.close).toHaveBeenCalledOnce();
  expect(hinweise()).toHaveLength(1);
  expect(m.banner).not.toHaveBeenCalled();
});
it.each(['archiviert', 'gesichert_aber_nicht_entfernt'])(
  'meldet Sicherung %s und anschließend fehlgeschlagene Speicherung als getrennte Tatsachen',
  async (status) => {
    m.dateien.set(markierungsPfad, 'defekt');
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        m.dateien.set('kopie', m.dateien.get(markierungsPfad) ?? '');
        if (status === 'archiviert') m.dateien.delete(markierungsPfad);
        return { status, sicherungspfad: 'kopie' };
      }
      if (befehl === 'atomar_datei_schreiben') throw new Error('Schreiben');
      return nativ(befehl, args);
    });
    await starten();
    await speichern();
    await warteAufAnzeige(() => {
      expect(dom.host.textContent).toContain('Der Kommentar konnte nicht gespeichert werden.');
    });
    expect(feld().value).toBe('Mein Kommentar');
    expect(feld().disabled).toBe(false);
    expect(m.close).not.toHaveBeenCalled();
    expect(m.historie.size).toBe(0);
    if (status === 'archiviert') {
      expect(hinweise()).toHaveLength(1);
      expect(hinweise()[0].hinweis.meldungen).toEqual([
        expect.objectContaining({ grund: 'imDatenordnerGesichert', sicherung: expect.any(String) }),
      ]);
      expect(hinweise()[0].hinweis.text).not.toContain('Kommentar wurde gespeichert');
    } else {
      expect(hinweise()).toHaveLength(0);
      expect(dom.host.textContent).toContain('konnte nicht bereinigt werden');
      expect(dom.host.textContent).toContain(sicherungenImDatenordnerSatz(1));
      expect(dom.host.textContent).not.toContain('kopie');
    }
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it.each(['titel', 'fremdes-gesetz'])(
  'berücksichtigt beim Kommentar nur die benötigte Quelle %s',
  async (quelle) => {
    const pfad = quelle === 'titel' ? titelPfad : 'gesetze/Fremd_de-bund.xml';
    m.dateien.set(pfad, 'defekt');
    const lesen = m.lesen.getMockImplementation()!;
    m.lesen.mockImplementation(async (absolut) => {
      if (absolut.endsWith(pfad)) throw new Error('Lesen');
      return lesen(absolut);
    });
    await starten();
    await speichern();
    await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
    expect(hinweise()).toHaveLength(quelle === 'titel' ? 1 : 0);
    if (quelle === 'titel') {
      expect(hinweise()[0].hinweis.text).toContain('Der Kommentar wurde gespeichert.');
      expect(hinweise()[0].hinweis.text).toContain('konnte nicht gelesen');
    } else
      expect(m.lesen.mock.calls.some(([pfad]) => pfad.endsWith('Fremd_de-bund.xml'))).toBe(false);
    expect(schreibaufrufe()).toHaveLength(1);
    expect(m.historie.size).toBe(1);
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it('ein Archivierungsabschluss der Ausgangsquelle behauptet keinen gespeicherten Kommentar', async () => {
  m.dateien.set('gesetze/BGB_de-bund.xml', 'defekt');
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await starten();
  await speichern();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(feld().disabled).toBe(false);
  });
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie.size).toBe(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(feld().disabled).toBe(false);
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Der Kommentar konnte nicht gespeichert werden.');
  });
  // Ein Hinweis je Vorgang, der alle Meldungen trägt.
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0]?.hinweis.meldungen).toHaveLength(2);
  expect(
    hinweise()
      .map((h) => h.hinweis.text)
      .join(' '),
  ).not.toContain('Kommentar wurde gespeichert');
  expect(m.banner).not.toHaveBeenCalled();
});
it('eine endgültige Hinweisfrist ändert Speichererfolg und Historie nicht und erlaubt keinen zweiten Schreibversuch', async () => {
  await starten();
  vi.useFakeTimers();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  const { begonnen } = halteFensterHinweisAn();
  m.close.mockRejectedValueOnce(new Error('Schließen'));
  await speichern(false);
  await act(async () => begonnen);
  await warteAufAnzeige(() => expect(knopf('Schließen')).toBeDefined());
  expect(m.close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(1);
  expect(hinweise()).toHaveLength(1);
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Das Fenster konnte nicht geschlossen werden.');
  });
  await warteAufAnzeige(() => expect(knopf('Schließen')).toBeDefined());
  await act(async () => knopf('Schließen').click());
  expect(schreibaufrufe()).toHaveLength(1);
  expect(hinweise()).toHaveLength(1);
  expect(m.close).toHaveBeenCalledTimes(2);
  expect(m.banner).not.toHaveBeenCalled();
});
it('wiederholt bei offenem Historienabschluss ausschließlich die Übertragung, ohne erneute Hinweise', async () => {
  await starten();
  vi.useFakeTimers();
  m.bestaetigen = false;
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await speichern(false);
  await vi.waitFor(() => expect(m.historie.size).toBe(1));
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Die Änderung wurde gespeichert. Die Übernahme für Rückgängig konnte nicht bestätigt werden.',
    );
  });
  expect(m.close).not.toHaveBeenCalled();
  expect(hinweise()).toHaveLength(1);
  expect(schreibaufrufe()).toHaveLength(1);
  m.bestaetigen = true;
  await act(async () => knopf('Erneut versuchen').click());
  await warteAufAbschluss();
  expect(m.close).toHaveBeenCalledOnce();
  expect(schreibaufrufe()).toHaveLength(1);
  expect(hinweise()).toHaveLength(1);
  expect(m.historie.size).toBe(1);
});
it('zeigt Überlappungsablehnung ohne Schreiben oder Übertragung lokal', async () => {
  const textstelle = { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 };
  await hinzufuegenMarkierung(
    gesetz,
    markierungsEintrag({
      bezug: { typ: 'bezugstext' as const, textstelle: textstelle, bezugstext: 'Text' },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),

      kommentarText: 'Alt',
    }),
  );
  m.kontext = { ...m.kontext!, auswahl: { textstelle, bezugstext: 'Text' } };
  m.invoke.mockClear();
  await starten();
  await speichern();
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain(
      'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
    );
  });
  expect(feld().value).toBe('Mein Kommentar');
  expect(feld().disabled).toBe(false);
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie.size).toBe(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});

it('unterscheidet unverändertes Bearbeiten mit offenem Prüfabschluss von neuer Speicherung', async () => {
  await speichereKommentar(m.kontext!, markierungsEinzelzugriffFuerTest, 'Mein Kommentar', false);
  const elementstand = (await ladeMarkierungen(gesetz))[0]!.bezug.elementstand;
  m.kontext = {
    ...m.kontext!,
    bearbeiten: {
      kommentarText: 'Mein Kommentar',
      vorher: { kommentarText: 'Mein Kommentar', elementstand },
    },
  };
  m.invoke.mockClear();
  m.historie.clear();
  await starten();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await speichern();
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie.size).toBe(0);
  expect(m.close).toHaveBeenCalledOnce();
  expect(hinweise()).toHaveLength(1);
  expect(hinweise()[0].hinweis.text).toBe(
    'Der Kommentar ist unverändert. Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.',
  );
  expect(m.banner).not.toHaveBeenCalled();
});
it('behält die Überarbeitung und ihre Historienaktion bei Hinweisfehlern', async () => {
  await hinzufuegenMarkierung(
    gesetz,
    markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),

      kommentarText: 'Vorher',
    }),
  );
  m.kontext = {
    ...m.kontext!,
    bearbeiten: {
      kommentarText: 'Vorher',
      vorher: { elementstand: testElementstand(), kommentarText: 'Vorher' },
    },
  };
  m.invoke.mockClear();
  await starten();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  m.hinweise.mockRejectedValue(new Error('Fensterstart'));
  await speichern();
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  expect((await ladeMarkierungen(gesetz))[0]!.kommentarText).toBe('Mein Kommentar');
  expect(schreibaufrufe()).toHaveLength(1);
  expect([...m.historie.values()]).toMatchObject([{ art: 'kommentarBearbeiten' }]);
  expect(m.close).toHaveBeenCalledOnce();
  expect(hinweise()).toHaveLength(1);
  expect(dom.host.textContent).not.toContain('konnte nicht gespeichert');
  expect(dom.host.textContent).not.toContain('Prüfung auf Markierungskonflikte');
  expect(m.banner).not.toHaveBeenCalled();
});
it('stellt einen abgewiesenen Duplikatstart mit offenem Quellabschluss nicht als gespeichert dar', async () => {
  await hinzufuegenMarkierung(
    gesetz,
    markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),

      kommentarText: 'Mein Kommentar',
    }),
  );
  m.invoke.mockClear();
  await starten();
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await speichern();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(dom.host.textContent).toContain('Prüfabschluss konnte nicht bestätigt werden');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Ein identischer Kommentar existiert bereits.');
  });
  await warteAufAnzeige(() => {
    expect(dom.host.textContent).toContain('Prüfabschluss konnte nicht bestätigt werden');
  });
  expect(dom.host.textContent).not.toContain('Kommentar wurde gespeichert');
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie.size).toBe(0);
  expect(hinweise()).toHaveLength(0);
  expect(m.close).not.toHaveBeenCalled();
  expect(feld().disabled).toBe(false);
  expect(m.banner).not.toHaveBeenCalled();
});

it('bündelt gleiche Prüfhinweise mehrerer Quellen einmal und erhält den Sicherungsbefund', async () => {
  m.dateien.set(titelPfad, 'defekt');
  m.abschliessen.mockRejectedValue(new Error('Abschluss'));
  await starten();
  await speichern();
  await act(async () => vi.waitFor(() => expect(m.close).toHaveBeenCalledOnce()));
  // Ein Hinweis je Vorgang; er trägt den Prüfhinweis einmal und den Sicherungsbefund.
  const [einziger, ...weitere] = hinweise();
  expect(weitere).toEqual([]);
  const texte: string[] = einziger?.hinweis.meldungen?.map((x: { text: string }) => x.text) ?? [];
  expect(texte.filter((t) => t === pruefHinweis)).toHaveLength(1);
  expect(texte.some((t) => t.includes('Titeldatei für „BGB“ war beschädigt'))).toBe(true);
  expect(texte).toHaveLength(2);
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.historie.size).toBe(1);
  expect(m.close).toHaveBeenCalledOnce();
});
