/**
 * dependency-cruiser Konfiguration für LexLata.
 *
 * Prüft nicht nur generische Hygiene (Zyklen, verwaiste Module), sondern
 * setzt vor allem eine konkrete, bereits im Code dokumentierte Regel technisch
 * durch: die AppData-Pfadauflösung darf ausschließlich über den Wrapper
 * appDatenZugriff.ts laufen. Allgemeine Ressourcen-/Exportpfade laufen über
 * die eingeschränkten Helfer in lib/plattform/dateipfade.ts
 * (BaseDirectory würde den Ordner nach dem App-Identifier benennen –
 * siehe Kommentarkopf in appDatenZugriff.ts).
 *
 * Lauf: npm run pruefen:modulgrenzen
 */
const {
  MODULE,
  DIREKTIMPORTE,
  modulRegeln,
  REINE_BEREICHE,
  ABLAUFBEREICHE,
  PRAEFIXLAUF_REGELN,
} = require('./modulgrenzen.cjs');

const TESTDATEI = '\\.test\\.tsx?$';
const TESTQUELLEN = [TESTDATEI, '^src/test/'];
const MOBILE_TESTQUELLE =
  '^src/components/gesetzestextansicht/ansichtssteuerung/scrollen/Gesetzestextansicht\\.weitergabe\\.test\\.tsx$';
const MOBILE_TESTZIEL = '^src/mobile/screens/GesetzTextScreen\\.tsx$';
const VERWEIS_TESTQUELLE =
  '^src/lib/markierungen/hilfsfenster-aktionen/verweismarkierungAktionen\\.zitatAufloesung\\.test\\.ts$';
