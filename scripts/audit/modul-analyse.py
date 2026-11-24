#!/usr/bin/env python3
"""
modul-analyse.py

Analysiert den aktuellen Stand von "Deep Modules nach Ousterhout" im Projekt,
basierend auf dem tatsächlichen Import-Graphen (via madge), nicht auf einer
formalen Modul-Definition. Die Regeln in Kurzform (Details unten je Schritt):

SCHRITT 1 -- Kandidaten für Interface-Dateien (berechne_interfaces):
  Eine Datei ist Interface-KANDIDAT, wenn mindestens ein Importer einen
  Ordner hat, der NICHT in Ahnen/Nachfahren-Beziehung zu ihrem eigenen
  Ordner steht (also: weder gleicher Ordner, noch Unter-, noch Ober-Ordner).
  Das ist die reine, lokale "von außen"-Prüfung aus dem Chat -- sie schaut
  nur auf EINEN Import auf einmal, noch nicht auf die Modulgrenzen.
  Sonderfall Projektwurzel: eine Datei direkt in --root (z.B. main.tsx,
  Ordner == "") gilt NUR als Ahne von sich selbst, nicht von jedem
  Unterordner -- sonst würde main.tsx nie "von außen" importieren.

SCHRITT 2 -- Cluster bilden (Union-Find, in baue_module):
  Für jede Datei M werden ALLE Interface-Kandidaten gesucht, die M über
  eine (beliebig lange) Importkette erreichen UND deren Ordner mit dem
  von M in Ahnen/Nachfahren-Beziehung steht. Erreichen ≥2 Kandidaten
  dieselbe Datei (auch wenn einer von beiden M selbst ist, siehe unten),
  werden sie zu einem Cluster verschmolzen. Das deckt zwei Fälle ab:
    (a) zwei Interface-Kandidaten im selben Ordner, die beide dieselbe
        dritte Datei importieren (z.B. appTypes.ts und tabAktivierung.ts
        teilen sich eine Hilfsdatei in lib/domain),
    (b) eine "gemeinsame" Datei OBERHALB von mehreren Interface-Kandidaten,
        die von mehreren von ihnen importiert wird (z.B. eine Datei in
        components/overlays/, importiert von mehreren Interfaces in
        components/overlays/standard/ UND .../suche/).
  Ist M selbst ein Interface-Kandidat, wird es zusätzlich mit den
  Kandidaten vereinigt, die es erreichen (sonst würde z.B. eine Datei B,
  die nur von genau einem anderen Kandidaten A importiert wird, fälschlich
  ein eigener Cluster bleiben statt mit A zu verschmelzen).
  Jede Datei gehört danach zu GENAU EINEM Cluster (siehe
  pruefe_eindeutigkeit als Laufzeit-Absicherung dafür).

SCHRITT 3 -- Echte Interfaces vs. degradierte Kandidaten (trenne_echte_interfaces):
  Ein Cluster kann mehrere Interface-Kandidaten enthalten, die sich
  gegenseitig erreichen (z.B. weil eine Datei aus lib/import/gemeinsam
  direkt von lib/import/bw importiert wird, obwohl beide sowieso zum
  selben lib/import-Cluster gehören). Damit nur "echte" öffentliche
  Eintrittspunkte als Interface-Datei(en) erscheinen: ein Kandidat bleibt
  nur dann Interface-Datei, wenn MINDESTENS EINER seiner externen Importer
  (aus Schritt 1) selbst KEIN Mitglied desselben Clusters ist -- er also
  tatsächlich von außerhalb des ganzen Clusters genutzt wird. Sind ALLE
  seine externen Importer selbst Cluster-Mitglieder, war die "Außen"-
  Erkennung nur ein interner Quer-Import; der Kandidat wird zur normalen
  Moduldatei degradiert. Beispiel: lib/import/bw/HTMLImporterBW.ts wird
  nur von lib/import/gemeinsam/*-Dateien importiert (beides derselbe
  Cluster) -> degradiert. lib/persistenz/nutzerdaten/lesezeichenSpeicher.ts
  wird zusätzlich von hooks/useLesezeichenUndFavoriten.ts importiert (nicht
  Teil des Clusters) -> bleibt echte Interface-Datei. Sonderfall: würde das
  ALLE Interface-Kandidaten eines Clusters degradieren (reiner Ring ganz
  ohne echten Außenzugang), bleibt die mit dem flachsten Ordner stehen.

SCHRITT 4 -- Submodule (berechne_submodule):
  Innerhalb eines Moduls: eine Moduldatei, die von einer Datei aus einem
  ECHTEN Ober-Ordner importiert wird (liegt selbst tiefer), ist ein
  Submodul-Interface-KANDIDAT für ihren Ordner. Liegen in diesem Ordner
  AUCH "normale" Moduldateien (nicht selbst Kandidat), bildet der Ordner
  ein echtes Submodul. Sind ALLE Dateien des Ordners Kandidaten (keine
  normale Moduldatei übrig), bleiben sie schlicht normale Moduldateien
  des übergeordneten Moduls (kein eigenes Submodul).

Datenquelle: `npx madge --json` (wie in architektur-analyse.py), das bereits
tsconfig-Pfad-Aliase (@/*) auflöst und sowohl statische als auch dynamische
(`await import(...)`) Importe erfasst. Test-Dateien (*.test.ts) werden
komplett aus der Analyse ausgeschlossen.

Wichtig: der Import-Graph wird IMMER über das gesamte --root-Verzeichnis
berechnet (Fan-in muss global stimmen), --paths schränkt nur ein, welche
Dateien am Ende in der Ausgabe auftauchen.

Laufzeit-Selbstprüfungen (siehe main()): pruefe_eindeutigkeit (jede Datei
kommt genau einmal in der Ausgabe vor), pruefe_ordner_praefix (der
angezeigte "gemeinsame Ordner" eines Moduls ist tatsächlich ein Präfix
aller seiner Dateien), pruefe_submodul_ordner (Submodul-Dateien liegen
tatsächlich direkt im ausgewiesenen Submodul-Ordner). Bricht mit Exit-Code
2 ab, falls eine dieser Invarianten verletzt ist.

Benutzung (im Projekt-Root, wo tsconfig.json liegt):
  python3 scripts/audit/modul-analyse.py
      -- Standard: schreibt nach .reports/modul-analyse.txt, ohne die
         "importiert: ..."-Zeilen (das ist, was `npm run audit` aufruft).
  python3 scripts/audit/modul-analyse.py --paths src/lib/import src/lib/markierungen
  python3 scripts/audit/modul-analyse.py --out modul-analyse.txt
  python3 scripts/audit/modul-analyse.py --mit-importen
"""

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "werkzeuge"))
from _madge_helfer import run_madge_json  # noqa: E402

