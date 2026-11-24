import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// useTastenkuerzel.helpers.test.ts
// Prüft Tastenkürzelerkennung und die vollständige Gesetzeszuordnung.
import { gesetzesreferenz, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import {
  istTastenkuerzelWaehrendEinfuehrungErlaubt,
  behandleLesezeichenZiffernTastenkuerzel,
  behandleTabPositionsTastenkuerzel,
  behandleTabWechselTastenkuerzel,
  behandleVerlaufNavigationTastenkuerzel,
  behandleKlappstufenTastenkuerzel,
  behandleOeffnenZifferTastenkuerzel,
  behandleGesetzeskurzbefehl,
} from './useTastenkuerzel.helpers';
import {
  parseTastenkuerzel,
  tastenkuerzelKatalog,
} from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { describe, it, expect, vi } from 'vitest';
import type { Tab } from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { Gesetzeskurzbefehl } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';

// Alle Funktionen hier lesen nur einen Teil der echten KeyboardEvent-Felder
// (siehe TastenkuerzelEvent-Typ in useTastenkuerzel.helpers.ts) – Tests bauen daher
// einfache Objektliteral-Fakes statt echter KeyboardEvent-Instanzen (kein
// jsdom nötig, Tests laufen im 'node'-Environment, siehe vitest.config.ts).
function fakeEvent(overrides: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  key?: string;
  code?: string;
}) {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    key: '',
    code: '',
    preventDefault: vi.fn(),
    ...overrides,
  };
}

function ref<T>(current: T): { current: T } {
  return { current };
}

describe('istTastenkuerzelWaehrendEinfuehrungErlaubt', () => {
  it('liest Klappstufentasten auch aus nicht aufzählbaren Browserereignis-Eigenschaften', () => {
    const event = Object.create(null);
    const werte = fakeEvent({ key: 'ArrowLeft', metaKey: true });
    for (const [name, value] of Object.entries(werte)) {
      Object.defineProperty(event, name, { value, enumerable: false });
    }
    expect(istTastenkuerzelWaehrendEinfuehrungErlaubt(event, 6)).toBe(true);
  });
  const teilaktionen: Record<string, number[]> = {
    oeffnen: [0],
    'favorit-speichern': [2, 3],
    'lesezeichen-speichern': [4],
    'klappstufe-zuklappen': [6, 7],
    'klappstufe-aufklappen': [6, 7],
  };
  it.each(
    tastenkuerzelKatalog.filter((e) => e.behandlung === 'J' || e.id.startsWith('klappstufe-')),
  )('$id: Erlaubnis folgt der Katalogbelegung und der Teilaktion', (eintrag) => {
    const taste = parseTastenkuerzel(eintrag.accelerator);
    const key =
      ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight' } as Record<string, string>)[
        taste.taste
      ] ?? taste.taste;
    for (const primaer of ['metaKey', 'ctrlKey']) {
      const e = fakeEvent({
        key,
        code: `Key${key.toUpperCase()}`,
        shiftKey: taste.shift,
        altKey: taste.alt,
        [primaer]: true,
      });
      for (let teilaktion = 0; teilaktion < 9; teilaktion++) {
        expect(
          istTastenkuerzelWaehrendEinfuehrungErlaubt(e, teilaktion),
          `${eintrag.id}, Teilaktion ${teilaktion}`,
        ).toBe(teilaktionen[eintrag.id]?.includes(teilaktion) ?? false);
      }
    }
  });
  it.each(['0', '3', '9', '§'])('Ziffer/§ %s ist nur in Teilaktion 0 erlaubt', (key) => {
    expect(istTastenkuerzelWaehrendEinfuehrungErlaubt(fakeEvent({ key }), 0)).toBe(true);
    expect(istTastenkuerzelWaehrendEinfuehrungErlaubt(fakeEvent({ key }), 1)).toBe(false);
    expect(istTastenkuerzelWaehrendEinfuehrungErlaubt(fakeEvent({ key, altKey: true }), 0)).toBe(
      false,
    );
  });
  it('Klappstufen behalten die Modifier-Erlaubnis des Sonderhandlers', () => {
    expect(
      istTastenkuerzelWaehrendEinfuehrungErlaubt(
        fakeEvent({ key: 'ArrowRight', metaKey: true, ctrlKey: true }),
        6,
      ),
    ).toBe(true);
    expect(
      istTastenkuerzelWaehrendEinfuehrungErlaubt(
        fakeEvent({ key: 'ArrowLeft', metaKey: true, shiftKey: true }),
        6,
      ),
    ).toBe(true);
  });
});

