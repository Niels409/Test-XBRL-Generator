# Test XBRL Generator: functional specification (rebuild)

This document describes what the generator does, precisely enough to rebuild it in any language. It matches the reference
implementation v2.2.0 (`app/core.js`, function `generate()`; section names below refer to its `// ----` comments). Where this
document and the reference differ, the acceptance test (section 8) decides.

## 1. Purpose and scope

The generator turns an Excel sheet with test scenarios into test XBRL instance documents for the real estate taxonomies of
SBR Nexus. One Excel row becomes one XBRL file. Fields that the row leaves empty are filled with realistic test data. The
files are used to test a lender's intake of valuation reports.

| In scope (first version) | Out of scope |
|---|---|
| Data product **Taxatierapport** (valuation report) | The other five data products |
| **VT17** (20240131, update 20260804) and **VT15** (20210421) | Business rules of the taxonomy (formula assertions), Arelle |
| Use per VBO: commercial, residential, agricultural (VT17 only), unlinked | Test report, scenario library |
| Input checks and fact checks (section 7) | User interface, Azure Function, macOS app |

The generator never reads the taxonomy. Everything it needs is in the model files (section 4).

## 2. Run

Input: an `.xlsx` file and the date of today (a parameter, default the system date; the acceptance test uses 2026-12-01).
Output: one XBRL file per generated row in an output folder, plus a list per row of: test ID, status (section 7.3), file
name, input check messages and fact check messages.

## 3. Input: the Excel sheet

**Header row.** The first row (on any sheet) with a cell whose normalised text is `data product`, `dataproduct`, `test id`
or `scenario-id`. Normalising: remove `*`, collapse whitespace, trim, lower case. Columns are found by the normalised header.

**Data rows.** Every row below the header that has at least one non-empty cell and a Data product or a Case / Reference ID.

**Test ID.** The Case / Reference ID, or `row <Excel row number>` when it is empty. When a Test ID occurs again for the same
taxonomy and data product, the later row gets `<Test ID>_row<Excel row number>`.

| Column (header) | Meaning | Allowed values | When empty |
|---|---|---|---|
| Taxonomy | Taxonomy of the file | `VT17`, `VT15` (any text containing 17 or 15) | VT17 |
| Data product * | Data product | `Taxatierapport` (case-insensitive, optional prefix `SBR `) | error E02 |
| Case / Reference ID | Case ID, written to *Opdrachtinformatie › Referentie*; also the Test ID | text | generated |
| Valuer report ID | Valuer's report number, written to *Opdrachtnemer › Referentie* | text | generated |
| Use (report) | Use of the whole report | see *Use values* | derived from the VBO uses (6.11) |
| Street | Street of VBO 1 (*Hoofdadres*) | text, max. 24 characters (taxonomy) | generated |
| House number | House number of VBO 1 | digits, optionally followed by an addition: `12`, `12-B`, `12 B` | generated |
| House number addition | Addition of VBO 1 | text | none |
| Postcode | Postcode of VBO 1 | `1234AB`; `1234 ab` is normalised to `1234AB` | generated |
| VBO ID n (n = 1..5) | BAG VBO ID of object n. VBO ID 1 is also the Process ID | 16 digits (BAG) or `2000000` + 5 digits | generated |
| Use VBO n | Use of VBO n | see *Use values* | from Use (report), see 6.4 |
| Market value VBO n (EUR) | Market value of VBO n | number | generated (6.11) |
| Valuation date report | Valuation date; also the date of every context | see *Dates* | today − 7 days |
| Valuer CoC number | KvK number of the valuation firm | 8 digits | generated |
| Description | What the row tests (not written to the XBRL) | text | |
| Expected result | Expected status (not used by the generator) | No deviations / Deviations / Not generated | |

**VBOs.** VBO n exists when VBO ID n, Use VBO n or Market value VBO n is filled. VBOs keep their column order; a VBO
without an ID gets a generated ID (6.3). Excel stores a 16-digit ID typed as a number with 15 digits: a numeric cell with 15
digits gets a leading `0`. A numeric Valuer CoC number is padded with leading zeros to 8 digits.

**EMPTY.** The cell values `EMPTY`, `<EMPTY>`, `REMOVE`, `DELETE`, `LEEG`, `<LEEG>`, `VERWIJDEREN` (any case) mean: leave
this field out of the XBRL (for negative tests). `BLANK` / `BLANCO` writes an empty value. In a VBO ID, EMPTY is not
possible (W01) and an ID is generated.

