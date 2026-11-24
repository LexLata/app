// Tab-Meldungen: gleiche Bezeichnungen auslassen, Scrollvorschau auf 100 ms drosseln.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { ermittleTabBezeichnung } from './struktur/struktur.index';

export function useTabBezeichnung(
  gesetz: GesetzDarstellung,
  aktivesElementId: string | null,
  melden: ((wert: string | undefined) => void) | undefined,
) {
  const aktuell = useRef({ gesetz, melden });
  const aktiv = useRef(true);
  const meldung = useRef<{
    gesetz: GesetzDarstellung;
    wert?: string;
    zuletzt: number;
    timer: ReturnType<typeof setTimeout> | null;
    ausstehend?: string;
  }>({ gesetz, zuletzt: -Infinity, timer: null });
  useLayoutEffect(() => {
    aktuell.current = { gesetz, melden };
  });
  const meldeTab = useCallback((id: string | null, sofort: boolean) => {
    if (!aktiv.current || !aktuell.current.melden) return;
    const elemente = aktuell.current.gesetz.elemente;
    const wert = ermittleTabBezeichnung(
      elemente,
      elemente.findIndex((el) => el.data.id === id),
    );
    const m = meldung.current;
    const verwerfen = () => {
      if (m.timer !== null) clearTimeout(m.timer);
      m.timer = null;
      m.ausstehend = undefined;
    };
    if (sofort) verwerfen();
    if (wert === m.wert) {
      verwerfen();
      return;
    }
    if (sofort || Date.now() - m.zuletzt >= 100) {
      m.wert = wert;
      m.zuletzt = Date.now();
      aktuell.current.melden?.(wert);
      return;
    }
    m.ausstehend = wert;
    if (m.timer === null)
      m.timer = setTimeout(
        () => {
          m.timer = null;
          const letzter = m.ausstehend;
          m.ausstehend = undefined;
          if (letzter === m.wert) return;
          m.wert = letzter;
          m.zuletzt = Date.now();
          aktuell.current.melden?.(letzter);
        },
        100 - (Date.now() - m.zuletzt),
      );
  }, []);
  useEffect(() => {
    aktiv.current = true;
    const m = meldung.current;
    if (m.gesetz !== gesetz) {
      m.gesetz = gesetz;
      m.wert = undefined;
      m.zuletzt = -Infinity;
    }
    return () => {
      aktiv.current = false;
      if (m.timer !== null) clearTimeout(m.timer);
      m.timer = null;
      m.ausstehend = undefined;
    };
  }, [gesetz]);
  useEffect(() => {
    meldeTab(aktivesElementId, true);
  }, [aktivesElementId, gesetz, meldeTab]);
  return meldeTab;
}
