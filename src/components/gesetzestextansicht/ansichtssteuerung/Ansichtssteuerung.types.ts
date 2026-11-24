// Ansichtssteuerung.types.ts
// Gemeinsamer Bedien- und Rendervertrag der Ansicht.
import type { ProfilerOnRenderCallback, RefObject } from 'react';
import type { GesetzestextansichtProps } from '@/components/gesetzestextansicht/Gesetzestextansicht.types';
import type { EinklappState } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import type { VirtuelleTextListe } from '@/components/gesetzestextansicht/Gesetzestextansicht.renderTypes';
import type { KontextEintrag } from './useStrukturKontext.helpers';
import type { ScrollMessziel } from '@/lib/utils/scrollMesslaufAnmeldung';
import type { TextMessung } from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';

/** Anfangszustand, globale Darstellungswerte und bestehende Rückmeldungen.
 * Zustandsänderungen während der Anzeige erfolgen über Bedienoperationen;
 * initiale Einklapp-/Scrollwerte werden beim Mount übernommen. */
export type AnsichtssteuerungOptionen = Pick<
  GesetzestextansichtProps,
  | 'gesetz'
  | 'initialNorm'
  | 'initialScrollIndex'
  | 'initialScrollOffsetInItem'
  | 'initialEingeklappteUeberschriften'
  | 'initialEingeklappteNormen'
  | 'initialAktivesElementId'
  | 'onInitialNormScrolled'
  | 'onScrollIndexChange'
  | 'onAktivierung'
  | 'onBedienung'
  | 'onEinklappZustandChange'
  | 'onTabBezeichnung'
  | 'onKlappstufenStatusAendern'
  | 'schriftgroesse'
  | 'schriftart'
  | 'zeilenabstand'
  | 'randInline'
  | 'maxTextSpalteBreite'
  | 'lesbareZeilenlaenge'
  | 'einfuehrungSperren'
> & {
  /** Dieselbe aufgelöste Messgrundlage wie für den Textbaum; kein Cachezugriff. */
  messung: TextMessung;
  /** Seitenleisten samt Anfangsdaten wurden in das Layout übernommen. */
  initialLayoutBereit?: boolean;
  inhaltEinzug: number;
  satzNeuZeile: boolean;
  textAlign: 'left' | 'justify';
  hyphens: 'auto' | 'none';
  lang: string | undefined;
  strukturKontextLeisteGroesse: number;
};

/** Beobachtbarer Textbaumzustand und seine Bedienaktionen; keine Setter. */
export type BaumSteuerung = Pick<
  EinklappState,
  | 'eingeklappteUeberschriften'
  | 'eingeklappteNormen'
  | 'aktivesElementId'
  | 'ueberschriftArtigeNormIds'
  | 'trennerVorIds'
  | 'unterArtikelIds'
  | 'onUeberschriftKlick'
  | 'onNormKlick'
  | 'onNormTextKlick'
>;

export interface KlappstufenStatus {
  readonly kannAufklappen: boolean;
  readonly kannZuklappen: boolean;
  aufklappen(): void;
  zuklappen(): void;
}

/** Anzeige und Messanschluss der Leiste; deren interne Polster-/Höhen-Refs
 * sind keine Aufgaben ihrer Aufrufer. */
export interface KontextLeistenModell {
  readonly pfad: readonly KontextEintrag[];
  /** Ausschließlich auftragsbezogene, unsichtbare Messdarstellung. */
  readonly messung?: {
    readonly pfad: readonly KontextEintrag[];
    bestaetigen(this: void, hoehe: number): void;
  };
  readonly effektiveHoehe: number;
  readonly hoeheAnimiert: boolean;
  readonly bereit: boolean;
  waehleEintrag(this: void, eintrag: KontextEintrag): void;
  meldeGemesseneHoehe(this: void, hoehe: number): void;
}

export interface Ansichtssteuerung {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly bereit: boolean;
  readonly baum: BaumSteuerung;
  readonly textListe: VirtuelleTextListe;
  readonly kontextLeiste: KontextLeistenModell;
  readonly klappstufen: KlappstufenStatus;
  /** true: gültiges Ziel angenommen, Ausführung kann asynchron erfolgen.
   * false: Ziel fehlt bzw. ist ohne erlaubtes Aufklappen nicht sichtbar.
   * Ein neuer Auftrag ersetzt den vorherigen einschließlich Nachkorrekturen. */
  springeZuXmlId(
    xmlId: string,
    art: 'sprung' | 'schritt',
    optionen?: { vorfahrenAufklappen?: boolean },
  ): boolean;
  /** Messziel für lexlataScrollMesslauf; nur im Entwicklungsbetrieb, sonst undefined. */
  readonly messziel?: ScrollMessziel;
  /** Profiler-Rückruf für die Bildzeit-Aufteilung des Messlaufs; nur im Entwicklungsbetrieb. */
  readonly meldeRender?: ProfilerOnRenderCallback;
}

export interface StrukturKontextLeisteProps {
  modell: KontextLeistenModell;
  schrift: number;
  skalierungsFaktor: number;
  maxBreite: number | 'none';
  randInline: number;
  minimalistischerModus: boolean;
}