**Dates.** `dd-mm-yyyy`, `d-m-yyyy`, also with `/` or `.`; `yyyy-mm-dd`; an Excel date (serial number); `today`, `vandaag`,
or `today±N` followed by `d` (days), `w` (weeks), `m` (months) or `j`/`y` (years), e.g. `today-14d`. A month step keeps the
day, capped at the last day of the month. A date that does not exist (31-02-2026) is invalid.

**Numbers.** Excel numbers, or text: spaces and `€` are removed; `1.250.000` and `1.250.000,50` (dot thousands, comma
decimals) and `950000,50` are Dutch formats.

**Use values** (report and per VBO; checked in this order, case-insensitive; numbers are the codes of the taxonomy):

| Code | Recognised when the text | Meaning |
|---|---|---|
| u | contains `unlink`, `no use`, `geen`, `ongekoppeld`, `parkeer`, `parking`, `grond`, or is `land` | unlinked (VBO only) |
| a | contains `agri`, `agrar`, `landelijk`, `rural`; or is `5` | agricultural (VT17 only) |
| m | contains `mix`, `both`, `gemengd`, `beide`; or is `3` | mixed use (report only) |
| r | contains `resid`, `woon`, `wonen`, `buy-to-let` / `buy to let`; or is `2` or `4` | residential |
| c | contains `comm`, `zakelijk`, `bedrijf`; or is `1` | commercial |
| ? | anything else | not recognised (W04 / W06) |

## 4. Model files

`model/vt17-taxatierapport.json` and `model/vt15-taxatierapport.json` are compiled from the official taxonomy packages and
example messages (build scripts in `build/`, reference implementation). JSON, same format for both:

```text
{ "tax": "VT17",
  "ns": { prefix: namespace URI },                         used for the namespace declarations
  "concepts": { "<prefix:Name>": {
      "l": label, "doc": documentation, "p": "i" (instant) | "d" (duration), "k": kind,
      "e": [[code, label], ...],                           allowed values (kind enum, or an enumeration facet)
      "maxLength", "minLength", "pattern", "minInclusive", "maxInclusive": facets (strings) } },
  "roles": { "<role id>": {                                hypercubes: which dimensions a concept may have
      "l": label, "u": role URI,
      "x": [ { "a": axis, "t": typed member element } | { "a": axis, "m": [allowed explicit members] } ],
      "i": [ concepts ] } },
  "eps": { "Taxatierapport": {
      "href": entry point URL (schemaRef),
      "roles": [ role ids of this data product ],
      "keys": [ [field key, role id, concept] ],           the fields the generator writes (6.10, 6.11)
      "base": { "anchor": "yyyy-mm-dd", "entity": [scheme, id], "facts": [fact] },   the base report
      "ext":  { "r": { "anchor", "facts", "full"? }, "a": {...} } } } }       parts per use (VT17: r, a; VT15: r)
fact = { "c": concept, "d": [[axis, "t"|"e", member], ...], "v": value, "u": [measures] | absent, "dec": decimals,
         "g": use code ("c", "r", "a") when the fact belongs to the part of one use }
```

Kinds (`k`): `string`, `enum`, `enumSet`, `date`, `gYear`, `duration`, `boolean`, `integer`, `decimal`, `percent`,
`monetary`, `area`, `length`, `energy`, `volume`; no `k` = abstract. The base report is the official example message of the
data product; the commercial part is tagged `g: "c"`. The residential and agricultural parts (`ext`) are synthetic, built
from the taxonomy. A field key is the path *section › label* as in the taxonomy presentation.

## 5. Output: the XBRL file

**File name.** `<Test ID>_Taxatierapport.xbrl`, for VT15 `<Test ID>_VT15_Taxatierapport.xbrl`. In the Test ID every run of
characters other than letters, digits, `_`, `.` and `-` becomes `_`; leading and trailing `_` are removed; max. 60 characters.

**Layout** (UTF-8, `\n` line ends, two-space indentation):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Test data generated by Test XBRL Generator v2.2.0 (VT17, Taxatierapport) on 2026-12-01. Not a real valuation. -->
<xbrli:xbrl xml:lang="nl" xmlns:frc-vt-dim="..." xmlns:...>
  <link:schemaRef xlink:type="simple" xlink:href="{href}"/>
  {contexts} {units} {facts}
