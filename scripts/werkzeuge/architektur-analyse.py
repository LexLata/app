#!/usr/bin/env python3
"""
architektur-analyse.py

Aggregiert eine madge-Abhaengigkeitsanalyse (Datei-Ebene) auf Modul-Ebene
(Verzeichnisse) und erzeugt daraus zwei lesbare Graphviz-Diagramme statt
des ueblichen madge-Datei-Spaghettis. Zusaetzlich: Fan-in/Fan-out-Ranking
und zirkulaere Abhaengigkeiten als Text.

Voraussetzungen:
  - Node/npm im Projekt (madge wird via `npx madge` aufgerufen)
  - Graphviz installiert (liefert den `dot`-Befehl)
      macOS:   brew install graphviz
      Ubuntu:  apt install graphviz

Benutzung (im Projekt-Root ausfuehren, dort wo tsconfig.json liegt):
  python3 scripts/werkzeuge/architektur-analyse.py

Optionen:
  --src PATH            Quellverzeichnis (default: src)
  --extensions EXT       Dateiendungen fuer madge (default: ts,tsx)
  --ts-config PATH       tsconfig fuer madge (default: tsconfig.json)
  --depth N              Verzeichnistiefe fuer Modul-Aggregation (default: 2)
  --min-weight N         Minimales Kantengewicht im gefilterten Diagramm (default: 3)
  --out DIR              Ausgabeverzeichnis (default: architektur-diagramme)
  --top N                Anzahl Zeilen im Fan-in/Fan-out-Ranking (default: 20)

Ausgabe (im --out Verzeichnis):
  overview.svg           Top-Level-Diagramm (depth=1, alle Kanten)
  modules.svg            Modul-Diagramm (--depth, gefiltert nach --min-weight)
  report.txt             Fan-in/Fan-out-Ranking, Modul-Kopplungstabelle,
                          zirkulaere Abhaengigkeiten (madge --circular)
"""

import argparse
import collections
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _madge_helfer import run_madge_json, run_madge_circular  # noqa: E402


def module_of(path: str, depth: int) -> str:
    dirs = path.split("/")[:-1]
    if not dirs:
        return "(root)"
    return "/".join(dirs[:depth])


def compute_fan(data: dict):
    fan_out = {f: len(deps) for f, deps in data.items()}
    fan_in = collections.Counter()
    for _, deps in data.items():
        for d in deps:
            fan_in[d] += 1
    return fan_in, fan_out


def aggregate_modules(data: dict, depth: int):
    files = sorted(data.keys())
    mod_files = collections.Counter()
    for f in files:
        mod_files[module_of(f, depth)] += 1

    edges = collections.Counter()
    internal = collections.Counter()
    for f, deps in data.items():
        mf = module_of(f, depth)
        for d in deps:
            md = module_of(d, depth)
            if mf == md:
                internal[mf] += 1
            else:
                edges[(mf, md)] += 1
    return mod_files, edges, internal


def coupling_table(mod_files, edges):
    out_deg = collections.defaultdict(set)
    in_deg = collections.defaultdict(set)
    for (a, b) in edges:
        out_deg[a].add(b)
        in_deg[b].add(a)
    all_mods = set(mod_files) | set(out_deg) | set(in_deg)
    rows = []
    for m in all_mods:
        rows.append((m, len(out_deg[m]), len(in_deg[m])))
    rows.sort(key=lambda r: -(r[1] + r[2]))
    return rows


def to_dot(mod_files, edges, internal, min_weight, title):
    lines = ["digraph G {"]
    lines.append("  rankdir=LR;")
    lines.append(
        '  graph [fontname="Helvetica", fontsize=20, label="%s", '
        'labelloc=t, splines=true, overlap=false, nodesep=0.6, ranksep=1.1];'
        % title
    )
    lines.append(
        '  node [fontname="Helvetica", shape=box, style="rounded,filled", '
        'fillcolor="#eef3fb", color="#3a5f8a", penwidth=1.2];'
    )
    lines.append('  edge [fontname="Helvetica", fontsize=10, color="#8a97a8"];')

    out_deg = collections.defaultdict(set)
    in_deg = collections.defaultdict(set)
    for (a, b), w in edges.items():
        if w < min_weight:
            continue
        out_deg[a].add(b)
        in_deg[b].add(a)

    for m, n in mod_files.items():
        total_deg = len(out_deg[m]) + len(in_deg[m])
        size = 0.4 + min(n, 50) * 0.03
        if total_deg >= 7:
            fill, border = "#f6c2c2", "#a13a3a"   # viele Modul-Nachbarn -> shallow-Verdacht
        elif total_deg >= 4:
            fill, border = "#fbe3b0", "#b8892c"
        else:
            fill, border = "#cfe8d0", "#3f7a44"   # wenig gekoppelt
        internal_n = internal.get(m, 0)
        lines.append(
            '  "%s" [label="%s\\n%d Dateien, %d interne Kanten", '
            'fillcolor="%s", color="%s", width=%.2f, height=%.2f];'
            % (m, m, n, internal_n, fill, border, size, size * 0.5)
        )

    for (a, b), w in edges.items():
        if w < min_weight:
            continue
        penwidth = 1 + min(w, 40) / 8
        lines.append('  "%s" -> "%s" [penwidth=%.2f, label="%d"];' % (a, b, penwidth, w))

    lines.append("}")
    return "\n".join(lines)