describe('behandleLesezeichenZiffernTastenkuerzel', () => {
  it('⌥3: öffnet Lesezeichen an Index 2 (0-basiert, Ziffer 1 -> Index 0)', () => {
    const oeffnen = vi.fn();
    const eintraegeRef = ref([
      { bezeichnung: 'a', gesetz: gesetzesreferenz({ kurztitel: 'g1' }) },
      { bezeichnung: 'b', gesetz: gesetzesreferenz({ kurztitel: 'g1' }) },
      { bezeichnung: 'c', gesetz: gesetzesreferenz({ kurztitel: 'g1' }) },
    ]);
    const e = fakeEvent({ altKey: true, code: 'Digit3' });
    const verarbeitet = behandleLesezeichenZiffernTastenkuerzel(
      e,
      eintraegeRef,
      ref(oeffnen),
      true,
    );
    expect(verarbeitet).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(oeffnen).toHaveBeenCalledWith('c', gesetzesreferenz({ kurztitel: 'g1' }));
  });

  it('⌥0: Index 9 (letzte Ziffernreihen-Position)', () => {
    const eintraege = Array.from({ length: 10 }, (_, i) => ({
      bezeichnung: `e${i}`,
      gesetz: gesetzesreferenz({ kurztitel: 'g' }),
    }));
    const e = fakeEvent({ altKey: true, code: 'Digit0' });
    const verarbeitet = behandleLesezeichenZiffernTastenkuerzel(
      e,
      ref(eintraege),
      ref(vi.fn()),
      true,
    );
    expect(verarbeitet).toBe(true);
  });

  it('⌥⇧3: Basis-Offset 10 (zweite Reihe), Index 12', () => {
    const oeffnen = vi.fn();
    const eintraege = Array.from({ length: 15 }, (_, i) => ({
      bezeichnung: `e${i}`,
      gesetz: gesetzesreferenz({ kurztitel: 'g' }),
    }));
    const e = fakeEvent({ altKey: true, shiftKey: true, code: 'Digit3' });
    behandleLesezeichenZiffernTastenkuerzel(e, ref(eintraege), ref(oeffnen), true);
    expect(oeffnen).toHaveBeenCalledWith('e12', gesetzesreferenz({ kurztitel: 'g' }));
  });

  it('kein Eintrag an diesem Index: konsumiert das Event trotzdem, aber ohne Aktion/preventDefault', () => {
    const oeffnen = vi.fn();
    const e = fakeEvent({ altKey: true, code: 'Digit5' });
    const verarbeitet = behandleLesezeichenZiffernTastenkuerzel(e, ref([]), ref(oeffnen), true);
    expect(verarbeitet).toBe(true);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(oeffnen).not.toHaveBeenCalled();
  });

  it('kein Alt oder zusätzlich Meta/Ctrl gedrückt: nicht zuständig (false)', () => {
    const e = fakeEvent({ altKey: true, metaKey: true, code: 'Digit1' });
    expect(behandleLesezeichenZiffernTastenkuerzel(e, ref([]), ref(vi.fn()), true)).toBe(false);
  });

  it('Alt + Buchstaben-Code (kein Digit-Pattern): nicht zuständig (false), fällt durch', () => {
    const e = fakeEvent({ altKey: true, code: 'KeyA' });
    expect(behandleLesezeichenZiffernTastenkuerzel(e, ref([]), ref(vi.fn()), true)).toBe(false);
  });
});