TEST_RE = re.compile(r"\.test\.tsx?$")


def ist_testdatei(pfad: str) -> bool:
    return bool(TEST_RE.search(pfad))


def dirname(pfad: str) -> str:
    idx = pfad.rfind("/")
    return pfad[:idx] if idx != -1 else ""


def dir_teile(d: str) -> tuple:
    return tuple(d.split("/")) if d else ()


def ist_ahne(a: str, b: str) -> bool:
    """a ist der gleiche Ordner wie b, oder ein (echter) Ober-Ordner von b.
    Sonderfall: die Projektwurzel (a == "", z.B. Dateien wie main.tsx direkt
    in src/) gilt NUR als Ahne ihrer selbst, nicht als Ahne von jedem
    Unterordner -- sonst würde jeder Import direkt aus main.tsx nie als
    "von außen" zählen."""
    if a == "":
        return b == ""
    ta, tb = dir_teile(a), dir_teile(b)
    return ta == tb[: len(ta)]


def intern(a: str, b: str) -> bool:
    """Ordner a und b stehen in Ahnen/Nachfahren-Beziehung (inkl. Gleichheit)
    -> Import gilt NICHT als 'von außen'."""
    return ist_ahne(a, b) or ist_ahne(b, a)


def lade_graph(root: str, extensions: str, ts_config: str):
    roh = run_madge_json(root, extensions, ts_config)
    dateien = {f for f in roh if not ist_testdatei(f)}
    deps = {}
    for f in dateien:
        deps[f] = sorted({d for d in roh.get(f, []) if d in dateien and d != f})
    importers = defaultdict(set)
    for f, ds in deps.items():
        for d in ds:
            importers[d].add(f)
    return dateien, deps, importers