def render_svg(dot_text: str, out_svg: Path):
    dot_path = out_svg.with_suffix(".dot")
    dot_path.write_text(dot_text)
    if shutil.which("dot") is None:
        print(f"WARNUNG: 'dot' (Graphviz) nicht gefunden, {dot_path} wurde geschrieben, "
              f"aber kein SVG erzeugt. Graphviz installieren und "
              f"`dot -Tsvg {dot_path} -o {out_svg}` manuell ausfuehren.", file=sys.stderr)
        return
    subprocess.run(["dot", "-Tsvg", str(dot_path), "-o", str(out_svg)], check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default="src")
    ap.add_argument("--extensions", default="ts,tsx")
    ap.add_argument("--ts-config", default="tsconfig.json")
    ap.add_argument("--depth", type=int, default=2)
    ap.add_argument("--min-weight", type=int, default=3)
    ap.add_argument("--out", default="architektur-diagramme")
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Lese Abhaengigkeiten via madge ...")
    data = run_madge_json(args.src, args.extensions, args.ts_config)
    circular_report = run_madge_circular(args.src, args.extensions, args.ts_config)

    fan_in, fan_out = compute_fan(data)
    files = sorted(data.keys())
    rows = [(f, fan_in.get(f, 0), fan_out.get(f, 0)) for f in files]

    report_lines = []
    report_lines.append(f"=== TOP {args.top} nach FAN-IN (am meisten genutzte Dateien) ===")
    for f, fi, fo in sorted(rows, key=lambda r: -r[1])[: args.top]:
        report_lines.append(f"  in={fi:3d} out={fo:3d}  {f}")

    report_lines.append("")
    report_lines.append(f"=== TOP {args.top} nach FAN-OUT (Dateien mit den meisten eigenen Abhaengigkeiten) ===")
    for f, fi, fo in sorted(rows, key=lambda r: -r[2])[: args.top]:
        report_lines.append(f"  in={fi:3d} out={fo:3d}  {f}")

    # Top-Level-Uebersicht (depth=1, ungefiltert)
    mf1, e1, i1 = aggregate_modules(data, depth=1)
    dot1 = to_dot(mf1, e1, i1, min_weight=1, title="Top-Level Architektur (depth=1)")
    render_svg(dot1, out_dir / "overview.svg")

    # Modul-Ebene (--depth, gefiltert nach --min-weight)
    mf2, e2, i2 = aggregate_modules(data, depth=args.depth)
    dot2 = to_dot(mf2, e2, i2, min_weight=args.min_weight,
                  title=f"Modul-Ebene (depth={args.depth}, Kanten >= {args.min_weight})")
    render_svg(dot2, out_dir / "modules.svg")

    report_lines.append("")
    report_lines.append(f"=== MODUL-GROESSEN (Dateien pro Modul, depth={args.depth}) ===")
    for m, c in sorted(mf2.items(), key=lambda x: -x[1]):
        report_lines.append(f"  {c:3d}  {m}")

    report_lines.append("")
    report_lines.append(f"=== MODUL-KOPPLUNG (depth={args.depth}) ===")
    for m, out_n, in_n in coupling_table(mf2, e2):
        report_lines.append(
            f"  {m:45s}  out->{out_n:2d} Module   in<-{in_n:2d} Module   "
            f"interne Kanten={i2.get(m, 0)}"
        )

    report_lines.append("")
    report_lines.append("=== ZIRKULAERE ABHAENGIGKEITEN (madge --circular) ===")
    report_lines.append(circular_report.strip())

    report_text = "\n".join(report_lines)
    (out_dir / "report.txt").write_text(report_text)

    print(report_text)
    print()
    print(f"Diagramme und Report liegen in: {out_dir}/")
    print(f"  - {out_dir}/overview.svg")
    print(f"  - {out_dir}/modules.svg")
    print(f"  - {out_dir}/report.txt")


if __name__ == "__main__":
    main()