const VERWEIS_TESTZIEL = '^src/hooks/tabs/useGesetzOeffnen\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'ziehvorschauseite-bleibt-eigenstaendig',
      severity: 'error',
      from: { path: '^src/components/ziehvorschau/ziehvorschau\\.(start|darstellung)\\.ts$' },
      to: { pathNot: '^src/components/ziehvorschau/ziehvorschau\\.darstellung\\.ts$' },
    },
    ...PRAEFIXLAUF_REGELN,
    {
      name: 'bannerhost-nur-im-hauptfenstereinstieg',
      severity: 'error',
      comment:
        'BannerHost gehört ausschließlich in die Hauptansichtseinstiege App.tsx und MobileApp.tsx; nur die genau benannten Anzeige- und Grenztests dürfen ihn zusätzlich importieren.',
      from: {
        pathNot: [
          '^src/App\\.tsx$',
          '^src/mobile/MobileApp\\.tsx$',
          '^src/components/hauptfenster/BannerHost\\.test\\.tsx$',
          '^src/components/hauptfenster/BannerHost\\.grenze\\.test\\.tsx$',
          '^src/components/seitenleisten/favoriten/Favoritenleiste\\.integration\\.test\\.tsx$',
          '^src/test/einfuehrung/EinfuehrungBedienungProbe\\.tsx$',
        ],
      },
      to: { path: '^src/components/hauptfenster/BannerHost\\.tsx$' },
    },
    {
      name: 'reine-bereiche-ohne-ablaufkopplung',
      severity: 'error',
      comment:
        'Domain, Darstellung und technische Helfer verwenden Ablaufbereiche ausschließlich als reine Typverträge; Integrationsprüfungen bleiben erlaubt.',
      from: { path: REINE_BEREICHE, pathNot: TESTDATEI },
      to: { path: ABLAUFBEREICHE, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'lib-importiert-nur-lib',
      severity: 'error',
      comment: 'lib darf keine Hooks oder Bedienoberflächen importieren.',
      from: { path: '^src/lib/', pathNot: TESTDATEI },
      to: { path: '^src/', pathNot: '^src/lib/' },
    },
    {
      name: 'lib-tests-importieren-nur-lib-oder-tests',
      severity: 'error',
      comment:
        'lib-Tests dürfen gemeinsame Testhelfer verwenden, aber keine beliebigen Hooks oder Oberflächen.',
      from: { path: '^src/lib/.*\\.test\\.tsx?$', pathNot: VERWEIS_TESTQUELLE },
      to: { path: '^src/', pathNot: ['^src/lib/', ...TESTQUELLEN] },
    },
    {
      name: 'verweis-integrationstest-nur-benannter-hook',
      severity: 'error',
      comment:
        'Der vorhandene Integrationstest prüft angelegte Verweise bis zum Klick. Die Ausnahme öffnet nur dessen Navigationshook.',
      from: { path: VERWEIS_TESTQUELLE },
      to: { path: '^src/', pathNot: ['^src/lib/', ...TESTQUELLEN, VERWEIS_TESTZIEL] },
    },
    {
      name: 'hooks-importieren-keine-oberflaeche',
      severity: 'error',
      comment:
        'Die Oberfläche verwendet Hooks; Hooks dürfen nicht von Oberfläche oder App-Einstiegen abhängen.',
      from: { path: '^src/hooks/' },
      to: { path: ['^src/components/', '^src/mobile/', '^src/[^/]+\\.tsx?$'] },
    },
    {
      name: 'desktop-importiert-kein-mobile',
      severity: 'error',
      comment:
        'Mobile darf gemeinsame Komponenten verwenden; die Gegenrichtung ist nur für den benannten Weitergabetest zulässig.',
      from: { path: '^src/components/', pathNot: MOBILE_TESTQUELLE },
      to: { path: '^src/mobile/' },
    },
    {
      name: 'mobile-weitergabetest-nur-benanntes-ziel',
      severity: 'error',
      comment: 'Die Testausnahme erlaubt ausschließlich die geprüfte mobile Gesetzesansicht.',
      from: { path: MOBILE_TESTQUELLE },
      to: { path: '^src/mobile/', pathNot: MOBILE_TESTZIEL },
    },
    {
      name: 'anwendung-importiert-keine-tests',
      severity: 'error',
      comment: 'Testhelfer und Testdateien gehören nicht in den Anwendungscode.',
      from: { path: '^src/', pathNot: TESTQUELLEN },
      to: { path: TESTQUELLEN },
    },
    {
      name: 'keine-dev-pakete-im-anwendungscode',
      severity: 'error',
      comment: 'Entwicklungswerkzeuge dürfen nur in Tests oder als reine Typen verwendet werden.',
      from: { path: '^src/', pathNot: TESTQUELLEN },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'keine-node-module-im-anwendungscode',
      severity: 'error',
      comment: 'Die Tauri-Weboberfläche hat keine Node-Laufzeit; Tests dürfen Node verwenden.',
      from: { path: '^src/', pathNot: TESTQUELLEN },
      to: { dependencyTypes: ['core'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'fachliche-module-ohne-react-und-tauri',
      severity: 'error',
      comment:
        'Domain, Darstellung und technische Helfer bleiben unabhängig von React und Tauri; DOM-Auswertung bleibt erlaubt.',
      from: { path: '^src/lib/(domain|darstellung|utils)/', pathNot: TESTDATEI },
      to: { path: '^node_modules/(react(?:-dom)?(?:/|$)|@tauri-apps/)' },
    },
    {
      name: 'utils-importiert-keine-domain',
      severity: 'error',
      comment:
        'Technische Helfer dürfen nicht von Fachwerten oder fachlicher Validierung abhängen.',
      from: { path: '^src/lib/utils/', pathNot: TESTDATEI },
      to: { path: '^src/lib/domain/' },
    },
    {
      name: 'domain-importiert-keine-darstellung',
      severity: 'error',
      comment: 'Domain bleibt unabhängig von der Darstellung; Tests dürfen Integrationen prüfen.',
      from: { path: '^src/lib/domain/', pathNot: TESTDATEI },
      to: { path: '^src/lib/darstellung/' },
    },
    {
      name: 'domain-importiert-persistenz-nur-als-typen',
      severity: 'error',
      comment:
        'Domain darf den Vertrag gespeicherter Daten als reine Typen verwenden; Speicherzugriffe und andere Laufzeitimporte bleiben bei den Aufrufern. Tests dürfen Integrationen prüfen.',
      from: { path: '^src/lib/domain/', pathNot: TESTDATEI },
      to: { path: '^src/lib/persistenz/', dependencyTypesNot: ['type-only'] },
    },
    {
      // Keine Ausnahmen (siehe Commit-Historie für die frühere, sehr
      // ausführlich begründete pathNot-Liste – der Cluster
      // persistenz/gesetz+markierungen+lib/import ist strukturell aufgelöst,
      // nicht mehr nur formal umgangen): jede zirkuläre Kette soll den Build
      // sofort stoppen. Reine Typimporte zählen auch innerhalb der Kette nicht.
      name: 'no-circular',
      severity: 'error',
      comment:
        'Zirkuläre Importe erschweren Nachvollziehbarkeit und können zu Init-Reihenfolge-Bugs führen.',
      from: {},
      to: {
        circular: true,
        dependencyTypesNot: ['type-only'],
        viaOnly: { dependencyTypesNot: ['type-only'] },
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Modul wird von nirgends importiert. Kann ein legitimer Einstiegspunkt sein (dann hier in path.ignore ergänzen) oder totes Gewicht.',
      from: {
        orphan: true,
        pathNot: [
          '\\.test\\.ts$',
          '\\.d\\.ts$',
          'src/main\\.tsx$',
          'src/components/ziehvorschau/ziehvorschau\\.start\\.ts$',
          'src/test/setupNode\\.ts$',
          'vite\\.config\\.ts$',
          'vitest\\.config\\.ts$',
          'scripts/.*\\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'darstellung-importiert-nicht-aus-import-pipeline',
      severity: 'error',
      comment:
        'Die Darstellungs-Pipeline (GesetzesXML → gesetzesXMLParser.ts → GesetzDarstellung) arbeitet ' +
        'ausschließlich auf dem bereits persistierten GesetzesXML und darf nichts aus der Import-Pipeline ' +
        'referenzieren – sonst ist die Trennung über die Disk-Grenze nur noch Dokumentation, keine echte Grenze mehr.',
      from: { path: ['^src/lib/darstellung'] },
      to: { path: ['^src/lib/import'] },
    },
    // "Nur Indexdatei darf von außen genutzt werden"-Regeln für alle in
    // modulgrenzen.cjs eingetragenen Module (siehe Modulliste). Bewusst nötige Direktimporte sind dort als
    // einzelne Quell-Ziel-Kanten mit ihrer Begründung definiert.
    ...modulRegeln(MODULE, DIREKTIMPORTE),
    {
      name: 'tauri-path-nur-in-pfadhelfern',
      severity: 'error',
      comment:
        'Datenordner-Auflösung bleibt in plattform/datenordner, Dateizugriffe in appDatenZugriff; Ressourcen- und Exportpfade verwenden ausschließlich die eingeschränkten Plattformhelfer.',
      from: {
        pathNot: [
          '^src/lib/persistenz/kern/dateizugriff/appDatenZugriff\\.ts$',
          '^src/lib/plattform/dateipfade\\.ts$',
          '^src/lib/plattform/datenordner\\.ts$',
        ],
      },
      to: { path: '^node_modules/@tauri-apps/api/path\\.(?:js|mjs|cjs|d\\.ts)$' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: ['^src-tauri/', '^src/test/setupNode\\.ts$'],
    },
  },
};
