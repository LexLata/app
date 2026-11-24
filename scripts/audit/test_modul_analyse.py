#!/usr/bin/env python3
"""
test_modul_analyse.py

Tests für die reinen Graph-/Klassifikations-Funktionen aus modul-analyse.py.
Nutzt überall synthetische, von Hand gebaute deps-Graphen (dict: Datei ->
Liste importierter Dateien) statt eines echten madge-Laufs -- die Funktionen
sind dafür bewusst so geschnitten, dass sie nur mit diesen Dicts arbeiten.

Ausführen:
  python3 -m unittest scripts/audit/test_modul_analyse.py -v
"""

import importlib.util
import sys
import unittest
from collections import defaultdict
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "modul_analyse", Path(__file__).parent / "modul-analyse.py"
)
ma = importlib.util.module_from_spec(_spec)
sys.modules["modul_analyse"] = ma
_spec.loader.exec_module(ma)


def graph(deps: dict) -> tuple:
    """Baut aus einem deps-dict (Datei -> [importierte Dateien]) die üblichen
    drei Strukturen: dateien-Set, deps-dict (vervollständigt), importers."""
    dateien = set(deps) | {d for ds in deps.values() for d in ds}
    voll_deps = {f: sorted(deps.get(f, [])) for f in dateien}
    importers = defaultdict(set)
    for f, ds in voll_deps.items():
        for d in ds:
            importers[d].add(f)
    return dateien, voll_deps, importers


class IstAhneUndIntern(unittest.TestCase):
    def test_gleicher_ordner(self):
        self.assertTrue(ma.ist_ahne("lib/persistenz", "lib/persistenz"))

    def test_echter_ober_ordner(self):
        self.assertTrue(ma.ist_ahne("lib", "lib/persistenz/fenster"))

    def test_geschwister_ordner_sind_keine_ahnen(self):
        self.assertFalse(ma.ist_ahne("lib/import/bw", "lib/import/gemeinsam"))
        self.assertFalse(ma.ist_ahne("lib/import/gemeinsam", "lib/import/bw"))

    def test_wurzel_ist_nur_ahne_von_sich_selbst(self):
        # Regression: main.tsx liegt an der Wurzel ("" als Ordner). Die Wurzel
        # darf NICHT als Ahne von jedem Unterordner gelten, sonst zählt kein
        # Import aus main.tsx je als "von außen".
        self.assertFalse(ma.ist_ahne("", "components/hilfsfenster"))
        self.assertTrue(ma.ist_ahne("", ""))

    def test_intern_ist_symmetrisch(self):
        self.assertTrue(ma.intern("lib/persistenz", "lib/persistenz/fenster"))
        self.assertTrue(ma.intern("lib/persistenz/fenster", "lib/persistenz"))
        self.assertFalse(ma.intern("lib/import/bw", "lib/import/gemeinsam"))