describe('behandleTabPositionsTastenkuerzel', () => {
  const tabs = [{ id: 't1' }, { id: 't2' }, { id: 't3' }] as Tab[];

  it('⌘2: wählt den zweiten Tab', () => {
    const setAktiverTabId = vi.fn();
    const e = fakeEvent({ metaKey: true, key: '2' });
    expect(behandleTabPositionsTastenkuerzel(e, ref(tabs), setAktiverTabId)).toBe(true);
    expect(setAktiverTabId).toHaveBeenCalledWith('t2');
  });

  it('⌘9: wählt IMMER den letzten Tab, unabhängig von der tatsächlichen Anzahl', () => {
    const setAktiverTabId = vi.fn();
    const e = fakeEvent({ metaKey: true, key: '9' });
    behandleTabPositionsTastenkuerzel(e, ref(tabs), setAktiverTabId);
    expect(setAktiverTabId).toHaveBeenCalledWith('t3');
  });

  it('⌘5 bei nur 3 Tabs: fällt auf den letzten Tab zurück statt undefined', () => {
    const setAktiverTabId = vi.fn();
    const e = fakeEvent({ metaKey: true, key: '5' });
    behandleTabPositionsTastenkuerzel(e, ref(tabs), setAktiverTabId);
    expect(setAktiverTabId).toHaveBeenCalledWith('t3');
  });

  it('keine Tabs offen: konsumiert das Event (true), aber kein preventDefault/Aktion', () => {
    const setAktiverTabId = vi.fn();
    const e = fakeEvent({ metaKey: true, key: '1' });
    expect(behandleTabPositionsTastenkuerzel(e, ref([]), setAktiverTabId)).toBe(true);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(setAktiverTabId).not.toHaveBeenCalled();
  });

  it('mit ⇧ gedrückt: nicht zuständig (false)', () => {
    const e = fakeEvent({ metaKey: true, shiftKey: true, key: '1' });
    expect(behandleTabPositionsTastenkuerzel(e, ref(tabs), vi.fn())).toBe(false);
  });
});

describe('behandleTabWechselTastenkuerzel', () => {
  const tabs = [{ id: 't1' }, { id: 't2' }, { id: 't3' }] as Tab[];

  it('⌃Tab: wechselt zum nächsten Tab (mit Umlauf ans Ende)', () => {
    const setAktiverTabId = vi.fn();
    const e = fakeEvent({ ctrlKey: true, key: 'Tab' });
    behandleTabWechselTastenkuerzel(e, ref(tabs), ref('t3'), setAktiverTabId);
    expect(setAktiverTabId).toHaveBeenCalledWith('t1');
  });

  it('⌃⇧Tab: wechselt zum vorherigen Tab (mit Umlauf ans Ende)', () => {
    const setAktiverTabId = vi.fn();
    const e = fakeEvent({ ctrlKey: true, shiftKey: true, key: 'Tab' });
    behandleTabWechselTastenkuerzel(e, ref(tabs), ref('t1'), setAktiverTabId);
    expect(setAktiverTabId).toHaveBeenCalledWith('t3');
  });

  it('nur ein Tab offen: konsumiert das Event, aber kein Wechsel', () => {
    const setAktiverTabId = vi.fn();
    const e = fakeEvent({ ctrlKey: true, key: 'Tab' });
    expect(behandleTabWechselTastenkuerzel(e, ref([tabs[0]!]), ref('t1'), setAktiverTabId)).toBe(
      true,
    );
    expect(setAktiverTabId).not.toHaveBeenCalled();
  });
});

