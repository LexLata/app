import { describe, expect, it } from 'vitest';
import { naechsteAktiveTabIdNachSchliessen } from './tabAktivierung';
import type { Tab } from '@/lib/domain/appTypes';

function tab(id: string): Tab {
  return { id };
}

describe('naechsteAktiveTabIdNachSchliessen', () => {
  it('aktiviert den Tab an derselben Position wie der geschlossene (mittendrin)', () => {
    const vorherige = [tab('a'), tab('b'), tab('c')];
    const verbleibende = [tab('a'), tab('c')];
    expect(naechsteAktiveTabIdNachSchliessen(vorherige, verbleibende, 'b')).toBe('c');
  });

  it('aktiviert den letzten Tab, wenn der geschlossene der letzte war', () => {
    const vorherige = [tab('a'), tab('b'), tab('c')];
    const verbleibende = [tab('a'), tab('b')];
    expect(naechsteAktiveTabIdNachSchliessen(vorherige, verbleibende, 'c')).toBe('b');
  });

  it('aktiviert den (einzig) verbleibenden Tab, wenn der erste von zweien geschlossen wurde', () => {
    const vorherige = [tab('a'), tab('b')];
    const verbleibende = [tab('b')];
    expect(naechsteAktiveTabIdNachSchliessen(vorherige, verbleibende, 'a')).toBe('b');
  });

  it('aktiviert den ersten Tab, wenn der erste von dreien geschlossen wurde', () => {
    const vorherige = [tab('a'), tab('b'), tab('c')];
    const verbleibende = [tab('b'), tab('c')];
    expect(naechsteAktiveTabIdNachSchliessen(vorherige, verbleibende, 'a')).toBe('b');
  });
});
