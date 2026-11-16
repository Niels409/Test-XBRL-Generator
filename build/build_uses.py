"""Adds use information (commercial / residential / agricultural) to an appdata.json.

Usage: python3 build_uses.py <appdata.json> vt17|vt15 [residential example .json (vt15)]

- every Taxatierapport base fact gets a tag  g = 'c' | 'r' | 'a'  when it belongs to a use-specific part
- eps.Taxatierapport.ext = { r: {facts, anchor, full}, a: {...} } : extra source facts for the other uses
  VT15 residential: a real residential VT15 message, anonymised here (all free text -> placeholders)
  VT17 residential / agricultural: synthetic sections (no official example exists for them)
"""
import json, sys, re

P, VER = sys.argv[1], sys.argv[2]
A = json.load(open(P))
C = A['concepts']

TYPED = {
    'HouseAxis': 'r', 'HouseTypeAxis': 'r', 'SaleReferenceResidentialAxis': 'r',
    'ComplexCostsContinuedExploitationYearAxis': 'r', 'ComplexCostsAfterRentSalesYearAxis': 'r',
    'UnitAxis': 'c', 'LeaseContractAxis': 'c', 'LeaseContractItemAxis': 'c', 'LeaseChargesBreakAxis': 'c',
    'LeaseReferenceCommercialAxis': 'c', 'SaleInvestmentReferencesCommercial': 'c',
}
if VER == 'vt15':
    TYPED.update({'LeaseReferenceAxis': 'r', 'ContractAxis': 'c', 'IndexationAxis': 'c', 'RentExtensionOptionAxis': 'c'})
else:
    TYPED.update({'RealEstatePropertyAxis': 'a', 'ActivityAxis': 'a', 'DesignAxis': 'a', 'FacilityAxis': 'a'})
MEMBER = {'frc-vt-dm:ResidentialPartRealEstateMember': 'r', 'frc-vt-dm:CommercialPartRealEstateMember': 'c',
          'frc-vt-dm:RuralAgriculturalRealEstateMember': 'a'}


def tag(dims):
    for ax, kind, mem in dims:
        if kind == 'e' and mem in MEMBER:
            return MEMBER[mem]
        if kind == 't':
            t = TYPED.get(ax.split(':')[1])
            if t:
                return t
    return None


UNIT = {'monetary': ['iso4217:EUR'], 'percent': ['xbrli:pure'], 'integer': ['xbrli:pure'], 'decimal': ['xbrli:pure'],
        'area': ['utr:sqm'], 'length': ['utr:m'], 'energy': ['utr:J'], 'volume': ['utr:m3']}


def fact(c, dims, v):
    k = C[c]['k']
    f = {'c': c, 'd': [list(x) for x in dims], 'v': str(v)}
    if k in UNIT:
        f['u'] = UNIT[k]
        f['dec'] = 'INF'
    return f


E = A['eps']['Taxatierapport']
for f in E['base']['facts']:
    g = tag(f['d'])
    if g:
        f['g'] = g
ext = {}

