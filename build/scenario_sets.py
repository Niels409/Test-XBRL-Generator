"""Scenario library: ready-made sets of test scenarios.

python3 build/scenario_sets.py <appdata-vt17.json> <out dir>
Writes one filled template per set plus index.json (used by the app).
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
_n = [58400]


def vbo():
    """Next VBO number in the test range: 12 digits starting with 2000000 (also valid as Process ID)."""
    _n[0] += 1
    return '2000000' + str(_n[0])


def row(case, desc, product='Taxatierapport', tax='VT17', use='', vbos=(), street='', nr='', add='', pc='', date='', kvk='', report='', expected='No deviations'):
    return {'tax': tax, 'product': product, 'case': case, 'report': report, 'use': use, 'street': street, 'nr': nr, 'add': add, 'pc': pc,
            'vbos': [[vbo() if v[0] == '+' else v[0], v[1], v[2] if len(v) > 2 else ''] for v in vbos], 'date': date, 'kvk': kvk, 'desc': desc, 'expected': expected}


A = dict(street='Oudegracht', nr='112', pc='3511AW', kvk='34567890')
B = dict(street='Coolsingel', nr='40', add='B', pc='3011AD', kvk='24123456')
C = dict(street='Polderweg', nr='7', pc='2411NA', kvk='45671234')
R, K, AG, U = 'Residential', 'Commercial', 'Agricultural', 'Unlinked'


def residential(tax, p):
    return [
        row(f'{p}-RES-01', 'One home with a market value', tax=tax, use=R, vbos=[('+', R, 425000)], report='VR-RES-01', date='today-14d', **A),
        row(f'{p}-RES-02', 'Three homes, each with its own market value; total = sum', tax=tax, use=R, vbos=[('+', R, 310000), ('+', R, 295000), ('+', R, 405000)], **A),
        row(f'{p}-RES-03', 'Five homes (maximum of the template)', tax=tax, use=R, vbos=[('+', R, 250000 + i * 15000) for i in range(5)], **A),
        row(f'{p}-RES-04', 'Home with a parking space (Unlinked): parking space only in the BAG lists', tax=tax, use=R, vbos=[('+', R, 520000), ('+', U, 30000)], **A),
        row(f'{p}-RES-05', 'Homes without market values: values are generated, total = sum', tax=tax, use=R, vbos=[('+', R), ('+', R)], **A),
        row(f'{p}-RES-06', 'Use only at report level: every VBO becomes residential', tax=tax, use=R, vbos=[('+', '', 380000), ('+', '', 360000)], **A),
        row(f'{p}-RES-07', 'No report Use: derived from the VBOs (residential)', tax=tax, vbos=[('+', R, 440000)], **A),
        row(f'{p}-RES-08', 'Minimal row: only data product and Use', tax=tax, use=R),
    ]


def commercial(tax, p):
    return [
        row(f'{p}-COM-01', 'One commercial unit (Ruimte) with lease contract', tax=tax, use=K, vbos=[('+', K, 1850000)], report='VR-COM-01', **B),
        row(f'{p}-COM-02', 'Three commercial units; lease contract linked to the first', tax=tax, use=K, vbos=[('+', K, 900000), ('+', K, 700000), ('+', K, 450000)], **B),
        row(f'{p}-COM-03', 'Commercial unit with land (Unlinked)', tax=tax, use=K, vbos=[('+', K, 1200000), ('+', U, 150000)], **B),
        row(f'{p}-COM-04', 'Commercial without market values', tax=tax, use=K, vbos=[('+', K), ('+', K)], **B),
        row(f'{p}-COM-05', 'Very high value (EUR 950 million)', tax=tax, use=K, vbos=[('+', K, 950000000)], **B),
    ]


def mixed(tax, p):
    return [
        row(f'{p}-MIX-01', 'Shop with a home above it: one Ruimte and one Eenheid', tax=tax, use='Mixed use', vbos=[('+', K, 1000000), ('+', R, 400000)], **B),
        row(f'{p}-MIX-02', 'Residential VBO first, commercial second', tax=tax, use='Mixed use', vbos=[('+', R, 350000), ('+', K, 650000)], **B),
        row(f'{p}-MIX-03', 'Two commercial, two residential and a parking space', tax=tax, use='Mixed use', vbos=[('+', K, 800000), ('+', R, 300000), ('+', K, 500000), ('+', R, 320000), ('+', U, 30000)], **B),
        row(f'{p}-MIX-04', 'Mixed without Use per VBO: VBO 1 commercial, others residential', tax=tax, use='Mixed use', vbos=[('+', '', 900000), ('+', '', 300000), ('+', '', 310000)], **B),
        row(f'{p}-MIX-05', 'No report Use: mixed is derived from the VBOs', tax=tax, vbos=[('+', K, 700000), ('+', R, 300000)], **B),
        row(f'{p}-MIX-06', 'Only unlinked VBOs under a residential report', tax=tax, use=R, vbos=[('+', U, 50000), ('+', U, 60000)], **A),
    ]


def agricultural(p):
    return [
        row(f'{p}-AGR-01', 'Farm: one agricultural object', use=AG, vbos=[('+', AG, 2500000)], **C),
        row(f'{p}-AGR-02', 'Farm with land (Unlinked) and a second object', use=AG, vbos=[('+', AG, 2500000), ('+', U, 400000), ('+', AG, 600000)], **C),
        row(f'{p}-AGR-03', 'Farm with farmhouse (agricultural + residential)', use=AG, vbos=[('+', AG, 2000000), ('+', R, 450000)], **C),
        row(f'{p}-AGR-04', 'All three uses in one report', vbos=[('+', K, 800000), ('+', R, 400000), ('+', AG, 900000)], **C),
    ]


def products(tax, p):
    names = ['Opdrachtbrief', 'Taxatierapport', 'Taxatierapport-Conformiteitsscore', 'Huurinformatie', 'Gebouwinformatie', 'Duurzaamheidsinformatie']
    v = vbo()
    return [row(f'{p}-DOSSIER-1', f'{n}: same case and VBO in every data product', product=n, tax=tax, use=R, vbos=[(v, R, 415000)], report='VR-DOS-1', **A) for n in names]


def negative(p):
    base = dict(use=R, **A)
    return [
        row(f'{p}-NEG-01', 'Reference: valid report (should be accepted)', vbos=[('+', R, 400000)], **base),
        row(f'{p}-NEG-02', 'Street name longer than 24 characters (schema error)', expected='Deviations', use=R, vbos=[('+', R, 400000)], street='Burgemeester de Withstraat', nr='5', pc='3511AW', kvk='34567890'),
        row(f'{p}-NEG-03', 'Postcode in the wrong format', expected='Deviations', use=R, vbos=[('+', R, 400000)], street='Oudegracht', nr='112', pc='35111', kvk='34567890'),
        row(f'{p}-NEG-04', 'Valuer CoC number with 7 digits and a letter', expected='Deviations', use=R, vbos=[('+', R, 400000)], street='Oudegracht', nr='112', pc='3511AW', kvk='1234567A'),
        row(f'{p}-NEG-05', 'Valuer CoC number left out (EMPTY): required field', expected='Deviations', use=R, vbos=[('+', R, 400000)], street='Oudegracht', nr='112', pc='3511AW', kvk='EMPTY'),
        row(f'{p}-NEG-06', 'Postcode of the main address left out (EMPTY): allowed by the taxonomy, tests the workflow', use=R, vbos=[('+', R, 400000)], street='Oudegracht', nr='112', pc='EMPTY', kvk='34567890'),
        row(f'{p}-NEG-07', 'Valuation date that does not exist (31-02-2026)', expected='Deviations', vbos=[('+', R, 400000)], date='31-02-2026', **base),
        row(f'{p}-NEG-08', 'Valuation date in the future: allowed by the taxonomy (warning), tests the workflow', vbos=[('+', R, 400000)], date='today+30d', **base),
        row(f'{p}-NEG-09', 'Valuation date left out (EMPTY): required field', expected='Deviations', vbos=[('+', R, 400000)], date='EMPTY', **base),
        row(f'{p}-NEG-10', 'Market value is text instead of a number', expected='Deviations', vbos=[('+', R, 'onbekend')], **base),
        row(f'{p}-NEG-11', 'Negative market value: allowed by the taxonomy (warning), tests the workflow', vbos=[('+', R, -5000)], **base),
        row(f'{p}-NEG-12', 'Market value zero: tests the workflow', vbos=[('+', R, 0)], **base),
        row(f'{p}-NEG-13', 'Real 16-digit BAG VBO ID: Process ID is not 12 digits starting with 2000000 (warning)', vbos=[('0363010000123456', R, 400000)], **base),
        row(f'{p}-NEG-14', 'No VBO at all: random Process ID', **base),
        row(f'{p}-NEG-15', 'Same VBO twice in one report: duplicate facts', expected='Deviations', vbos=[('200000059999', R, 400000), ('200000059999', R, 400000)], **base),
        row(f'{p}-NEG-16', 'Report says commercial, VBO is residential (mismatch, warning)', use=K, vbos=[('+', R, 400000)], **A),
        row(f'{p}-NEG-17', 'Mixed use with only one VBO (warning)', use='Mixed use', vbos=[('+', '', 600000)], **A),
        row(f'{p}-NEG-18', 'Agricultural in VT15: not possible, the row is refused', expected='Not generated', tax='VT15', use=AG, vbos=[('+', AG, 1000000)], **C),
        row(f'{p}-NEG-19', 'Use (report) left out (EMPTY): required field', expected='Deviations', use='EMPTY', vbos=[('+', R, 400000)], **A),
        row(f'{p}-NEG-20', 'Valuer report ID left out (EMPTY): allowed by the taxonomy, tests the workflow', use=R, vbos=[('+', R, 400000)], report='EMPTY', **A),
    ]


SETS = [
    ('01-residential-vt17', 'Residential (VT17)', 'Homes: one or more Eenheden, parking space, with and without market values.', residential('VT17', 'S1')),
    ('02-commercial-vt17', 'Commercial (VT17)', 'Commercial units (Ruimte) with lease contracts, land, high values.', commercial('VT17', 'S2')),
    ('03-mixed-and-unlinked-vt17', 'Mixed use and unlinked (VT17)', 'Combinations of commercial and residential VBOs and unlinked VBOs.', mixed('VT17', 'S3')),
    ('04-agricultural-vt17', 'Agricultural (VT17)', 'Farms, land and combinations with the other uses.', agricultural('S4')),
    ('05-all-data-products-vt17', 'All data products, one case (VT17)', 'The six data products for the same case and VBO.', products('VT17', 'S5')),
    ('06-vt15', 'VT15: residential, commercial, mixed, all data products', 'The VT15 counterparts of sets 1, 2, 3 and 5.', residential('VT15', 'S6')[:5] + commercial('VT15', 'S6')[:3] + mixed('VT15', 'S6')[:4] + products('VT15', 'S6')),
    ('07-negative-tests', 'Negative tests', 'Invalid, missing and contradictory input. Most rows are generated on purpose with deviations; the expected problem is in the Description.', negative('S7')),
]
SETS.append(('00-full-regression', 'Full regression set', 'All valid scenarios of sets 1 to 6 in one file.', [dict(r, case=r['case'].replace(r['case'].split('-')[0], 'REG' + r['case'].split('-')[0][1:], 1)) for s in SETS[:6] for r in s[3]]))

if __name__ == '__main__':
    appdata, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    index = []
    for key, title, desc, rows in sorted(SETS):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump({'title': title, 'rows': rows}, f)
        fn = f'{key}.xlsx'
        subprocess.run([sys.executable, os.path.join(HERE, 'build_template.py'), appdata, os.path.join(out, fn), f.name], check=True, stdout=subprocess.DEVNULL)
        os.unlink(f.name)
        index.append({'key': key, 'title': title, 'description': desc, 'file': fn, 'rows': len(rows)})
    json.dump(index, open(os.path.join(out, 'index.json'), 'w', encoding='utf-8'), indent=1)
    print('scenario sets:', ', '.join(f"{i['key']} ({i['rows']})" for i in index))