def externe_importer(f: str, importers: dict) -> list:
    """Alle Importer von f, deren Ordner NICHT in Ahnen/Nachfahren-Beziehung
    zu f's Ordner steht -- die Importe "von außen" im Sinn der Kern-Regel."""
    fd = dirname(f)
    return [imp for imp in importers.get(f, ()) if not intern(fd, dirname(imp))]


def berechne_interfaces(dateien, importers):
    return {f for f in dateien if externe_importer(f, importers)}


def berechne_erreichbarkeit(interfaces: set, deps: dict) -> dict:
    """Für jede Interface-Datei: welche Dateien erreicht sie über eine
    (beliebig lange) Importkette (Vorwärts-BFS über deps)."""
    erreichbar = {}
    for i in interfaces:
        besucht = set()
        stack = list(deps.get(i, ()))
        while stack:
            x = stack.pop()
            if x not in besucht:
                besucht.add(x)
                stack.extend(deps.get(x, ()))
        erreichbar[i] = besucht
    return erreichbar


class UnionFind:
    """Einfache Union-Find-Struktur (Pfadkompression, ohne Rang -- die
    Datenmengen hier sind klein genug, dass das nicht ins Gewicht fällt)."""

    def __init__(self):
        self.eltern = {}

    def find(self, x):
        self.eltern.setdefault(x, x)
        wurzel = x
        while self.eltern[wurzel] != wurzel:
            wurzel = self.eltern[wurzel]
        while self.eltern[x] != wurzel:
            self.eltern[x], x = wurzel, self.eltern[x]
        return wurzel

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.eltern[ra] = rb


def baue_module(dateien, deps, interfaces, importers):
    erreichbar = berechne_erreichbarkeit(interfaces, deps)

    uf = UnionFind()
    for i in interfaces:
        uf.find(i)

    # Für jede Datei: welche Interface-Dateien (egal ob flacher, gleich oder
    # tiefer im Ordnerbaum) erreichen sie über eine Importkette? Reicht mehr
    # als eine, werden diese Interfaces zu einem Cluster verschmolzen.
    erreicht_von = {}
    for f in dateien:
        fd = dirname(f)
        treffer = sorted(
            i for i in interfaces
            if i != f and intern(fd, dirname(i)) and f in erreichbar.get(i, ())
        )
        if treffer:
            erreicht_von[f] = treffer
            # Verschmelzen: alle reichenden Interfaces untereinander UND,
            # falls f selbst auch eine Interface-Datei ist, auch f selbst
            # mit ihnen (sonst bleibt z.B. B.ts, das nur von genau einer
            # anderen Interface-Datei A.ts erreicht wird, faelschlich ein
            # eigener Cluster statt mit A.ts zu verschmelzen).
            zu_vereinen = treffer + ([f] if f in interfaces else [])
            for andere in zu_vereinen[1:]:
                uf.union(zu_vereinen[0], andere)

    module = defaultdict(lambda: {"interfaces": set(), "dateien": set()})
    unzugeordnet = []

    for f in dateien:
        if f in interfaces:
            module[uf.find(f)]["interfaces"].add(f)
        elif f in erreicht_von:
            module[uf.find(erreicht_von[f][0])]["dateien"].add(f)
        else:
            unzugeordnet.append(f)

    # Innerhalb eines Clusters: eine Interface-Datei, deren SÄMTLICHE
    # externen Importer selbst Mitglieder DESSELBEN Clusters sind, ist nicht
    # wirklich von außen genutzt -- ihre "Außen"-Erkennung kam nur durch
    # einen Quer-Import innerhalb des Clusters zustande (z.B.
    # lib/import/bw/HTMLImporterBW.ts wird nur von lib/import/gemeinsam/*
    # importiert -- beides Teil desselben lib/import-Clusters). Sie wird zur
    # normalen Moduldatei degradiert. Hat sie dagegen MINDESTENS einen
    # externen Importer AUSSERHALB des Clusters (z.B.
    # lib/persistenz/nutzerdaten/lesezeichenSpeicher.ts wird zusätzlich von
    # hooks/useLesezeichenUndFavoriten.ts importiert), bleibt sie echte
    # Interface-Datei -- unabhängig davon, ob sie zusätzlich auch von einer
    # anderen Interface-Datei desselben Clusters erreicht wird.
    for inhalt in module.values():
        mitglieder = inhalt["interfaces"] | inhalt["dateien"]
        echte, degradiert = trenne_echte_interfaces(inhalt["interfaces"], mitglieder, importers)
        inhalt["interfaces"] = echte
        inhalt["dateien"] |= degradiert

    return module, unzugeordnet


