# Test XBRL Generator — Azure Function

Server-side version of the Test XBRL Generator desktop app. Same generator code (`core.js`, `xlsx.js`, `appdata.json`, `appdata-vt15.json`); generates VT17 or VT15 per row (column Taxonomy), wrapped as an HTTP API for a Copilot Studio agent flow.

## Endpoints

| Method | Route | Body | Response |
|---|---|---|---|
| POST | `/api/generate` | `{ "fileName": "tests.xlsx", "contentBase64": "<xlsx as base64>" }` | `{ generator, summary, files: [{ name, contentBase64, valid, deviations[], warnings[], dataProduct, caseId, processId, expected }], failed: [{ test, row, errors[] }], report: { name, contentBase64 } }` (report = test report .xlsx) |
| GET | `/api/template` | – | `{ name, contentBase64 }` (Excel template) |

At most 250 tests per call (app setting `MAX_ROWS`); more returns HTTP 413.

Auth level `function`: call with header `x-functions-key: <key>` or `?code=<key>`.

## Run / deploy

```bash
npm install
node test-local.js template.xlsx output      # local test, no Azure needed
func start                                   # Azure Functions Core Tools, local
func azure functionapp publish <app-name>    # deploy (Function App: Node 20+, Linux, Consumption or Flex plan)
```

No outbound network access is needed; the VT17 and VT15 taxonomies are embedded in `appdata.json` and `appdata-vt15.json`.

## Files

- `core.js` — taxonomy model access, realistic data, XBRL serialisation, validation (existence + conditional rules: VT17 192, VT15 258)
- `xlsx.js` — minimal .xlsx reader (no dependencies)
- `appdata.json` — VT17 model (concepts, hypercubes, rules) + official SBR Nexus example messages + synthetic residential/agricultural parts
- `appdata-vt15.json` — VT15 model + official examples + anonymised residential VT15 base
- `lib.js` — `generateFromXlsx(buffer)`
- `src/functions/generate.js` — Azure Functions HTTP triggers
- `template.xlsx` — the Excel template users fill in