class BerechneInterfaces(unittest.TestCase):
    def test_externer_import_macht_interface(self):
        dateien, deps, importers = graph({
            "lib/persistenz/persistenz.index.ts": ["lib/persistenz/appDatenZugriff.ts"],
            "lib/import/parser.ts": ["lib/persistenz/persistenz.index.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertIn("lib/persistenz/persistenz.index.ts", interfaces)

    def test_nur_interner_import_macht_kein_interface(self):
        dateien, deps, importers = graph({
            "lib/persistenz/persistenz.index.ts": ["lib/persistenz/appDatenZugriff.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertNotIn("lib/persistenz/appDatenZugriff.ts", interfaces)

    def test_import_aus_unterordner_macht_kein_interface(self):
        # persistenz.index.ts (Ober-Ordner) importiert eine Datei aus einem
        # Unterordner -- das ist ein "Parent"-Import, zaehlt nicht als aussen.
        dateien, deps, importers = graph({
            "lib/persistenz/persistenz.index.ts": ["lib/persistenz/fenster/fensterSpeicher.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertNotIn("lib/persistenz/fenster/fensterSpeicher.ts", interfaces)


class BerechneErreichbarkeit(unittest.TestCase):
    def test_transitive_huelle(self):
        _, deps, _ = graph({
            "a": ["b"],
            "b": ["c"],
            "c": ["d"],
        })
        erreichbar = ma.berechne_erreichbarkeit({"a"}, deps)
        self.assertEqual(erreichbar["a"], {"b", "c", "d"})

    def test_kein_absturz_bei_zyklus(self):
        _, deps, _ = graph({"a": ["b"], "b": ["a"]})
        erreichbar = ma.berechne_erreichbarkeit({"a", "b"}, deps)
        self.assertEqual(erreichbar["a"], {"a", "b"})
        self.assertEqual(erreichbar["b"], {"a", "b"})


class BaueModule(unittest.TestCase):
    def test_einfacher_fall_ein_interface_mehrere_moduldateien(self):
        dateien, deps, importers = graph({
            "lib/x/x.index.ts": ["lib/x/helferA.ts", "lib/x/helferB.ts"],
            "aussen/nutzer.ts": ["lib/x/x.index.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        [inhalt] = [m for m in module.values() if m["interfaces"] == {"lib/x/x.index.ts"}]
        self.assertEqual(inhalt["dateien"], {"lib/x/helferA.ts", "lib/x/helferB.ts"})

    def test_zwei_interfaces_gleicher_ordner_teilen_sich_datei_werden_verschmolzen(self):
        # Nachbau des appTypes.ts / tabAktivierung.ts-Falls: zwei Interfaces
        # im selben Ordner, beide erreichen "geteilteDatei.ts" -> ein Cluster.
        dateien, deps, importers = graph({
            "lib/domain/appTypes.ts": ["lib/domain/geteilteDatei.ts"],
            "lib/domain/tabAktivierung.ts": ["lib/domain/geteilteDatei.ts"],
            "components/App.tsx": ["lib/domain/appTypes.ts"],
            "hooks/useTabs.ts": ["lib/domain/tabAktivierung.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertEqual(interfaces, {"lib/domain/appTypes.ts", "lib/domain/tabAktivierung.ts"})
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        # appTypes.ts und tabAktivierung.ts muessen im SELBEN Cluster landen,
        # und "geteilteDatei.ts" darf nur einmal auftauchen.
        treffer = [m for m in module.values() if "geteilteDatei.ts".rsplit("/", 1)[-1] in "".join(m["dateien"])]
        self.assertEqual(len(treffer), 1)
        cluster = treffer[0]
        self.assertEqual(cluster["interfaces"], {"lib/domain/appTypes.ts", "lib/domain/tabAktivierung.ts"})
        self.assertEqual(cluster["dateien"], {"lib/domain/geteilteDatei.ts"})

    def test_geteilte_datei_oberhalb_mehrerer_interfaces_wird_gefunden(self):
        # Nachbau des OverlayRahmen.tsx-Falls: eine Datei liegt EINE Ebene
        # oberhalb von zwei Interface-Dateien in verschiedenen Unterordnern
        # und wird von beiden importiert.
        dateien, deps, importers = graph({
            "components/overlays/OverlayRahmen.tsx": [],
            "components/overlays/standard/A.tsx": ["components/overlays/OverlayRahmen.tsx"],
            "components/overlays/suche/B.tsx": ["components/overlays/OverlayRahmen.tsx"],
            "main.tsx": ["components/overlays/standard/A.tsx", "components/overlays/suche/B.tsx"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertEqual(interfaces, {"components/overlays/standard/A.tsx", "components/overlays/suche/B.tsx"})
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        [cluster] = [m for m in module.values() if m["dateien"]]
        self.assertEqual(cluster["dateien"], {"components/overlays/OverlayRahmen.tsx"})
        self.assertEqual(
            cluster["interfaces"],
            {"components/overlays/standard/A.tsx", "components/overlays/suche/B.tsx"},
        )

    def test_unerreichte_datei_ohne_bezug_bleibt_unzugeordnet(self):
        # Zwei Interfaces im selben Ordner, die sich NICHTS teilen (formular
        # vs. groesse-Fall) -- eine Datei, die von keinem der beiden erreicht
        # wird, muss unzugeordnet bleiben statt zufaellig einem zugeschlagen
        # zu werden.
        dateien, deps, importers = graph({
            "components/hilfsfenster/A.tsx": ["components/hilfsfenster/nurVonA.ts"],
            "components/hilfsfenster/B.tsx": [],
            "components/hilfsfenster/verwaist.ts": [],
            "main.tsx": ["components/hilfsfenster/A.tsx", "components/hilfsfenster/B.tsx"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        self.assertIn("components/hilfsfenster/verwaist.ts", unzugeordnet)
        # nurVonA.ts darf NUR bei A.tsx landen, nicht bei B.tsx.
        cluster_von_a = [m for m in module.values() if "components/hilfsfenster/A.tsx" in m["interfaces"]][0]
        self.assertEqual(cluster_von_a["dateien"], {"components/hilfsfenster/nurVonA.ts"})

    def test_nur_intern_erreichter_kandidat_wird_degradiert(self):
        # Nachbau HTMLImporterBW.ts: HelperA.ts wird als Interface-Kandidat
        # erkannt, weil DispatchB.ts (Geschwister-Ordner) es direkt
        # importiert -- aber DispatchB.ts ist selbst Teil desselben
        # Clusters (wird von x.index.ts erreicht). Alle externen Importer
        # von HelperA.ts sind also Cluster-intern -> degradiert.
        dateien, deps, importers = graph({
            "lib/x/x.index.ts": ["lib/x/a/indexA.ts", "lib/x/b/DispatchB.ts"],
            "lib/x/a/indexA.ts": ["lib/x/a/HelperA.ts"],
            "lib/x/b/DispatchB.ts": ["lib/x/a/HelperA.ts"],
            "aussen/n.ts": ["lib/x/x.index.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertEqual(interfaces, {"lib/x/x.index.ts", "lib/x/a/HelperA.ts"})
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        [cluster] = [m for m in module.values() if m["interfaces"] or m["dateien"]]
        self.assertEqual(cluster["interfaces"], {"lib/x/x.index.ts"})
        self.assertIn("lib/x/a/HelperA.ts", cluster["dateien"])

    def test_echt_extern_erreichter_kandidat_bleibt_interface(self):
        # Nachbau lesezeichenSpeicher.ts: wird sowohl vom eigenen
        # Modul-Interface (intern, über Unterordner) ALS AUCH von einer
        # Datei komplett außerhalb des Clusters importiert -- muss trotz
        # der internen Erreichbarkeit echte Interface-Datei bleiben.
        dateien, deps, importers = graph({
            "lib/y/y.index.ts": ["lib/y/nutzerdaten/lesezeichenSpeicher.ts"],
            "aussen/hook.ts": ["lib/y/nutzerdaten/lesezeichenSpeicher.ts"],
            "aussen/haupt.ts": ["lib/y/y.index.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertEqual(interfaces, {"lib/y/y.index.ts", "lib/y/nutzerdaten/lesezeichenSpeicher.ts"})
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        [cluster] = [m for m in module.values() if m["interfaces"]]
        self.assertEqual(
            cluster["interfaces"],
            {"lib/y/y.index.ts", "lib/y/nutzerdaten/lesezeichenSpeicher.ts"},
        )

    def test_ring_ganz_ohne_externen_zugang_behaelt_flachste_interface(self):
        # Konstruierter Grenzfall: A und B (Geschwister-Ordner) importieren
        # sich nur gegenseitig UND teilen sich eine dritte, flachere Datei M
        # (die sie erst in denselben Cluster verschmilzt). Ihre einzigen
        # externen Importer sind jeweils der ANDERE von beiden -- also
        # wieder cluster-intern. Ohne Sonderfall würden BEIDE degradiert und
        # keine Interface-Datei bliebe übrig.
        dateien, deps, importers = graph({
            "lib/x/a/A.ts": ["lib/x/M.ts", "lib/x/b/B.ts"],
            "lib/x/b/B.ts": ["lib/x/M.ts", "lib/x/a/A.ts"],
            "lib/x/M.ts": [],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        self.assertEqual(interfaces, {"lib/x/a/A.ts", "lib/x/b/B.ts"})
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        [cluster] = [m for m in module.values() if m["interfaces"]]
        # A.ts und B.ts liegen gleich tief -> alphabetisch entscheidet, A gewinnt.
        self.assertEqual(cluster["interfaces"], {"lib/x/a/A.ts"})
        self.assertIn("lib/x/b/B.ts", cluster["dateien"])


class ExterneImporterUndTrennung(unittest.TestCase):
    def test_externe_importer_filtert_interne_raus(self):
        _, deps, importers = graph({
            "lib/x/a.ts": ["lib/x/b.ts"],
            "lib/y/c.ts": ["lib/x/b.ts"],
        })
        self.assertEqual(ma.externe_importer("lib/x/b.ts", importers), ["lib/y/c.ts"])

    def test_trenne_echte_interfaces_intern_vs_extern(self):
        importers = defaultdict(set, {
            "mod/a/i1.ts": {"aussen/x.ts"},   # extern, NICHT Cluster-Mitglied -> i1 bleibt
            "mod/b/i2.ts": {"mod/a/i1.ts"},   # extern (Geschwister-Ordner), ABER Cluster-Mitglied -> degradiert
        })
        mitglieder = {"mod/a/i1.ts", "mod/b/i2.ts"}
        echte, degradiert = ma.trenne_echte_interfaces(mitglieder, mitglieder, importers)
        self.assertEqual(echte, {"mod/a/i1.ts"})
        self.assertEqual(degradiert, {"mod/b/i2.ts"})


class BerechneSubmodule(unittest.TestCase):
    def test_submodul_mit_plain_dateien_wird_erkannt(self):
        modul_dateien = {"lib/x/bw/erstellung.ts", "lib/x/bw/helfer.ts"}
        modul_interfaces = {"lib/x/x.index.ts"}
        importers = defaultdict(set, {
            "lib/x/bw/erstellung.ts": {"lib/x/x.index.ts"},
            "lib/x/bw/helfer.ts": {"lib/x/bw/erstellung.ts"},
        })
        sub = ma.berechne_submodule(modul_dateien, modul_interfaces, importers)
        self.assertIn("lib/x/bw", sub)
        self.assertEqual(sub["lib/x/bw"]["interfaces"], ["lib/x/bw/erstellung.ts"])
        self.assertEqual(sub["lib/x/bw"]["dateien"], ["lib/x/bw/helfer.ts"])

    def test_ordner_nur_mit_geflaggten_dateien_bildet_kein_submodul(self):
        # Regel 3: Submodul-Interfaces ohne "normale" Geschwister-Dateien
        # bleiben schlicht Moduldateien, kein eigenes Submodul.
        modul_dateien = {"lib/x/bw/a.ts", "lib/x/bw/b.ts"}
        modul_interfaces = {"lib/x/x.index.ts"}
        importers = defaultdict(set, {
            "lib/x/bw/a.ts": {"lib/x/x.index.ts"},
            "lib/x/bw/b.ts": {"lib/x/x.index.ts"},
        })
        sub = ma.berechne_submodule(modul_dateien, modul_interfaces, importers)
        self.assertEqual(sub, {})


class GemeinsamerOrdner(unittest.TestCase):
    def test_ein_interface(self):
        self.assertEqual(ma.gemeinsamer_ordner({"lib/domain/appTypes.ts"}), "lib/domain")

    def test_gemeinsamer_praefix_ueber_unterordner(self):
        self.assertEqual(
            ma.gemeinsamer_ordner({
                "components/overlays/standard/A.tsx",
                "components/overlays/suche/B.tsx",
            }),
            "components/overlays",
        )

    def test_beruecksichtigt_auch_moduldateien_nicht_nur_interfaces(self):
        # Regression: eine gemeinsam genutzte Moduldatei kann flacher liegen
        # als alle Interfaces des Clusters (OverlayRahmen-Fall) -- der
        # gemeinsame Ordner muss dann diese flachere Datei mit einschließen.
        self.assertEqual(
            ma.gemeinsamer_ordner({
                "components/overlays/standard/A.tsx",  # Interface
                "components/overlays/OverlayRahmen.tsx",  # Moduldatei, flacher
            }),
            "components/overlays",
        )

    def test_kein_gemeinsamer_praefix(self):
        self.assertEqual(ma.gemeinsamer_ordner({"lib/domain/a.ts", "hooks/b.ts"}), "")


class PruefeOrdnerPraefixUndKuerzung(unittest.TestCase):
    def test_korrekter_cluster_meldet_keinen_fehler(self):
        module = {
            "c1": {
                "interfaces": {"lib/x/x.index.ts"},
                "dateien": {"lib/x/helfer.ts", "lib/x/bw/erstellung.ts"},
            }
        }
        self.assertEqual(ma.pruefe_ordner_praefix(module), [])

    def test_disjunkter_cluster_ohne_gemeinsamen_ordner_ist_kein_fehler(self):
        # gemeinsamer_ordner() berechnet den Ordner IMMER aus genau denselben
        # Dateien, gegen die anschließend geprüft wird -- ein Auseinanderlaufen
        # ist dadurch strukturell ausgeschlossen (die Prüfung ist also ein
        # Sicherheitsnetz für künftige Refactorings, nicht für den Ist-Stand).
        # Fall ohne jeden gemeinsamen Ordner (ordner == "") darf trotzdem
        # keinen Fehler melden.
        module = {"c1": {"interfaces": {"a/x.ts", "b/y.ts"}, "dateien": set()}}
        self.assertEqual(ma.pruefe_ordner_praefix(module), [])

    def test_kurz_kuerzt_den_praefix(self):
        self.assertEqual(ma.kurz("lib/import/bw/a.ts", "lib/import"), "bw/a.ts")
        self.assertEqual(ma.kurz("lib/import/a.ts", "lib/import"), "a.ts")
        self.assertEqual(ma.kurz("a.ts", ""), "a.ts")

    def test_basisname(self):
        self.assertEqual(ma.basisname("lib/import/gemeinsam/x.ts"), "x.ts")
        self.assertEqual(ma.basisname("x.ts"), "x.ts")

    def test_submodul_dateien_liegen_direkt_im_submodul_ordner(self):
        # berechne_submodule gruppiert per dirname(f) -- das garantiert per
        # Konstruktion, dass alle Dateien eines Submoduls direkt in dessen
        # Ordner liegen (nicht tiefer verschachtelt). pruefe_submodul_ordner
        # ist das Sicherheitsnetz dafür, ähnlich wie bei pruefe_ordner_praefix.
        module = {
            "c1": {
                "interfaces": {"lib/x/x.index.ts"},
                "dateien": {"lib/x/bw/erstellung.ts", "lib/x/bw/helfer.ts"},
            }
        }
        importers = defaultdict(set, {
            "lib/x/bw/erstellung.ts": {"lib/x/x.index.ts"},
            "lib/x/bw/helfer.ts": {"lib/x/bw/erstellung.ts"},
        })
        self.assertEqual(ma.pruefe_submodul_ordner(module, importers), [])


class PruefeEindeutigkeit(unittest.TestCase):
    def test_korrekte_zuordnung_meldet_keinen_fehler(self):
        dateien, deps, importers = graph({
            "lib/x/x.index.ts": ["lib/x/helfer.ts"],
            "aussen/n.ts": ["lib/x/x.index.ts"],
        })
        interfaces = ma.berechne_interfaces(dateien, importers)
        module, unzugeordnet = ma.baue_module(dateien, deps, interfaces, importers)
        self.assertEqual(ma.pruefe_eindeutigkeit(dateien, module, unzugeordnet), [])

    def test_erkennt_doppelt_vorkommende_datei(self):
        module = {
            "c1": {"interfaces": {"i1"}, "dateien": {"geteilt.ts"}},
            "c2": {"interfaces": {"i2"}, "dateien": {"geteilt.ts"}},
        }
        fehler = ma.pruefe_eindeutigkeit({"i1", "i2", "geteilt.ts"}, module, [])
        self.assertTrue(any("geteilt.ts" in f for f in fehler))

    def test_erkennt_fehlende_datei(self):
        module = {"c1": {"interfaces": {"i1"}, "dateien": set()}}
        fehler = ma.pruefe_eindeutigkeit({"i1", "vergessen.ts"}, module, [])
        self.assertTrue(any("vergessen.ts" in f for f in fehler))


if __name__ == "__main__":
    unittest.main()