def trenne_echte_interfaces(cluster_interfaces: set, cluster_mitglieder: set, importers: dict) -> tuple:
    """Trennt die Interface-Dateien eines Clusters in "echte" Eintrittspunkte
    (mindestens ein externer Importer LIEGT AUSSERHALB des Clusters) und
    "degradierte" (alle externen Importer sind selbst Cluster-Mitglieder --
    nur ein interner Quer-Import, kein echter zweiter Eingang). Bei einem
    reinen Ring, in dem für jede Interface-Datei sämtliche externen Importer
    intern sind, bleibt die mit dem flachsten Ordner als Interface stehen
    (sonst würde am Ende gar keine übrig bleiben)."""
    degradiert = set()
    for i in cluster_interfaces:
        ext = externe_importer(i, importers)
        if ext and all(imp in cluster_mitglieder for imp in ext):
            degradiert.add(i)
    echte = cluster_interfaces - degradiert
    if not echte and cluster_interfaces:
        ueberlebender = min(cluster_interfaces, key=lambda f: (len(dir_teile(dirname(f))), f))
        echte = {ueberlebender}
        degradiert = cluster_interfaces - echte
    return echte, degradiert


def berechne_submodule(modul_dateien: set, modul_interfaces: set, importers: dict):
    """Liefert dict: Ordner -> {'interfaces': [...], 'dateien': [...]} für
    jeden Ordner innerhalb des Moduls, der ECHTE Submodule bildet (d.h. dort
    liegen sowohl von einem Ober-Ordner importierte Dateien als auch
    "normale" Moduldateien). Reine Interface-only-Ordner (Regel 3) werden
    nicht als Submodul ausgegeben; ihre Dateien bleiben normale Moduldateien
    des übergeordneten Moduls."""
    scope = modul_dateien | modul_interfaces
    flags = {}
    for f in modul_dateien:
        fd = dirname(f)
        flag = False
        for imp in importers.get(f, ()):
            if imp in scope and imp != f and ist_ahne(dirname(imp), fd) and dirname(imp) != fd:
                flag = True
                break
        flags[f] = flag

    by_dir = defaultdict(list)
    for f in modul_dateien:
        by_dir[dirname(f)].append(f)

    submodule = {}
    for d, fs in by_dir.items():
        geflaggt = sorted(f for f in fs if flags[f])
        ungeflaggt = sorted(f for f in fs if not flags[f])
        if geflaggt and ungeflaggt:
            submodule[d] = {"interfaces": geflaggt, "dateien": ungeflaggt}
    return submodule


