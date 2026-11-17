# Changelog

All notable changes to the Test XBRL Generator. The version is shown in the app footer, in a comment at the top of every
generated XBRL file and in the test report.

## 2.1.0 — 2026-11-17

### Added
- **The built-in check evaluates every business rule of the taxonomies**: all formula assertions, VT17 201 value assertions
  and 48 existence assertions, VT15 270 and 49 (was: 192 and 258 value assertions and most existence assertions). New are
  the totals that must equal the sum of their parts (parking places, corrections, costs; in VT15 debit minus credit), the
  unit of areas (VT15: m²), the "exactly one of" rules (place of residence or postcode in the Netherlands or abroad,
  location description) and the rules that only require an axis to be reported (land register, valuer).
- Every deviation from a business rule names that rule, for example `[House_PrtSumOfChildren1]`, also for required fields.
- **Rule-by-rule comparison with Arelle** in CI: for every file, the rules reported by Arelle and by the built-in check must
  be identical. Besides the scenario sets this runs on a mutation corpus (`tools/mutants.js`): for every rule that occurs in
  the generated reports, one report is changed so that it breaks that rule.
- `build/build_rules.py` stops with an error on a filter, test or precondition it does not support, so a new taxonomy
  version cannot lose rules unnoticed. `build/inject_rules.py` updates the rules in existing app data.

### Fixed
- Rules with an aspect cover on all dimensions (two in VT15) now ignore the dimensions when matching facts, as the
  taxonomy defines.

## 2.0.0 — 2026-11-17

### Added
- **Official validation with Arelle** (open-source XBRL processor) in GitHub Actions: on every push the scenario sets are
  generated and every file is validated against the official SBR Nexus taxonomy packages (XML Schema, XBRL 2.1,
  dimensions and the formula assertions of the taxonomy). `tools/arelle_validate.py` runs the same check locally.
- **Automatic tests on GitHub** (`.github/workflows/ci.yml`): build, official examples, 700+ scenario tests, review tests,
  Azure Function and an end-to-end browser test.
- **Scenario library**: eight ready-made sets (residential, commercial, mixed and unlinked, agricultural, all data products,
  VT15, negative tests, full regression). Load a set straight into step 2 or download it as Excel.
- **Test report** (Excel) per run: every test with its input, file name, result, deviations, warnings and what was filled in
  from the Excel, plus a summary sheet. Also returned by the Azure Function.
- Template columns **Description** and **Expected result** (No deviations / Deviations / Not generated); the app and the
  test report show whether each outcome is as expected.

### Fixed (found by the Arelle validation)
- VT15 commercial and mixed reports: the unit address that linked a commercial VBO to its *Ruimte* (BAG VBO ID per unit)
  violated VT15's own rules ("When `UnitAxis` is used, `UnitType`, `MarketRent`, ... MUST be reported with the same
  dimensions"). It is no longer generated; in VT15 commercial VBOs are therefore not linked to a Ruimte.
- The built-in check now evaluates these unit/axis rules exactly like Arelle (all dimensions must match), so it reports
  this kind of problem as well.

### Changed
- One name everywhere: **Test XBRL Generator** (app, template, scenario sets, Azure Function, macOS app).
- VBO IDs in the 12-digit test format `2000000xxxxx` (also valid as Process ID) no longer give a BAG-format warning.
- Generated files start with a comment naming the generator, version, taxonomy, data product and date, and stating that
  the file is test data.

## 1.5.0 — 2026-11-17
- Second review round: content consistency, self-test of the built-in check with injected errors, `EMPTY` per field,
  structure compared with the official examples, repeatability; independent check against the taxonomy XSDs.
- Total market value is always the sum of the VBO values; case ID no longer overwritten by the Process ID in data products
  without an assignment reference; stricter built-in check (value lists, monetary units, duplicate facts); Excel reader
  finds the template on any sheet; Azure Function limited to 250 tests per call.

## 1.4.1 — 2026-11-16
- Extensive scenario test suite (use separation, VBO links, field mapping, XBRL structure, edge cases).
- VT15 commercial VBOs linked to a Ruimte; lease references and sector type follow the use; Huurinformatie keeps only units
  of the chosen use; postcode and Excel number fixes; warnings for duplicate VBOs, future dates and invalid amounts.
- Nederlandse Taxonomie facets (street name max. 24 characters, SBI code list) in the built-in check.

## 1.4.0 — 2026-11-16
- First version in this repository: VT17 and VT15, use per VBO (commercial, residential, agricultural, unlinked),
  offline single-file app, Excel template, Azure Function.