</xbrli:xbrl>
```

- **Namespaces**: `xbrli`, `link`, `xlink`, plus every prefix used by a fact concept, an axis, an explicit member, a typed
  member element or a measure, plus `xbrldi` when there are dimensions; sorted by prefix; URIs from `ns`. The comment line
  names the generator, version, taxonomy, data product and date and says the file is test data (the text is free).
- **Contexts** `c1, c2, …` in order of first use by the facts. One context per combination of period type and dimensions.
  Entity: `<xbrli:identifier scheme="{base.entity[0]}">{entity id}</xbrli:identifier>` (entity id: 6.15). Period: the
  valuation date as `<xbrli:instant>` for instant concepts, otherwise `<xbrli:startDate>` and `<xbrli:endDate>` both the
  valuation date. Dimensions in `<xbrli:scenario>`, sorted by axis: `<xbrldi:explicitMember dimension="{axis}">{member}</…>`
  or `<xbrldi:typedMember dimension="{axis}"><{element}>{value}</{element}></xbrldi:typedMember>`, where element is the
  `t` of the first role (in model order) that has this axis as a typed axis.
- **Units** `u1, u2, …` in order of first use, one `<xbrli:measure>` per measure.
- **Facts** in generation order: `<{concept} contextRef="cN">{value}</{concept}>`, numeric facts with
  `unitRef="uN" decimals="{dec or INF}"`. Text is escaped (`&`, `<`, `>`; in attributes also `"`).
- Units by kind for new facts: monetary `iso4217:EUR`; percent, integer, decimal `xbrli:pure`; area `utr:sqm`; length
  `utr:m`; energy `utr:J`; volume `utr:m3`; decimals `INF`.

## 6. Generation

Facts are a list of `{c, d, v, u, dec}`. The steps run in this order for one row.

**6.1 Taxonomy and data product.** Empty taxonomy = VT17; text containing `15` = VT15, containing `17` = VT17; otherwise
error E01. The data product must be Taxatierapport, otherwise error E02. VT15 and an agricultural use (report or VBO): E03.
A row with an error gets no file.

**6.2 Valuation date and date shift.** Valuation date = the parsed *Valuation date report*; empty or EMPTY = today − 7 days.
Invalid: W10, the contexts use today − 7 days and the field gets the literal text (6.11, giving fact check F04). After today:
W09. For each fact source (base, ext.r, ext.a) the shift is the number of days from its `anchor` to the valuation date.

**6.3 VBOs.** Given IDs are used as they are (W02 for a repeated ID, W03 for an ID that is neither 16 digits nor
`2000000`+5 digits). Missing IDs, and all VBOs of a row without VBOs (then one VBO), get a generated BAG ID: 4-digit
municipality code + `01` + 10 random digits. Also generated once per row: a pand ID (`…10…`) and another BAG ID (`…02…`).

**6.4 Uses.** Report use from *Use (report)* (W04 if not recognised). VBO use, per VBO: a recognised c/r/a/u is used; else
the report use if it is c, r or a; else, when the report use or the VBO use is mixed (m): commercial for VBO 1 and
residential for the others (W05 when the VBO use itself was m, W06 when it was not recognised); else commercial.
*Uses* = the set of VBO uses without u; when empty: {c, r} for a mixed report, else {report use} when it is recognised
(c, r, a or u; with u no use part is included), else {c}.
Warnings: W07 mixed report with one VBO and no VBO uses given; W08 report use (m = c+r) differs from *uses*.

**6.5 Start facts.** Primary source = `ext.r` when *uses* has r but not c and `ext.r.full` is true, otherwise `base`. Take the
primary facts without `g` or with `g` in *uses*. Then, for each use in *uses* (in order of first appearance) that has an
`ext` part which is not the primary, is not c with the base as primary, and has no facts in the primary: append the facts of
that part with that `g`. Every copied fact remembers the shift of its source (6.2).

**6.6 BAG placeholders.** Every `BAGPANDIDAxis` member and `BAGPANDID` value becomes the pand ID; every `BAGOTHERIDAxis`
member and `BAGOTHERID` value the other BAG ID.

**6.7 VBO expansion.** The example VBO = the first `BAGVBOIDAxis` member among facts without `g`. Each fact without `g`
that has `BAGVBOIDAxis` with the example VBO is replaced, in place, by one copy per VBO (in VBO order) with that VBO's ID
as member; a `BAGVBOID` copy gets the VBO ID as value. Such facts with another example member are removed. Then every
`BAGVBOID` fact without `BAGVBOIDAxis` whose value is not 16 digits gets the first VBO of the matching use (`HouseAxis` →
residential, `UnitAxis` → commercial), else VBO 1.

