// @vitest-environment jsdom
// Einstellungsanzeigen.test.tsx
// Prüft Textblätter, native Optionsbeschriftungen und unveränderte Bedienaktionen.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { EinstellungenZeile } from './EinstellungenZeile';
import { EinstellungenKategorieAbschnitt } from './EinstellungenKategorieAbschnitt';
import { EinstellungenCheckboxZeile } from './EinstellungenCheckboxZeile';
import { EinstellungenSeitenleiste } from './EinstellungenSeitenleiste';
import { FarbAuswahlDropdown } from './FarbAuswahlDropdown';
import { AllgemeinAbschnitt } from './AllgemeinAbschnitt';
import { ZitatKopierenAbschnitt } from './ZitatKopierenAbschnitt';
import { GesetzestextAbschnitt } from './GesetzestextAbschnitt';
import { SeitenleistenAbschnitt } from './SeitenleistenAbschnitt';
import { HervorhebungsfarbeAbschnitt } from './HervorhebungsfarbeAbschnitt';
import { ErweitertAbschnitt } from './ErweitertAbschnitt';
import { WerkzeugeAbschnitt } from './WerkzeugeAbschnitt';
import { FARBWAHL_OPTIONEN } from '@/lib/einstellungen/einstellungen.index';

vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  FARBWAHL_OPTIONEN: [
    { wert: 'blau', label: 'Art. 1 Abs. 1' },
    { wert: 'rot', label: '§ 2' },
  ],
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('schützt Kategorie und Checkbox am Anzeigeort und erhält Layout, Labelklick und Änderung', async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <EinstellungenKategorieAbschnitt id="ziel" titel="Art. 1 Abs. 1">
        <EinstellungenZeile label={<TextAnzeige element="label" text="Art. 1 Abs. 1" />}>
          <EinstellungenCheckboxZeile checked={false} onChange={onChange} text="Art. 1 Abs. 1" />
        </EinstellungenZeile>
      </EinstellungenKategorieAbschnitt>,
    ),
  );
  const section = host.querySelector('section')!;
  expect(section.id).toBe('ziel');
  expect(section.firstElementChild!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  const labels = host.querySelectorAll('label');
  expect(labels[0]!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  expect(labels[1]!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  await act(async () => labels[1]!.click());
  expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
});

it('schützt Seitenleistenbeschriftungen und navigiert mit unveränderten IDs', async () => {
  const ziel = document.createElement('section');
  ziel.id = 'Art. 1';
  ziel.scrollIntoView = vi.fn();
  const kategorien = [{ id: 'Art. 1', titel: 'Art. 1 Abs. 1' }];
  // Das Sprungziel steht außerhalb des von React verwalteten Hosts.
  document.body.append(ziel);
  try {
    await act(async () =>
      root.render(
        <EinstellungenSeitenleiste
          kategorien={kategorien}
          aktiveId="Art. 1"
          fehlermeldungen={[]}
        />,
      ),
    );
    const button = host.querySelector('button')!;
    expect(button.textContent).toBe('Art.\u00a01 Abs.\u00a01');
    button.click();
    expect(ziel.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(kategorien[0]).toEqual({ id: 'Art. 1', titel: 'Art. 1 Abs. 1' });
  } finally {
    ziel.remove();
  }
});

it('zeigt Optionen als geschützten Plaintext und behält Originaldaten, Auswahl und Sperrung', async () => {
  const onAendern = vi.fn();
  await act(async () =>
    root.render(
      <FarbAuswahlDropdown id="farbe" wert="blau" onAendern={onAendern} previewVar="--akzent" />,
    ),
  );
  const select = host.querySelector('select')!;
  expect(select.options[0]!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  expect(select.options[0]!.children).toHaveLength(0);
  expect(select.value).toBe('blau');
  await act(async () => {
    select.value = 'rot';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onAendern).toHaveBeenCalledExactlyOnceWith('rot');
  expect(FARBWAHL_OPTIONEN[0]).toEqual({ wert: 'blau', label: 'Art. 1 Abs. 1' });
  await act(async () =>
    root.render(
      <FarbAuswahlDropdown
        id="farbe"
        wert="rot"
        onAendern={onAendern}
        previewVar="--akzent"
        disabled
      />,
    ),
  );
  expect(select.disabled).toBe(true);
  expect(select.value).toBe('rot');
});

it('erhält die fachlichen Labelzuordnungen und Auswahlaktionen in Allgemein', async () => {
  const farbschema = vi.fn();
  const groesse = vi.fn();
  await act(async () =>
    root.render(
      <AllgemeinAbschnitt
        farbschema="system"
        onFarbschemaAendern={farbschema}
        appAkzentfarbe="blau"
        onAppAkzentfarbeAendern={vi.fn()}
        uiGroesse="normal"
        onUiGroesseAendern={groesse}
        appUpdatesAutomatischSuchen
        onAppUpdatesAutomatischSuchenAendern={vi.fn()}
      />,
    ),
  );
  expect([...host.querySelectorAll('label')].map((label) => label.control?.id)).toEqual([
    'farbschema-select',
    'app-akzentfarbe-select',
    'ui-groesse-select',
    // Checkbox „Automatisch nach Updates suchen“ hat keine eigene ID.
    '',
  ]);
  await act(async () => {
    const schema = host.querySelector<HTMLSelectElement>('#farbschema-select')!;
    schema.value = 'dunkel';
    schema.dispatchEvent(new Event('change', { bubbles: true }));
    const ui = host.querySelector<HTMLSelectElement>('#ui-groesse-select')!;
    ui.value = 'gross';
    ui.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(farbschema).toHaveBeenCalledExactlyOnceWith('dunkel');
  expect(groesse).toHaveBeenCalledExactlyOnceWith('gross');
  expect([...host.querySelectorAll('option')].every((option) => option.children.length === 0)).toBe(
    true,
  );
});

it('schützt die vollständige Zitat-Erklärung einschließlich römischer Kurzform und erhält Checkboxaktionen', async () => {
  const roemisch = vi.fn();
  const props = {
    abkuerzungenAktiv: true,
    onAbkuerzungenAktivAendern: vi.fn(),
    ohnePunkt: false,
    onOhnePunktAendern: vi.fn(),
    roemischeAbsaetze: false,
    onRoemischeAbsaetzeAendern: roemisch,
  };
  await act(async () => root.render(<ZitatKopierenAbschnitt {...props} />));
  const erklaerung = host.lastElementChild!;
  expect(erklaerung.textContent).toBe(
    'Z.\u00a0B. „§\u00a0433 Abs.\u00a01 S.\u00a01" → „§\u00a0433 I\u00a01".',
  );
  const gruppen = [...erklaerung.querySelectorAll('span')]
    .filter((span) => span.style.whiteSpace === 'nowrap')
    .map((span) => span.textContent);
  expect(gruppen).toEqual(
    expect.arrayContaining(['„§\u00a0433', 'Abs.\u00a01', 'S.\u00a01"', 'I\u00a01".']),
  );
  const labels = host.querySelectorAll('label');
  expect(labels[2]!.textContent).toBe('Absätze als römische Zahlen (Abs.\u00a01 → I)');
  await act(async () => labels[2]!.click());
  expect(roemisch).toHaveBeenCalledExactlyOnceWith(true);
  expect(props.roemischeAbsaetze).toBe(false);
  await act(async () =>
    root.render(<ZitatKopierenAbschnitt {...props} abkuerzungenAktiv={false} />),
  );
  expect(host.querySelectorAll('input')).toHaveLength(1);
});

it('erhält Seitenleistenwerte und Markierungsfarbe samt geschützter Art.-Anzeige und Bedienung', async () => {
  const schrift = vi.fn();
  const hinweise = vi.fn();
  const farbe = vi.fn();
  await act(async () =>
    root.render(
      <>
        <SeitenleistenAbschnitt
          leistenTauschen={false}
          onLeistenTauschenAendern={vi.fn()}
          leistenSchriftgroesse={13}
          onLeistenSchriftgroesseAendern={schrift}
          seitenleistenTastenkuerzel={true}
          onSeitenleistenTastenkuerzelAendern={hinweise}
        />
        <HervorhebungsfarbeAbschnitt
          hervorhebungsfarbe="blau"
          onHervorhebungsfarbeAendern={farbe}
        />
      </>,
    ),
  );
  const select = host.querySelector<HTMLSelectElement>('#leisten-schriftgroesse-select')!;
  expect(select.value).toBe('13');
  expect([...select.options].map((option) => [option.value, option.textContent])).toEqual(
    [10, 11, 12, 13, 14, 16, 18].map((wert) => [String(wert), `${wert} pt`]),
  );
  const markierung = host.querySelector<HTMLSelectElement>('#markierungsfarbe-select')!;
  expect(markierung.value).toBe('blau');
  expect(markierung.options[0]!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  const labels = [...host.querySelectorAll('label')];
  expect(labels.map((label) => label.control?.id)).toEqual([
    'leisten-schriftgroesse-select',
    '',
    '',
    'markierungsfarbe-select',
  ]);
  await act(async () => {
    select.value = '18';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    labels[1]!.click();
    markierung.value = 'rot';
    markierung.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(schrift).toHaveBeenCalledExactlyOnceWith(18);
  expect(hinweise).toHaveBeenCalledExactlyOnceWith(false);
  expect(farbe).toHaveBeenCalledExactlyOnceWith('rot');
});

it('erhält Gesetzestextwerte, Regleranzeige, Labelklick und gesperrte Auswahlelemente', async () => {
  const breite = vi.fn();
  const laenge = vi.fn();
  const props = {
    schriftgroesse: 17,
    onSchriftgroesseAendern: vi.fn(),
    schriftart: 'serif' as const,
    onSchriftartAendern: vi.fn(),
    zeilenabstand: 1.4,
    onZeilenabstandAendern: vi.fn(),
    satzNeuZeile: true,
    onSatzNeuZeileAendern: vi.fn(),
    blocksatz: true,
    onBlocksatzAendern: vi.fn(),
    silbentrennung: false,
    onSilbentrennungAendern: vi.fn(),
    randbreite: 'breit' as const,
    onRandbreiteAendern: breite,
    lesbareZeilenlaenge: false,
    onLesbareZeilenlaengeAendern: laenge,
    lesbareZeilenlaengeBreite: 'normal' as const,
    onLesbareZeilenlaengeBreiteAendern: vi.fn(),
    strukturKontextLeisteGroesse: 'klein' as const,
    onStrukturKontextLeisteGroesseAendern: vi.fn(),
    gesetzestextAkzentfarbe: 'blau' as const,
    onGesetzestextAkzentfarbeAendern: vi.fn(),
  };
  await act(async () => root.render(<GesetzestextAbschnitt {...props} />));
  expect(host.firstElementChild!.textContent).toBe('Schriftgröße17 pt');
  const regler = host.querySelector<HTMLInputElement>('#schriftgroesse-slider')!;
  expect([regler.value, regler.min, regler.max, regler.step]).toEqual(['17', '11', '24', '1']);
  expect([...host.querySelectorAll('select')].map((select) => select.value)).toEqual([
    'serif',
    '1.4',
    'normal',
    'breit',
    'klein',
    'blau',
  ]);
  const zeilen = host.querySelector<HTMLSelectElement>('#zeilenlaenge-select')!;
  const akzent = host.querySelector<HTMLSelectElement>('#gesetzestext-akzent-select')!;
  expect(zeilen.disabled).toBe(true);
  expect(akzent.disabled).toBe(false);
  expect(host.textContent).not.toContain('Simples Farbformat');
  expect(akzent.options[0]!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  const label = [...host.querySelectorAll('label')].find(
    (item) => item.textContent === 'Lesbare Zeilenlänge',
  )!;
  expect(label.control?.getAttribute('type')).toBe('checkbox');
  const checkboxTexte = [...host.querySelectorAll('label')]
    .filter((item) => item.control?.getAttribute('type') === 'checkbox')
    .map((item) => item.textContent);
  expect(checkboxTexte.indexOf('Neue Zeile für jeden Satz')).toBe(
    checkboxTexte.indexOf('Blocksatz') - 1,
  );
  const satzLabel = [...host.querySelectorAll('label')].find(
    (item) => item.textContent === 'Neue Zeile für jeden Satz',
  );
  expect(satzLabel?.control).toHaveProperty('checked', true);
  await act(async () => satzLabel?.click());
  expect(props.onSatzNeuZeileAendern).toHaveBeenCalledExactlyOnceWith(false);
  await act(async () => {
    label.click();
    const rand = host.querySelector<HTMLSelectElement>('#randbreite-select')!;
    rand.value = 'schmal';
    rand.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(laenge).toHaveBeenCalledExactlyOnceWith(true);
  expect(breite).toHaveBeenCalledExactlyOnceWith('schmal');
  expect(props.randbreite).toBe('breit');
  await act(async () => root.render(<GesetzestextAbschnitt {...props} lesbareZeilenlaenge />));
  expect(zeilen.disabled).toBe(false);
  expect(akzent.disabled).toBe(false);
});

it('sichert vollständige Erweitert-Erklärungen und erhält Werte, Plattformvorschau und Zurücksetzen-Sperrung', async () => {
  const importAendern = vi.fn();
  const titelleiste = vi.fn();
  const zuruecksetzen = vi.fn();
  const props = {
    euFassung: 'konsolidiert' as const,
    onEuFassungAendern: vi.fn(),
    euDurchfuehrungsaktSuche: false,
    onEuDurchfuehrungsaktSucheAendern: vi.fn(),
    minimalistischerModus: false,
    onMinimalistischerModusAendern: vi.fn(),
    nachbereitungBeiImport: 'saetze-und-verweise' as const,
    onNachbereitungBeiImportAendern: importAendern,
    istLinux: false,
    linuxTitelleistenPraeferenz: 'eigene' as const,
    onLinuxTitelleistenPraeferenzAendern: titelleiste,
    plattformfremdeUiAnzeigen: true,
    onPlattformfremdeUiAnzeigenAendern: vi.fn(),
    zuruecksetzenLaeuft: false,
    onZuruecksetzen: zuruecksetzen,
  };
  await act(async () => root.render(<ErweitertAbschnitt {...props} />));
  const gruppen = [...host.querySelectorAll('span')]
    .filter((span) => span.style.whiteSpace === 'nowrap')
    .map((span) => span.textContent);
  expect(gruppen).toEqual(expect.arrayContaining(['(z.\u00a0B.']));
  expect(gruppen.filter((text) => text === '(z.\u00a0B.')).toHaveLength(2);
  expect(host.textContent).toContain(' Auf dieser Plattform wirkungslos – nur zur Vorschau.');
  const euFassung = host.querySelector<HTMLSelectElement>('#eu-fassung-select')!;
  expect([...euFassung.options].map((option) => option.textContent)).toEqual([
    'Konsolidiert mit Erwägungsgründen',
    'Konsolidiert',
    'Originaltext',
  ]);
  expect(host.textContent).toContain(
    'Aktuellste verfügbare konsolidierte Fassung ohne Ergänzungen aus dem Originaltext.',
  );
  await act(async () => {
    euFassung.value = 'original';
    euFassung.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(props.onEuFassungAendern).toHaveBeenCalledExactlyOnceWith('original');
  await act(async () => root.render(<ErweitertAbschnitt {...props} euFassung="original" />));
  expect(host.textContent).toContain('Originaltext ohne spätere Änderungen.');
  await act(async () =>
    root.render(<ErweitertAbschnitt {...props} euFassung="konsolidiert-mit-erwaegungsgruenden" />),
  );
  expect(host.textContent).toContain(
    'Aktuellste verfügbare konsolidierte Fassung. Fehlende Erwägungsgründe werden aus dem Originaltext ergänzt.',
  );
  const select = host.querySelector<HTMLSelectElement>('#import-taggen-select')!;
  const leiste = host.querySelector<HTMLSelectElement>('#titelleiste-select')!;
  expect([select.value, leiste.value]).toEqual(['saetze-und-verweise', 'eigene']);
  expect([...host.querySelectorAll('label')].map((label) => label.control?.id)).toEqual([
    '',
    'import-taggen-select',
    'eu-fassung-select',
    '',
    '',
    'titelleiste-select',
  ]);
  const button = host.querySelector('button')!;
  await act(async () => {
    select.value = 'verweise';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    leiste.value = 'nativ';
    leiste.dispatchEvent(new Event('change', { bubbles: true }));
    button.click();
  });
  expect(importAendern).toHaveBeenCalledExactlyOnceWith('verweise');
  expect(titelleiste).toHaveBeenCalledExactlyOnceWith('nativ');
  expect(zuruecksetzen).toHaveBeenCalledTimes(1);
  expect(props.nachbereitungBeiImport).toBe('saetze-und-verweise');
  await act(async () => root.render(<ErweitertAbschnitt {...props} zuruecksetzenLaeuft />));
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe('Wird zurückgesetzt …');
  button.click();
  expect(zuruecksetzen).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(<ErweitertAbschnitt {...props} plattformfremdeUiAnzeigen={false} />),
  );
  expect(host.querySelector('#titelleiste-select')).toBeNull();
});

it.each([false, true])(
  'bindet Markierungscheckbox direkt an deaktiviert=%s und erhält die Werkzeugauswahl',
  async (deaktiviert) => {
    const intervall = vi.fn();
    const markierungen = vi.fn();
    await act(async () =>
      root.render(
        <WerkzeugeAbschnitt
          autoAktualisierungsIntervall="woechentlich"
          onAutoAktualisierungsIntervallAendern={intervall}
          markierungenDeaktiviert={deaktiviert}
          onMarkierungenDeaktiviertAendern={markierungen}
          hervorhebungsfarbe="blau"
          onHervorhebungsfarbeAendern={vi.fn()}
          leistenTauschen={false}
          onLeistenTauschenAendern={vi.fn()}
          leistenSchriftgroesse={13}
          onLeistenSchriftgroesseAendern={vi.fn()}
          seitenleistenTastenkuerzel={true}
          onSeitenleistenTastenkuerzelAendern={vi.fn()}
          zitatAbkuerzungenAktiv
          onZitatAbkuerzungenAktivAendern={vi.fn()}
          zitatOhnePunkt={false}
          onZitatOhnePunktAendern={vi.fn()}
          zitatRoemischeAbsaetze={false}
          onZitatRoemischeAbsaetzeAendern={vi.fn()}
        />,
      ),
    );
    const select = host.querySelector<HTMLSelectElement>('#auto-aktualisierung-select')!;
    expect(select.value).toBe('woechentlich');
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
      ['taeglich', 'Täglich'],
      ['woechentlich', 'Wöchentlich'],
      ['zweiwoechentlich', 'Zweiwöchentlich'],
      ['nie', 'Nie'],
    ]);
    expect(
      host.querySelector<HTMLSelectElement>('#markierungsfarbe-select')!.options[0]!.textContent,
    ).toBe('Art.\u00a01 Abs.\u00a01');
    const label = [...host.querySelectorAll('label')].find(
      (item) => item.textContent === 'Markierungen deaktivieren',
    )!;
    expect((label.control as HTMLInputElement).checked).toBe(deaktiviert);
    await act(async () => {
      select.value = 'nie';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      label.click();
    });
    expect(intervall).toHaveBeenCalledExactlyOnceWith('nie');
    expect(markierungen).toHaveBeenCalledExactlyOnceWith(!deaktiviert);
  },
);