if VER == 'vt15' and len(sys.argv) <= 3:
    # synthetic residential part (built from the taxonomy + the official commercial example; no real messages)
    RES = [['frc-vt-dim:TypeOfRealEstateAxis', 'e', 'frc-vt-dm:ResidentialPartRealEstateMember']]
    COM = [['frc-vt-dim:TypeOfRealEstateAxis', 'e', 'frc-vt-dm:CommercialPartRealEstateMember']]
    HT = [['frc-vt-dim:HouseTypeAxis', 't', 'Type 1']]
    H = HT + [['frc-vt-dim:HouseAxis', 't', 'Eenheid 1']]
    i = 'frc-vt-i:'
    r = [
        fact(i + 'ValuationPeriodResidential', RES, '10'), fact(i + 'NameComplex', RES, 'Naam'), fact(i + 'NumberComplex', RES, '1001'),
        fact(i + 'HIW', RES, 'Nee') if 'e' in C[i + 'HIW'] and ['Nee', 'Nee'] in C[i + 'HIW']['e'] else fact(i + 'HIW', RES, C[i + 'HIW']['e'][0][0]),
        fact(i + 'ForecastIndexYear', RES, '2026'), fact(i + 'PercentageOfIrrecoverableAnnualRent', RES, '0.01'),
        fact(i + 'MarketabilityOfUnits', RES, '75'),
        # house type + unit template (cloned per residential VBO by the generator)
        fact(i + 'HouseTypeID', HT, 'Type 1'), fact(i + 'UsableFloorArea', HT, '85'), fact(i + 'GrossFloorArea', HT, '98'),
        fact(i + 'MarketRent', HT, '14400'), fact(i + 'NonIndependentHouse', HT, 'Nee'),
        fact(i + 'HouseTypeID', H, 'Type 1'), fact(i + 'UsableFloorArea', H, '85'), fact(i + 'GrossFloorArea', H, '98'),
        fact(i + 'MarketRent', H, '14400'), fact(i + 'MarketValueVHE', H, '325000'), fact(i + 'WOZValue', H, '298000'),
        fact(i + 'Empty', H, '1'), fact(i + 'CV', H, '1'), fact(i + 'Renovated', H, '0'), fact(i + 'LiberalizedContract', H, 'Nee'),
        fact(i + 'NonIndependentHouse', H, 'Nee'), fact(i + 'TenantOrVacantType', H, '1'),
        fact(i + 'LinkedBAGVBOID', H, 'BAGVBO-1'), fact('nl-cd:StreetNameNL', H, 'Straat'), fact(i + 'StreetNameNLFull', H, 'Straat'),
        fact('nl-cd:HouseNumberNL', H, '1'), fact('nl-cd:PostalCodeNL', H, '1000AA'), fact('nl-cd:PlaceOfResidenceNL', H, 'Plaats'),
        fact('nl-cd:CountryCodeISO', H, 'NLD'),
    ]
    # KPI's and general information: same structure as the commercial part of the official example, residential member
    kpi_roles = [rl for rl in E['roles'] if A['roles'][rl]['l'] in ("KPI's van het taxatieresultaat commercieel", 'Algemene informatie commercieel deel vastgoed')]
    kpi_concepts = set(c for rl in kpi_roles for c in A['roles'][rl]['i'])
    for f in E['base']['facts']:
        if f['d'] == COM and f['c'] in kpi_concepts and f['c'] not in (i + 'DescriptionLocationCommercialPart', i + 'OtherInformationCommercialRealEstate', i + 'Image', i + 'BREEAMCertificate', i + 'PrimeRent', i + 'WeightedAverageLeaseExpiryCommercialResult', i + 'ValuationPeriodDCFCommercial', i + 'MarketTechnicalUpdateAverageVacancyMonths', i + 'MarketTechnicalUpdateMarketRent', i + 'MarketTechnicalUpdateMarketValueAfterTransferCost', i + 'MarketTechnicalUpdateNetInitialYieldAfterCorrectionMarketRentBeforeTransferCost', i + 'ActualUse', i + 'MarketValueBasedOnSpecialAssumption', i + 'InternalRateOfReturn', i + 'MarketValueAfterTransferCostPerSquareMeter'):
            g = dict(f); g['d'] = [list(x) for x in RES]; r.append(g)
    for f in r:
        f['g'] = 'r'
    ext['r'] = {'facts': r, 'anchor': E['base']['anchor'], 'full': False}
