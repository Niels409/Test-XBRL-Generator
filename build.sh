#!/usr/bin/env bash
# Rebuilds the Excel template, the offline HTML app and the Azure Function package from app/ + data/.
# Requires: python3 with openpyxl, zip.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
python3 build/build_template.py data/appdata-vt17.json "dist/VT test scenarios template.xlsx"
python3 build/build_html.py "dist/VT test scenarios template.xlsx" "dist/VT Test Generator.html"
# Azure Function: same generator code and data
cp app/core.js app/xlsx.js azure/
cp data/appdata-vt17.json azure/appdata.json
cp data/appdata-vt15.json azure/appdata-vt15.json
cp "dist/VT test scenarios template.xlsx" azure/template.xlsx
(cd azure && zip -qr "../dist/VT Test Generator - Azure Function.zip" . -x "node_modules/*")
echo "Built: dist/VT Test Generator.html, dist/VT test scenarios template.xlsx, dist/VT Test Generator - Azure Function.zip"
