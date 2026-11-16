# Test XBRL Generator

Generates **test XBRL instance documents** for the Dutch real estate taxonomies of SBR Nexus,
**Vastgoedtaxonomie 17 (VT17, 20240131)** and **Vastgoedtaxonomie 15 (VT15, 20210421)**, from an Excel sheet with test scenarios.
Every row in the Excel becomes one XBRL file. Fields you leave empty are filled with realistic test data.

It is meant for testing processes that receive valuation XBRLs (for example a lender's intake workflow). All generated data is fictitious.

## Use it

1. Open `dist/VT Test Generator.html` in Chrome or Edge. It works offline; nothing is uploaded anywhere.
2. Click **Download template** and fill in one row per test.
3. Drop the Excel file on step 2 and click **Generate**. The XBRL files are saved to your Downloads folder and stay listed on screen, so you can download any of them again, until you generate a new set.

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
| Valuation date report | dd-mm-yyyy |
| Valuer CoC number | KvK number of the valuer |

Process ID (*Opdrachtgever › Referentie*) = VBO ID 1, or a random 12-digit number starting with `2000000`.

### Use per VBO

The taxonomies do not tie the commercial / residential / agricultural parts to the chosen use, so the generator does it:
commercial VBOs get a *Ruimte* (+ *Adres ruimte*), residential VBOs an *Eenheid* (+ *Adres eenheid*), agricultural VBOs an object in the *Landelijk & Agrarisch* part, and unlinked VBOs appear only in the BAG VBO lists. Parts of uses that do not occur are left out.
Only residential units have a market value per unit in the taxonomy; other VBO values count towards the total market value.

## Validation

Each file is checked against the taxonomy before it is offered: concepts, dimensions/hypercubes, periods, units, data types and facets
(including the Nederlandse Taxonomie types such as `StreetNameNL` max. 24 characters and the SBI code list), required existence assertions
and most conditional value assertions (VT17: 192 of 201, VT15: 258 of 270). This is the generator's own validator, not a certified XBRL processor.

## Repository layout

| Path | Contents |
|---|---|
| `app/` | `core.js` (model, realistic data, XBRL serialisation, validation), `xlsx.js` (dependency-free .xlsx reader), `index.template.html` (UI) |
| `data/` | `appdata-vt17.json`, `appdata-vt15.json`: compiled taxonomy models, rules and base example messages |
| `build/` | Python scripts that compile the taxonomy packages into `data/`, build the Excel template, the HTML app and a macOS app bundle |
| `azure/` | Azure Function (Node 20, v4 model): `POST /api/generate`, `GET /api/template` |
| `test/` | Validation of the official examples, use scenarios, end-to-end UI test (Playwright) |
| `dist/` | Ready-to-use HTML app, Excel template, Azure Function zip |

## Build

```bash
./build.sh                 # template + offline HTML app + Azure Function zip (python3 + openpyxl, zip)
node test/base_check.js    # official SBR Nexus examples against the validator
node test/uses.js          # use scenarios for VT17 / VT15
```

Recompiling `data/` from the taxonomies (only needed for a new taxonomy version) needs the SBR Nexus VT17/VT15 packages and example messages:

```bash
python3 build/build_model.py <vt17 package dir> build/vt17_model.json
python3 build/build_rules.py <vt17 package dir> build/rules.json
python3 build/build_appdata.py build/vt17_model.json <vt17 examples dir> data/appdata-vt17.json
python3 build/build_uses.py data/appdata-vt17.json vt17
# VT15: add "vt15" as last argument to build_model/build_rules/build_uses
```

## Taxonomy content

The VT17 and VT15 taxonomies and example messages are published by [SBR Nexus](https://www.sbrnexus.nl); the NT types by the Nederlandse Taxonomie.
`data/` contains a compiled extract of them. The residential and agricultural parts that have no official example are synthetic (built from the taxonomy); no real valuation messages are included. Check the SBR Nexus terms of use before reusing that content elsewhere.

## License

MIT, see [LICENSE](LICENSE). The license covers the code in this repository, not the SBR Nexus taxonomy content.