elif VER == 'vt15':
    src = json.load(open(sys.argv[3]))
    KEEP = {'CountryCodeISO', 'ReportingCurrency', 'FullValuationReferenceByRevaluationOrUpdate', 'ValuationPeriodIndices',
            'LegalEntityLegalForm', 'JobTitle', 'LandRegisterIndexNumberApartmentRight', 'LandRegisterSection', 'LandRegisterNumber'}
    REPL = {'NRVTNumber': 'RT1234567890', 'RICS': '1234567', 'AppendixUri': 'https://www.example.org/bijlage.pdf',
            'TitlesSuffix': 'RT', 'NumberComplex': '1001', 'HouseTypeID': 'Type 1', 'Latitude': '52.0907', 'Longitude': '5.1214',
            'BusinessNames': 'Naam', 'LandRegisterCode': 'UTT00', 'LandRegister': 'Utrecht'}
    DROP = {'HouseNumberAdditionBAG', 'LandRegisterReference'}
    # typed members -> neutral names
    memmap = {}
    def mem(ax, v):
        key = (ax, v)
        if key not in memmap:
            n = 1 + sum(1 for k in memmap if k[0] == ax)
            memmap[key] = ax.split(':')[1].replace('Axis', '') + ' ' + str(n)
        return memmap[key]
    facts = []
    for f in src['facts']:
        local = f['c'].split(':')[1]
        if local in DROP:
            continue
        g = {'c': f['c'], 'd': [[a, k, mem(a, m) if k == 't' else m] for a, k, m in f['d']], 'v': f['v']}
        if f.get('u'):
            g['u'] = f['u']; g['dec'] = f.get('dec') or 'INF'
        c = C.get(f['c'], {})
        if c.get('k') == 'string':
            if local in REPL:
                g['v'] = REPL[local]
            elif local not in KEEP:
                g['v'] = 'Toelichting'
        if local in ('BAGVBOID', 'LinkedBAGVBOID'):
            g['v'] = [x for x in g['d'] if x[0].endswith('BAGVBOIDAxis')][0][2] if any(x[0].endswith('BAGVBOIDAxis') for x in g['d']) else 'BAGVBO-ID 1'
        if local == 'BAGPANDID':
            g['v'] = [x for x in g['d'] if x[0].endswith('BAGPANDIDAxis')][0][2]
        t = tag(g['d'])
        if t:
            g['g'] = t
        facts.append(g)
    # keep HouseTypeID equal to the HouseType member
    for f in facts:
        if f['c'] == 'frc-vt-i:HouseTypeID':
            f['v'] = [x for x in f['d'] if x[0].endswith('HouseTypeAxis')][0][2]
    ext['r'] = {'facts': facts, 'anchor': src['anchor'], 'full': True}
else:
    RES = [['frc-vt-dim:TypeOfRealEstateAxis', 'e', 'frc-vt-dm:ResidentialPartRealEstateMember']]
    AGR = [['frc-vt-dim:TypeOfRealEstateAxis', 'e', 'frc-vt-dm:RuralAgriculturalRealEstateMember']]
    H = [['frc-vt-dim:HouseAxis', 't', 'Eenheid 1']]
    i = 'frc-vt-i:'
    r = [
        fact(i + 'ConstructionYear', RES, '1998'), fact(i + 'ValuationPeriodResidential', RES, '10'),
        fact(i + 'NameComplex', RES, 'Naam'), fact(i + 'NumberComplex', RES, '1001'),
        fact(i + 'ParkingLots', RES, '0'), fact(i + 'HIW', RES, 'Nee'), fact(i + 'Split', RES, 'Nee'),
        fact(i + 'ParkingOnPrivateProperty', RES, 'Nee'), fact(i + 'PercentageIrrecoverableAnnualRent', RES, '0.01'),
        # unit template (cloned per residential VBO by the generator)
        fact(i + 'HouseTypeID', H, 'Type 1'), fact(i + 'UsableFloorArea', H, '85'), fact(i + 'GrossFloorArea', H, '98'),
        fact(i + 'MarketRent', H, '14400'), fact(i + 'MarketValueVHE', H, '325000'), fact(i + 'IPDTypeProperty', H, '5'),
        fact(i + 'Empty', H, 'Nee'), fact(i + 'LiberalizedContract', H, 'Nee'), fact(i + 'WOZValue', H, '298000'),
        fact(i + 'LinkedBAGVBOID', H, 'BAGVBO-1'), fact('nl-cd:StreetNameNL', H, 'Straat'), fact(i + 'StreetNameNLFull', H, 'Straat'),
        fact('nl-cd:HouseNumberNL', H, '1'), fact('nl-cd:PostalCodeNL', H, '1000AA'), fact('nl-cd:PlaceOfResidenceNL', H, 'Plaats'),
        fact('nl-cd:CountryCodeISO', H, 'NLD'),
    ]
    # residential monument information: same answers as the commercial one in the example
    for f in E['base']['facts']:
        if f.get('g') == 'c' and f['d'] == [['frc-vt-dim:TypeOfRealEstateAxis', 'e', 'frc-vt-dm:CommercialPartRealEstateMember']] and \
                f['c'] in (i + 'CountyMonument', i + 'NationalMonument', i + 'ProtectedCountyView', i + 'ProvinceMonument', i + 'MonumentInformationExplanation'):
            r.append({'c': f['c'], 'd': [list(x) for x in RES], 'v': f['v']})
    O = [['frc-vt-dim:RealEstatePropertyAxis', 't', 'Object 1']]
    a = [
        fact(i + 'Sector', AGR, '8'), fact(i + 'Subsector', AGR, '9'), fact(i + 'ConstructionYear', AGR, '1995'),
        fact(i + 'GroundBasedExploitation', AGR, 'Ja'), fact('nl-cd:SbiBusinessCode', AGR, '01411'),
        fact(i + 'KVKnumber', AGR, '12345678'), fact(i + 'LocationDescriptionRuralAgriculturalRealEstate', AGR, 'Omschrijving'),
        fact(i + 'ActivityName', AGR, 'Melkveehouderij'), fact(i + 'NumberActivities', AGR, '1'), fact(i + 'NumberPerActivity', AGR, '120'),
        fact(i + 'UnitActivities', AGR, '2'), fact(i + 'RevenueExploitation', AGR, '420000'), fact(i + 'AccruedCosts', AGR, '310000'),
        fact(i + 'Balance', AGR, '110000'),
        fact(i + 'CultivableLandFieldPlotProperty', AGR, '350000'), fact(i + 'CultivableLandFieldPlotPropertyAmount', AGR, '2450000'),
        fact(i + 'LandUnderBuildingBlocks', AGR, '15000'), fact(i + 'SoilUnderBuildingBlocks', AGR, '180000'),
        fact(i + 'DescriptionKpi', AGR, 'Toelichting'),
        # object template (cloned per agricultural VBO)
        fact(i + 'PropertyName', O, 'Naam'), fact(i + 'TypeOfRealEstateObject', O, '5'), fact(i + 'ConstructionYear', O, '1995'),
        fact(i + 'ConstructionMethod', O, '1'), fact(i + 'MaintenanceCondition', O, '4'), fact(i + 'Asbestos', O, 'Nee'),
        fact(i + 'Acreage', O, '1850'), fact(i + 'DescriptionRealEstateObject', O, 'Omschrijving'),
    ]
    for lst, g in ((r, 'r'), (a, 'a')):
        for f in lst:
            f['g'] = g
    ext['r'] = {'facts': r, 'anchor': E['base']['anchor'], 'full': False}
    ext['a'] = {'facts': a, 'anchor': E['base']['anchor'], 'full': False}

