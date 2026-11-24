#!/usr/bin/env bash
# Rebuilds the Excel template, the scenario sets, the offline HTML app and the Azure Function package from app/ + data/.
# Requires: python3 with openpyxl, node, zip.
set -euo pipefail
cd "$(dirname "$0")"
NAME="Test XBRL Generator"
mkdir -p dist
rm -rf dist/scenario-sets
python3 build/build_template.py data/appdata-vt17.json "dist/$NAME - template.xlsx"
python3 build/scenario_sets.py data/appdata-vt17.json dist/scenario-sets
python3 build/build_html.py "dist/$NAME - template.xlsx" "dist/$NAME.html" --sets dist/scenario-sets
# Azure Function: same generator code and data
cp app/core.js app/xlsx.js azure/
cp data/appdata-vt17.json azure/appdata.json
cp data/appdata-vt15.json azure/appdata-vt15.json
cp "dist/$NAME - template.xlsx" azure/template.xlsx
rm -f "dist/$NAME - Azure Function.zip"
# fixed timestamps and sorted entries: the same sources give the same zip
(cd azure && find . -path ./node_modules -prune -o -type f -print | LC_ALL=C sort > ../.zip-list \
  && xargs -d '\n' touch -d '2026-01-01T00:00:00Z' < ../.zip-list \
  && zip -qX "../dist/$NAME - Azure Function.zip" -@ < ../.zip-list) && rm -f .zip-list
echo "Built: dist/$NAME.html, dist/$NAME - template.xlsx, dist/scenario-sets/, dist/$NAME - Azure Function.zip"
