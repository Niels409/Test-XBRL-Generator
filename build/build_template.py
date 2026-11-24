"""Builds the Excel template (one sheet) for the test scenarios.

python3 build_template.py <appdata-vt17.json> <out.xlsx> [rows.json]
rows.json (optional) = a scenario set: {"title": ..., "rows": [{tax, product, case, report, use, street, nr, add, pc, vbos: [[id, use, value]], date, kvk, desc}]}
"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.utils import get_column_letter

APP = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
SET = json.load(open(sys.argv[3], encoding='utf-8')) if len(sys.argv) > 3 else None
HAS_DESC = True
N_PAIRS = 6
HEADER_ROW = 10
N_ROWS = 300

NAVY, TEAL, INK, INK2 = '17324D', '0E6E73', '17324D', '4A5F73'
F = 'Arial'
def fill(c): return PatternFill('solid', fgColor=c)
thin = Side(style='thin', color='D3DAD6')
hair = Side(style='hair', color='D3DAD6')
cell_border = Border(left=hair, right=hair, top=hair, bottom=thin)

wb = Workbook()
ws = wb.active
ws.title = 'Test scenarios'
ws.sheet_view.showGridLines = False
ws.sheet_view.zoomScale = 110

# ---------------------------------------------------------------- kolommen
N_VBO = 5
COLS = [
    # (kop, breedte, groep, hulptekst)
    ('Taxonomy', 11, 0, 'VT17 or VT15. Empty = VT17. VT15 has a completely different structure; the XBRL is built in the chosen taxonomy.'),
    ('Data product *', 24, 0, 'Taxatierapport (valuation report).' if len(APP['eps']) == 1 else
     'Pick the data product from the list (Taxatierapport = valuation report, Opdrachtbrief = engagement letter). Same names in VT17 and VT15.'),
    ('Case / Reference ID', 24, 0, 'Case ID used to find the file in the workflow tooling. Written to the assignment reference (SBR reference). Also used in the file name.'),
    ('Valuer report ID', 20, 0, "The valuer's own report number. Written to the contractor reference, allocated by the valuer."),
    ('Use (report)', 16, 0, 'Commercial, Residential, Mixed use or Agricultural (Agricultural: VT17 only). Written to "Commercieel en/of residentieel" and the default for every VBO without its own Use. Empty = derived from the VBO uses.'),
    ('Street', 24, 1, 'Street name of the property (VBO 1).'),
    ('House number', 11, 1, 'House number, digits only (e.g. 263).'),
    ('House number addition', 12, 1, 'Optional addition, e.g. a, B or 2-hoog.'),
    ('Postcode', 11, 1, 'Dutch postcode, e.g. 1017AB.'),
]
for n in range(1, N_VBO + 1):
    COLS.append((f'VBO ID {n}', 20, 2, ('VBO number of object 1. Also used as the Process ID (12 digits starting with 2000000). Empty = random Process ID.' if n == 1 else f'VBO number of object {n}. Leave empty if there is no VBO {n}.')))
    COLS.append((f'Use VBO {n}', 14, 2, f'Use of VBO {n}: Commercial (Ruimte), Residential (Eenheid), Agricultural (VT17 only) or Unlinked (no use, e.g. land or a parking space: only in the BAG VBO lists). Empty = Use (report); for Mixed use VBO 1 = commercial, others residential.'))
    COLS.append((f'Market value VBO {n} (EUR)', 15, 2, f'Market value of VBO {n} in whole euros. The total market value is the sum of all VBOs. Only residential VBOs also get a market value per unit (taxonomy has none for the other uses).'))
COLS += [
    ('Valuation date report', 14, 3, 'Valuation date of the report as dd-mm-yyyy (e.g. 30-10-2026). Empty = 7 days ago.'),
    ('Valuer CoC number', 14, 3, 'Chamber of Commerce (KvK) number of the valuation firm, 8 digits.'),
]
NFIX = len(COLS)
COLS.append(('Description', 50, 4, 'What this scenario tests. Not written to the XBRL; shown in the app and in the test report.'))
COLS.append(('Expected result', 16, 4, 'Optional: No deviations, Deviations or Not generated. The test report shows whether the outcome matches.'))
NCOL = len(COLS)
LASTCOL = get_column_letter(NCOL)

GROUPS = [  # naam, band-kleur, kop-tint
    ('Report', NAVY, 'DCE5EE'),
    ('Address', '2E6B57', 'DCEDE5'),
    ('VBOs and market value per VBO', '5B4A7A', 'E8E3F0'),
    ('Valuation and valuer', '8A5A1F', 'F3E8D8'),
    ('Scenario', '4A5F73', 'E6EAEE'),
]

# ---------------------------------------------------------------- titelband
for r in (1, 2):
    for ci in range(1, NCOL + 1):
        ws.cell(row=r, column=ci).fill = fill(NAVY)
ws.row_dimensions[1].height = 36
ws.row_dimensions[2].height = 20
ws['A1'] = 'Test XBRL Generator · ' + (SET['title'] if SET else 'test scenarios (VT17 / VT15)')
ws['A1'].font = Font(name=F, size=18, bold=True, color='FFFFFF')
ws['A1'].alignment = Alignment(vertical='center', indent=1)
ws['A2'] = f"Dutch real estate taxonomy {APP['version']} and VT15 (20210421) · load this file into the Test XBRL Generator"
ws['A2'].font = Font(name=F, size=10, color='B8CAD6')
ws['A2'].alignment = Alignment(vertical='top', indent=1)

# ---------------------------------------------------------------- uitleg
HELP = [
    ('How it works', 'One row per test. Each row becomes one XBRL file. Everything not listed here is filled in with realistic data.'),
    ('Required', 'Only Data product (marked with *). All other columns may be left empty. Taxonomy empty = VT17.'),
    ("VBOs", 'Up to 5 VBOs per test: VBO ID, its Use and its market value. Only the parts of the matching use are filled (commercial / residential / agricultural); Unlinked VBOs are not linked to a unit. The address applies to VBO 1.'),
    ('Examples & tips', ('The light blue rows are the scenarios of this set; change or extend them as you like.' if SET else 'The light blue rows are examples; overwrite or delete them.') + ' Negative test: type EMPTY in a field to leave it out of the XBRL; invalid values are written as given and shown as deviations.'),
]
HELP_END = 4 + len(HELP)
for i, (lab, txt) in enumerate(HELP):
    r = 4 + i
    ws.row_dimensions[r].height = 18
    for ci in range(1, NCOL + 1):
        ws.cell(row=r, column=ci).fill = fill('F4F7F6')
    a = ws.cell(row=r, column=1, value=lab)
    a.font = Font(name=F, size=10, bold=True, color=TEAL)
    a.alignment = Alignment(vertical='center', indent=1)
    b = ws.cell(row=r, column=2, value=txt)
    b.font = Font(name=F, size=10, color=INK)
    b.alignment = Alignment(vertical='center')
for ci in range(1, NCOL + 1):
    ws.cell(row=3, column=ci).fill = fill('F4F7F6')
    ws.cell(row=HELP_END, column=ci).fill = fill('F4F7F6')
ws.row_dimensions[3].height = 8
ws.row_dimensions[HELP_END].height = 8

# ---------------------------------------------------------------- groepsband + koppen
start = 1
spans = []
for gi, g in enumerate(GROUPS):
    cols = [i for i, c in enumerate(COLS, start=1) if c[2] == gi]
    spans.append((min(cols), max(cols), g))
for a, b, (name, band, tint) in spans:
    for ci in range(a, b + 1):
        ws.cell(row=HEADER_ROW - 1, column=ci).fill = fill(band)
    c = ws.cell(row=HEADER_ROW - 1, column=a, value=name)
    c.font = Font(name=F, size=10, bold=True, color='FFFFFF')
    c.alignment = Alignment(horizontal='left', vertical='center', indent=1)
    if b > a:
        ws.merge_cells(start_row=HEADER_ROW - 1, start_column=a, end_row=HEADER_ROW - 1, end_column=b)
ws.row_dimensions[HEADER_ROW - 1].height = 22

for ci, (h, w, gi, hint) in enumerate(COLS, start=1):
    band, tint = GROUPS[gi][1], GROUPS[gi][2]
    c = ws.cell(row=HEADER_ROW, column=ci, value=h)
    c.font = Font(name=F, size=10, bold=True, color=INK)
    c.fill = fill(tint)
    c.alignment = Alignment(vertical='center', wrap_text=True, indent=1)
    c.border = Border(left=Side(style='thin', color='FFFFFF'), bottom=Side(style='medium', color=band))
    ws.column_dimensions[get_column_letter(ci)].width = w
ws.row_dimensions[HEADER_ROW].height = 34

# ---------------------------------------------------------------- voorbeelden en invoerrijen
def ex(tax, prod, case, rep, use, street, nr, add, pc, vbos, date, kvk):
    row = [tax, prod, case, rep, use, street, nr, add, pc]
    for n in range(N_VBO):
        row += list(vbos[n]) if n < len(vbos) else ['', '', '']
    return row + [date, kvk, []]
if SET:
    examples = [ex(r.get('tax', 'VT17'), r['product'], r.get('case', ''), r.get('report', ''), r.get('use', ''), r.get('street', ''), r.get('nr', ''), r.get('add', ''), r.get('pc', ''),
                   [tuple(v) for v in r.get('vbos', [])], r.get('date', ''), r.get('kvk', '')) for r in SET['rows']]
    for e, r in zip(examples, SET['rows']):
        e.append([r.get('desc', ''), r.get('expected', '')])
else:
  examples = [
    ex('VT17', 'Taxatierapport', 'CASE-2026-000101', 'VR-2026-0457', 'Residential', 'Prinsengracht', '263', 'a', '1017AB',
       [('200000058297', 'Residential', 1250000)], '30-10-2026', '34567890'),
    ex('VT17', 'Taxatierapport', 'CASE-2026-000102', 'VR-2026-0458', 'Mixed use', 'Keizersgracht', '120', '', '1015CX',
       [('200000058298', 'Commercial', 2100000), ('200000058299', 'Residential', 950000), ('200000058301', 'Unlinked', 35000)], '28-10-2026', '56781234'),
    ex('VT17', 'Taxatierapport', 'CASE-2026-000103', 'VR-2026-0460', 'Agricultural', 'Polderweg', '7', '', '2411AB',
       [('200000058302', 'Agricultural', 3400000), ('200000058303', 'Unlinked', 150000)], '27-10-2026', '45671234'),
    ex('VT15', 'Taxatierapport', 'CASE-2026-000104', 'VR-2026-0461', 'Residential', 'Oudegracht', '88', '', '3511AV',
       [('200000058304', 'Residential', 410000)], '29-10-2026', '67812345'),
    ex('VT17', 'Opdrachtbrief', 'CASE-2026-000105', 'VR-2026-0459', 'Commercial', 'Coolsingel', '40', 'B', '3011AA',
       [('200000058300', 'Commercial', '')], '', '24123456'),
  ]
  for e, d in zip(examples, [('One home', 'No deviations'), ('Shop with home above it and a parking space', 'No deviations'),
                             ('Farm with land', 'No deviations'), ('VT15: one home', 'No deviations'), ('Engagement letter for a commercial property', 'No deviations')]):
      e.append(list(d))
FIRST = HEADER_ROW + 1
LAST = HEADER_ROW + N_ROWS
ex_fill = fill('EAF2FA')
zebra = fill('F8FAF9')
for r in range(FIRST, LAST + 1):
    is_ex = r < FIRST + len(examples)
    ws.row_dimensions[r].height = 20
    for ci in range(1, NCOL + 1):
        c = ws.cell(row=r, column=ci)
        c.number_format = '#,##0' if COLS[ci - 1][0].startswith('Market value') else '@'  # tekst: Excel zet ID's en datums niet om
        c.border = cell_border
        c.alignment = Alignment(vertical='center', indent=1 if ci != 1 else 1)
        if is_ex:
            c.fill = ex_fill
            c.font = Font(name=F, size=10, color='1F4E79')
        else:
            if (r - FIRST) % 2 == 1:
                c.fill = zebra
            c.font = Font(name=F, size=10, color=INK)
    if is_ex:
        ex = examples[r - FIRST]
        vals = ex[:NFIX]
        vals += list(ex[NFIX + 1]) if len(ex) > NFIX + 1 else ['', '']
        for ci, v in enumerate(vals, start=1):
            if v != '':
                ws.cell(row=r, column=ci, value=v)
for r in range(FIRST, FIRST + len(examples)):
    ws.cell(row=r, column=3).font = Font(name=F, size=10, bold=True, color='1F4E79')

# ---------------------------------------------------------------- keuzelijsten (verborgen kolommen op hetzelfde tabblad)
LISTCOL = NCOL + 4
fields = []
for i, k in enumerate(APP['eps'].keys(), start=FIRST):
    ws.cell(row=i, column=LISTCOL + 1, value=k)
L, L2 = get_column_letter(LISTCOL), get_column_letter(LISTCOL + 1)
ws.column_dimensions[L2].hidden = True

def dv(col_idx, **kw):
    h, w, gi, hint = COLS[col_idx - 1]
    d = DataValidation(allow_blank=True, showInputMessage=True, promptTitle=h.replace(' *', '')[:32], prompt=hint[:255], **kw)
    ws.add_data_validation(d)
    col = get_column_letter(col_idx)
    d.add(f'{col}{FIRST}:{col}{LAST}')
    return d

for ci in range(1, NCOL + 1):
    h = COLS[ci - 1][0]
    if h.startswith('Data product'):
        dv(ci, type='list', formula1=f'=${L2}${FIRST}:${L2}${FIRST + len(APP["eps"]) - 1}', showErrorMessage=True,
           errorTitle='Unknown data product', error='Please pick a data product from the list.')
    elif h == 'Taxonomy':
        dv(ci, type='list', formula1='"VT17,VT15"', showErrorMessage=True, errorTitle='Unknown taxonomy', error='Pick VT17 or VT15.')
    elif h.startswith('Use VBO'):
        dv(ci, type='list', formula1='"Commercial,Residential,Agricultural,Unlinked"', showErrorMessage=True,
           errorTitle='Unknown use', error='Pick Commercial, Residential, Agricultural (VT17 only) or Unlinked.')
    elif h.startswith('Market value'):
        dv(ci, type='whole', operator='greaterThanOrEqual', formula1='0', showErrorMessage=True,
           errorTitle='Invalid amount', error='Enter an amount in whole euros, without separators or text.')
    elif h == 'Expected result':
        dv(ci, type='list', formula1='"No deviations,Deviations,Not generated"', showErrorMessage=True,
           errorTitle='Unknown expected result', error='Pick No deviations, Deviations or Not generated.')
    elif h.startswith('Use'):
        dv(ci, type='list', formula1='"Commercial,Residential,Mixed use,Agricultural"', showErrorMessage=True,
           errorTitle='Unknown use', error='Pick Commercial, Residential, Mixed use or Agricultural (VT17 only).')
    else:
        dv(ci)

# ontbrekend dataproduct of scenario-ID rood markeren
red = PatternFill('solid', fgColor='F6D5D1')
ws.conditional_formatting.add(f'B{FIRST}:B{LAST}', FormulaRule(formula=[f'AND($B{FIRST}="",COUNTA($C{FIRST}:${LASTCOL}{FIRST})>0)'], fill=red))
# Agricultural bij VT15 rood markeren
for ci, c in enumerate(COLS, start=1):
    if c[0].startswith('Use'):
        col = get_column_letter(ci)
        ws.conditional_formatting.add(f'{col}{FIRST}:{col}{LAST}', FormulaRule(formula=[f'AND($A{FIRST}="VT15",${col}{FIRST}="Agricultural")'], fill=red))
# marktwaarde zonder VBO-ID
for n in range(N_VBO):
    idc = get_column_letter(10 + 3 * n); mvc = get_column_letter(12 + 3 * n)
    if n > 0:
        ws.conditional_formatting.add(f'{idc}{FIRST}:{idc}{LAST}', FormulaRule(formula=[f'AND(${idc}{FIRST}="",${mvc}{FIRST}<>"")'], fill=red))

ws.freeze_panes = ws.cell(row=FIRST, column=4)
ws.auto_filter.ref = f'A{HEADER_ROW}:{LASTCOL}{LAST}'
ws.page_setup.orientation = 'landscape'
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.print_title_rows = f'{HEADER_ROW - 1}:{HEADER_ROW}'
ws.sheet_view.selection[0].activeCell = f'A{FIRST + len(examples)}'
ws.sheet_view.selection[0].sqref = f'A{FIRST + len(examples)}'
wb.save(OUT)


def reproducible(path):
    """Fixed timestamps in the workbook properties and the zip entries: the same input gives the same bytes (no noise in git)."""
    import re, zipfile
    with zipfile.ZipFile(path) as z:
        items = [(i, z.read(i.filename)) for i in z.infolist()]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for info, data in items:
            if info.filename == 'docProps/core.xml':
                data = re.sub(rb'(<dcterms:(?:created|modified)[^>]*>)[^<]*', rb'\g<1>2026-01-01T00:00:00Z', data)
            zi = zipfile.ZipInfo(info.filename, date_time=(2026, 1, 1, 0, 0, 0))
            zi.compress_type, zi.external_attr = zipfile.ZIP_DEFLATED, info.external_attr
            z.writestr(zi, data)


reproducible(OUT)
print('sjabloon', OUT)