# commerciële eenheid zonder adres (VT15-voorbeeld): 'Adres ruimte' toevoegen zodat elk commercieel VBO aan een Ruimte gekoppeld wordt
ufacts = [f for f in E['base']['facts'] if any(d[0] == 'frc-vt-dim:UnitAxis' for d in f['d']) and not any(d[0] == 'frc-vt-dim:LeaseContractAxis' for d in f['d'])]
if ufacts and not any(any(d[0] == 'frc-vt-dim:BAGVBOIDAxis' for d in f['d']) for f in ufacts):
    first = [d for d in ufacts[0]['d'] if d[0] == 'frc-vt-dim:UnitAxis'][0][2]
    AD = [['frc-vt-dim:BAGVBOIDAxis', 't', 'BAGVBO-1'], ['frc-vt-dim:UnitAxis', 't', first]]
    for c, v in (('frc-vt-i:LinkedBAGVBOID', 'BAGVBO-1'), ('nl-cd:StreetNameNL', 'Straat'), ('frc-vt-i:StreetNameNLFull', 'Straat'),
                 ('nl-cd:HouseNumberNL', '1'), ('nl-cd:HouseNumberAddition', 'A'), ('nl-cd:PostalCodeNL', '1000AA'),
                 ('nl-cd:PlaceOfResidenceNL', 'Plaats'), ('nl-cd:CountryCodeISO', 'NLD')):
        f = fact(c, AD, v); f['g'] = 'c'; E['base']['facts'].append(f)
    print('added Adres ruimte template')
# huisnummertoevoeging in het adres van residentiële eenheden
for src in ext.values():
    hs = [f for f in src['facts'] if f.get('g') == 'r' and f['c'] == 'nl-cd:HouseNumberNL' and any(d[0] == 'frc-vt-dim:HouseAxis' for d in f['d'])]
    for h in hs[:1]:
        if not any(f['c'] == 'nl-cd:HouseNumberAddition' and f['d'] == h['d'] for f in src['facts']):
            f = fact('nl-cd:HouseNumberAddition', h['d'], 'A'); f['g'] = 'r'; src['facts'].append(f)
E['ext'] = ext
A['tax'] = VER.upper()
json.dump(A, open(P, 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(VER, 'base tags', Counter(f.get('g') for f in E['base']['facts']), {k: (len(v['facts']), Counter(f.get('g') for f in v['facts'])) for k, v in ext.items()})