**6.8 Units per use.** For each use c, r, a (in this order) in *uses*:

| Use | Axis | Member |
|---|---|---|
| c | `frc-vt-dim:UnitAxis` | `Ruimte 1`, `Ruimte 2`, … |
| r | `frc-vt-dim:HouseAxis` | `Eenheid 1`, `Eenheid 2`, … |
| a | `frc-vt-dim:RealEstatePropertyAxis` | `Object 1`, `Object 2`, … |

The unit facts are the facts with `g` = that use, the axis, and no `LeaseContractAxis`. The template is the unit facts with
the member of the first one. All unit facts are removed; then for the k-th VBO of that use (k = 1, 2, …) a copy of the
template is appended with member `<Name> k`, `BAGVBOIDAxis` set to that VBO and `LinkedBAGVBOID` = that VBO. When no VBO
has the use, one copy `<Name> 1` is made without the facts that have `BAGVBOIDAxis` or concept `LinkedBAGVBOID`.
For c, the lease contracts point to the first commercial unit and VBO. Every fact with `LeaseContractAxis`: with the unit
axis it is kept only for the template member (renamed `Ruimte 1`); a `BAGVBOIDAxis` member and a `LinkedBAGVBOID` value
become the first commercial VBO (the fact is removed when no VBO is commercial). Other `LinkedBAGVBOID` facts of the
commercial part (`g` = c, without unit and VBO axis) also get the first commercial VBO (removed when there is none).
VT15 has no `BAGVBOIDAxis` facts in the unit part: there a Ruimte is never linked to a VBO.

**6.9 Realistic values.** Dates (kind date) move by the shift of their source; `DocumentCreationDate` = today.
A `LinkedBAGVBOID` not set by the lease rule of 6.8 = the member of its `BAGVBOIDAxis`, else the VBO it was copied for
(6.7, 6.8), else VBO 1. A `HouseNumberAddition` fact of a VBO copy is removed when the row has no house number addition.
The fields below get realistic generated values; **any value that passes the fact checks is accepted** (the acceptance test
does not compare them):
`FirstName FamilyName Prefix Initials JobTitle OrganisationName LegalEntityName ShortName ChamberOfCommerceRegistrationNumber
EmailAddressFull TelephoneNumber StreetNameNL StreetNameNLFull HouseNumberNL HouseNumberAddition PostalCodeNL
PlaceOfResidenceNL DescriptionLocationNL LandRegister LandRegisterCode LandRegisterSection LandRegisterNumber
LandRegisterReference OwnerAccordingToLandRegister FileName MimeType SoftwareUsed SoftwareUsedReference Reference
BusinessNames NameComplex PropertyName UnitNameDescriptive KVKnumber NameValuationReport ValuationAmount UsableFloorArea
MarketRent BAGPANDID BAGOTHERID`, and text facts whose example value is placeholder text (`tekst`, `toelichting`, …).
The reference uses one consistent "persona" (name, company, address, KvK) per party, addresses of VBO n = address of VBO 1
with house number + 2(n−1), and short Dutch sentences for placeholder text, cut to `maxLength`. These values are overwritten
where the row gives a value (6.10, 6.11). Generated values should be the same when the same row is generated again.

**6.10 Case ID and Process ID.** A given Case / Reference ID (not EMPTY) is written to field key
*Opdrachtinformatie › Referentie*; when that context has no `ReferenceAllocatedByPartyType` yet, add one with `4`
(VT15: `Geldgever`). Process ID = VBO ID 1 as given, else `2000000` + 5 random digits (W11 when not `2000000`+5 digits). It is
written to *Opdrachtgever › Referentie* and *Opdrachtgever › Omschrijving van de referentie*, with *Opdrachtgever › Referentie
toegekend door* = `4` (VT15 `Geldgever`).

**Writing a field** (also 6.11): the targets are the facts with the field's concept whose dimensions fit the field's role
(same number of dimensions; typed axes present; explicit members allowed). For fields with `BAGVBOIDAxis` (*Hoofdadres*) only
the fact of VBO 1. EMPTY removes the targets; BLANK writes `""`; otherwise the value is converted by kind (dates and numbers
as in section 3; an enum value may be the code or the label; W13–W16 when conversion fails, the text is then written as is)
and written to every target. Without targets a fact is added: dimensions from the role (typed `BAGVBOIDAxis` = the VBO,
`BAGPANDIDAxis`/`BAGOTHERIDAxis` = the generated IDs, other typed axes = a member already used for that axis or `1`, explicit
axes = their first member), unit by kind, decimals `INF`. A field key that does not exist in the taxonomy: W12.

