# Build guide

How to build the generator of `FUNCTIONAL_SPEC.md` with as little code as possible, in Python or in Java.

## 1. Python or Java

| | Python | Java |
|---|---|---|
| Size (generator + checks + writer, without tests) | about 600–800 lines | about 1,200–1,600 lines |
| Libraries | `openpyxl` (Excel); the rest is the standard library | Apache POI `poi-ooxml` (Excel), Jackson or `org.json` (model) |
| Build and run | `python generate.py scenarios.xlsx out/` | Maven or Gradle; `java -jar generator.jar scenarios.xlsx out/` |
| Choose when | no platform rule says otherwise: least code, so the fewest tokens to build and to review | the platform only allows JVM applications, or the team maintains Java |

The functional behaviour is the same; the acceptance test (spec section 8) decides for both.

## 2. Parts

```text
main / cli        read arguments (xlsx, output folder, optional --today yyyy-mm-dd), loop over rows, write files, print a summary
excel_reader      header row, data rows, column values (spec 3)                         returns a list of Row
model             load model/*.json; concept(q), role(id), fits_role(fact, role), field(key) -> (role, concept)
generator         spec 6.1–6.15: Row -> facts + input check messages, or input errors
checks            spec 7.2 on the facts: fact check messages; status (7.3)
xbrl_writer       spec 5: facts -> XML text (string building gives the exact layout; no XML library needed)
acceptance_test   run acceptance/scenarios.xlsx with today 2026-12-01; compare with acceptance/expected/*.json (spec 8)
```

Data types:

```text
Row   { test_id, row_number, taxonomy, data_product, case_id, valuer_report_id, use_report, street, house_number,
        addition, postcode, valuation_date, valuer_coc, vbos: [ {id, use, value} ] }        raw cell values
Fact  { concept, dims: [ (axis, 't'|'e', member) ], value: str, unit: [str] | null, decimals: str | null,
        g: use code | null, shift: days, vbo_index: int | null, drop: bool, fixed_link: bool }
```

## 3. Things that are easy to get wrong

- **Fact order** matters for "first" (first VBO member, first unit member, first reference) and for the output order: keep
  the order of the model, insert VBO copies in place (6.7) and append unit copies at the end (6.8).
- **Sets keep insertion order** (*uses*, references). In Python use a list or `dict.fromkeys`, in Java `LinkedHashSet`.
- **Dates** are calendar dates: compute in UTC (`date` in Python, `LocalDate` in Java), never with local time.
- **Numbers from Excel** are written without a trailing `.0`: `1250000`, `950000.5`. In Python `str(1250000.0)` gives
  `1250000.0`; format whole numbers as integers. A total is rounded to a whole number.
- **IDs from Excel**: 16-digit IDs only survive as text cells (the template formats them as text); a numeric cell with 15
  digits gets a leading zero.
- **Exact text** of codes: VT17 *toegekend door* is `4` / `6`, VT15 `Geldgever` / `Taxateur` (spec 6.10, 6.11).
- **Field writing** (spec 6.10) is used for every column: implement it once (targets, EMPTY, conversion, add when missing).
- **Regular expressions** in the model (`pattern`) are XML Schema patterns: match the whole value (`^(?:pattern)$`).

## 4. Generated values

Use any random generator, seeded per Test ID so that the same row gives the same file. The acceptance test does not compare
generated values (spec 6.9), but they must pass the fact checks: Dutch postcodes `1234AB`, KvK numbers of 8 digits (not
starting with 0), text within `maxLength`. The reference lists of names, streets and places are at the top of
`app/core.js` (`FIRST`, `FAMILY`, `CITIES`, `STREETS`, `COMPANY_A/B`, `SENTENCES`).

## 5. Acceptance test

1. Read `acceptance/scenarios.xlsx` with the excel_reader and generate every row with today = 2026-12-01.
2. For each row load `acceptance/expected/<Test ID>.json` and compare status, `inputChecks` and `deviations`.
3. For a generated file, parse the XML (Python `xml.etree.ElementTree`, Java DOM): contexts (id → dimensions, date),
   units (id → measures) and facts; build the lines `concept|dimensions|unit|value` and match them as a multiset against
   `facts`, where `*` matches any value or member. Check the file name, the context dates and the entity scheme.
4. Print per row PASS or the differences (missing and unexpected lines). The build is done when all 30 rows pass.

`tools/check_acceptance.py` in this repository does steps 3 and 4 for a folder of generated files (about 120 lines of
Python); CI runs it on the output of the reference implementation.

Test code should read the expected files itself: there is no need to load them, or the model files, into an AI
assistant's context (together about 2 MB).

## 6. Where to look in the reference

`app/core.js` (JavaScript) is the reference implementation; `generate()` follows the steps of the spec in the same order,
with these section comments: `---- VBO's` (6.3), `---- use per VBO` (6.4), `---- facts kopiëren` (6.5), `bestaande
placeholder-leden` (6.6, 6.7), `---- gebruiksspecifieke eenheden per VBO` (6.8), `---- realistische waarden` (6.9),
`setField` (field writing), `---- case-ID` and `---- ProcesID` (6.10), `---- vaste kolommen` (6.11), `huur- en
koopreferenties` (6.12), `---- marktwaarde per VBO` (6.13), `---- object-informatie` (6.14). Also: `convertValue`
(conversions), `checkValue` and the first part of `validate()` (fact checks), `serialize()` (writer), `useCode`,
`parseDateExpr`; `app/xlsx.js` `rowsToScenarios` (Excel reading). Business rules (`ruleHelpers`, `evalConditional`,
`evalExistence`) are not part of the rebuild.
