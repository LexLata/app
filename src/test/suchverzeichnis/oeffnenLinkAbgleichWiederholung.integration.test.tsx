// @vitest-environment jsdom
// Echte Navigation, Abgleich und Einzelöffnung; nur native Zugriffe werden angehalten.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useEffect, useRef } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzVerwaltung } from '@/hooks/tabs/useGesetzVerwaltung';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useInterneNavigation } from '@/hooks/fenster/useInterneNavigation';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import { bereiteSuchverzeichnisVor } from '@/lib/gesetz-laden/gesetz-laden.index';
import { leseSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
const dom = domTestWurzel();
function sperre() {
  let fertig = () => {};
  const warten = new Promise<void>((resolve) => {
    fertig = resolve;
  });
  return { warten, fertig };
}
const xml = (titel: string) =>
  `<gesetz><infos><kurztitel>${titel}</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>`;
let zustand: (ReturnType<typeof useAppTabs> & ReturnType<typeof useGesetzVerwaltung>) | undefined;
const suchfehler = vi.fn();
let anmeldung: unknown;
let auftrag: unknown;
function Host() {
  const tabs = useAppTabs();
  const verwaltung = useGesetzVerwaltung(tabs);
  const oeffnen = useGesetzOeffnen({ ...tabs, ...verwaltung });
  const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
  const oeffnenLinkAusfuehren = useOeffnenLinkNavigation({
    importindexVorbereitungRef,
    zeigeSuchfehler: suchfehler,
  });
  useInterneNavigation({ ...tabs, ...oeffnen, startAbgeschlossen: true, oeffnenLinkAusfuehren });
  useEffect(() => {
    zustand = { ...tabs, ...verwaltung };
  });
  return null;
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  suchfehler.mockReset();
  anmeldung = undefined;
  auftrag = { kennung: 1, auftrag: { type: 'oeffnen', suchtext: '1' }, neuesFenster: false };
  io.dateien.set('gesetze/A_de-bund.xml', xml('A'));
  io.dateien.set('gesetze/X_de-bund.xml', xml('X'));
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'interne_navigation_bereit') {
      anmeldung = args.anmeldung;
      return auftrag;
    }
    if (name === 'interne_navigation_lesen') return anmeldung === args.anmeldung ? auftrag : null;
    if (name === 'interne_navigation_anzeigen' || name === 'interne_navigation_abmelden') return;
    if (name === 'interne_navigation_bestaetigen') {
      auftrag = null;
      return;
    }
    return nativ?.(name, args);
  });
});
async function pruefeOeffnungsabschluss() {
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(auftrag).toBeNull();
  });
  const tab = zustand?.tabs.find((t) => t.id === zustand?.aktiverTabId);
  expect(zustand?.holeTabGesetz(tab)?.kurztitel).toBe('A');
  expect(tab?.initialNorm).toBe('p1');
  expect(suchfehler).not.toHaveBeenCalled();
}
it.each(['Dateilesen', 'Abgleichabschluss'] as const)(
  'wiederholt nach wiederhergestellter Lesbarkeit trotz noch offenem altem %s',
  async (phase) => {
    const alterAbschluss = sperre();
    const abschlussBegonnen = sperre();
    const suchvorbereitungBegonnen = sperre();
    let lesbar = false;
    let gehalten = false;
    const senden = io.emitTo.getMockImplementation();
    io.vorLesen = (pfad) => {
      if (pfad.endsWith('gesetze/A_de-bund.xml') && !lesbar) {
        if (phase === 'Dateilesen') {
          gehalten = true;
          abschlussBegonnen.fertig();
          return alterAbschluss.warten.then(() => {
            throw new Error('Datei gesperrt');
          });
        }
        throw new Error('Datei gesperrt');
      }
      if (gehalten && anmeldung && pfad.endsWith('cache/suchverzeichnis.json'))
        suchvorbereitungBegonnen.fertig();
      return undefined;
    };
    io.emitTo.mockImplementation(async (...args: unknown[]) => {
      if (args[1] === 'gesetze-geaendert' && !gehalten && phase === 'Abgleichabschluss') {
        gehalten = true;
        abschlussBegonnen.fertig();
        await alterAbschluss.warten;
      }
      return senden?.(...args);
    });
    const hintergrund = bereiteSuchverzeichnisVor();
    let wiederholung: Promise<void> | undefined;
    try {
      await abschlussBegonnen.warten;
      const alterStand = await leseSuchverzeichnis();
      if (phase === 'Abgleichabschluss')
        expect(alterStand.eintraege.some((e) => e.status === 'nicht-lesbar')).toBe(true);
      else expect(alterStand.abgeglichen).toBe(false);
      await act(async () => dom.root.render(<Host />));
      await suchvorbereitungBegonnen.warten;
      expect(auftrag).not.toBeNull();
      lesbar = true;
      wiederholung = zustand?.gleicheGesetzeAb();
      alterAbschluss.fertig();
      await act(async () => {
        await hintergrund;
        await wiederholung;
      });
      expect((await leseSuchverzeichnis()).eintraege.every((e) => e.status === 'in-ordnung')).toBe(
        true,
      );
      await pruefeOeffnungsabschluss();
    } finally {
      alterAbschluss.fertig();
      await hintergrund;
      await wiederholung;
    }
  },
);

it('verliert einen erfolgreichen Abgleich nicht hinter einem später beendeten erfolglosen Einzelöffnen', async () => {
  await bereiteSuchverzeichnisVor();
  const lesenBegonnen = sperre();
  const alterLesefehler = sperre();
  let anzahl = 0;
  io.vorLesen = (pfad) => {
    if (!pfad.endsWith('gesetze/A_de-bund.xml')) return undefined;
    anzahl++;
    if (anzahl === 1) {
      lesenBegonnen.fertig();
      return alterLesefehler.warten.then(() => {
        throw new Error('Alter Lesefehler');
      });
    }
    return undefined;
  };
  try {
    await act(async () => dom.root.render(<Host />));
    await lesenBegonnen.warten;
    expect(auftrag).not.toBeNull();
    await act(async () => zustand?.gleicheGesetzeAb());
    expect((await leseSuchverzeichnis()).abgeglichen).toBe(true);
    expect(anzahl).toBe(1);
    await act(async () => alterLesefehler.fertig());
    await pruefeOeffnungsabschluss();
    expect(anzahl).toBe(2);
  } finally {
    alterLesefehler.fertig();
  }
});
