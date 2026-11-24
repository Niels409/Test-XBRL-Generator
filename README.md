# Test XBRL Generator

[![CI](https://github.com/Niels409/Test-XBRL-Generator/actions/workflows/ci.yml/badge.svg)](https://github.com/Niels409/Test-XBRL-Generator/actions/workflows/ci.yml)

Generates **test XBRL instance documents** for the Dutch real estate taxonomies of SBR Nexus,
**Vastgoedtaxonomie 17 (VT17, 20240131, update 20260804)** and **Vastgoedtaxonomie 15 (VT15, 20210421)**, from an Excel sheet with test scenarios.
Every row in the Excel becomes one XBRL file. Fields you leave empty are filled with realistic test data.

It is meant for testing processes that receive valuation XBRLs (for example a lender's intake workflow). All generated data is fictitious,
and every file starts with a comment that says so.

**Rebuilding it elsewhere?** [`rebuild/`](rebuild/README.md) has everything to build the generator again in another environment and language
(Python or Java): a functional specification, a build guide, the model files and an acceptance test of 30 scenarios.

## Use it

1. Open `dist/Test XBRL Generator.html` in Chrome or Edge. It works offline; nothing is uploaded anywhere.
2. Click **Download template** and fill in one row per test, or pick a ready-made **scenario set** (see below).
3. Drop the Excel file on step 2 and click **Generate**. The XBRL files are saved to your Downloads folder and stay listed on screen,
   so you can download any of them again until you generate a new set.
4. Click **Download test report** for an Excel overview of the run: every test with its input, file name, result, deviations and warnings,
   and whether the outcome matches the expected result.

### Excel columns

| Column | Meaning |
|---|---|
| Taxonomy | `VT17` (default) or `VT15` |
| Data product * | Taxatierapport, Opdrachtbrief, Huurinformatie, Gebouwinformatie, Duurzaamheidsinformatie, Taxatierapport-Conformiteitsscore |
| Case / Reference ID | Written to *Opdrachtinformatie › Referentie* |
| Valuer report ID | Written to *Opdrachtnemer › Referentie* |
| Use (report) | Commercial, Residential, Mixed use, Agricultural (VT17 only) |
| Street, House number, Addition, Postcode | Main address (VBO 1) |
| VBO ID n / Use VBO n / Market value VBO n | Up to 5 VBOs. Use per VBO: Commercial, Residential, Agricultural (VT17), Unlinked (e.g. land, parking space) |
| Valuation date report | dd-mm-yyyy (also `today-14d` and similar) |
| Valuer CoC number | KvK number of the valuer |
| Description | What the test is about (shown in the app and the test report, not written to the XBRL) |
| Expected result | Optional: No deviations, Deviations or Not generated |

Process ID (*Opdrachtgever › Referentie*) = VBO ID 1, or a random 12-digit number starting with `2000000`.
Type `EMPTY` in a field to leave it out of the XBRL (negative tests).

### Use per VBO

The taxonomies do not tie the commercial / residential / agricultural parts to the chosen use, so the generator does it:
commercial VBOs get a *Ruimte* (+ *Adres ruimte*), residential VBOs an *Eenheid* (+ *Adres eenheid*), agricultural VBOs an object in the
*Landelijk & Agrarisch* part, and unlinked VBOs appear only in the BAG VBO lists. Parts of uses that do not occur are left out.
Only residential units have a market value per unit in the taxonomy; other VBO values count towards the total market value.
In VT15 the taxonomy's own rules do not allow a BAG VBO ID per *Ruimte*, so there commercial VBOs are not linked to a Ruimte.

### Scenario library

| Set | Tests |
|---|---|
| Full regression set | all valid scenarios of the sets below |
| Residential (VT17) | one or more homes, parking space, with and without market values |
| Commercial (VT17) | units with lease contracts, land, very high value |
| Mixed use and unlinked (VT17) | combinations of commercial, residential and unlinked VBOs |
| Agricultural (VT17) | farms, land, farm with farmhouse, all three uses |
| All data products, one case (VT17) | the six data products for the same case and VBO |
| VT15 | residential, commercial, mixed and all data products in VT15 |
| Negative tests | invalid, missing and contradictory input, each with its expected result |

The sets are built by `build/scenario_sets.py`; in the app they are under step 1.

## Validation

**Built-in check (in the app).** Each file is checked before it is offered: concepts, dimensions/hypercubes, periods, units, data types and
facets (including the Nederlandse Taxonomie types such as `StreetNameNL` max. 24 characters and the SBI code list), and **all business rules
(formula assertions) of the taxonomy**: VT17 201 value assertions and 48 existence assertions, VT15 270 and 49. That covers the required
fields, the conditional rules, the totals that must equal their parts (for example `ParkingLotsRented` = inside + outside) and the unit of
areas. Every deviation names the rule it breaks, for example `[House_PrtSumOfChildren1]`. Up to version 2.1.0 the generated files and
this check were also compared rule by rule with [Arelle](https://arelle.org) in CI (identical on 625 files); that comparison has been
removed to keep the project simple.

## Repository layout

| Path | Contents |
|---|---|
| `app/` | `core.js` (model, realistic data, XBRL serialisation, validation, test report), `xlsx.js` (dependency-free .xlsx reader/writer), `index.template.html` (UI) |
| `data/` | `appdata-vt17.json`, `appdata-vt15.json`: compiled taxonomy models, rules and base example messages |
| `build/` | Scripts that compile the taxonomy packages into `data/` and build the template, scenario sets, HTML app and macOS app |
| `rebuild/` | Rebuild package: functional specification, build guide, model files, template, acceptance scenarios and expected results |
| `tools/` | `export_rebuild.js` (generates `rebuild/` from this implementation), `rebuild_scenarios.json` (its acceptance scenarios), `check_acceptance.py` (acceptance check of generated files), `prepare_package.py` (extracts an SBR Nexus release bundle) |
| `azure/` | Azure Function (Node 20, v4 model): `POST /api/generate` (files + test report), `GET /api/template` |
| `test/` | Official examples, 700+ scenario tests, review tests, browser test, independent XSD check (needs the taxonomy packages) |
| `.github/workflows/ci.yml` | Build, all tests and the rebuild package check on every push |

## Build and test

```bash
./build.sh                 # template, scenario sets, offline HTML app, Azure Function zip  (python3 + openpyxl, node, zip)
node test/base_check.js    # official SBR Nexus examples against the built-in check (add data/appdata-vt15.json for VT15)
node test/deep.js          # 700+ scenarios: use separation, VBO links, field mapping, XBRL structure, edge cases (FUZZ=n for more)
node test/review.js        # content consistency, self-test with injected errors, EMPTY markers, structure vs official examples
node test/ui.js            # end-to-end browser test (npm install --no-save playwright && npx playwright install chromium)
node tools/export_rebuild.js --files out/acceptance && python3 tools/check_acceptance.py out/acceptance   # rebuild package + its acceptance test
```

The built app is also attached to every CI run (artifact `test-xbrl-generator-<commit>`). Changes per version: [CHANGELOG.md](CHANGELOG.md).

Recompiling `data/` from the taxonomies (only needed for a new taxonomy version) needs the SBR Nexus VT17/VT15 packages and example messages:

```bash
python3 build/build_model.py <vt17 package dir> build/vt17_model.json
python3 build/build_rules.py <vt17 package dir> build/rules.json
python3 build/build_appdata.py build/vt17_model.json <vt17 examples dir> data/appdata-vt17.json
python3 build/build_uses.py data/appdata-vt17.json vt17
# VT15: add "vt15" as last argument to build_model/build_rules/build_uses
# after a change in build_rules.py only the rules need to be replaced:
python3 build/inject_rules.py build/rules.json data/appdata-vt17.json
```

## Taxonomy content

The VT17 and VT15 taxonomies and example messages are published by [SBR Nexus](https://www.sbrnexus.nl); the NT types by the Nederlandse Taxonomie.
`data/` contains a compiled extract of them. The residential and agricultural parts that have no official example are synthetic (built from the
taxonomy); no real valuation messages are included. The taxonomy packages themselves are not stored in this repository. Check the SBR Nexus
terms of use before reusing taxonomy content elsewhere.

## License

MIT, see [LICENSE](LICENSE). The license covers the code in this repository, not the SBR Nexus taxonomy content.
