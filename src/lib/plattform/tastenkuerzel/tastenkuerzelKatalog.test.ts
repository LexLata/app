// Prüft Accelerator-Grammatik und stabile Normalisierung unabhängig vom Katalog.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  parseTastenkuerzel,
  tastenkuerzelAnzeige,
  tastenkuerzelKatalog,
} from './tastenkuerzelKatalog';
it.each([
  'A',
  '7',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Enter',
  'Escape',
  'Space',
  'Delete',
  'Backspace',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  '.',
  ',',
])('liest Taste %s mit allen Modifiern', (taste) => {
  expect(parseTastenkuerzel(`CmdOrCtrl+Shift+Alt+${taste}`)).toMatchObject({
    primaer: 'CmdOrCtrl',
    shift: true,
    alt: true,
  });
});
it('unterscheidet Strg von CmdOrCtrl', () => {
  expect(parseTastenkuerzel('Ctrl+Tab').primaer).toBe('Ctrl');
  expect(parseTastenkuerzel('CmdOrCtrl+Tab').primaer).toBe('CmdOrCtrl');
});
it.each([
  '',
  '+',
  'CmdOrCtrl',
  'CmdOrCtrl++A',
  'CmdOrCtrl+Ctrl+A',
  'Shift+Shift+A',
  'Meta+A',
  'Shift+Unbekannt',
  'A+Shift',
  'AB',
])('verwirft %s', (wert) => expect(() => parseTastenkuerzel(wert)).toThrow());
it('zerlegt Primärtaste, Shift, Alt und Taste unabhängig von der Eingabereihenfolge der Bestandteile', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('', 'Ctrl+', 'CmdOrCtrl+'),
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom('A', '9', ',', 'Tab', 'Space'),
      (primaer, shift, alt, taste) => {
        const ergebnis = parseTastenkuerzel(
          `${primaer}${shift ? 'Shift+' : ''}${alt ? 'Alt+' : ''}${taste}`,
        );
        expect(ergebnis.primaer).toBe(primaer ? primaer.slice(0, -1) : null);
        expect(ergebnis.shift).toBe(shift);
        expect(ergebnis.alt).toBe(alt);
      },
    ),
  );
});

it('ermittelt Katalogtreffer mit exakten Modifikatoren und physischen Tasten', async () => {
  const { findeTastenkuerzel } = await import('./tastenkuerzelKatalog');
  const event = {
    key: 'd',
    code: 'KeyD',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  };
  expect(findeTastenkuerzel(event)?.id).toBe('lesezeichen-speichern');
  expect(findeTastenkuerzel({ ...event, key: 'D' })?.id).toBe('lesezeichen-speichern');
  expect(findeTastenkuerzel({ ...event, metaKey: false, ctrlKey: true })?.id).toBe(
    'lesezeichen-speichern',
  );
  expect(findeTastenkuerzel({ ...event, key: 'ß', shiftKey: true, altKey: true })?.id).toBe(
    'alle-lesezeichen-entfernen',
  );
  expect(findeTastenkuerzel({ ...event, altKey: true })).toBeUndefined();
  expect(findeTastenkuerzel({ ...event, ctrlKey: true })).toBeUndefined();
  expect(
    findeTastenkuerzel({ ...event, key: 'ß', code: 'KeyS', shiftKey: true, altKey: true }),
  ).toBeUndefined();
});

it('zeigt Katalogkürzel plattformgerecht und meldet unbekannte IDs', () => {
  expect(tastenkuerzelAnzeige('alle-lesezeichen-entfernen', true)).toBe('⌥\u202f⇧\u202f⌘\u202fD');
  expect(tastenkuerzelAnzeige('alle-lesezeichen-entfernen', false)).toBe('Strg+Alt+Umschalt+D');
  expect(tastenkuerzelAnzeige('tab-naechster', true)).toBe('⌃\u202fTab');
  expect(tastenkuerzelAnzeige('tab-naechster', false)).toBe('Strg+Tab');
  expect(tastenkuerzelAnzeige('verlauf-zurueck', true)).toBe('⌥\u202f←');
  expect(tastenkuerzelAnzeige('oeffnen-neuer-tab', true)).toBe('⌘\u202f↩');
  expect(tastenkuerzelAnzeige('oeffnen-neuer-tab', false)).toBe('Strg+Enter');
  expect(tastenkuerzelAnzeige('klappstufe-aufklappen', false)).toBe('Strg+→');
  expect(() => tastenkuerzelAnzeige('unbekannt', true)).toThrow('unbekannt');
});
it('zeigt Familienmitglieder aus dem Katalog', () => {
  expect(tastenkuerzelAnzeige('favoriten-27-52', true, 0)).toBe('⇧\u202fa');
  expect(tastenkuerzelAnzeige('favoriten-53-78', false, 25)).toBe('Alt+z');
  expect(tastenkuerzelAnzeige('lesezeichen-1-10', true, 0)).toBe('⌥\u202f0');
  expect(tastenkuerzelAnzeige('lesezeichen-1-10', true, 9)).toBe('⌥\u202f9');
  expect(tastenkuerzelAnzeige('tab-position', true)).toBe('⌘\u202f1–9');
  expect(() => tastenkuerzelAnzeige('favoriten-27-52', true, 26)).toThrow();
});
it('zeigt plattformübergreifend dieselbe Zahl an Modifikatoren', () => {
  fc.assert(
    fc.property(fc.constantFrom(...tastenkuerzelKatalog), (eintrag) => {
      const mac = tastenkuerzelAnzeige(eintrag.id, true);
      const andere = tastenkuerzelAnzeige(eintrag.id, false);
      expect((mac.match(/[⌃⌘⌥⇧]/g) ?? []).length).toBe(andere.split('+').length - 1);
    }),
  );
});

it('enthält keine veraltete Suchschließtaste und keine Hinweise Gesetz offen', () => {
  expect(tastenkuerzelKatalog.some((e) => e.id === 'oeffnen-schliessen')).toBe(false);
  expect(tastenkuerzelKatalog.some((e) => e.bedingung === 'Gesetz offen')).toBe(false);
});

it.each([true, false])(
  'zeigt unmodifizierte Favoritenfamilien klein und modifizierte groß (Mac: %s)',
  (istMac) => {
    expect(tastenkuerzelAnzeige('favoriten-1-26', istMac)).toBe('a–z');
    expect(tastenkuerzelAnzeige('favoriten-27-52', istMac)).toBe(
      istMac ? '⇧\u202fA–Z' : 'Umschalt+A–Z',
    );
    expect(tastenkuerzelAnzeige('favoriten-53-78', istMac)).toBe(istMac ? '⌥\u202fA–Z' : 'Alt+A–Z');
    expect(tastenkuerzelAnzeige('favoriten-1-26', istMac, 0)).toBe('a');
    expect(tastenkuerzelAnzeige('favoriten-1-26', istMac, 1)).toBe('b');
  },
);
