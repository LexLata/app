/**
 * Schema für "nur die Indexdatei eines Moduls darf von außen importiert
 * werden" – automatisch generiert statt pro Modul von Hand geschrieben.
 *
 * Für jeden Eintrag in MODULE wird eine dependency-cruiser-Regel erzeugt,
 * die erzwingt: Code außerhalb von <pfad>/** darf ausschließlich aus
 * <letztes Pfadsegment>.index.ts importieren, nie direkt aus den
 * Unterordnern/-dateien. Regelname und erwarteter Indexdatei-Name werden
 * automatisch aus dem Ordnernamen (letztes Segment von `pfad`) abgeleitet.
 *
 * Neues Modul mit dieser Grenze versehen: einfach unten einen Eintrag
 * ergänzen (Voraussetzung: <pfad>/<ordnername>.index.ts existiert bereits
 * als Fassade) – keine neue Regel von Hand schreiben.
 *
 * Bewusst nötige Direktimporte stehen separat in DIREKTIMPORTE. Für jede
 * einzelne Kante wird eine zusätzliche Regel erzeugt. So öffnet eine Ausnahme
 * weder die gesamte Quelle noch das gesamte Zielmodul.
 *
 * Die Gegenrichtung ist ebenfalls geschützt: Implementierungsdateien dürfen
 * ihre eigene Fassade nicht importieren. Testdateien dürfen die Schnittstelle
 * prüfen. Optionale relative Pfade in `zusammensetzung` benennen Dateien, von
 * denen Unterbereiche nicht abhängen dürfen (z. B. die vollständige Ansicht).
 * Optionales `attrappeVonAussen` (Grund) erlaubt allein für Attrappen in Tests
 * (scripts/automatisch/modulgrenzen-attrappen.mjs), das Interface dieses
 * Submoduls auch von außerhalb des umgebenden Moduls zu ersetzen. */
const MODULE = [
  { pfad: 'src/lib/domain/aktives-element' },
  { pfad: 'src/lib/gesetz-laden' },
  { pfad: 'src/lib/darstellung' },
  { pfad: 'src/lib/einstellungen' },
  { pfad: 'src/lib/banner' },
  { pfad: 'src/lib/domain/app/oeffnen' },
  { pfad: 'src/lib/domain/app/tab-bereithaltung' },
  { pfad: 'src/components/ziehvorschau' },
  { pfad: 'src/lib/plattform/tauri-befehle' },
  { pfad: 'src/lib/plattform/tastenkuerzel' },
  { pfad: 'src/components/textanzeige' },
  { pfad: 'src/lib/plattform/fensterkommunikation' },
  { pfad: 'src/components/hilfsfenster' },
  { pfad: 'src/components/hilfsfenster/einstellungsfenster' },
  {
    pfad: 'src/lib/plattform/menu',
  },
  {
    pfad: 'src/lib/import-export',
  },
  {
    pfad: 'src/lib/import-export/datei-import',
  },
  {
    pfad: 'src/lib/persistenz/kern',
  },
  {
    pfad: 'src/lib/persistenz/kern/dateizugriff',
    attrappeVonAussen:
      'Die Persistenz gilt als Hülle des Dateisystems; Tests außerhalb des Kerns ersetzen den Dateizugriff über dieses Interface. Gilt nur für Attrappen, nicht für Importe.',
  },
  {
    pfad: 'src/lib/persistenz/gesetz',
  },
  {
    pfad: 'src/lib/persistenz/fenster',
  },
  {
    pfad: 'src/lib/import',
  },
  {
    pfad: 'src/lib/import/basis',
  },
  { pfad: 'src/lib/import/quelldateien' },
  {
    pfad: 'src/lib/import/praefixstruktur',
  },
  {
    pfad: 'src/lib/import/importindex',
  },
  {
    pfad: 'src/lib/import/bund',
  },
  {
    pfad: 'src/lib/import/bw',
  },
  {
    pfad: 'src/lib/import/eu',
  },
  {
    pfad: 'src/lib/import/importabschluss',
  },
  {
    pfad: 'src/lib/markierungen',
  },
  {
    pfad: 'src/lib/markierungen/zitat',
  },
  {
    pfad: 'src/lib/markierungen/gemeinsam',
  },
  {
    pfad: 'src/lib/markierungen/dateiimport',
  },
  {
    pfad: 'src/lib/markierungen/markierungskonflikte',
  },
  {
    pfad: 'src/lib/markierungen/eintrag',
  },
  {
    pfad: 'src/lib/markierungen/markierungs-xml',
  },
  {
    pfad: 'src/lib/markierungen/hilfsfenster-aktionen',
  },
  { pfad: 'src/lib/domain/einfuehrung' },
  {
    pfad: 'src/lib/domain/norm',
  },
  {
    pfad: 'src/lib/domain/textpfad',
  },
  {
    pfad: 'src/components/gesetzestextansicht/auswahl',
  },
  {
    pfad: 'src/components/seitenleisten',
  },
  {
    pfad: 'src/components/gesetzestextansicht/ansichtssteuerung',
  },
  {
    pfad: 'src/components/gesetzestextansicht/ansichtssteuerung/struktur',
  },
  {
    pfad: 'src/components/gesetzestextansicht/ansichtssteuerung/scrollen',
  },
  {
    pfad: 'src/components/gesetzestextansicht/markierung',
  },
  {
    pfad: 'src/components/gesetzestextansicht/text-darstellung',
  },
  {
    pfad: 'src/components/gesetzestextansicht/baum',
  },
  {
    pfad: 'src/components/overlays',
  },
  {
    pfad: 'src/components/gesetzestextansicht',
    zusammensetzung: ['Gesetzestextansicht.tsx'],
  },
];

