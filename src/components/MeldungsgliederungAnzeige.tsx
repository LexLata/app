// MeldungsgliederungAnzeige.tsx
// Stellt eine Meldungsgliederung (gliedereMeldungen) dar, gemeinsam für
// Importbericht und Banner. Text immer in Normalfarbe. Eine Kategorie wird nur
// genannt, wenn es mehr als eine gibt (allgemeine Sätze zählen nicht).
// Satzform: je Kategorie eine Zeile „<Kategorie>: <Sätze>“ ohne Einzug.
// Gliederungsform: Gruppenzeile „<Überschrift> (<Anzahl>):“, Namen darunter;
// eingerückt wird nur, wo Ebenen zu trennen sind (Textrolle berichtGruppe,
// zweite Ebene doppelt). Jede Zeile trägt data-zeile und data-einzug.

import type { CSSProperties } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import {
  formatiereGegliedertenNamen,
  type GegliederteGruppe,
  type GegliederteKategorie,
  type Meldungsgliederung,
} from '@/lib/domain/app/meldungsgliederung';

export interface MeldungsgliederungAnzeigeProps {
  gliederung: Meldungsgliederung;
  /** Layout-Ergänzung je Zeile (z. B. Abstand). */
  zeilenStil?: CSSProperties;
}

type Einzug = 0 | 1 | 2;
type Zeilenart = 'satz' | 'kategorie' | 'gruppe' | 'namen';

function Zeile({
  art,
  einzug,
  text,
  betont = 0,
  zeilenStil,
}: {
  art: Zeilenart;
  einzug: Einzug;
  text: string;
  /** Länge des hervorgehobenen Anfangs (Kategoriename). */
  betont?: number;
  zeilenStil?: CSSProperties;
}) {
  const textRollen = useTextRollen();
  const rolle = art === 'kategorie' ? textRollen.standardtextBetont : textRollen.standardtext;
  const stufe = textRollen.berichtGruppe.paddingLeft;
  const paddingLeft = einzug === 0 ? undefined : einzug === 1 ? stufe : `calc(2 * ${stufe})`;
  return (
    <TextAnzeige
      element="div"
      data-zeile={art}
      data-einzug={einzug}
      text={text}
      hervorhebungen={betont > 0 ? [{ von: 0, bis: betont }] : []}
      style={{
        ...(einzug === 0 ? rolle : { ...textRollen.berichtGruppe, ...rolle, paddingLeft }),
        ...zeilenStil,
      }}
    />
  );
}

function Gruppe({
  gruppe,
  einzug,
  namenEinzug,
  kategoriePraefix,
  zeilenStil,
}: {
  gruppe: GegliederteGruppe;
  einzug: Einzug;
  namenEinzug: Einzug;
  /** Bei genau einer Gruppe mehrerer Kategorien: „<Kategorie> – “ vor der Gruppe. */
  kategoriePraefix?: string;
  zeilenStil?: CSSProperties;
}) {
  const praefix = kategoriePraefix ? `${kategoriePraefix} – ` : '';
  return (
    <div data-gruppe={gruppe.schluessel}>
      <Zeile
        art="gruppe"
        einzug={einzug}
        text={`${praefix}${gruppe.ueberschrift} (${gruppe.anzahl}):`}
        betont={kategoriePraefix?.length ?? 0}
        zeilenStil={zeilenStil}
      />
      <Zeile
        art="namen"
        einzug={namenEinzug}
        text={gruppe.namen.map(formatiereGegliedertenNamen).join(', ')}
        zeilenStil={zeilenStil}
      />
    </div>
  );
}

function Gliederungskategorie({
  kategorie,
  mehrere,
  zeilenStil,
}: {
  kategorie: GegliederteKategorie;
  mehrere: boolean;
  zeilenStil?: CSSProperties;
}) {
  // Ausdrückliche Arraytypen: Die Textanzeige-Lintregel erkennt nur so die Listen.
  const gruppen: GegliederteGruppe[] = kategorie.gruppen;
  const saetze: string[] = kategorie.saetze;
  const ueberschrift = kategorie.ueberschrift;
  const einheiten = gruppen.length + saetze.length;
  // Einzige Einheit einer von mehreren Kategorien: Kategorie in derselben Zeile.
  if (mehrere && einheiten === 1) {
    const [gruppe] = gruppen;
    return gruppe ? (
      <Gruppe
        gruppe={gruppe}
        einzug={0}
        namenEinzug={1}
        kategoriePraefix={ueberschrift}
        zeilenStil={zeilenStil}
      />
    ) : (
      <Zeile
        art="satz"
        einzug={0}
        text={`${ueberschrift}: ${saetze[0]}`}
        betont={ueberschrift.length + 1}
        zeilenStil={zeilenStil}
      />
    );
  }
  // Mit Kategoriezeile stehen die Gruppen eine Ebene tiefer; die Namen sind
  // nur eingerückt, wenn mehrere Einheiten oder Kategorien zu trennen sind.
  const gruppenEinzug: Einzug = mehrere ? 1 : 0;
  const namenEinzug: Einzug = mehrere ? 2 : einheiten > 1 ? 1 : 0;
  return (
    <>
      {mehrere && <Zeile art="kategorie" einzug={0} text={ueberschrift} zeilenStil={zeilenStil} />}
      {gruppen.map((g) => (
        <Gruppe
          key={g.schluessel}
          gruppe={g}
          einzug={gruppenEinzug}
          namenEinzug={namenEinzug}
          zeilenStil={zeilenStil}
        />
      ))}
      {saetze.map((satz, i) => (
        <Zeile
          key={`satz-${i}`}
          art="satz"
          einzug={gruppenEinzug}
          text={satz}
          zeilenStil={zeilenStil}
        />
      ))}
    </>
  );
}

export function MeldungsgliederungAnzeige({
  gliederung,
  zeilenStil,
}: MeldungsgliederungAnzeigeProps) {
  const allgemein: string[] = gliederung.allgemein;
  const kategorien: GegliederteKategorie[] = gliederung.kategorien;
  const form = gliederung.form;
  const mehrere = kategorien.length > 1;
  return (
    <div data-form={form}>
      {allgemein.map((satz, i) => (
        <Zeile key={`allgemein-${i}`} art="satz" einzug={0} text={satz} zeilenStil={zeilenStil} />
      ))}
      {kategorien.map((k) => {
        const satz = [...k.gruppen.map((g) => g.satz), ...k.saetze].join(' ');
        return (
          <div key={k.schluessel} data-kategorie={k.schluessel}>
            {form === 'saetze' ? (
              <Zeile
                art="satz"
                einzug={0}
                text={mehrere ? `${k.ueberschrift}: ${satz}` : satz}
                betont={mehrere ? k.ueberschrift.length + 1 : 0}
                zeilenStil={zeilenStil}
              />
            ) : (
              <Gliederungskategorie kategorie={k} mehrere={mehrere} zeilenStil={zeilenStil} />
            )}
          </div>
        );
      })}
    </div>
  );
}
