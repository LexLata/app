// ergaenzungsbedarfEU.test.ts
// Die Ergänzungsentscheidung hängt von Fassungswunsch, tatsächlicher Fassung und Normen ab.
import { expect, it } from 'vitest';
import { brauchtEuOriginal } from './erwaegungsgruendeEU';
import type { EuFassung } from '@/lib/domain/euFassungsvertrag';
const fassungen: EuFassung[] = ['original', 'konsolidiert', 'konsolidiert-mit-erwaegungsgruenden'];
for (const fassung of fassungen) {
  for (const konsolidiert of [true, false]) {
    for (const vorhanden of [true, false]) {
      it(`${fassung}, ${konsolidiert ? 'konsolidiert' : 'Original/Rückfall'}, ${vorhanden ? 'mit' : 'ohne'} Erwägungsgründe`, () => {
        const normen = vorhanden
          ? [
              {
                type: 'gliederung' as const,
                bez: 'Erwägungsgründe',
                ebene: 1,
                gliederungskennzahl: '',
                absaetze: [],
              },
            ]
          : [];
        expect(brauchtEuOriginal(fassung, konsolidiert, normen)).toBe(
          fassung === 'konsolidiert-mit-erwaegungsgruenden' && konsolidiert && !vorhanden,
        );
      });
    }
  }
}
