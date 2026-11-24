// @vitest-environment jsdom
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// Beide Suchwege benutzen echte Auswahl und Import; Fehler entstehen an nativen Grenzen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useEffect, useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useOeffnenAuswahl } from './useOeffnenAuswahl';
import { useOeffnenLinkNavigation } from './fenster/useOeffnenLinkNavigation';
import { artikelkontextGesetz } from '@/test/gesetz/artikelkontext';
import { parseSuchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';
const { abruf } = vi.hoisted(() => ({ abruf: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: abruf }));
const dom = domTestWurzel();
let auswahl: ReturnType<typeof useOeffnenAuswahl>;
let oeffnenLink: ReturnType<typeof useOeffnenLinkNavigation>;
const fehler = vi.fn();
function Probe() {
  const vorbereitung = useRef(null);
  const waehlen = useOeffnenAuswahl();
  const navigieren = useOeffnenLinkNavigation({
    importindexVorbereitungRef: vorbereitung,
    zeigeSuchfehler: fehler,
  });
  useEffect(() => {
    auswahl = waehlen;
    oeffnenLink = navigieren;
  });
  return null;
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  io.dateien.set(
    'importindizes/de-bw.xml',
    '<?xml version="1.0"?><importindex version="1"><infos><verarbeitungszeit herkunft="nutzer">2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>test</abrufkennung></gesetz></inhalt></importindex>',
  );
  await act(async () => dom.root.render(<Probe />));
});
afterEach(() => vi.restoreAllMocks());
it.each(['Verbindung', 'Berechtigung'])(
  'erhält bei geworfenem Fehler %s die Fehlermeldung für Suche und Öffnen-Link',
  async (art) => {
    const meldung =
      art === 'Verbindung'
        ? 'Request canceled'
        : 'command not allowed on any window/webview/URL context';
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockImplementation(() => {
      throw meldung;
    });
    const ergebnis = await auswahl(
      {
        art: 'index',
        quelle: 'de-bw',
        eintrag: { kurztitel: 'TestG', langtitel: 'Testgesetz', abrufkennung: 'test' },
      },
      parseSuchanfrage('TestG'),
    );
    expect(ergebnis).toEqual({
      meldung: 'Import fehlgeschlagen.',
      keineVerbindung: art === 'Verbindung',
    });
    const oeffnen = vi.fn();
    await act(async () => {
      expect(
        await oeffnenLink(
          { type: 'oeffnen', suchtext: 'TestG' },

          async () => true,
          oeffnen,
        ),
      ).toBe(true);
    });
    expect(oeffnen).not.toHaveBeenCalled();
    expect(fehler).toHaveBeenLastCalledWith({
      suchtext: 'TestG',
      meldung: 'Import fehlgeschlagen.',
      ohneAktivesGesetz: true,
    });
  },
);

it('reicht den importierten Verbindungsfehler für die Suche durch und erhält den Öffnen-Link-Fehlerweg', async () => {
  io.dateien.set(
    'importindizes/de-bund.xml',
    '<?xml version="1.0"?><importindex version="1"><infos><verarbeitungszeit herkunft="nutzer">2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>bgb</abrufkennung></gesetz></inhalt></importindex>',
  );
  abruf.mockRejectedValue(new TypeError('Failed to fetch'));
  const ergebnis = await auswahl(
    {
      art: 'index',
      quelle: 'de-bund',
      eintrag: { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'bgb' },
    },
    parseSuchanfrage('BGB'),
  );
  expect(ergebnis).toEqual({
    meldung:
      'Keine Verbindung zu gesetze-im-internet.de möglich. Bitte später erneut versuchen. Ursache: TypeError: Failed to fetch',
    keineVerbindung: true,
  });
  const oeffnen = vi.fn();
  await act(async () => {
    expect(
      await oeffnenLink(
        { type: 'oeffnen', suchtext: 'BGB' },

        async () => true,
        oeffnen,
      ),
    ).toBe(true);
  });
  expect(oeffnen).not.toHaveBeenCalled();
  expect(fehler).toHaveBeenLastCalledWith({
    suchtext: 'BGB',
    meldung: ergebnis.meldung,
    ohneAktivesGesetz: true,
  });
});

it('öffnet per Öffnen-Link ohne Artikelkontext Art. 4 statt Art. 246a § 4', async () => {
  const eg = artikelkontextGesetz();
  setzeSuchverzeichnisTestdaten([eg]);

  const oeffnen = vi.fn();
  await act(async () => {
    expect(
      await oeffnenLink(
        { type: 'oeffnen', suchtext: '§ 4 EG' },

        async () => true,
        oeffnen,
      ),
    ).toBe(true);
  });
  expect(oeffnen).toHaveBeenCalledWith({
    gesetzesreferenz: { kurztitel: eg.kurztitel, normgeber: eg.normgeber },
    xmlId: '4',
    nurInstalliert: true,
  });
});