def pruefe_eindeutigkeit(dateien: set, module: dict, unzugeordnet: list) -> list:
    """Sicherheitsnetz: jede Datei aus `dateien` muss danach in GENAU einer
    Kategorie auftauchen (Interface einer Gruppe, Moduldatei einer Gruppe,
    oder unzugeordnet) -- nie in keiner, nie in mehreren. Gibt eine Liste
    von Fehlermeldungen zurück (leer = alles ok)."""
    vorkommen = defaultdict(int)
    for inhalt in module.values():
        for f in inhalt["interfaces"] | inhalt["dateien"]:
            vorkommen[f] += 1
    for f in unzugeordnet:
        vorkommen[f] += 1

    fehler = []
    for f in dateien:
        n = vorkommen.get(f, 0)
        if n != 1:
            fehler.append(f"{f} kommt {n}x vor (erwartet: genau 1x)")
    # Zusätzlich: gibt es Einträge in vorkommen, die gar nicht in `dateien` sind?
    for f in vorkommen:
        if f not in dateien:
            fehler.append(f"{f} taucht in der Ausgabe auf, ist aber nicht in `dateien`")
    return fehler


def pruefe_ordner_praefix(module: dict) -> list:
    """Sicherheitsnetz für die Kürzung der Dateipfade in der Ausgabe: jede
    Datei eines Clusters muss tatsächlich unterhalb (oder exakt in) dessen
    ausgewiesenem 'gemeinsamen Ordner' liegen -- sonst würde das Kürzen der
    Pfade in der Anzeige Informationen verschlucken oder falsche Pfade
    erzeugen."""
    fehler = []
    for inhalt in module.values():
        alle = inhalt["interfaces"] | inhalt["dateien"]
        ordner = gemeinsamer_ordner(alle)
        for f in alle:
            if ordner and not (f == ordner or f.startswith(ordner + "/")):
                fehler.append(f"{f} liegt nicht unter dem ausgewiesenen Ordner '{ordner}'")
    return fehler


def gemeinsamer_ordner(dateipfade) -> str:
    """Größter gemeinsamer Ordner-Nenner über ALLE Dateien eines Clusters
    (Interface- UND Moduldateien) -- nicht nur die Interface-Dateien, sonst
    kann eine Moduldatei flacher liegen als der ausgewiesene Ordner (z.B.
    eine gemeinsam genutzte Datei eine Ebene über allen Interfaces)."""
    ordner = {dirname(f) for f in dateipfade}
    if len(ordner) == 1:
        return next(iter(ordner))
    teile_liste = [dir_teile(o) for o in ordner]
    gemeinsam = []
    for ebene in zip(*teile_liste):
        if len(set(ebene)) == 1:
            gemeinsam.append(ebene[0])
        else:
            break
    return "/".join(gemeinsam) if gemeinsam else ""


def kurz(pfad: str, ordner: str) -> str:
    """Kürzt einen Dateipfad um den (per pruefe_ordner_praefix abgesicherten)
    gemeinsamen Ordner-Präfix, für die Anzeige innerhalb eines Modul-Blocks."""
    if not ordner:
        return pfad
    if pfad == ordner:
        return "."
    return pfad[len(ordner) + 1:]


def basisname(pfad: str) -> str:
    idx = pfad.rfind("/")
    return pfad[idx + 1:] if idx != -1 else pfad


def pruefe_submodul_ordner(module: dict, importers: dict) -> list:
    """Sicherheitsnetz: alle Dateien eines Submoduls müssen tatsächlich
    direkt in dessen Ordner liegen (durch berechne_submodule per
    Gruppierung nach dirname() so konstruiert) -- sonst dürfte der
    Ordner-Präfix in der Anzeige nicht einfach auf den Basisnamen gekürzt
    werden."""
    fehler = []
    for inhalt in module.values():
        submodule = berechne_submodule(inhalt["dateien"], inhalt["interfaces"], importers)
        for d, sub in submodule.items():
            for f in sub["interfaces"] + sub["dateien"]:
                if dirname(f) != d:
                    fehler.append(f"{f} liegt nicht direkt in Submodul-Ordner '{d}'")
    return fehler


