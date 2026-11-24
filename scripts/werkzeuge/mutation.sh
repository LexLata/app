#!/usr/bin/env bash
# scripts/werkzeuge/mutation.sh
#
# 'npm run mutation -- --mutate X' hängt Extra-Argumente an das GESAMTE
# npm-Skript an. Bei einer einzelnen Verkettung "stryker run && node ..."
# würde --mutate X dadurch beim Zusammenfassungsskript landen statt bei
# Stryker (das nach der Kette kommende Kommando bekommt kein Stück davon,
# das erste Kommando in der Kette ebenfalls nicht – npm hängt IMMER ganz
# hinten an). Dieses Wrapper-Skript reicht "$@" gezielt nur an
# 'stryker run' weiter.
set -euo pipefail

npx stryker run scripts/werkzeuge/stryker.config.mjs "$@"
node scripts/werkzeuge/mutation-zusammenfassung.mjs
