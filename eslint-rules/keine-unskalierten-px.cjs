// eslint-rules/keine-unskalierten-px.cjs
//
// Warnt vor Roh-px-Werten in Style-relevanten Objekt-Properties (padding,
// margin, fontSize, width, height, gap, borderRadius, top/left/right/bottom,
// borderWidth, lineHeight, letterSpacing, …). Erwartet stattdessen:
// pxSkaliert()/eine benannte Rolle aus textRollen.ts, buttonRollen.ts,
// paddingRollen.ts, radiusRollen.ts oder abstandRollen.ts, eine CSS-Variable
// (var(--...)) oder eine reine Prozent-/Keyword-Angabe ('100%', 'auto',
// 'flex-start', …) – letztere sind per Definition nicht px-basiert und daher
// nicht Ziel dieser Regel.
//
// Erkennt: nackte Zahlen-Literale (fontSize: 14) UND String-Literale mit
// eingebettetem px-Muster ('12px', '2px 0', '1px solid var(--rahmen)').
// Erkennt NICHT: CallExpressions (pxSkaliert(4, faktor)), Identifier
// (Variablen/Konstanten-Referenzen), TemplateLiteral MIT Interpolation
// (`${pxSkaliert(4, faktor)}px`), den Zahlen-Literal `0` (siehe
// enthaeltRohenPxWert() unten – 0 braucht in keiner Einheit eine Skalierung).
//
// SCOPE: feuert NUR innerhalb eines echten Style-Kontexts – entweder einem
// JSX-`style`-Attribut oder einem Objekt-Literal mit `CSSProperties`-Typ-
// annotation (siehe istStyleKontext() unten). Ohne diese Einschränkung
// feuerte die Regel auch auf beliebige Nicht-Style-Objekte, die zufällig
// gleichlautende Property-Namen verwenden (z. B. PopupHoeheKonstanten in
// useVerweismarkierungUndKommentarHilfsfenster.ts, eine reine Fenstergrößen-Schätzung
// ohne jeden Bezug zu CSS) – ein Fehlalarm, kein echter unskalierter Wert.
//
// Bewusst 'warn', nicht 'error': etliche bestehende Stellen (v. a. in
// src/mobile/, dort per Datei-Override komplett ausgenommen, siehe
// eslint.config.js) nutzen noch Roh-px – siehe Rückfrage im Chat, ob z. B.
// 1px-Haarlinien-Ränder ('1px solid ...') explizit ausgenommen werden
// sollen, bevor auf 'error' hochgestuft wird.

const SKALIERTE_EIGENSCHAFTEN = new Set([
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'fontSize',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'top',
  'left',
  'right',
  'bottom',
  'borderWidth',
  'letterSpacing',
  // ACHTUNG: 'lineHeight' bewusst NICHT in dieser Liste. Bei einer bloßen
  // Zahl ist lineHeight in CSS/React ein einheitenloses Vielfaches der
  // Schriftgröße (z.B. 1.4 = 140% der Schriftgröße), keine px-Angabe – im
  // Bestand ausschließlich so verwendet (1, 1.3, 1.4, 1.5, …). lineHeight
  // wird deshalb komplett von dieser Regel ausgenommen (auch der seltene
  // Fall eines String-px-Werts wie '20px' würde hier nicht erfasst).
]);

const PX_MUSTER = /-?\d+(\.\d+)?px/;

function enthaeltRohenPxWert(node) {
  if (node.type === 'Literal') {
    if (typeof node.value === 'number') return node.value !== 0;
    if (typeof node.value === 'string') return PX_MUSTER.test(node.value);
    return false;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.some((quasi) => PX_MUSTER.test(quasi.value.raw));
  }
  return false;
}

// Erkennt sowohl den bare-Import (`CSSProperties`) als auch den qualifizierten
// Zugriff (`React.CSSProperties`, im Bestand u.a. in DateiImportOverlay.tsx,
// Tableiste.fensterButtons.tsx verwendet).
function istCSSPropertiesReferenz(typ) {
  if (!typ || typ.type !== 'TSTypeReference') return false;
  const name = typ.typeName;
  if (!name) return false;
  if (name.type === 'Identifier') return name.name === 'CSSProperties';
  if (name.type === 'TSQualifiedName') return name.right?.name === 'CSSProperties';
  return false;
}