**6.11 Columns.** Before writing: VBOs without a market value get a generated value (residential 180,000–600,000; commercial
400,000–2,500,000; agricultural 1,000,000–4,000,000; unlinked 20,000–150,000; in steps of 10,000). Total market value =
the rounded sum of all VBO values (EMPTY and non-numeric values count as 0; when every VBO value is EMPTY no total is
written). When *Use (report)* is empty it becomes `5` if *uses* has a, else `3` if c and r, else `2` if r, else `1`. A postcode `1234 ab` becomes `1234AB`; a house number `12-B` gives number `12`
and, when the addition column is empty, addition `B`. Then, in this order:

| Value | Field key(s) | Conversion / extra |
|---|---|---|
| Valuer report ID | *Opdrachtnemer › Referentie* | also *Opdrachtnemer › Referentie toegekend door* = `6` (VT15 `Taxateur`) |
| Use (report) | VT17 *Informatie taxatierapport › Scope taxatie*; VT15 *… › Commercieel en/of residentieel onroerend goed* | code: c 1, r 2, m 3, a 5; `1`–`5` as is; else the text |
| Postcode | *Hoofdadres › Postcode* (VBO 1) | |
| House number addition | *Hoofdadres › Huisnummertoevoeging* (VBO 1) | |
| Street | *Hoofdadres › Straatnaam* (VBO 1) | |
| House number | *Hoofdadres › Huisnummer* (VBO 1) | digits part; addition as above |
| Total market value | *Waarde › Getaxeerde waarde* | also *Waarde › Waarde begrip* = `10` |
| Valuation date report | *Waarde › Waardepeildatum* | |
| Valuer CoC number | *Taxatieorganisatie › KvK-nummer* and *Opdrachtnemer › KvK-nummer* | |

The field keys resolve to role and concept through `keys` in the model.

**6.12 References (VT17).** The rent and sale references (`LeaseReferenceAxis`, `SaleInvestmentReferencesAxis` members, in
order of first appearance) are given the uses of *uses* in turn (order c, r, a, repeating). Facts of a reference of another
use than agricultural lose the agricultural-only fields (`BuildingBlocksAcreage BuildingBlocksAmount
TypeSaleReferenceRuralAgricultural CommercialBuildings CommercialBuildingsAmount CultivatedLand CultivableLandAmount
HousesAcreage HousesAmount RightsAmount OtherLand`); `IPDSubtype` is kept only for commercial references. `ReferenceType` =
`1` c, `2` r, `3` a; `IPDTypeProperty` = `5` r, `6` a, for c the example value if it is 1–4, else `3`.

**6.13 Market value per VBO.** Only residential units have a value per unit. For each residential VBO with its Eenheid:
EMPTY value → remove its `MarketValueVHE`; otherwise `MarketValueVHE` = the given value (rounded to whole euros; W17 and
written as given when it is not a number, W18 when negative) or the generated value; `UsableFloorArea` and `MarketRent`
get realistic values (reference: area = value / 6000 rounded to 5 within 30–400; rent = 4 % of the value rounded to 100,
min. 1200). Each is set on the Eenheid's facts with only `HouseAxis`
(and `HouseTypeAxis`), or added with their dimensions. **VT15** also writes the total per part to *KPI's van het
taxatieresultaat commercieel › Marktwaarde k.k. (afgerond)* and *… residentieel …*, for each use c / r in *uses*: the sum of
the given values of that use when there are several uses (the total when that sum is 0), else the total.

**6.14 Sector type.** When *uses* has exactly one use, the facts `IPDTypeProperty` and `ActualUse` that have none of the axes
`UnitAxis HouseAxis LeaseReferenceAxis SaleInvestmentReferencesAxis LeaseReferenceCommercialAxis
SaleInvestmentReferencesCommercial SaleReferenceResidentialAxis TypeOfRealEstateAxis` get, for r, the first code whose label starts with *woning* or *residentieel*;
for a, the first whose label contains *landelijk* or *agrar*; for c, when the current label contains *woning*, *landelijk* or
*agrar*, the first whose label starts with *kantoor*. For r and a those `IPDSubtype` facts are removed.