const DIREKTIMPORTE = [
  {
    von: 'src/test/import/dateiImportTesthilfe.ts',
    nach: 'src/lib/import-export/datei-import/gesetzDateiImport.ts',
    grund:
      'Vom Nutzer genehmigt: Einzige Testhilfe für das Einlesen des Datei-Imports (importierePfade) ohne den Overlay-Zustand des Datei-Import-Vorgangs; die App nutzt es nur über starteDateiImport. Tests außerhalb des Moduls importieren von dort.',
  },
  {
    von: 'src/components/gesetzestextansicht/baum/ueberschriftText.integration.test.tsx',
    nach: 'src/lib/import/basis/basis.index.ts',
    grund:
      'Vom Nutzer genehmigter Integrationstest: Überschrifttext durch XML-Bauer, Parser und bedienbare Anzeige prüfen, ohne die öffentliche Importfassade für Tests zu erweitern.',
  },
  {
    von: 'src/test/suchverzeichnis/oeffnenMessung.test.ts',
    nach: 'src/components/overlays/suche/VolltextSucheOverlay.helpers.ts',
    grund:
      'Der gemeinsame Messtest misst den echten Volltext-Indexaufbau; der interne Helfer wird dafür nicht Teil der öffentlichen Overlay-Fassade.',
  },
  {
    von: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.pruefung.ts',
    nach: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.ts',
    grund:
      'Der reine Kontextprüfer verwendet den benachbarten Transportvertrag ohne Aktionsfassade.',
  },
  {
    von: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.ts',
    nach: 'src/lib/markierungen/gemeinsam/markierungSpeicher.types.ts',
    grund:
      'Die transportierten Kontexttypen benötigen nur reine Markierungstypen, keine Speicheraktionen oder Undo-Abläufe.',
  },
  {
    von: 'src/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext.pruefung.ts',
    nach: 'src/lib/markierungen/gemeinsam/markierungSpeicher.types.ts',
    grund:
      'Die reine Eingangskontrolle prüft Markierungswerte ohne Abhängigkeit von Speicher- und Importabläufen.',
  },
  {
    von: 'src/lib/plattform/praefixlaufAuftrag.ts',
    nach: 'src/lib/import/importindex/importindexVertrag.types.ts',
    grund:
      'Der Auftragsvertrag verwendet die bestehende Kategorie ohne Rückkopplung über die Importfassade zum Prüflauf.',
  },
  {
    von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
    nach: 'src/components/gesetzestextansicht/text-darstellung/text-darstellung.index.ts',
    grund:
      'Der modulübergreifende Ablauftest prüft Absatzwiederholungen durch Darstellung, Markierungen und Importabschluss.',
  },
  {
    von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
    nach: 'src/lib/markierungen/markierungs-xml/markierungs-xml.index.ts',
    grund:
      'Der modulübergreifende Ablauftest prüft Absatzwiederholungen durch Darstellung, Markierungen und Importabschluss.',
  },
  {
    von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
    nach: 'src/lib/markierungen/gemeinsam/gemeinsam.index.ts',
    grund:
      'Der modulübergreifende Ablauftest prüft Absatzwiederholungen durch Darstellung, Markierungen und Importabschluss.',
  },
  {
    von: 'scripts/automatisch/absatz-wiederholung.integration.test.ts',
    nach: 'src/lib/import/importabschluss/importabschluss.index.ts',
    grund:
      'Der modulübergreifende Ablauftest prüft Absatzwiederholungen durch Darstellung, Markierungen und Importabschluss.',
  },
  {
    von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    nach: 'src/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige.ts',
    grund:
      'Die Gesamtabnahme prüft die Doku-Testdaten zu Markierungskonflikten durch Import, Prüfung und sichtbare Zeilentexte.',
  },
  {
    von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    nach: 'src/lib/markierungen/markierungs-xml/markierungs-xml.index.ts',
    grund:
      'Die Gesamtabnahme prüft die Doku-Testdaten zu Markierungskonflikten durch Import, Prüfung und sichtbare Zeilentexte.',
  },
  {
    von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    nach: 'src/lib/markierungen/gemeinsam/markierungskonfliktPruefung.ts',
    grund:
      'Die Gesamtabnahme prüft die Doku-Testdaten zu Markierungskonflikten durch Import, Prüfung und sichtbare Zeilentexte.',
  },
  {
    von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    nach: 'src/lib/import/dispatch/gesetzDateiVerarbeitung.ts',
    grund:
      'Die Gesamtabnahme prüft die Doku-Testdaten zu Markierungskonflikten durch Import, Prüfung und sichtbare Zeilentexte.',
  },
  {
    von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    nach: 'src/lib/import-export/datei-import/formatErkennung.ts',
    grund:
      'Die Gesamtabnahme prüft die Doku-Testdaten zu Markierungskonflikten durch Import, Prüfung und sichtbare Zeilentexte.',
  },
  {
    von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    nach: 'src/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers.ts',
    grund:
      'Die Gesamtabnahme prüft die Doku-Testdaten zu Markierungskonflikten durch Import, Prüfung und sichtbare Zeilentexte.',
  },
  {
    von: 'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    nach: 'src/components/hilfsfenster/markierungskonflikte/konfliktTexte.ts',
    grund:
      'Die Gesamtabnahme prüft die Doku-Testdaten zu Markierungskonflikten durch Import, Prüfung und sichtbare Zeilentexte.',
  },
  {
    von: 'scripts/werkzeuge/praefixdiagnoseAuswertung.ts',
    nach: 'src/lib/import/praefixstruktur/praefixstrukturXml.ts',
    grund: 'Das Diagnosewerkzeug liest PräfixstrukturXML; ein eigenes Modul dafür ist Nicht-Ziel.',
  },
  {
    von: 'scripts/werkzeuge/praefixdiagnoseAuswertung.test.ts',
    nach: 'src/lib/import/praefixstruktur/praefixstrukturXml.ts',
    grund: 'Das Diagnosewerkzeug liest PräfixstrukturXML; ein eigenes Modul dafür ist Nicht-Ziel.',
  },
  {
    von: 'scripts/werkzeuge/adressierbarkeit.ts',
    nach: 'src/lib/domain/norm/normAufloesung.ts',
    grund: 'Das Diagnosewerkzeug ermittelt Präfixe einer Norm und löst Ausgangsstellen auf.',
  },
  {
    von: 'scripts/werkzeuge/adressierbarkeit.ts',
    nach: 'src/lib/markierungen/gemeinsam/markierungskonfliktPruefung.ts',
    grund: 'Das Diagnosewerkzeug ermittelt Präfixe einer Norm und löst Ausgangsstellen auf.',
  },
  {
    von: 'scripts/werkzeuge/pruefeEuropaKuratiertAuswertung.ts',
    nach: 'src/lib/import/importindex/importindexVertrag.types.ts',
    grund: 'Das Prüfwerkzeug prüft die kuratierte EU-Liste und den Importindex.',
  },
  {
    von: 'scripts/werkzeuge/pruefeEuropaKuratiertAuswertung.ts',
    nach: 'src/lib/import/importindex/importindexValidierung.ts',
    grund: 'Das Prüfwerkzeug prüft die kuratierte EU-Liste und den Importindex.',
  },
  {
    von: 'scripts/werkzeuge/pruefeEuropaKuratiertAuswertung.ts',
    nach: 'src/lib/import/importindex/europaKuratiert.ts',
    grund: 'Das Prüfwerkzeug prüft die kuratierte EU-Liste und den Importindex.',
  },
  {
    von: 'scripts/werkzeuge/grundbestand.ts',
    nach: 'src/lib/import/importindex/importindexValidierung.ts',
    grund:
      'Der Grundbestand wird vor dem Entwicklerlauf mit dem Leser der App gegen den Importindex geprüft.',
  },
  {
    von: 'scripts/werkzeuge/grundbestand.ts',
    nach: 'src/lib/import/importindex/europaKuratiert.ts',
    grund:
      'Der Grundbestand wird vor dem Entwicklerlauf mit dem Leser der App gegen die kuratierte EU-Liste geprüft.',
  },
];

