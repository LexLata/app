#!/usr/bin/env python3
"""
Generiert die Menü-Icons aus src-tauri/icons/menu/quellen/
(*.svg, jeweils benannt wie die PNG-Datei, z.B.
"unterstreichen.svg" -> "unterstreichen.png"). In menu.rs ordnet icon_fuer
die Menü-ID mit menu_icon_bytes! den vier PNG-Varianten zu.

VORAUSSETZUNGEN (einmalig):
    pip install cairosvg pillow

AUFRUF:
    python3 generiere_icons.py

ERZEUGT vier Ordner unter ./out/, die 1:1 nach
src-tauri/icons/menu/ kopiert werden müssen:
    light/            - normale Icons, helles Erscheinungsbild (schwarz)
    dark/             - normale Icons, dunkles Erscheinungsbild (weiß)
    light-disabled/   - ausgegraute Variante, hell (35% Deckkraft)
    dark-disabled/    - ausgegraute Variante, dunkel (35% Deckkraft)

GRÖSSE ANPASSEN:
    Zwei Werte weiter unten steuern das Aussehen:

    CANVAS = 36   Die Bildgröße in Pixeln, die an macOS geliefert wird.
                  NICHT zum Verkleinern der sichtbaren Icons verändern -
                  das macht Icons nur unscharf (macOS bekommt dann ein
                  1x-Bild statt eines scharfen 2x-Retina-Bilds für den
                  ~18pt-Menüzeilen-Slot). 36 hat sich als scharf erwiesen.

    GLYPH  = 26   Die tatsächliche Größe des Symbols INNERHALB der
                  36x36-Leinwand, alles drumherum bleibt transparenter
                  Rand. DAS ist der Wert, den du für "größer/kleiner"
                  änderst. Aktuell 26 (war 22, das war laut Rückmeldung
                  einen Tick zu klein). Sinnvoller Bereich: ca. 18-32.

EINZELNES ICON AUSTAUSCHEN:
    1. Eine neue SVG-Datei besorgen (z.B. von https://lucide.dev - dort
       Icon suchen, "Copy SVG" klicken) und unter dem passenden Namen
       in src-tauri/icons/menu/quellen/ ablegen, z.B. "hervorheben.svg"
       ersetzen. Die Lizenzhinweise stehen dort in LIZENZ.txt.
    2. Dieses Skript erneut laufen lassen.
    3. Nur die vier Ordner unter src-tauri/icons/menu/ ersetzen - an
       menu.rs muss dafür NICHTS geändert werden (Dateinamen bleiben
       gleich).

NEUES ICON HINZUFÜGEN (für einen neuen Menüpunkt):
    Zuerst die vier PNG-Varianten erzeugen und übernehmen. Danach in
    menu.rs die Menü-ID in icon_fuer() über menu_icon_bytes! der PNG-Datei
    zuordnen (siehe bestehende Einträge als Vorlage). Die PNGs müssen
    vor dieser Zuordnung existieren, weil Rust sie beim Build einbettet.
"""

import os
import cairosvg
from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
QUELLEN = os.path.abspath(os.path.join(HIER, "..", "..", "src-tauri", "icons", "menu", "quellen"))
OUT = os.path.join(HIER, "out")

CANVAS = 36  # Bildgröße (Schärfe) - siehe Erklärung oben, nicht einfach verkleinern
GLYPH = 26   # Sichtbare Symbolgröße innerhalb der Leinwand - DAS ist der Größenregler

DISABLED_ALPHA = 0.35  # Deckkraft im ausgegrauten Zustand (0.0-1.0)


def rendere_variante(svg_pfad: str, farbe: str, ziel_pfad: str):
    """Rendert eine SVG-Datei in `farbe` (z.B. 'black'/'white'), zentriert
    auf einer CANVASxCANVAS-Leinwand mit GLYPHxGLYPH sichtbarer Größe."""
    with open(svg_pfad) as f:
        svg = f.read()
    # Lucide-SVGs nutzen stroke="currentColor" (CSS-Kontext-Farbe) - für
    # eigenständige PNGs brauchen wir eine feste Farbe.
    svg = svg.replace('stroke="currentColor"', f'stroke="{farbe}"')

    tmp_svg = ziel_pfad + ".tmp.svg"
    with open(tmp_svg, "w") as f:
        f.write(svg)

    tmp_png = ziel_pfad + ".tmp.png"
    cairosvg.svg2png(url=tmp_svg, write_to=tmp_png, output_width=GLYPH, output_height=GLYPH)

    glyph_img = Image.open(tmp_png).convert("RGBA")
    canvas_img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    offset = (CANVAS - GLYPH) // 2
    canvas_img.paste(glyph_img, (offset, offset), glyph_img)
    canvas_img.save(ziel_pfad)

    os.remove(tmp_svg)
    os.remove(tmp_png)


def dimme(quelle_pfad: str, ziel_pfad: str):
    """Erstellt die ausgegraute (reduzierte Deckkraft) Variante aus einer
    bereits fertigen PNG."""
    img = Image.open(quelle_pfad).convert("RGBA")
    r, g, b, a = img.split()
    a = a.point(lambda p: int(p * DISABLED_ALPHA))
    Image.merge("RGBA", (r, g, b, a)).save(ziel_pfad)


def main():
    for ordner in ("light", "dark", "light-disabled", "dark-disabled"):
        os.makedirs(os.path.join(OUT, ordner), exist_ok=True)

    svg_dateien = sorted(f for f in os.listdir(QUELLEN) if f.endswith(".svg"))
    if not svg_dateien:
        print(f"Keine .svg-Dateien in {QUELLEN} gefunden.")
        return

    for datei in svg_dateien:
        name = datei[:-4]  # ohne ".svg"
        svg_pfad = os.path.join(QUELLEN, datei)

        light_pfad = os.path.join(OUT, "light", f"{name}.png")
        dark_pfad = os.path.join(OUT, "dark", f"{name}.png")
        rendere_variante(svg_pfad, "black", light_pfad)
        rendere_variante(svg_pfad, "white", dark_pfad)

        dimme(light_pfad, os.path.join(OUT, "light-disabled", f"{name}.png"))
        dimme(dark_pfad, os.path.join(OUT, "dark-disabled", f"{name}.png"))

    print(f"Fertig: {len(svg_dateien)} Icons x 4 Varianten in {OUT}")
    print("Diese vier Ordner nach src-tauri/icons/menu/ kopieren, dann cargo clean + Neustart.")


if __name__ == "__main__":
    main()