def render(module: dict, deps: dict, unzugeordnet: list, importers: dict, scope_prefixe, mit_importen: bool):
    def in_scope(pfad):
        if not scope_prefixe:
            return True
        return any(pfad == p or pfad.startswith(p.rstrip("/") + "/") for p in scope_prefixe)

    def zeige_importe(zeilen, pfad, einrueckung):
        if not mit_importen:
            return
        for d in deps.get(pfad, ()):
            zeilen.append(f"{einrueckung}importiert: {d}")

    zeilen = []

    # Cluster, die im Scope sichtbar sind, nach ihrem (gemeinsamen) Ordner
    # gruppieren -- so bekommt jeder Ordner nur EINE dicke Trennlinie, auch
    # wenn mehrere unabhängige Cluster darin liegen (z.B. viele einzelne
    # components/overlays/standard/*.tsx).
    sichtbare_cluster = []
    for wurzel, inhalt in module.items():
        alle_dateien = inhalt["dateien"] | inhalt["interfaces"]
        if any(in_scope(f) for f in alle_dateien):
            sichtbare_cluster.append((gemeinsamer_ordner(alle_dateien), inhalt))

    nach_ordner = defaultdict(list)
    for ordner, inhalt in sichtbare_cluster:
        nach_ordner[ordner].append(inhalt)

    for ordner in sorted(nach_ordner):
        cluster_liste = sorted(
            nach_ordner[ordner], key=lambda c: sorted(c["interfaces"])[0]
        )
        # Nur Cluster mit mindestens einer echten Moduldatei sind "echte"
        # Module (verdienen einen eigenen MODUL:-Block). Cluster ohne
        # Moduldateien -- egal ob 1 Interface oder mehrere, die sich nur
        # gegenseitig referenzieren -- sind keine Modulstruktur im engeren
        # Sinn und werden als flache Liste "Einzeldateien" zusammengefasst.
        echte_module = [c for c in cluster_liste if c["dateien"]]
        einzeldatei_cluster = [c for c in cluster_liste if not c["dateien"]]

        zeilen.append("#" * 78)
        zeilen.append(f"  ORDNER: {ordner or '(Projektwurzel)'}")
        if len(echte_module) > 1:
            zeilen.append(f"  ({len(echte_module)} voneinander unabhängige Module)")
        zeilen.append("#" * 78)

        ist_erstes_element = True

        for inhalt in echte_module:
            if not ist_erstes_element:
                zeilen.append("=" * 78)
            ist_erstes_element = False
            zeilen.append(f"  MODUL: {ordner}")

            submodule = berechne_submodule(inhalt["dateien"], inhalt["interfaces"], importers)
            in_submodul = set()
            for sub in submodule.values():
                in_submodul.update(sub["interfaces"])
                in_submodul.update(sub["dateien"])

            zeilen.append("")
            zeilen.append(f"  Interface-Datei(en) ({len(inhalt['interfaces'])}):")
            for i in sorted(inhalt["interfaces"]):
                if not in_scope(i):
                    continue
                zeilen.append(f"    - {kurz(i, ordner)}")
                zeige_importe(zeilen, i, "        ")

            direkte_moduldateien = sorted(inhalt["dateien"] - in_submodul)
            if direkte_moduldateien:
                zeilen.append("")
                zeilen.append(f"  Moduldateien ohne eigenes Submodul ({len(direkte_moduldateien)}):")
                for f in direkte_moduldateien:
                    if not in_scope(f):
                        continue
                    zeilen.append(f"    - {kurz(f, ordner)}")
                    zeige_importe(zeilen, f, "        ")

            if submodule:
                zeilen.append("")
                zeilen.append(f"  Submodule ({len(submodule)}):")
                for d in sorted(submodule):
                    sub = submodule[d]
                    if not any(in_scope(f) for f in sub["interfaces"] + sub["dateien"]):
                        continue
                    zeilen.append(f"    -- {kurz(d, ordner)} --")
                    zeilen.append(f"       Submodul-Interface(s) ({len(sub['interfaces'])}):")
                    for i in sub["interfaces"]:
                        zeilen.append(f"         - {basisname(i)}")
                        zeige_importe(zeilen, i, "             ")
                    zeilen.append(f"       Submodul-Dateien ({len(sub['dateien'])}):")
                    for f in sub["dateien"]:
                        zeilen.append(f"         - {basisname(f)}")
                        zeige_importe(zeilen, f, "             ")
            zeilen.append("")

        if einzeldatei_cluster:
            alle_einzel = sorted(
                f for c in einzeldatei_cluster for f in c["interfaces"] if in_scope(f)
            )
            if alle_einzel:
                if not ist_erstes_element:
                    zeilen.append("=" * 78)
                ist_erstes_element = False
                zeilen.append(f"  EINZELDATEIEN in {ordner} ({len(alle_einzel)}):")
                for f in alle_einzel:
                    zeilen.append(f"    - {kurz(f, ordner)}")
                    zeige_importe(zeilen, f, "        ")
                zeilen.append("")

    unzugeordnet_in_scope = sorted(f for f in unzugeordnet if in_scope(f))
    zeilen.append("#" * 78)
    zeilen.append(f"  NICHT ZUGEORDNETE DATEIEN ({len(unzugeordnet_in_scope)}):")
    zeilen.append("#" * 78)
    if unzugeordnet_in_scope:
        zeilen.append(
            "  (keine Interface-Datei erreicht diese Datei über eine "
            "Importkette -- z.B. Datei ganz ohne Verwendung, oder Teil "
            "eines Ring-Clusters ohne erkennbaren eigenen Einstiegspunkt)"
        )
        for f in unzugeordnet_in_scope:
            zeilen.append(f"    - {f}")
    else:
        zeilen.append("  (keine -- alle Dateien im Scope sind zugeordnet)")

    return "\n".join(zeilen)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default="src", help="Wurzelverzeichnis für madge (default: src)")
    ap.add_argument("--extensions", default="ts,tsx")
    ap.add_argument("--ts-config", default="tsconfig.json")
    ap.add_argument(
        "--paths",
        nargs="*",
        default=None,
        help="Nur diese Ordner/Dateien (relativ zu --root) in der AUSGABE zeigen. "
        "Fan-in wird trotzdem immer global über das ganze --root berechnet.",
    )
    ap.add_argument(
        "--out",
        default=".reports/modul-analyse.txt",
        help="Zieldatei (default: .reports/modul-analyse.txt)",
    )
    ap.add_argument(
        "--mit-importen",
        action="store_true",
        help="Zeigt zusätzlich die 'importiert: ...'-Zeilen (default: nur Modul-/Dateistruktur)",
    )
    args = ap.parse_args()

    print("Lese Abhängigkeiten via madge ...", file=sys.stderr)
    dateien, deps, importers = lade_graph(args.root, args.extensions, args.ts_config)
    interfaces = berechne_interfaces(dateien, importers)
    module, unzugeordnet = baue_module(dateien, deps, interfaces, importers)

    fehler = pruefe_eindeutigkeit(dateien, module, unzugeordnet)
    fehler += pruefe_ordner_praefix(module)
    fehler += pruefe_submodul_ordner(module, importers)
    if fehler:
        print("INTERNER FEHLER in modul-analyse.py -- Selbstprüfung fehlgeschlagen:", file=sys.stderr)
        for f in fehler:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(2)

    # madge liefert Pfade relativ zu --root; --paths darf sowohl relativ zu
    # --root (z.B. "lib/import") als auch mit vorangestelltem --root
    # (z.B. "src/lib/import") angegeben werden.
    root_praefix = args.root.rstrip("/") + "/"
    paths_normalisiert = None
    if args.paths:
        paths_normalisiert = [
            p[len(root_praefix):] if p.startswith(root_praefix) else p
            for p in args.paths
        ]

    text = render(module, deps, unzugeordnet, importers, paths_normalisiert, args.mit_importen)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text + "\n")
        print(f"(geschrieben nach {args.out})", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