describe('behandleVerlaufNavigationTastenkuerzel', () => {
  it('⌥← außerhalb von Overlay/Eingabefeld: navigiert zurück', () => {
    const verlaufNavigationRef = ref(vi.fn());
    const e = fakeEvent({ altKey: true, key: 'ArrowLeft' });
    const verarbeitet = behandleVerlaufNavigationTastenkuerzel(
      e,
      verlaufNavigationRef,
      () => false,
      () => false,
    );
    expect(verarbeitet).toBe(true);
    expect(verlaufNavigationRef.current).toHaveBeenCalledWith('zurueck');
  });

  it('⌥→ bei aktivem Overlay: konsumiert das Event, navigiert aber NICHT', () => {
    const verlaufNavigationRef = ref(vi.fn());
    const e = fakeEvent({ altKey: true, key: 'ArrowRight' });
    const verarbeitet = behandleVerlaufNavigationTastenkuerzel(
      e,
      verlaufNavigationRef,
      () => true,
      () => false,
    );
    expect(verarbeitet).toBe(true);
    expect(verlaufNavigationRef.current).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('bei fokussiertem Eingabefeld: konsumiert das Event, navigiert aber NICHT', () => {
    const verlaufNavigationRef = ref(vi.fn());
    const e = fakeEvent({ altKey: true, key: 'ArrowRight' });
    behandleVerlaufNavigationTastenkuerzel(
      e,
      verlaufNavigationRef,
      () => false,
      () => true,
    );
    expect(verlaufNavigationRef.current).not.toHaveBeenCalled();
  });

  it('ohne Alt gedrückt: nicht zuständig (false)', () => {
    const e = fakeEvent({ key: 'ArrowLeft' });
    expect(
      behandleVerlaufNavigationTastenkuerzel(
        e,
        ref(vi.fn()),
        () => false,
        () => false,
      ),
    ).toBe(false);
  });
});

describe('behandleKlappstufenTastenkuerzel', () => {
  it('⌘← außerhalb von Overlay/Eingabefeld: klappt zu', () => {
    const zuklappenRef = ref(vi.fn());
    const aufklappenRef = ref(vi.fn());
    const e = fakeEvent({ metaKey: true, key: 'ArrowLeft' });
    const verarbeitet = behandleKlappstufenTastenkuerzel(
      e,
      zuklappenRef,
      aufklappenRef,
      () => false,
      () => false,
    );
    expect(verarbeitet).toBe(true);
    expect(zuklappenRef.current).toHaveBeenCalled();
    expect(aufklappenRef.current).not.toHaveBeenCalled();
  });

  it('⌘→: klappt auf', () => {
    const zuklappenRef = ref(vi.fn());
    const aufklappenRef = ref(vi.fn());
    const e = fakeEvent({ metaKey: true, key: 'ArrowRight' });
    behandleKlappstufenTastenkuerzel(
      e,
      zuklappenRef,
      aufklappenRef,
      () => false,
      () => false,
    );
    expect(aufklappenRef.current).toHaveBeenCalled();
    expect(zuklappenRef.current).not.toHaveBeenCalled();
  });
});

describe('behandleOeffnenZifferTastenkuerzel', () => {
  it('Ziffer außerhalb eines Eingabefelds: öffnet Öffnen-Overlay mit der Ziffer vorbelegt', () => {
    const setOeffnenOverlayInitial = vi.fn();
    const setAktivesOverlay = vi.fn();
    const e = fakeEvent({ key: '7' });
    const verarbeitet = behandleOeffnenZifferTastenkuerzel(
      e,
      setOeffnenOverlayInitial,
      setAktivesOverlay,
      () => false,
    );
    expect(verarbeitet).toBe(true);
    expect(setOeffnenOverlayInitial).toHaveBeenCalledWith('7');
    expect(setAktivesOverlay).toHaveBeenCalledWith('oeffnen');
  });

  it('§-Zeichen wird ebenfalls erkannt', () => {
    const e = fakeEvent({ key: '§' });
    expect(behandleOeffnenZifferTastenkuerzel(e, vi.fn(), vi.fn(), () => false)).toBe(true);
  });

  it('bei fokussiertem Eingabefeld: NICHT verarbeitet (false) – Ziffer bleibt normal eintippbar', () => {
    const setOeffnenOverlayInitial = vi.fn();
    const e = fakeEvent({ key: '7' });
    const verarbeitet = behandleOeffnenZifferTastenkuerzel(
      e,
      setOeffnenOverlayInitial,
      vi.fn(),
      () => true,
    );
    expect(verarbeitet).toBe(false);
    expect(setOeffnenOverlayInitial).not.toHaveBeenCalled();
  });
});

describe('behandleGesetzeskurzbefehl', () => {
  const gesetz: GesetzDarstellung = gesetzDarstellung({
    kurztitel: 'BGB',
    langtitel: 'Bürgerliches Gesetzbuch',
    hatGliederungsartikel: false,
    elemente: [],
  });
  const gesetzeskurzbefehle: Record<string, Gesetzeskurzbefehl> = {
    [gesetzesreferenzSchluessel(gesetz)]: {
      taste: 'b',
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
    },
  };

  it('passendes Tastenkürzel: öffnet das zugehörige Gesetz', () => {
    const oeffnen = vi.fn();
    const e = fakeEvent({ metaKey: true, key: 'b' });
    behandleGesetzeskurzbefehl(
      e,
      ref(gesetzeskurzbefehle),
      ref(alsSuchverzeichniseintraege([gesetz])),
      ref(oeffnen),
    );
    expect(e.preventDefault).toHaveBeenCalled();
    expect(oeffnen).toHaveBeenCalledWith(
      {
        gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
        nurInstalliert: true,
      },
      'aktiver-tab',
    );
  });

  it('kein passendes Tastenkürzel: tut nichts', () => {
    const oeffnen = vi.fn();
    const e = fakeEvent({ metaKey: true, key: 'x' });
    behandleGesetzeskurzbefehl(
      e,
      ref(gesetzeskurzbefehle),
      ref(alsSuchverzeichniseintraege([gesetz])),
      ref(oeffnen),
    );
    expect(oeffnen).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('Tastenkürzel matcht, aber Gesetz nicht (mehr) in der Liste: tut nichts (kein Absturz)', () => {
    const oeffnen = vi.fn();
    const e = fakeEvent({ metaKey: true, key: 'b' });
    behandleGesetzeskurzbefehl(e, ref(gesetzeskurzbefehle), ref([]), ref(oeffnen));
    expect(oeffnen).not.toHaveBeenCalled();
  });
});

it('öffnet bei gleichem Kurztitel den Normgeber des Kurzbefehls', () => {
  const bund: GesetzDarstellung = {
    kurztitel: 'BGB',
    normgeber: 'de-bund',
    langtitel: '',
    elemente: [],
    hatGliederungsartikel: false,
  };
  const bw: GesetzDarstellung = { ...bund, normgeber: 'de-bw' };
  const k: Gesetzeskurzbefehl = { taste: 'b', meta: true, ctrl: false, shift: false, alt: false };
  const oeffnen = vi.fn();
  behandleGesetzeskurzbefehl(
    fakeEvent({ metaKey: true, key: 'b' }),
    ref({ [gesetzesreferenzSchluessel({ kurztitel: 'bgb', normgeber: 'de-bw' })]: k }),
    ref(alsSuchverzeichniseintraege([bund, bw])),
    ref(oeffnen),
  );
  expect(oeffnen).toHaveBeenCalledExactlyOnceWith(
    {
      gesetzesreferenz: { kurztitel: bw.kurztitel, normgeber: bw.normgeber },
      nurInstalliert: true,
    },
    'aktiver-tab',
  );
});

it.each(Array.from({ length: 9 }, (_, i) => i))(
  'Lesezeichen-Ziffern sind ab Teilaktion 4 erlaubt (%s)',
  (teilaktion) => {
    for (const shiftKey of [false, true]) {
      expect(
        istTastenkuerzelWaehrendEinfuehrungErlaubt(
          fakeEvent({ key: '¡', code: 'Digit1', altKey: true, shiftKey }),
          teilaktion,
        ),
      ).toBe(teilaktion >= 4);
    }
  },
);
