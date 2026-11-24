# Rebuild package

Everything needed to build the Test XBRL Generator again in another environment and language, without running code from
this repository. Scope of the first version: Excel → XBRL for the **Taxatierapport** in **VT17** and **VT15**, with use per
VBO and input checks.

| File | What it is |
|---|---|
| [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md) | What the generator does: input, generation steps, output, checks, acceptance test |
| [BUILD_GUIDE.md](BUILD_GUIDE.md) | How to build it: Python or Java, parts, pitfalls, acceptance test |
| `model/vt17-taxatierapport.json`, `model/vt15-taxatierapport.json` | Taxonomy model and base report, read by the generator (spec 4) |
| `template.xlsx` | Excel template for users, with three examples |
| `acceptance/scenarios.xlsx` | 30 test rows (VT17 and VT15, valid and invalid input) |
| `acceptance/expected/*.json` | What each row must give: status, checks and all facts |
| `acceptance/reference/*.xbrl` | Output of the reference implementation for five rows |

## Steps

1. Choose the language (BUILD_GUIDE, section 1).
2. Build the parts of BUILD_GUIDE section 2, following FUNCTIONAL_SPEC sections 3 to 7.
3. Run the acceptance test (FUNCTIONAL_SPEC section 8, BUILD_GUIDE section 5) until all 30 rows pass.

To keep the work small, an AI assistant only needs to read the two documents. The model and expected files are data for
the code. The rest of the repository is the reference implementation (`app/core.js`), only needed to look up a detail.

## How this folder is made

`node tools/export_rebuild.js` generates the model files, the Excel files and the expected results from the reference
implementation; the scenarios are in `tools/rebuild_scenarios.json`. CI fails when this folder is not up to date, so do not
edit the generated files by hand. The two documents are written by hand.