function regexLiteral(pfad) {
  return `^${pfad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

function regelName(pfad) {
  return pfad
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function modulRegeln(module, direktimporte = DIREKTIMPORTE) {
  return module.flatMap(({ pfad, zusammensetzung = [] }) => {
    const modul = pfad.split('/').pop();
    const passendeDirektimporte = direktimporte.filter(({ nach }) => nach.startsWith(`${pfad}/`));
    const quellen = [...new Set(passendeDirektimporte.map(({ von }) => von))];
    const basisRegel = {
      name: `nur-${modul}-index-darf-von-aussen-genutzt-werden`,
      severity: 'error',
      comment:
        `Code außerhalb von ${pfad}/** darf ausschließlich aus ${modul}.index.ts importieren, ` +
        'nie direkt aus den Unterordnern/-dateien.',
      from: { pathNot: [`^${pfad}/`, ...quellen.map(regexLiteral)] },
      to: {
        path: [`^${pfad}/`],
        pathNot: [`^${pfad}/${modul}\\.index\\.ts$`],
      },
    };

    const direktimportRegeln = quellen.map((von) => {
      const erlaubteImporte = passendeDirektimporte.filter((eintrag) => eintrag.von === von);
      return {
        name: `nur-definierte-direktimporte-${regelName(von)}-nach-${modul}`,
        severity: 'error',
        comment:
          `Für ${von} sind innerhalb von ${pfad} nur die Modulfassade und die ausdrücklich definierten Direktimporte erlaubt. ` +
          erlaubteImporte.map(({ grund }) => grund).join(' '),
        from: { path: [regexLiteral(von)] },
        to: {
          path: [`^${pfad}/`],
          pathNot: [
            `^${pfad}/${modul}\\.index\\.ts$`,
            ...erlaubteImporte.map(({ nach }) => regexLiteral(nach)),
          ],
        },
      };
    });

    const rueckimportRegeln = [
      {
        name: `kein-interner-fassadenimport-${regelName(pfad)}`,
        severity: 'error',
        comment:
          'Interne Implementierung verwendet gemeinsame Definitionen oder Submodule statt der eigenen äußeren Fassade; Schnittstellentests dürfen die Fassade prüfen.',
        from: { path: [`^${pfad}/`], pathNot: ['\\.test\\.tsx?$'] },
        to: { path: [regexLiteral(`${pfad}/${modul}.index.ts`)] },
      },
    ];
    if (zusammensetzung.length)
      rueckimportRegeln.push({
        name: `keine-rueckimporte-in-zusammensetzung-${regelName(pfad)}`,
        severity: 'error',
        comment:
          'Unterbereiche dürfen nicht von der übergeordneten Zusammensetzung abhängen; Tests der vollständigen Ansicht bleiben erlaubt.',
        from: { path: [`^${pfad}/[^/]+/`], pathNot: ['\\.test\\.tsx?$'] },
        to: { path: zusammensetzung.map((datei) => regexLiteral(`${pfad}/${datei}`)) },
      });
    return [basisRegel, ...direktimportRegeln, ...rueckimportRegeln];
  });
}

// Tatsächlich reine Bibliotheksbereiche; nur bestehende Typverträge sind offen.
const REINE_BEREICHE = '^src/lib/(domain|darstellung|utils)/';
const ABLAUFBEREICHE =
  '^src/lib/(import(?:-export)?|markierungen|banner|einstellungen|plattform|persistenz|gesetz-laden)/';
// Nur direkte Zugriffe verbieten: Quellen- und Abschlussfassaden dürfen ihre
// bestehenden internen App-Speicherabhängigkeiten behalten.
const PRAEFIXLAUF_REGELN = [
  {
    name: 'quelldateien-ohne-praefixstruktur',
    severity: 'error',
    comment: 'Die gemeinsamen Laufbausteine hängen nicht vom Präfixlauf ab.',
    from: { path: '^src/lib/import/quelldateien/' },
    to: { path: '^src/lib/import/praefixstruktur/' },
  },
  {
    name: 'praefixlauf-ohne-app-speicher',
    severity: 'error',
    comment:
      'Prüflauf und reine Quellenoperationen speichern ausschließlich über die Repository-Commands; bestehender Indexabgleich bleibt hinter seiner Fassade erlaubt.',
    from: {
      path: [
        '^src/lib/import/praefixstruktur/',
        '^src/lib/import/quelldateien/',
        '^src/lib/import/eu/(euDownload|euKonvertierung|erwaegungsgruendeEU)\\.ts$',
        '^src/lib/import/(bund|bw)/gesetzDownload(Bund|BW)\\.ts$',
      ],
      pathNot: ['\\.test\\.tsx?$'],
    },
    to: {
      path: '^src/lib/(persistenz|markierungen|einstellungen|gesetz-laden|banner)/',
      dependencyTypesNot: ['type-only'],
    },
  },
];
module.exports = {
  MODULE,
  DIREKTIMPORTE,
  modulRegeln,
  REINE_BEREICHE,
  ABLAUFBEREICHE,
  PRAEFIXLAUF_REGELN,
};