**6.15 Entity.** The entity identifier is the value of the `ChamberOfCommerceRegistrationNumber` fact whose only
non-BAG dimension is `PartyAxis = DebtorPartyMember`, else the generated KvK of that party.

## 7. Checks

### 7.1 Input checks

| ID | Level | When |
|---|---|---|
| E01 | error | Taxonomy is not VT17 or VT15 |
| E02 | error | Data product is not Taxatierapport |
| E03 | error | Agricultural use (report or VBO) in VT15 |
| W01 | warning | EMPTY in a VBO ID (an ID is generated) |
| W02 | warning | The same VBO ID more than once (its facts are duplicated: F07) |
| W03 | warning | VBO ID not 16 digits and not `2000000`+5 digits |
| W04 | warning | Use (report) not recognised |
| W05 | warning | Use VBO n is Mixed use |
| W06 | warning | Use VBO n not recognised |
| W07 | warning | Mixed use with one VBO and no VBO uses |
| W08 | warning | Use (report) differs from the VBO uses |
| W09 | warning | Valuation date after today |
| W10 | warning | Valuation date is not a valid date |
| W11 | warning | Process ID (VBO ID 1) not `2000000`+5 digits |
| W12 | warning | A column's field does not exist in the taxonomy |
| W13 | warning | A date value that is not a valid date (kept as text) |
| W14 | warning | A code that is not in the allowed values (kept as text) |
| W15 | warning | A number that is not a valid number (kept as text) |
| W16 | warning | A whole number expected |
| W17 | warning | Market value VBO n is not a number |
| W18 | warning | Market value VBO n is negative |
| W19 | warning | The data product has no field for the Case ID |

Messages are free text; they name the column, the value and what happens. A row with an error gets no file.

### 7.2 Fact checks (on every fact of a generated file)

| ID | Check |
|---|---|
| F01 | The concept exists in the model |
| F02 | The dimensions fit one of the data product's roles that lists the concept (same axes; explicit member allowed) |
| F03 | Numeric kinds have a unit, others none; monetary uses `iso4217:XXX` |
| F04 | The value fits the kind (date `yyyy-mm-dd` that exists; gYear `yyyy`; duration `P…`; integer; decimal number; enum code; boolean) and the facets (`e` allowed values; `minInclusive`, `maxInclusive`, `maxLength`, `minLength`, `pattern` as a full match). enumSet values are not checked |
| F05 | Warning only: empty text value |
| F06 | A typed dimension has a value |
| F07 | No two facts with the same concept and dimensions |

### 7.3 Status

`failed` when the row has an input error (no file); else `deviations` when a fact check other than F05 fails (the file is
still written); else `ok`. Warnings do not change the status.

## 8. Acceptance test

`acceptance/scenarios.xlsx` holds 30 rows; `acceptance/expected/<Test ID>.json` what each must give, generated with
today = 2026-12-01:

```text
{ "test", "description", "row", "taxonomy", "status": "ok" | "deviations" | "failed",
  "inputChecks": [sorted check ids], "file": file name, "contextDate": valuation date, "entityScheme",
  "deviations": [ { "check": "F04", "concept": "nl-cd:StreetNameNL", "facet": "maxLength" }, ... ],
  "facts": [ "concept|dimensions|unit|value", ... ] }
```

A rebuilt generator passes when, for every row: status, input check ids (as a list with repeats) and deviations match; and
for every generated file the file name, the context date (all contexts), the entity scheme and the facts match. Facts are
compared as a multiset of lines `concept|dimensions|unit|value`: dimensions `axis=member` sorted by axis and joined by `;`
(typed member = the text inside the typed member element), unit = measures joined by `*` (empty when none), value = the
text of the fact. A `*` as value or as member matches anything. `acceptance/reference/*.xbrl` shows reference output of
five rows (generated values differ from run to run).

## 9. Taxonomy notes (found while testing)

- `nl-cd:StreetNameNL` has max. 24 characters (Nederlandse Taxonomie); longer street names are rejected by intake checks.
- VT15 has no agricultural part, and its rules do not allow a BAG VBO ID per Ruimte: commercial VBOs are not linked to a Ruimte.
- VT17 uses codes for *Referentie toegekend door* (`4` lender, `6` valuer); VT15 uses the texts `Geldgever`, `Taxateur`.
- Only residential units have a market value per unit (`MarketValueVHE`); other VBO values only count in the total.
- The parts of uses that do not occur are left out, so a residential report has no commercial lease data and vice versa.