function istCSSPropertiesTypAnnotation(typeAnnotation) {
  if (!typeAnnotation) return false;
  const typ = typeAnnotation.typeAnnotation ?? typeAnnotation;
  return istCSSPropertiesReferenz(typ);
}

// Überspringt Casts/Assertions, die den Werttyp nicht ändern
// (`{ ... } as CSSProperties`, `{ ... } satisfies CSSProperties`), um zur
// eigentlich style-relevanten Elternstelle vorzudringen. Klettert vom
// ObjectExpression AUS die Elternkette hoch, solange der jeweilige Elternteil
// selbst einer dieser transparenten Wrapper ist (Bugfix: die vorherige
// Fassung prüfte fälschlich den Typ des Startknotens selbst statt seiner
// Eltern – ein ObjectExpression ist nie selbst ein TSAsExpression, daher lief
// die Schleife nie an und `} as CSSProperties`-Casts wurden fälschlich NICHT
// als Style-Kontext erkannt, siehe Rückfrage im Chat/Review).
function entferneTransparenteHuellen(node) {
  let aktuell = node;
  while (
    aktuell.parent &&
    (aktuell.parent.type === 'TSAsExpression' ||
      aktuell.parent.type === 'TSSatisfiesExpression' ||
      aktuell.parent.type === 'TSNonNullExpression')
  ) {
    aktuell = aktuell.parent;
  }
  return aktuell;
}

function findeUmschliessendeFunktion(node) {
  let aktuell = node.parent;
  while (aktuell) {
    if (
      aktuell.type === 'FunctionDeclaration' ||
      aktuell.type === 'FunctionExpression' ||
      aktuell.type === 'ArrowFunctionExpression'
    ) {
      return aktuell;
    }
    aktuell = aktuell.parent;
  }
  return null;
}

// Entscheidet, ob das übergebene ObjectExpression tatsächlich in einem
// Style-Kontext steht (siehe SCOPE-Kommentar oben) – deckt die im Bestand
// vorkommenden Muster ab:
//  - style={{ ... }} (ggf. mit ` as CSSProperties`-Cast)
//  - const x: CSSProperties = { ... } / const x: React.CSSProperties = { ... }
//  - function f(): CSSProperties { return { ... }; }
//  - const f = (...): CSSProperties => ({ ... }) (implizites Return)
function istStyleKontext(objectExpression) {
  const huelle = entferneTransparenteHuellen(objectExpression);
  const eltern = huelle?.parent;
  if (!eltern) return false;

  if (eltern.type === 'JSXExpressionContainer') {
    const attribut = eltern.parent;
    return attribut?.type === 'JSXAttribute' && attribut.name?.name === 'style';
  }

  if (eltern.type === 'VariableDeclarator') {
    return istCSSPropertiesTypAnnotation(eltern.id?.typeAnnotation);
  }

  if (eltern.type === 'ReturnStatement') {
    const funktion = findeUmschliessendeFunktion(eltern);
    return istCSSPropertiesTypAnnotation(funktion?.returnType);
  }

  if (eltern.type === 'ArrowFunctionExpression' && eltern.body === huelle) {
    return istCSSPropertiesTypAnnotation(eltern.returnType);
  }

  return false;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Keine unskalierten px-Roh-Werte in Style-Objekten – pxSkaliert()/Rollen verwenden.',
    },
    schema: [],
    messages: {
      unskaliert:
        "Unskalierter Roh-Wert für '{{eigenschaft}}'. pxSkaliert()/eine Rolle aus textRollen.ts, " +
        'buttonRollen.ts, paddingRollen.ts, radiusRollen.ts oder abstandRollen.ts verwenden statt ' +
        'eines rohen px-Literals.',
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.computed) return;
        const eigenschaft = node.key.type === 'Identifier' ? node.key.name : node.key.value;
        if (typeof eigenschaft !== 'string' || !SKALIERTE_EIGENSCHAFTEN.has(eigenschaft)) return;
        if (!istStyleKontext(node.parent)) return;
        if (enthaeltRohenPxWert(node.value)) {
          context.report({
            node: node.value,
            messageId: 'unskaliert',
            data: { eigenschaft },
          });
        }
      },
    };
  },
};
