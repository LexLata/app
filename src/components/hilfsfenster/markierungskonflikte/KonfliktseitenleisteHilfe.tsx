// Kontrollierte Rückmeldungshilfe; Escape-Priorität bleibt im Rahmen der Konfliktseitenleiste.
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { fensterAussenPadding } from '@/lib/stil/paddingRollen';
import { erzeugeRadiusRollen } from '@/lib/stil/radiusRollen';
import { Question } from '@phosphor-icons/react';

import type { Dispatch, SetStateAction } from 'react';
export function KonfliktseitenleisteHilfe({
  allgemeineRueckmeldung,
  hilfeOffen,
  setHilfeOffen,
  textRollen,
  buttonRollen,
  abstandRollen,
  radiusRollen,
  uiFaktor,
}: {
  allgemeineRueckmeldung: boolean;
  hilfeOffen: boolean;
  setHilfeOffen: Dispatch<SetStateAction<boolean>>;
  textRollen: ReturnType<typeof useTextRollen>;
  buttonRollen: ReturnType<typeof useButtonRollen>;
  abstandRollen: ReturnType<typeof useAbstandRollen>;
  radiusRollen: ReturnType<typeof erzeugeRadiusRollen>;
  uiFaktor: number;
}) {
  return allgemeineRueckmeldung ? (
    <span
      style={{
        display: 'inline-block',
        marginLeft: abstandRollen.kompakt,
        lineHeight: 0,
        // Schriftbezogene Grundlinienkorrektur: der Kreis sitzt wie ein Großbuchstabe.
        verticalAlign: '-0.125em',
      }}
      onMouseEnter={() => setHilfeOffen(true)}
      onMouseLeave={() => setHilfeOffen(false)}
    >
      <TextAttributElement
        element="button"
        type="button"
        aria-label="Erklärung zur allgemeinen Verknüpfung"
        aria-expanded={hilfeOffen}
        aria-describedby={hilfeOffen ? 'allgemeine-verknuepfung-hilfe' : undefined}
        style={{
          ...buttonRollen.sekundaerKompakt(),
          display: 'inline-flex',
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-sekundaer)',
          fontSize: 'inherit',
          lineHeight: 1,
        }}
        onFocus={() => setHilfeOffen(true)}
        onBlur={() => setHilfeOffen(false)}
        onClick={() => setHilfeOffen(true)}
      >
        <Question size="1em" weight="regular" aria-hidden="true" />
      </TextAttributElement>
      {!!hilfeOffen && (
        <TextAnzeige
          id="allgemeine-verknuepfung-hilfe"
          role="tooltip"
          style={{
            ...textRollen.standardtext,
            color: 'var(--text-sekundaer)',
            display: 'block',
            position: 'absolute',
            right: 0,
            top: '100%',
            width: '100%',
            border: '1px solid var(--trenner-ebene)',
            borderRadius: radiusRollen.standard,
            // Kompakte Erklärung statt Fensterinhalt: halber Fenster-Außenrand.
            padding: fensterAussenPadding(0.5 * uiFaktor),
            boxSizing: 'border-box',
            background: 'var(--bg-panel)',
            zIndex: 1,
          }}
          text={
            'Diese Aktion aktualisiert nur Verknüpfungen von Verweisen und Kommentaren, die sich auf die gesamte Norm beziehen, sowie Verknüpfungen zu Zielnormen, die in den Gesetzen auf dem Gerät vorhanden sind. Konflikte an spezifischen Textstellen müssen einzeln geprüft werden.'
          }
        />
      )}
    </span>
  ) : null;
}
