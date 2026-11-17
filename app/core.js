/* VT17 XBRL-testgenerator — kern (werkt in de browser en in Node).
 * Verwacht APPDATA (taxonomiemodel + voorbeeldberichten) als argument.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VT17Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIM_VBO = 'frc-vt-dim:BAGVBOIDAxis';
  const DIM_PAND = 'frc-vt-dim:BAGPANDIDAxis';
  const DIM_OTHER = 'frc-vt-dim:BAGOTHERIDAxis';

  // ------------------------------------------------------------------ hulpfuncties
  function hashStr(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (h >>> 0);
  }
  function rngFrom(seed) {
    let a = seed >>> 0;
    const r = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.digits = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String(Math.floor(r() * 10)); return s; };
    return r;
  }
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function isoDate(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function parseIso(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  function addMonths(d, n) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last)));
  }
  function todayUTC(now) {
    const n = now || new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }
  function excelSerialToDate(n) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  }
  function fmtNL(d) { return pad(d.getUTCDate()) + '-' + pad(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear(); }

  /** Datumexpressie uit het sjabloon -> Date of null.
   *  Ondersteunt: dd-mm-jjjj, d-m-jjjj, dd/mm/jjjj, jjjj-mm-dd, Excel-serienummer,
   *  'vandaag', 'vandaag-3d', 'vandaag+2w', 'vandaag-6m', 'vandaag-20j'. */
  function parseDateExpr(raw, today) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return excelSerialToDate(raw);
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    let m = /^(?:vandaag|today)\s*(?:([+-])\s*(\d+)\s*([dwmjy]))?$/.exec(s);
    if (m) {
      if (!m[1]) return today;
      const n = (m[1] === '-' ? -1 : 1) * parseInt(m[2], 10);
      if (m[3] === 'd') return addDays(today, n);
      if (m[3] === 'w') return addDays(today, 7 * n);
      if (m[3] === 'm') return addMonths(today, n);
      return addMonths(today, 12 * n);
    }
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (m) return parseIso(m[3] + '-' + pad(m[2]) + '-' + pad(m[1]));
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return parseIso(s);
    if (/^\d{4,6}(\.0+)?$/.test(s)) return excelSerialToDate(parseFloat(s));
    return null;
  }

  // ------------------------------------------------------------------ realistische gegevens
  const FIRST = ['Jan', 'Pieter', 'Sanne', 'Lotte', 'Daan', 'Emma', 'Bram', 'Fleur', 'Thomas', 'Anouk', 'Ruben', 'Iris', 'Koen', 'Marieke', 'Joost', 'Femke', 'Hans', 'Ingrid', 'Mark', 'Yvonne', 'Sven', 'Esther', 'Wouter', 'Linda', 'Gerrit', 'Noor'];
  const FAMILY = [['', 'Jansen'], ['de', 'Vries'], ['van den', 'Berg'], ['', 'Bakker'], ['', 'Visser'], ['', 'Smit'], ['', 'Meijer'], ['de', 'Boer'], ['', 'Mulder'], ['de', 'Groot'], ['', 'Bos'], ['', 'Vos'], ['', 'Peters'], ['', 'Hendriks'], ['van', 'Leeuwen'], ['', 'Dekker'], ['', 'Brouwer'], ['de', 'Wit'], ['', 'Dijkstra'], ['', 'Verhoeven'], ['van', 'Dijk'], ['', 'Kok'], ['van der', 'Meer'], ['', 'Schouten']];
  const CITIES = [
    { n: 'Amsterdam', pc: [1011, 1109], g: '0363', k: 'ASD' }, { n: 'Rotterdam', pc: [3011, 3089], g: '0599', k: 'RTD' },
    { n: 'Utrecht', pc: [3511, 3585], g: '0344', k: 'UTT' }, { n: "'s-Gravenhage", pc: [2491, 2599], g: '0518', k: 'SGH' },
    { n: 'Gouda', pc: [2801, 2809], g: '0513', k: 'GDA' }, { n: 'Leiden', pc: [2311, 2334], g: '0546', k: 'LDN' },
    { n: 'Bodegraven', pc: [2411, 2415], g: '1901', k: 'BDG' }, { n: 'Eindhoven', pc: [5611, 5658], g: '0772', k: 'EHV' },
    { n: 'Groningen', pc: [9711, 9747], g: '0014', k: 'GNG' }, { n: 'Zwolle', pc: [8011, 8046], g: '0193', k: 'ZWL' },
    { n: 'Amersfoort', pc: [3811, 3829], g: '0307', k: 'AMF' }, { n: 'Haarlem', pc: [2011, 2036], g: '0392', k: 'HLM' },
  ];
  const STREETS = ['Kerkstraat', 'Stationsweg', 'Molenweg', 'Dorpsstraat', 'Julianalaan', 'Beatrixstraat', 'Industrieweg', 'Parallelweg', 'Nieuwe Gracht', 'Oranjelaan', 'Wilhelminastraat', 'Prinsengracht', 'Lindenlaan', 'Havenstraat', 'Marktplein', 'Burg. de Withstraat', 'Rijnkade', 'Schoolstraat', 'Spoorlaan', 'Weth. Verheijstraat'];
  const COMPANY_A = ['Van Dam', 'Noordwest', 'Rijnland', 'De Hoeksteen', 'Groenhof', 'Hollandse', 'Kanaalzicht', 'Meridiaan', 'Polderland', 'Stadshart', 'Veenweide', 'Zuidas'];
  const COMPANY_B = ['Vastgoed', 'Beheer', 'Taxaties', 'Makelaardij', 'Projectontwikkeling', 'Holding', 'Investments', 'Onroerend Goed'];
  const JOBS = ['Accountmanager vastgoed', 'Directeur', 'Register-taxateur', 'Beheerder', 'Financieel adviseur', 'Kredietanalist', 'Assetmanager'];
  const SENTENCES = [
    'Geen bijzonderheden geconstateerd tijdens de inspectie.',
    'Conform de aangeleverde stukken en de bezichtiging ter plaatse.',
    'Het object verkeert in een normale staat van onderhoud.',
    'Zie de toelichting in de bijlage bij dit rapport.',
    'De gegevens zijn ontleend aan het Kadaster en de BAG.',
    'Uitgangspunt is de huidige verhuurde staat van het object.',
    'Er zijn geen afwijkingen ten opzichte van de vorige taxatie.',
    'Op basis van recente marktgegevens in de directe omgeving.',
  ];
  const PLACEHOLDERS = new Set(['tekst', 'toelichting', 'omschrijving', 'geen', 'bron', 'naam', 'test', 'test bv', 'vastgoed bv', 'waardering bv', 'eigenaar', 'beschrijving', 'opmerking', 'nvt', 'n.v.t.', 'lorem ipsum']);

  function makePerson(r) {
    const f = r.pick(FIRST); const fam = r.pick(FAMILY);
    return { first: f, prefix: fam[0], family: fam[1], initials: f[0] + '.' };
  }
  function makeCompany(r) { return r.pick(COMPANY_A) + ' ' + r.pick(COMPANY_B) + ' B.V.'; }
  function makeAddress(r, city) {
    const c = city || r.pick(CITIES);
    const num = r.int(c.pc[0], c.pc[1]);
    const letters = 'ABCDEGHJKLMNPRSTVWXZ';
    return { street: r.pick(STREETS), number: r.int(1, 180), city: c.n, cityObj: c,
      postcode: num + letters[r.int(0, letters.length - 1)] + letters[r.int(0, letters.length - 1)] };
  }
  function bagId(r, gemeente, typeCode) { return gemeente + typeCode + r.digits(10); }

  // ------------------------------------------------------------------ model-hulp
  function Model(APP) {
    this.APP = APP;
    this.tax = APP.tax || 'VT17';
    this.keyIndex = {};
    for (const ep in APP.eps) {
      const idx = {};
      for (const [k, role, c] of APP.eps[ep].keys) idx[k.toLowerCase()] = { key: k, role, c };
      this.keyIndex[ep] = idx;
    }
  }
  Model.prototype.concept = function (q) { return this.APP.concepts[q]; };
  /** first field key of a concept in a data product (optionally within a section label) */
  Model.prototype.keyOf = function (ep, concept, section) {
    const k = this.APP.eps[ep].keys.find(([key, role, c]) => c === concept && (!section || key.startsWith(section + ' ›')));
    return k ? k[0] : null;
  };

  /** Pick the taxonomy model for a scenario. models: Model or {VT17: Model, VT15: Model} */
  function pickModel(models, scenario) {
    if (models instanceof Model) return { model: models };
    const raw = String(scenario.taxonomy == null ? '' : scenario.taxonomy).trim();
    let t = 'VT17';
    if (raw) {
      if (/^(vt\s*)?15$/i.test(raw.replace(/[^a-z0-9]/gi, '')) || /15/.test(raw)) t = 'VT15';
      else if (/17/.test(raw)) t = 'VT17';
      else return { error: `Unknown taxonomy "${raw}". Choose VT17 or VT15.` };
    }
    if (!models[t]) return { error: `Taxonomy ${t} is not available in this version of the generator.` };
    return { model: models[t] };
  }

  // use codes: c = commercial, r = residential, a = agricultural, u = unlinked (VBO only), m = mixed (report only)
  const USE_NAME = { c: 'commercial', r: 'residential', a: 'agricultural', u: 'unlinked', m: 'mixed use' };
  function useCode(v) {
    const t = String(v == null ? '' : v).trim().toLowerCase();
    if (!t) return null;
    if (/^[1-5]$/.test(t)) return { 1: 'c', 2: 'r', 3: 'm', 4: 'r', 5: 'a' }[t];
    if (/unlink|no use|geen|ongekoppeld|parkeer|parking|^land$|grond/.test(t)) return 'u';
    if (/agri|agrar|landelijk|rural/.test(t)) return 'a';
    if (/mix|both|gemengd|beide/.test(t)) return 'm';
    if (/resid|woon|wonen|buy.?to.?let/.test(t)) return 'r';
    if (/comm|zakelijk|bedrijf/.test(t)) return 'c';
    return '?';
  }
  Model.prototype.dataproducts = function () { return Object.keys(this.APP.eps); };
  Model.prototype.resolveEp = function (name) {
    if (!name) return null;
    const s = String(name).trim().toLowerCase().replace(/^sbr\s+/, '');
    return this.dataproducts().find(e => e.toLowerCase() === s) || null;
  };
  /** Veld uit het sjabloon -> {role, c, vbo, all} */
  Model.prototype.resolveField = function (ep, raw) {
    let s = String(raw).trim();
    let vbo = null, all = false;
    const m = /\s*\[\s*(?:vbo\s*(\d+)|(alle(?:\s+vbo'?s?)?))\s*\]\s*$/i.exec(s);
    if (m) { if (m[1]) vbo = parseInt(m[1], 10); else all = true; s = s.slice(0, m.index).trim(); }
    const idx = this.keyIndex[ep];
    let hit = idx[s.toLowerCase()];
    if (!hit) {
      // ook toegestaan: conceptnaam (met of zonder prefix), mits uniek in dit dataproduct
      const name = s.includes(':') ? s : null;
      const cands = this.APP.eps[ep].keys.filter(([k, role, c]) => c === name || c.split(':')[1].toLowerCase() === s.toLowerCase());
      if (cands.length === 1) hit = { key: cands[0][0], role: cands[0][1], c: cands[0][2] };
      else if (cands.length > 1) return { error: `Field "${raw}" is ambiguous in ${ep} (e.g. "${cands[0][0]}").` };
    }
    if (!hit) return { error: `Field "${raw}" does not exist in data product ${ep}.` };
    return { role: hit.role, c: hit.c, key: hit.key, vbo, all };
  };

  // ------------------------------------------------------------------ waarde-conversie
  function convertValue(model, conceptQ, raw, today) {
    const c = model.concept(conceptQ) || {};
    const warn = [];
    if (raw === null || raw === undefined) return { v: '', warn };
    let s = typeof raw === 'number' ? String(raw) : String(raw).trim();
    switch (c.k) {
      case 'date': {
        const d = parseDateExpr(raw, today);
        if (d) return { v: isoDate(d), warn };
        warn.push(`"${s}" is not a valid date; value kept as is (invalid XBRL).`);
        return { v: s, warn };
      }
      case 'gYear': {
        if (typeof raw === 'number' && raw > 1000 && raw < 10000) return { v: String(raw), warn };
        return { v: s, warn };
      }
      case 'enum': {
        const e = (c.e || []).find(([v, l]) => v.toLowerCase() === s.toLowerCase() || l.toLowerCase() === s.toLowerCase());
        if (e) return { v: e[0], warn };
        warn.push(`"${s}" is not a valid code (allowed: ${(c.e || []).map(x => x[0] + '=' + x[1]).join(', ')}).`);
        return { v: s, warn };
      }
      case 'monetary': case 'decimal': case 'percent': case 'area': case 'length': case 'energy': case 'volume': case 'integer': {
        if (typeof raw === 'number') {
          if (c.k === 'integer' && !Number.isInteger(raw)) warn.push(`${raw} is not a whole number.`);
          return { v: c.k === 'integer' ? String(raw) : String(+raw.toFixed(10)), warn };
        }
        let t = s.replace(/\s|€/g, '');
        if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
        else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
        if (c.k === 'percent' && /%$/.test(t)) t = String(parseFloat(t) / 100);
        if (!/^-?\d+(\.\d+)?$/.test(t)) warn.push(`"${s}" is not a valid number; value kept as is.`);
        return { v: t, warn };
      }
      default:
        return { v: s, warn };
    }
  }

  // ------------------------------------------------------------------ validatie van een waarde
  function checkValue(c, v) {
    if (!c) return 'unknown concept';
    const s = String(v);
    switch (c.k) {
      case 'date': return parseIso(s) ? null : `"${s}" is not a valid xs:date (yyyy-mm-dd)`;
      case 'gYear': return /^-?\d{4}$/.test(s) ? null : `"${s}" is not a valid year`;
      case 'duration': return /^-?P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(s) ? null : `"${s}" is not a valid duration (e.g. P5Y)`;
      case 'integer':
        if (!/^[-+]?\d+$/.test(s)) return `"${s}" is not a whole number`;
        break;
      case 'monetary': case 'decimal': case 'percent': case 'area': case 'length': case 'energy': case 'volume':
        if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return `"${s}" is not a valid number`;
        break;
      case 'enum':
        if (!(c.e || []).some(([x]) => x === s)) return `"${s}" is not an allowed code`;
        break;

      case 'boolean': if (!/^(true|false|0|1)$/.test(s)) return `"${s}" is not a boolean`; break;
    }
    if (c.k !== 'enum' && c.e && c.e.length && !c.set && !c.e.some(([x]) => x === s)) return `"${s}" is not an allowed value`;
    if (c.e && c.e.length && c.set && s.split(/\s+/).filter(Boolean).some(t => !c.e.some(([x]) => x === t))) return `"${s}" contains a value that is not allowed`;
    if (c.minInclusive !== undefined && /^[-+]?[\d.]+$/.test(s) && parseFloat(s) < parseFloat(c.minInclusive)) return `${s} is below the minimum ${c.minInclusive}`;
    if (c.maxInclusive !== undefined && /^[-+]?[\d.]+$/.test(s) && parseFloat(s) > parseFloat(c.maxInclusive)) return `${s} is above the maximum ${c.maxInclusive}`;
    if (c.maxLength !== undefined && s.length > parseInt(c.maxLength, 10)) return `text longer than ${c.maxLength} characters`;
    if (c.minLength !== undefined && s.length < parseInt(c.minLength, 10)) return `text shorter than ${c.minLength} characters`;
    if (c.pattern && !new RegExp('^(?:' + c.pattern + ')$').test(s)) return `"${s}" does not match the pattern ${c.pattern}`;
    if (c.k === 'string' && s === '' ) return 'empty text value';
    return null;
  }

  // ------------------------------------------------------------------ generatie
  const UNIT_BY_KIND = { monetary: ['iso4217:EUR'], percent: ['xbrli:pure'], integer: ['xbrli:pure'], decimal: ['xbrli:pure'], area: ['utr:sqm'], length: ['utr:m'], energy: ['utr:J'], volume: ['utr:m3'] };

  function dimKey(d) { return d.map(x => x.join('=')).join('|'); }
  function groupKey(dims) {
    // groep = alle dimensies behalve BAG-assen (één 'persona' per groep)
    return dims.filter(x => x[0] !== DIM_VBO && x[0] !== DIM_PAND && x[0] !== DIM_OTHER).map(x => x.join('=')).join('|') || '(rapport)';
  }

  /**
   * scenario: {id, omschrijving, dataproduct, caseId, vbos:[...], peildatum, verwacht, opmerking, changes:[{veld, waarde}]}
   * opts: {today: Date, caseTarget: {ep: fieldKey}}
   */
  function generate(models, scenario, opts) {
    opts = opts || {};
    const log = [], errors = [], warnings = [];
    const pm = pickModel(models, scenario);
    if (pm.error) return { ok: false, errors: [pm.error], warnings, log };
    const model = pm.model;
    const APP = model.APP;
    const TAX = model.tax;
    const ep = model.resolveEp(scenario.dataproduct);
    if (!ep) return { ok: false, errors: [`Unknown data product "${scenario.dataproduct || ''}". Choose from: ${model.dataproducts().join(', ')}.`], warnings, log };
    const E = APP.eps[ep];
    const today = opts.today || todayUTC();
    const r = rngFrom(hashStr(String(scenario.id) + '|' + String(scenario.caseId || '') + '|' + ep));

    const fx = Object.assign({}, scenario.fixed || {});
    const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
    const isSpecial = (v) => typeof v === 'string' && /^(leeg|<leeg>|verwijderen|blanco|empty|<empty>|remove|delete|blank)$/i.test(v.trim());

    // waardepeildatum = datum van de contexten (en van de taxatie)
    let peil = addDays(today, -7);
    const peilRaw = filled(fx.waardepeildatum) && !isSpecial(fx.waardepeildatum) ? fx.waardepeildatum : scenario.peildatum;
    if (filled(peilRaw)) {
      const d = parseDateExpr(peilRaw, today);
      if (d) { peil = d; if (d > today) warnings.push(`Valuation date ${isoDate(d)} is in the future; derived dates (inspection, previous valuations) follow it (intentional?).`); }
      else if (filled(fx.waardepeildatum)) warnings.push(`Valuation date "${peilRaw}" is not a valid date; contexts use today-7d and the field keeps the literal value (invalid XBRL).`);
      else errors.push(`Reference date "${peilRaw}" is not a valid date (use dd-mm-yyyy or e.g. today-7d).`);
    }
    const shiftFor = (anchorIso) => Math.round((peil - parseIso(anchorIso)) / 86400000);

    // ---- VBO's
    const rawVbos = (scenario.vbos || []).map(x => String(x == null ? '' : x).trim()).map((x, i) => {
      if (isSpecial(x)) { warnings.push(`VBO ID ${i + 1}: "${x}" is not possible for a VBO ID (it is the key of the VBO data); a generated ID is used.`); return ''; }
      return x;
    });
    const firstGiven = rawVbos.find(Boolean);
    // plaats van het object afleiden uit de gemeentecode van het eerste VBO-ID (indien bekend)
    const city = (firstGiven && CITIES.find(c => firstGiven.startsWith(c.g))) || r.pick(CITIES);
    let vbos = rawVbos.length ? rawVbos.map(v => v || bagId(r, city.g, '01')) : [bagId(r, city.g, '01')];
    { const seenV = new Set(); for (const v of rawVbos.filter(Boolean)) { if (seenV.has(v)) warnings.push(`VBO ID ${v} appears more than once; its data is written twice (duplicate facts, intentional?).`); seenV.add(v); } }
    for (const v of rawVbos.filter(Boolean)) if (!/^\d{16}$/.test(v)) warnings.push(`VBO ID "${v}" is not in the 16-digit BAG format (intentional?).`);
    const pandId = bagId(r, city.g, '10');
    const otherId = bagId(r, city.g, '02');

    // ---- use per VBO (Taxatierapport): commercial / residential / agricultural / unlinked
    const reportUse = filled(fx.useType) && !isSpecial(fx.useType) ? useCode(fx.useType) : null;
    if (reportUse === '?') warnings.push(`Use "${fx.useType}" not recognised; use Commercial, Residential, Mixed use${TAX === 'VT17' ? ' or Agricultural' : ''}.`);
    const givenUses = (scenario.vboUses || []).map(useCode);
    const vboUse = vbos.map((_, i) => {
      const g = givenUses[i];
      if (g === 'm') { warnings.push(`Use VBO ${i + 1}: "Mixed use" is a report-level choice; VBO ${i + 1} is treated as ${i === 0 ? 'commercial' : 'residential'}.`); }
      if (g === '?') warnings.push(`Use VBO ${i + 1} "${scenario.vboUses[i]}" not recognised; use Commercial, Residential, ${TAX === 'VT17' ? 'Agricultural, ' : ''}Unlinked.`);
      if (g && g !== '?' && g !== 'm') return g;
      if (reportUse === 'r' || reportUse === 'a' || reportUse === 'c') return reportUse;
      if (reportUse === 'm' || g === 'm') return i === 0 ? 'c' : 'r';
      return 'c';
    });
    const isTax = ep === 'Taxatierapport' && !!E.ext;
    let uses = new Set(vboUse.filter(u => u !== 'u'));
    if (!uses.size) uses = new Set(reportUse === 'm' ? ['c', 'r'] : [reportUse && reportUse !== '?' ? reportUse : 'c']);
    if (isTax) {
      if (TAX !== 'VT17' && (uses.has('a') || reportUse === 'a')) errors.push('Agricultural is only available for VT17 (VT15 has no agricultural part).');
      if (reportUse === 'm' && vbos.length < 2 && !givenUses.some(Boolean)) warnings.push('Mixed use with only one VBO: VBO 1 is treated as commercial and there is no residential VBO. Add a VBO or set "Use VBO n".');
      const expect = reportUse === 'm' ? 'cr' : reportUse && reportUse !== '?' ? reportUse : null;
      const got = [...uses].sort().join('');
      if (expect && expect.split('').sort().join('') !== got) warnings.push(`Use (report) is ${USE_NAME[reportUse]} but the VBOs are ${[...uses].map(u => USE_NAME[u]).join(' + ')}; the XBRL follows the VBO uses, "Commercieel en/of residentieel" follows the report Use (deliberate mismatch?).`);
      log.push('Uses: ' + vbos.map((v, i) => `VBO ${i + 1} ${USE_NAME[vboUse[i]]}`).join(', '));
    }

    // ---- facts kopiëren (per bron eigen datumverschuiving)
    const copyFacts = (list, sh) => list.map(f => ({ c: f.c, d: f.d.map(x => x.slice()), v: f.v, u: f.u ? f.u.slice() : null, dec: f.dec || null, g: f.g || null, sh }));
    let facts;
    if (isTax) {
      const X = E.ext;
      const primary = (!uses.has('c') && uses.has('r') && X.r && X.r.full) ? X.r : E.base;
      facts = copyFacts(primary.facts.filter(f => !f.g || uses.has(f.g)), shiftFor(primary.anchor));
      for (const u of uses) {
        const src = X[u];
        if (!src || src === primary || (primary === E.base && u === 'c')) continue;
        if (primary.facts.some(f => f.g === u)) continue;
        facts = facts.concat(copyFacts(src.facts.filter(f => f.g === u), shiftFor(src.anchor)));
      }
      if (primary !== E.base) log.push(`Base: ${TAX} residential message (anonymised).`);
    } else facts = copyFacts(E.base.facts, shiftFor(E.base.anchor));

    // bestaande placeholder-leden vervangen
    const vboPlaceholders = new Set();
    for (const f of facts) for (const x of f.d) if (x[0] === DIM_VBO && !f.g) vboPlaceholders.add(x[2]);
    const vboList = [...vboPlaceholders];
    for (const f of facts) {
      for (const x of f.d) {
        if (x[0] === DIM_PAND) x[2] = pandId;
        if (x[0] === DIM_OTHER) x[2] = otherId;
      }
      if (f.c === 'frc-vt-i:BAGPANDID') f.v = pandId;
      if (f.c === 'frc-vt-i:BAGOTHERID') f.v = otherId;
    }
    // facts met (alleen) een VBO-as dupliceren per opgegeven VBO; gebruiksspecifieke delen gaan via sjablonen hieronder
    const expanded = [];
    for (const f of facts) {
      const vx = f.d.find(x => x[0] === DIM_VBO);
      if (!vx || (isTax && f.g)) { expanded.push(f); continue; }
      if (vboList.indexOf(vx[2]) > 0) continue; // alleen het eerste voorbeeld-VBO als sjabloon gebruiken
      vbos.forEach((id, i) => {
        const g = Object.assign({}, f, { d: f.d.map(x => x[0] === DIM_VBO ? [x[0], 't', id] : x.slice()), vboIndex: i + 1 });
        if (g.c === 'frc-vt-i:BAGVBOID') g.v = id;
        expanded.push(g);
      });
    }
    facts = expanded;
    if (vboPlaceholders.size === 0 && (scenario.vbos || []).length) {
      warnings.push(`Data product ${ep} has no BAG VBO data by default; VBO IDs are only used for fields with a VBO dimension.`);
    }

    // ---- andere dataproducten met eenheden (Huurinformatie): alleen Eenheden/Ruimtes van het opgegeven gebruik
    const useGiven = !!reportUse && reportUse !== '?' || givenUses.some(u => u && u !== '?');
    if (!isTax && useGiven && facts.some(f => f.d.some(x => x[0] === 'frc-vt-dim:HouseAxis' || x[0] === 'frc-vt-dim:UnitAxis'))) {
      const keepR = uses.has('r'), keepC = uses.has('c');
      const before = facts.length;
      facts = facts.filter(f => !((!keepR && f.d.some(x => x[0] === 'frc-vt-dim:HouseAxis')) || (!keepC && f.d.some(x => x[0] === 'frc-vt-dim:UnitAxis'))));
      const firstOf = (u) => { const i = vboUse.indexOf(u); return i >= 0 ? vbos[i] : null; };
      for (const f of facts) if (f.c === 'frc-vt-i:BAGVBOID' && !f.d.some(x => x[0] === DIM_VBO)) {
        const v = f.d.some(x => x[0] === 'frc-vt-dim:HouseAxis') ? firstOf('r') : f.d.some(x => x[0] === 'frc-vt-dim:UnitAxis') ? firstOf('c') : null;
        if (v) { f.v = v; f.fixedVbo = true; }
      }
      if (facts.length !== before) log.push(`${ep}: only ${[keepC && 'Ruimtes (commercial)', keepR && 'Eenheden (residential)'].filter(Boolean).join(' and ') || 'no units'} kept (${before - facts.length} facts removed)`);
    }

    // BAGVBOID-velden zonder VBO-as met een voorbeeldwaarde (bijv. 'BAGVBO-1' in Huurinformatie): naar een echt VBO
    for (const f of facts) if (f.c === 'frc-vt-i:BAGVBOID' && !f.fixedVbo && !f.d.some(x => x[0] === DIM_VBO) && !/^\d{16}$/.test(f.v)) {
      const want = f.d.some(x => x[0] === 'frc-vt-dim:HouseAxis') ? 'r' : f.d.some(x => x[0] === 'frc-vt-dim:UnitAxis') ? 'c' : null;
      const i = want ? vboUse.indexOf(want) : -1;
      f.v = vbos[i >= 0 ? i : 0];
    }

    // ---- gebruiksspecifieke eenheden per VBO: Ruimte (commercieel), Eenheid (residentieel), Vastgoedobject (agrarisch)
    const unitOf = {};   // vbo index (1-based) -> {use, axis, member}
    if (isTax) {
      const TPL = { c: ['frc-vt-dim:UnitAxis', 'Ruimte'], r: ['frc-vt-dim:HouseAxis', 'Eenheid'], a: ['frc-vt-dim:RealEstatePropertyAxis', 'Object'] };
      for (const u of ['c', 'r', 'a']) {
        if (!uses.has(u)) continue;
        const [axis, name] = TPL[u];
        const has = (f) => f.d.some(x => x[0] === axis);
        const linked = (f) => f.d.some(x => x[0] === 'frc-vt-dim:LeaseContractAxis');
        const unitFacts = facts.filter(f => f.g === u && has(f) && !linked(f));
        if (!unitFacts.length) continue;
        const first = unitFacts[0].d.find(x => x[0] === axis)[2];
        const tpl = unitFacts.filter(f => f.d.find(x => x[0] === axis)[2] === first);
        facts = facts.filter(f => unitFacts.indexOf(f) < 0);
        const idx = vboUse.map((x, i) => x === u ? i : -1).filter(i => i >= 0);
        const targets = idx.length ? idx : [null];
        targets.forEach((vi, k) => {
          const member = `${name} ${k + 1}`;
          const vid = vi === null ? null : vbos[vi];
          if (vi !== null) unitOf[vi + 1] = { use: u, axis, member };
          for (const f of tpl) {
            if (vid === null && (f.c === 'frc-vt-i:LinkedBAGVBOID' || f.d.some(x => x[0] === DIM_VBO))) continue;
            const g = Object.assign({}, f, { d: f.d.map(x => x[0] === axis ? [axis, 't', member] : x[0] === DIM_VBO ? [x[0], 't', vid] : x.slice()) });
            if (vi !== null) g.vboIndex = vi + 1;
            if (g.c === 'frc-vt-i:LinkedBAGVBOID') g.v = vid;
            facts.push(g);
          }
        });
        // koppelingen van huurcontracten aan ruimte / VBO: naar de eerste commerciële eenheid
        if (u === 'c') {
          const firstVid = idx.length ? vbos[idx[0]] : null;
          facts = facts.filter(f => {
            if (!linked(f)) return true;
            const ux = f.d.find(x => x[0] === axis);
            if (ux) { if (ux[2] !== first) return false; ux[2] = `${name} 1`; }
            const vx = f.d.find(x => x[0] === DIM_VBO);
            if (vx) { if (!firstVid) return false; vx[2] = firstVid; }
            if (f.c === 'frc-vt-i:LinkedBAGVBOID') { if (!firstVid) return false; f.v = firstVid; }
            return true;
          });
          // overige koppelingen in het commerciële deel (bijv. contractregels): naar het eerste commerciële VBO
          for (const f of facts) if (f.g === 'c' && f.c === 'frc-vt-i:LinkedBAGVBOID' && !f.d.some(x => x[0] === axis || x[0] === DIM_VBO)) { f.v = firstVid; f.fixedLink = true; }
          facts = facts.filter(f => !(f.fixedLink && !f.v));
        }
        log.push(`${USE_NAME[u]}: ${targets.length} ${name}${targets.length > 1 ? 's' : ''}` + (idx.length ? ' → ' + idx.map(i => 'VBO ' + (i + 1)).join(', ') : ' (no VBO of this use)'));
      }
      const unl = vboUse.map((x, i) => x === 'u' ? 'VBO ' + (i + 1) : null).filter(Boolean);
      if (unl.length) log.push(`Unlinked: ${unl.join(', ')} (only in the BAG VBO lists, not linked to a unit).`);
    }

    // ---- realistische waarden
    const personas = {};
    const persona = (key) => {
      if (!personas[key]) {
        const p = makePerson(r);
        const company = makeCompany(r);
        const addr = makeAddress(r);
        personas[key] = { p, company, addr, kvk: r.digits(8).replace(/^0/, '1'), phone: '06' + r.digits(8), email: (p.first + '.' + (p.prefix ? p.prefix.replace(/ /g, '') : '') + p.family).toLowerCase() + '@' + company.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') + '.nl' };
      }
      return personas[key];
    };
    const vboAddr = {};
    const baseObjAddr = makeAddress(r, city);
    baseObjAddr.addition = '';
    // adres eerste object uit het scenario
    const hn = filled(fx.huisnummer) && !isSpecial(fx.huisnummer) ? /^\s*(\d+)\s*[-\s]?\s*(.*?)\s*$/.exec(String(fx.huisnummer)) : null;
    if (filled(fx.straat) && !isSpecial(fx.straat)) baseObjAddr.street = String(fx.straat).trim();
    if (hn) { baseObjAddr.number = parseInt(hn[1], 10); baseObjAddr.addition = hn[2] || ''; }
    if (filled(fx.toevoeging) && !isSpecial(fx.toevoeging)) baseObjAddr.addition = String(fx.toevoeging).trim();
    // postcode met spatie of kleine letters ('3511 ab') normaliseren naar '3511AB'
    if (filled(fx.postcode) && !isSpecial(fx.postcode)) {
      const pm = /^\s*([1-9]\d{3})\s*([a-zA-Z]{2})\s*$/.exec(String(fx.postcode));
      if (pm && pm[1] + pm[2].toUpperCase() !== String(fx.postcode)) { log.push(`Postcode "${fx.postcode}" written as ${pm[1] + pm[2].toUpperCase()}`); fx.postcode = pm[1] + pm[2].toUpperCase(); }
    }
    if (filled(fx.postcode) && !isSpecial(fx.postcode)) {
      const pc = String(fx.postcode).trim().toUpperCase().replace(/\s+/g, '');
      baseObjAddr.postcode = pc;
      const n4 = parseInt(pc.slice(0, 4), 10);
      const c2 = CITIES.find(c => n4 >= c.pc[0] && n4 <= c.pc[1]);
      if (c2) { baseObjAddr.city = c2.n; baseObjAddr.cityObj = c2; }
    }
    const addrFor = (f) => {
      if (f.vboIndex) {
        if (!vboAddr[f.vboIndex]) vboAddr[f.vboIndex] = Object.assign({}, baseObjAddr, { number: baseObjAddr.number + (f.vboIndex - 1) * 2 });
        return vboAddr[f.vboIndex];
      }
      return persona(groupKey(f.d)).addr;
    };
    const debtorKey = 'frc-vt-dim:PartyAxis=e=frc-vt-dm:DebtorPartyMember';
    const entityKvk = persona(debtorKey).kvk;

    for (const f of facts) {
      const c = APP.concepts[f.c] || {};
      const local = f.c.split(':')[1];
      const P = persona(groupKey(f.d));
      if (c.k === 'date') {
        if (local === 'DocumentCreationDate') { f.v = isoDate(today); continue; }
        const d = parseIso(f.v); if (d) f.v = isoDate(addDays(d, f.sh || 0));
        continue;
      }
      if (local === 'ValuationAmount') { f.v = String(r.int(25, 400) * 10000); continue; }
      if (c.k !== 'string' && c.k !== undefined) continue;
      const lv = String(f.v).trim().toLowerCase();
      const A = addrFor(f);
      switch (local) {
        case 'FirstName': f.v = P.p.first; continue;
        case 'FamilyName': f.v = P.p.family; continue;
        case 'Prefix': f.v = P.p.prefix || 'van'; continue;
        case 'Initials': f.v = P.p.initials; continue;
        case 'JobTitle': f.v = f.d.some(x => x[0] === 'frc-vt-dim:ValuatorAxis') ? 'Register-taxateur' : r.pick(JOBS); continue;
        case 'OrganisationName': case 'LegalEntityName': f.v = P.company; continue;
        case 'ShortName': f.v = P.company.split(' ').slice(0, 2).join(' '); continue;
        case 'ChamberOfCommerceRegistrationNumber': f.v = groupKey(f.d) === debtorKey ? entityKvk : P.kvk; continue;
        case 'EmailAddressFull': f.v = P.email; continue;
        case 'TelephoneNumber': f.v = P.phone; continue;
        case 'StreetNameNL': case 'StreetNameNLFull': f.v = A.street; continue;
        case 'HouseNumberNL': f.v = String(A.number); continue;
        case 'HouseNumberAddition':
          if (f.vboIndex && !A.addition) f.drop = true; else if (A.addition) f.v = A.addition;
          continue;
        case 'PostalCodeNL': f.v = A.postcode; continue;
        case 'PlaceOfResidenceNL': f.v = A.city; continue;
        case 'DescriptionLocationNL': f.v = `${A.street} ${A.number}${A.addition ? ' ' + A.addition : ''}, ${A.city}`; continue;
        case 'LandRegister': f.v = A.city.replace(/^'s-/, 'S-'); continue;
        case 'LandRegisterCode': f.v = A.cityObj.k + '0' + r.int(0, 9); continue;
        case 'LandRegisterSection': f.v = 'ABCDEFGHKLMN'[r.int(0, 11)]; continue;
        case 'LandRegisterNumber': f.v = String(r.int(100, 9999)); continue;
        case 'LandRegisterReference': if (/^(Aanduiding|Tekst)/i.test(f.v) || !f.v.trim()) f.v = `${A.cityObj.k}0${r.int(0, 9)} ${'ABCDEFGHKLMN'[r.int(0, 11)]} ${r.int(100, 9999)}`; continue;
        case 'OwnerAccordingToLandRegister': f.v = `${P.p.initials} ${P.p.prefix ? P.p.prefix + ' ' : ''}${P.p.family}`; continue;
        case 'FileName': f.v = 'bijlage_' + r.int(1, 9) + '.pdf'; continue;
        case 'MimeType': f.v = 'application/pdf'; continue;
        case 'SoftwareUsed': f.v = 'TaxatieSuite 2026'; continue;
        case 'SoftwareUsedReference': f.v = 'TS-' + r.digits(8); continue;
        case 'Reference': f.v = 'REF-' + today.getUTCFullYear() + '-' + r.digits(5); continue;
        case 'LinkedBAGVBOID': { if (f.fixedLink) continue; const vx = f.d.find(x => x[0] === DIM_VBO); f.v = vx ? vx[2] : f.vboIndex ? vbos[f.vboIndex - 1] : vbos[0]; continue; }
        case 'BusinessNames': f.v = P.company; continue;
        case 'NameComplex': f.v = `${baseObjAddr.street} ${baseObjAddr.number}, ${baseObjAddr.city}`; continue;
        case 'PropertyName': { const B = f.vboIndex ? A : baseObjAddr; f.v = `${B.street} ${B.number}${B.addition ? ' ' + B.addition : ''}, ${B.city}`; continue; }
        case 'UnitNameDescriptive': if (f.vboIndex) { f.v = `${A.street} ${A.number}${A.addition ? ' ' + A.addition : ''}`; continue; } break;
        case 'KVKnumber': f.v = P.kvk; continue;
        case 'NameValuationReport': f.v = `Taxatierapport ${baseObjAddr.street} ${baseObjAddr.number} ${baseObjAddr.city}`; continue;
      }
      if (PLACEHOLDERS.has(lv) || /^(tekst|toelichting|omschrijving)\b/.test(lv)) {
        const ml = c.maxLength ? parseInt(c.maxLength, 10) : 1000;
        const s = r.pick(SENTENCES);
        f.v = s.length <= ml ? s : s.slice(0, ml);
      }
    }

    // ---- hulp om facts te vinden/maken voor (role, concept)
    const roleAxes = (role) => APP.roles[role].x;
    const matchesRole = (f, role) => {
      const axes = roleAxes(role);
      if (axes.length !== f.d.length) return false;
      return axes.every(a => {
        const x = f.d.find(y => y[0] === a.a);
        if (!x) return false;
        return a.t ? x[1] === 't' : (x[1] === 'e' && a.m.indexOf(x[2]) >= 0);
      });
    };
    const existingTypedValue = (axis) => {
      for (const f of facts) { const x = f.d.find(y => y[0] === axis && y[1] === 't'); if (x) return x[2]; }
      return null;
    };
    const dimsForRole = (role, vboIdx) => roleAxes(role).map(a => {
      if (a.t) {
        if (a.a === DIM_VBO) return [a.a, 't', vbos[(vboIdx || 1) - 1] || vbos[0]];
        if (a.a === DIM_PAND) return [a.a, 't', pandId];
        if (a.a === DIM_OTHER) return [a.a, 't', otherId];
        return [a.a, 't', existingTypedValue(a.a) || '1'];
      }
      return [a.a, 'e', a.m[0]];
    });
    const unitFor = (q) => { const c = APP.concepts[q] || {}; return UNIT_BY_KIND[c.k] || null; };

    function setField(fieldRes, value, source) {
      const { role, c } = fieldRes;
      const hasVbo = roleAxes(role).some(a => a.a === DIM_VBO);
      let targets = facts.filter(f => f.c === c && matchesRole(f, role));
      if (hasVbo && !fieldRes.all) {
        const n = fieldRes.vbo || 1;
        if (n > vbos.length) { errors.push(`${source}: VBO ${n} does not exist (this test has ${vbos.length} VBO(s)).`); return; }
        targets = targets.filter(f => (f.d.find(x => x[0] === DIM_VBO) || [])[2] === vbos[n - 1]);
      }
      const special = typeof value === 'string' ? value.trim().toUpperCase() : null;
      if (['LEEG', '<LEEG>', 'VERWIJDEREN', 'EMPTY', '<EMPTY>', 'REMOVE', 'DELETE'].includes(special)) {
        if (!targets.length) { log.push(`${source}: not present, nothing removed.`); return; }
        facts = facts.filter(f => targets.indexOf(f) < 0);
        log.push(`${source}: removed (${targets.length}×).`);
        return;
      }
      let v, w = [];
      if (special === 'BLANCO' || special === 'BLANK') v = '';
      else ({ v, warn: w } = convertValue(model, c, value, today));
      w.forEach(x => warnings.push(`${source}: ${x}`));
      if (!targets.length) {
        const idxs = hasVbo ? (fieldRes.all ? vbos.map((_, i) => i + 1) : [fieldRes.vbo || 1]) : [1];
        for (const i of idxs) {
          const nf = { c, d: dimsForRole(role, i), v, u: unitFor(c), dec: unitFor(c) ? 'INF' : null, vboIndex: hasVbo ? i : undefined };
          facts.push(nf);
        }
        log.push(`${source}: added = ${v === '' ? '(empty)' : v}`);
      } else {
        targets.forEach(f => { f.v = v; });
        log.push(`${source}: ${v === '' ? '(empty)' : v}${targets.length > 1 ? ` (${targets.length}×)` : ''}`);
      }
    }

    // 'toegekend door': VT17 gebruikt codes (4 = geldgever, 6 = taxateur), VT15 tekstwaarden
    const allocEnum = ((APP.concepts['frc-vt-i:ReferenceAllocatedByPartyType'] || {}).e || []).map(x => x[0]);
    const ALLOC = (code) => allocEnum.indexOf(code) >= 0 ? code : ({ 4: 'Geldgever', 6: 'Taxateur' })[code] || code;

    // ---- case-ID
    if (scenario.caseId !== undefined && scenario.caseId !== null && String(scenario.caseId).trim() !== '') {
      const targetKey = (opts.caseTarget && opts.caseTarget[ep]) || defaultCaseTarget(model, ep);
      const fr = targetKey ? model.resolveField(ep, targetKey) : { error: 'no field' };
      if (isSpecial(String(scenario.caseId))) log.push('Case ID left out');
      else if (!targetKey) warnings.push(`Case / Reference ID is not written: ${TAX} ${ep} has no assignment reference field (Opdrachtgever › Referentie holds the Process ID).`);
      else if (fr.error) errors.push('Case ID: ' + fr.error);
      else {
        setField(fr, String(scenario.caseId).trim(), `Case ID → ${fr.key}`);
        // formuleregel: bij Reference hoort ReferenceAllocatedByPartyType in dezelfde context
        if (fr.c === 'frc-vt-i:Reference') {
          const ref = facts.find(f => f.c === fr.c && matchesRole(f, fr.role));
          if (ref && !facts.some(f => f.c === 'frc-vt-i:ReferenceAllocatedByPartyType' && dimKey(f.d) === dimKey(ref.d))) {
            facts.push({ c: 'frc-vt-i:ReferenceAllocatedByPartyType', d: ref.d.map(x => x.slice()), v: ALLOC('4'), u: null, dec: null });
            log.push('Reference allocated by = 4 (lender) added with the case ID.');
          }
        }
      }
    }

    // ---- ProcesID: 12 cijfers, begint met 2000000, bij elke generatie nieuw (zoals in productieberichten:
    //      Opdrachtgever › Referentie, toegekend door de geldgever, met dezelfde waarde als omschrijving)
    //      Bron: het eerste VBO-nummer uit het sjabloon; leeg = willekeurig 2000000xxxxx
    const procesId = scenario.procesId || rawVbos.find(Boolean) || ('2000000' + String(Math.floor(Math.random() * 100000)).padStart(5, '0'));
    if (!/^2000000\d{5}$/.test(procesId)) warnings.push(`Process ID "${procesId}" (from VBO ID 1) is not 12 digits starting with 2000000.`);
    {
      const fr = model.resolveField(ep, 'Opdrachtgever › Referentie');
      if (!fr.error) {
        setField(fr, procesId, 'Process ID → ' + fr.key);
        const fa = model.resolveField(ep, 'Opdrachtgever › Referentie toegekend door');
        if (!fa.error) setField(fa, ALLOC('4'), 'Reference allocated by → lender');
        const fd = model.resolveField(ep, 'Opdrachtgever › Omschrijving van de referentie');
        if (!fd.error) setField(fd, procesId, 'Reference description → ' + fd.key);
      }
    }

    // ---- vaste kolommen uit het sjabloon
    const kvkVal = (v) => (typeof v === 'number' && Number.isInteger(v)) ? String(v).padStart(8, '0') : v;
    const useConv = (v) => {
      const t = String(v).trim();
      if (/^[1-5]$/.test(t)) return t;
      const u = useCode(t);
      if (u === 'a' && TAX !== 'VT17') return t;
      const code = { c: '1', r: '2', m: '3', a: '5' }[u];
      if (code) return code;
      return t;
    };
    // marktwaarde per VBO -> totaal getaxeerde waarde (als er geen totaal is opgegeven)
    const vboVals = (scenario.vboValues || []).slice();
    const numOf = (v) => { const t = convertValue(model, 'frc-vt-i:ValuationAmount', v, today).v; return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null; };
    const givenVboVals = vboVals.filter(v => filled(v) && !isSpecial(v));
    // Taxatierapport: VBO's zonder opgegeven marktwaarde krijgen een realistische waarde, zodat het totaal altijd de som van de VBO's is
    const autoVal = {};
    if (isTax) vbos.forEach((_, i) => {
      if (filled(vboVals[i])) return;
      const u = vboUse[i];
      autoVal[i] = u === 'r' ? r.int(18, 60) * 10000 : u === 'c' ? r.int(40, 250) * 10000 : u === 'a' ? r.int(100, 400) * 10000 : r.int(2, 15) * 10000;
    });
    if (!filled(fx.marktwaarde) && (givenVboVals.length || Object.keys(autoVal).length)) {
      const sum = vbos.reduce((a, _, i) => a + (autoVal[i] !== undefined ? autoVal[i] : (filled(vboVals[i]) && !isSpecial(vboVals[i]) ? numOf(vboVals[i]) || 0 : 0)), 0);
      const extra = vboVals.slice(vbos.length).filter(v => filled(v) && !isSpecial(v)).reduce((a, v) => a + (numOf(v) || 0), 0);
      fx.marktwaarde = String(Math.round(sum + extra));
      log.push(`Total market value = sum of the VBO market values = ${fx.marktwaarde}` + (Object.keys(autoVal).length ? ' (VBOs without a value got a generated one)' : ''));
    }
    if (isTax && !filled(fx.useType)) {
      fx.useType = uses.has('a') ? '5' : uses.has('c') && uses.has('r') ? '3' : uses.has('r') ? '2' : '1';
      log.push(`Commercieel en/of residentieel = ${fx.useType} (derived from the VBO uses)`);
    }
    const FIXED = [
      ['valuerReportId', 'Valuer report ID', 'Opdrachtnemer › Referentie', null],
      ['useType', 'Use', model.keyOf(ep, 'frc-vt-i:ScopeValuation') || 'Informatie taxatierapport › Scope taxatie', useConv],
      ['postcode', 'Postcode', 'Hoofdadres › Postcode [VBO 1]', null],
      ['toevoeging', 'House number addition', 'Hoofdadres › Huisnummertoevoeging [VBO 1]', null],
      ['straat', 'Street', 'Hoofdadres › Straatnaam [VBO 1]', null],
      ['huisnummer', 'House number', 'Hoofdadres › Huisnummer [VBO 1]', (v) => hn ? String(hn[1]) : v],
      ['marktwaarde', 'Market value', 'Waarde › Getaxeerde waarde', null],
      ['waardepeildatum', 'Valuation date report', 'Waarde › Waardepeildatum', null],
      ['valuerKvk', 'Valuer CoC number', 'Taxatieorganisatie › KvK-nummer', kvkVal],
      ['valuerKvk', 'Valuer CoC number', 'Opdrachtnemer › KvK-nummer', kvkVal],
      ['kvk', 'Client CoC number', 'Klant › KvK-nummer', kvkVal],
      ['taxVoornaam', 'Valuer first name', 'Taxateur › Voornaam', null],
      ['taxAchternaam', 'Valuer last name', 'Taxateur › Achternaam', null],
      ['taxEmail', 'Valuer email', 'Taxateur › E-mailadres', null],
      ['taxTelefoon', 'Valuer phone', 'Taxateur › Telefoonnummer', (v) => typeof v === 'number' ? '0' + String(v) : v],
    ];
    facts = facts.filter(f => !f.drop);
    // achternaam taxateur: voorvoegsel afsplitsen ("de Vries" -> voorvoegsel "de", achternaam "Vries")
    let taxPrefix = null;
    if (filled(fx.taxAchternaam) && !isSpecial(fx.taxAchternaam)) {
      const m = /^((?:van\s+der|van\s+den|van\s+de|van\s+'t|in\s+'t|van|de|der|den|het|ten|ter|te|'t)\s+)(.+)$/i.exec(String(fx.taxAchternaam).trim());
      if (m) { taxPrefix = m[1].trim(); fx.taxAchternaam = m[2].trim(); } else taxPrefix = 'LEEG';
    }
    // e-mail taxateur afleiden uit opgegeven naam als er geen e-mail is opgegeven
    if (!filled(fx.taxEmail) && (filled(fx.taxVoornaam) || filled(fx.taxAchternaam)) && !isSpecial(fx.taxVoornaam || '') && !isSpecial(fx.taxAchternaam || '')) {
      const vn = filled(fx.taxVoornaam) ? String(fx.taxVoornaam) : 'taxateur';
      const an = (taxPrefix && taxPrefix !== 'LEEG' ? taxPrefix : '') + (filled(fx.taxAchternaam) ? String(fx.taxAchternaam) : '');
      const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      fx.taxEmail = norm(vn) + '.' + norm(an) + '@taxatiebureau-' + norm(an || vn).slice(0, 12) + '.nl';
    }
    const skippedCols = new Set(), appliedCols = new Set();
    for (const [prop, label, key, conv] of FIXED) {
      if (!filled(fx[prop])) continue;
      const fr = model.resolveField(ep, key);
      if (fr.error) { skippedCols.add(label); continue; }
      appliedCols.add(label);
      const val = isSpecial(fx[prop]) ? fx[prop] : (conv ? conv(fx[prop]) : fx[prop]);
      setField(fr, val, label + ' → ' + fr.key);
      if (prop === 'valuerReportId' && !isSpecial(fx[prop])) {
        const fa = model.resolveField(ep, 'Opdrachtnemer › Referentie toegekend door');
        if (!fa.error) setField(fa, ALLOC('6'), 'Reference allocated by → valuer');
      }
      if (prop === 'huisnummer' && hn && hn[2] && !filled(fx.toevoeging) && !isSpecial(fx[prop])) {
        const fa = model.resolveField(ep, 'Hoofdadres › Huisnummertoevoeging [VBO 1]');
        if (!fa.error) setField(fa, hn[2], 'House number addition → ' + fa.key);
      }
      if (prop === 'taxAchternaam' && taxPrefix) {
        const fp = model.resolveField(ep, 'Taxateur › Voorvoegsel');
        if (!fp.error) setField(fp, taxPrefix, 'Valuer name prefix → ' + fp.key);
      }
      if (prop === 'marktwaarde' && !isSpecial(fx[prop])) {
        const fb = model.resolveField(ep, 'Waarde › Waarde begrip');
        if (!fb.error) setField(fb, '10', 'Value concept → Market value (IVS)');
      }
    }

    for (const label of skippedCols) if (!appliedCols.has(label)) warnings.push(`Column "${label}" does not apply to ${ep} and was skipped.`);

    // ---- VT17: huur- en koopreferenties in lijn met het gebruik (Soort referentie, IPD-type, agrarische velden)
    if (isTax && TAX === 'VT17') {
      const order = ['c', 'r', 'a'].filter(u => uses.has(u));
      const REF_AX = ['frc-vt-dim:LeaseReferenceAxis', 'frc-vt-dim:SaleInvestmentReferencesAxis'];
      const AGR_ONLY = ['BuildingBlocksAcreage', 'BuildingBlocksAmount', 'TypeSaleReferenceRuralAgricultural', 'CommercialBuildings', 'CommercialBuildingsAmount', 'CultivatedLand', 'CultivableLandAmount', 'HousesAcreage', 'HousesAmount', 'RightsAmount', 'OtherLand'];
      const refs = [];
      for (const f of facts) for (const x of f.d) if (REF_AX.includes(x[0]) && !refs.some(q => q[0] === x[0] && q[1] === x[2])) refs.push([x[0], x[2]]);
      const useOf = {};
      refs.forEach((q, k) => { useOf[q.join('|')] = order[k % order.length]; });
      const refUse = (f) => { const x = f.d.find(y => REF_AX.includes(y[0])); return x ? useOf[x[0] + '|' + x[2]] : null; };
      facts = facts.filter(f => {
        const u = refUse(f); if (!u) return true;
        const l = f.c.split(':')[1];
        if (AGR_ONLY.includes(l) && u !== 'a') return false;
        if (l === 'IPDSubtype' && u !== 'c') return false;
        return true;
      });
      for (const f of facts) {
        const u = refUse(f); if (!u) continue;
        const l = f.c.split(':')[1];
        if (l === 'ReferenceType') f.v = { c: '1', r: '2', a: '3' }[u];
        if (l === 'IPDTypeProperty') f.v = u === 'r' ? '5' : u === 'a' ? '6' : (['1', '2', '3', '4'].includes(f.v) ? f.v : '3');
      }
      if (refs.length) log.push('References: ' + refs.map(q => `${q[1]} ${USE_NAME[useOf[q.join('|')]]}`).join(', '));
    }

    // ---- marktwaarde per VBO: alleen residentiële eenheden hebben een marktwaarde per eenheid (Indicatieve marktwaarde VHE)
    if (isTax) {
      vbos.forEach((id, i) => {
        let v = vboVals[i];
        const un = unitOf[i + 1];
        const given = filled(v) && !isSpecial(v);
        if (!un || un.use !== 'r') {
          if (given) log.push(`VBO ${i + 1} (${USE_NAME[vboUse[i]]}): market value ${v} is part of the total; ${TAX} has no market value per ${USE_NAME[vboUse[i]]} unit.`);
          return;
        }
        if (given && numOf(v) !== null && !Number.isInteger(numOf(v))) { log.push(`Market value VBO ${i + 1} ${v} rounded to whole euros`); v = Math.round(numOf(v)); vboVals[i] = v; }
        if (given && numOf(v) === null) warnings.push(`Market value VBO ${i + 1} "${v}" is not a number; written as given (invalid XBRL).`);
        else if (given && numOf(v) < 0) warnings.push(`Market value VBO ${i + 1} is negative (${v}) (intentional?).`);
        if (isSpecial(v)) { facts = facts.filter(f => !(f.c === 'frc-vt-i:MarketValueVHE' && f.d.some(x => x[0] === un.axis && x[2] === un.member))); log.push(`VBO ${i + 1}: market value per unit left out`); return; }
        const val = given ? numOf(v) || 0 : autoVal[i];
        const gbo = Math.max(30, Math.min(400, Math.round(val / 6000 / 5) * 5 || r.int(60, 160)));
        const huur = Math.max(1200, Math.round(val * 0.04 / 100) * 100);
        const mine = facts.filter(f => f.d.some(x => x[0] === un.axis && x[2] === un.member) && !f.d.some(x => x[0] !== un.axis && x[0] !== 'frc-vt-dim:HouseTypeAxis'));
        const put = (c, value, unit) => {
          const hit = mine.filter(f => f.c === c);
          if (hit.length) hit.forEach(f => { f.v = value; });
          else if (mine.length) facts.push({ c, d: mine[0].d.map(x => x.slice()), v: value, u: unit, dec: unit ? 'INF' : null, vboIndex: i + 1 });
        };
        if (given) {
          const cv = convertValue(model, 'frc-vt-i:MarketValueVHE', v, today);
          cv.warn.forEach(w => warnings.push(`Market value VBO ${i + 1}: ${w}`));
          put('frc-vt-i:MarketValueVHE', cv.v, ['iso4217:EUR']);
          log.push(`VBO ${i + 1} (${id}): market value ${cv.v} → ${un.member}`);
        } else put('frc-vt-i:MarketValueVHE', String(val), ['iso4217:EUR']);
        put('frc-vt-i:UsableFloorArea', String(gbo), ['utr:sqm']);
        put('frc-vt-i:MarketRent', String(huur), ['iso4217:EUR']);
      });
      // VT15: marktwaarde k.k. (afgerond) per deel in de KPI's (commercieel / residentieel)
      if (TAX === 'VT15' && filled(fx.marktwaarde) && !isSpecial(fx.marktwaarde)) {
        const total = numOf(fx.marktwaarde);
        const sumUse = (u) => vbos.reduce((a, _, i) => a + (vboUse[i] === u && filled(vboVals[i]) && !isSpecial(vboVals[i]) ? numOf(vboVals[i]) || 0 : 0), 0);
        for (const [u, sec] of [['c', "KPI's van het taxatieresultaat commercieel"], ['r', "KPI's van het taxatieresultaat residentieel"]]) {
          if (!uses.has(u)) continue;
          const part = uses.size > 1 ? (sumUse(u) || total) : total;
          const key = model.keyOf(ep, 'frc-vt-i:MarketValueAfterTransferCostRounded', sec);
          const fr = key && model.resolveField(ep, key);
          if (fr && !fr.error && part !== null) setField(fr, String(Math.round(part)), `Market value (${USE_NAME[u]} part) → ${fr.key}`);
        }
      }
    }

    // ---- object-informatie (Sector type / Feitelijk gebruik) in lijn met het gebruik, alle dataproducten
    if ((isTax || useGiven) && uses.size === 1) {
      const only = [...uses][0];
      const skipAx = ['frc-vt-dim:UnitAxis', 'frc-vt-dim:HouseAxis', 'frc-vt-dim:LeaseReferenceAxis', 'frc-vt-dim:SaleInvestmentReferencesAxis', 'frc-vt-dim:LeaseReferenceCommercialAxis', 'frc-vt-dim:SaleInvestmentReferencesCommercial', 'frc-vt-dim:SaleReferenceResidentialAxis', 'frc-vt-dim:TypeOfRealEstateAxis'];
      const target = (f) => (f.c === 'frc-vt-i:IPDTypeProperty' || f.c === 'frc-vt-i:ActualUse' || f.c === 'frc-vt-i:IPDSubtype') && !f.d.some(x => skipAx.includes(x[0]));
      const RX = { r: /^(woning|residentieel)/i, a: /landelijk|agrar/i };
      const changed = new Set();
      for (const f of facts) if (target(f) && f.c !== 'frc-vt-i:IPDSubtype') {
        const E2 = (APP.concepts[f.c] || {}).e || [];
        const cur = (E2.find(x => x[0] === f.v) || [])[1] || '';
        let e = null;
        if (only === 'r' || only === 'a') e = E2.find(x => RX[only].test(x[1]));
        else if (/woning|landelijk|agrar/i.test(cur)) e = E2.find(x => /^kantoor/i.test(x[1]));
        if (e && e[0] !== f.v) { f.v = e[0]; changed.add(JSON.stringify(f.d)); }
      }
      if (only === 'r' || only === 'a') facts = facts.filter(f => !(f.c === 'frc-vt-i:IPDSubtype' && target(f)));
      if (changed.size) log.push(`Sector type / actual use set to ${USE_NAME[only]}`);
    }

    // ---- aanpassingen uit het scenario
    for (const ch of scenario.changes || []) {
      if (ch.veld === undefined || ch.veld === null || String(ch.veld).trim() === '') continue;
      const fr = model.resolveField(ep, ch.veld);
      if (fr.error) { errors.push(fr.error); continue; }
      setField(fr, ch.waarde, fr.key + (fr.vbo ? ` [VBO ${fr.vbo}]` : fr.all ? ' [all VBOs]' : ''));
    }

    // entity-identifier: KvK van de klant (tenzij aangepast)
    const debtorKvk = facts.find(f => f.c === 'nl-cd:ChamberOfCommerceRegistrationNumber' && groupKey(f.d) === debtorKey);
    const entity = [E.base.entity[0], debtorKvk ? debtorKvk.v : entityKvk];

    const xml = serialize(APP, ep, facts, entity, isoDate(peil));
    for (let i = warnings.length - 1; i >= 0; i--) if (warnings.indexOf(warnings[i]) < i) warnings.splice(i, 1);
    const validation = validate(model, ep, facts, today, entity[1]);
    return { ok: errors.length === 0, tax: TAX, ep, xml, facts, errors, warnings, log, validation, vbos, peildatum: isoDate(peil), entity: entity[1], procesId };
  }

  function defaultCaseTarget(model, ep) {
    const keys = model.APP.eps[ep].keys.map(k => k[0]);
    for (const k of ['Opdrachtinformatie › Referentie', 'Klant › Referentie']) if (keys.indexOf(k) >= 0) return k;
    // 'Opdrachtgever › Referentie' is the Process ID; never use it (or the valuer / attachment reference) for the case ID
    return keys.find(k => / › Referentie$/.test(k) && !/^(Opdrachtgever|Opdrachtnemer|Bijlage) ›/.test(k)) || null;
  }
  function caseTargetOptions(model, ep) {
    return model.APP.eps[ep].keys.filter(([k, role, c]) => c === 'frc-vt-i:Reference' || c === 'frc-vt-i:SoftwareUsedReference').map(k => k[0]);
  }

  // ------------------------------------------------------------------ serialisatie
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function serialize(APP, ep, facts, entity, date) {
    const E = APP.eps[ep];
    const ctxIds = new Map(), ctxs = [];
    const unitIds = new Map(), units = [];
    const prefixes = new Set(['xbrli', 'link', 'xlink']);
    const lines = [];
    const ctxFor = (f) => {
      const c = APP.concepts[f.c] || {};
      const inst = c.p === 'i';
      const dims = f.d.slice().sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      const key = (inst ? 'I' : 'D') + dimKey(dims);
      if (!ctxIds.has(key)) {
        const id = 'c' + (ctxIds.size + 1);
        ctxIds.set(key, id);
        let x = `  <xbrli:context id="${id}">\n    <xbrli:entity>\n      <xbrli:identifier scheme="${escAttr(entity[0])}">${esc(entity[1])}</xbrli:identifier>\n    </xbrli:entity>\n    <xbrli:period>\n`;
        x += inst ? `      <xbrli:instant>${date}</xbrli:instant>\n` : `      <xbrli:startDate>${date}</xbrli:startDate>\n      <xbrli:endDate>${date}</xbrli:endDate>\n`;
        x += '    </xbrli:period>\n';
        if (dims.length) {
          x += '    <xbrli:scenario>\n';
          for (const [axis, kind, mem] of dims) {
            prefixes.add(axis.split(':')[0]);
            if (kind === 'e') { prefixes.add(mem.split(':')[0]); prefixes.add('xbrldi'); x += `      <xbrldi:explicitMember dimension="${axis}">${mem}</xbrldi:explicitMember>\n`; }
            else {
              const ax = APP.concepts[axis];
              const role = Object.values(APP.roles).find(r => r.x.some(a => a.a === axis && a.t));
              const tm = role.x.find(a => a.a === axis).t;
              prefixes.add(tm.split(':')[0]); prefixes.add('xbrldi');
              x += `      <xbrldi:typedMember dimension="${axis}">\n        <${tm}>${esc(mem)}</${tm}>\n      </xbrldi:typedMember>\n`;
            }
          }
          x += '    </xbrli:scenario>\n';
        }
        x += '  </xbrli:context>\n';
        ctxs.push(x);
      }
      return ctxIds.get(key);
    };
    const unitFor = (u) => {
      const key = u.join(' ');
      if (!unitIds.has(key)) {
        const id = 'u' + (unitIds.size + 1);
        unitIds.set(key, id);
        u.forEach(m => prefixes.add(m.split(':')[0]));
        units.push(`  <xbrli:unit id="${id}">\n${u.map(m => `    <xbrli:measure>${m}</xbrli:measure>\n`).join('')}  </xbrli:unit>\n`);
      }
      return unitIds.get(key);
    };
    for (const f of facts) {
      prefixes.add(f.c.split(':')[0]);
      const cid = ctxFor(f);
      let attrs = ` contextRef="${cid}"`;
      if (f.u) attrs += ` unitRef="${unitFor(f.u)}" decimals="${f.dec || 'INF'}"`;
      lines.push(`  <${f.c}${attrs}>${esc(f.v)}</${f.c}>\n`);
    }
    const nsDecl = [...prefixes].sort().map(p => ` xmlns:${p}="${APP.ns[p]}"`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<xbrli:xbrl xml:lang="nl"${nsDecl}>\n  <link:schemaRef xlink:type="simple" xlink:href="${E.href}"/>\n` + ctxs.join('') + units.join('') + lines.join('') + '</xbrli:xbrl>\n';
  }

  // ------------------------------------------------------------------ validatie
  // ------------------------------------------------------------------ voorwaardelijke regels (value assertions uit VT17)
  function evalConditional(APP, ep, facts, entityId) {
    const rules = APP.eps[ep].cond || [];
    const errors = [];
    const P = (f) => ((APP.concepts[f.c] || {}).p) || 'd';
    const dimVal = (f, a) => { const x = f.d.find(y => y[0] === a); return x ? x[2] : null; };
    function match(f, flt) {
      let ok;
      switch (flt.t) {
        case 'c': ok = flt.q.indexOf(f.c) >= 0; break;
        case 'e': { const v = dimVal(f, flt.a); ok = v !== null && (!flt.m.length || flt.m.indexOf(v) >= 0); break; }
        case 't': ok = f.d.some(y => y[0] === flt.a && y[1] === 't'); break;
        case 'or': ok = flt.f.some(x => match(f, x)); break;
        default: return true; // aspectCover e.d.
      }
      return flt.not ? !ok : ok;
    }
    function covered(v, set) {
      const cov = { concept: false, period: false, unit: false, all: false, axes: new Set() };
      for (const flt of v.f) { // groepsfilters (variable-set) dekken geen aspecten af; dat sluit aan bij de officiële voorbeeldberichten
        if (flt.t === 'c' || (flt.t === 'or' && flt.f.some(x => x.t === 'c'))) cov.concept = true;
        if (flt.t === 'e' || flt.t === 't') cov.axes.add(flt.a);
        if (flt.t === 'cov') for (const a of flt.asp) cov[a] = true;
      }
      return cov;
    }
    function sameUncovered(cand, ref, cov) {
      if (cov.all) return true;
      if (!cov.concept && cand.c !== ref.c) return false;
      if (!cov.period && P(cand) !== P(ref)) return false;
      if (!cov.unit && (cand.u || []).join(' ') !== (ref.u || []).join(' ')) return false;
      const axes = new Set(cand.d.map(x => x[0]).concat(ref.d.map(x => x[0])));
      for (const a of axes) if (!cov.axes.has(a) && dimVal(cand, a) !== dimVal(ref, a)) return false;
      return true;
    }
    const sel = (v, set) => facts.filter(f => v.f.every(x => match(f, x)) && set.every(x => match(f, x)));
    const label = (q) => q.split(':')[1];
    for (const rule of rules) {
      const names = Object.keys(rule.vars);
      const prem = names.filter(n => !rule.vars[n].fb && n !== rule.items);
      if (rule.test === 'exists' || rule.test === 'notexists') {
        const cv = rule.vars[rule.concl];
        const candAll = sel(cv, rule.set);
        const prv = prem.map(n => rule.vars[n]);
        // typed-as-variant: premisse filtert alleen op een typed as (geen concept)
        if (prv.length === 1 && prv[0].seq && !prv[0].f.some(x => x.t === 'c' || x.t === 'or')) {
          const tf = prv[0].f.find(x => x.t === 't');
          if (!tf) continue;
          const members = [...new Set(sel(prv[0], rule.set).map(f => dimVal(f, tf.a)))];
          for (const m of members) {
            const has = candAll.some(f => dimVal(f, tf.a) === m);
            if ((rule.test === 'exists') !== has) errors.push(rule.msg.replace(/\{m\}/g, m) + ` [${rule.id}]`);
          }
          continue;
        }
        if (!prv.length) continue;
        // conclusie zonder concept, alleen een typed as ("<as> MUST be reported on"): bestaat er een feit met die as?
        const axisOnly = !cv.f.some(x => x.t === 'c' || x.t === 'or') && cv.f.some(x => x.t === 't' && !x.not);
        if (axisOnly) {
          const prem0 = sel(rule.vars[prem[0]], rule.set);
          if (prem0.length && (rule.test === 'exists') !== (candAll.length > 0)) errors.push(rule.msg.replace(/\{m\}/g, '') + ` [${rule.id}]`);
          continue;
        }
        const ccov = covered(cv, rule.set);
        const first = prem[0];
        const seen = new Set();
        for (const pf of sel(rule.vars[first], rule.set)) {
          // overige premissen moeten meebinden
          const bound = { [first]: pf };
          let okBind = true;
          for (const n of prem.slice(1)) {
            const c2 = covered(rule.vars[n], rule.set);
            const hit = sel(rule.vars[n], rule.set).find(f => sameUncovered(f, pf, c2));
            if (!hit) { okBind = false; break; }
            bound[n] = hit;
          }
          if (!okBind) continue;
          if (rule.pre) { const bf = bound[rule.pre.v]; if (!bf || String(bf.v) !== rule.pre.val) continue; }
          const has = candAll.some(f => sameUncovered(f, pf, ccov));
          if ((rule.test === 'exists') !== has) {
            const where = pf.d.map(x => label(x[0]).replace(/Axis$/, '') + '=' + (x[1] === 'e' ? label(x[2]) : x[2])).join(', ');
            const msg = rule.msg.replace(/\{m\}/g, '') + (where ? ` (${where})` : '') + ` [${rule.id}]`;
            if (!seen.has(msg)) { seen.add(msg); errors.push(msg); }
          }
        }
      } else if (rule.test === 'datele') {
        const va = rule.vars[rule.a], vb = rule.vars[rule.b];
        const cb = covered(vb, rule.set);
        for (const fa of sel(va, rule.set)) for (const fb of sel(vb, rule.set)) {
          if (!sameUncovered(fb, fa, cb)) continue;
          if (!(String(fa.v) <= String(fb.v))) errors.push(rule.msg + ` (${fa.v} > ${fb.v}) [${rule.id}]`);
        }
      } else if (rule.test === 'identifier') {
        const vb = rule.vars[rule.b];
        const cb = covered(vb, rule.set);
        const pv = rule.pre && rule.vars[rule.pre.v];
        if (!pv) continue;
        for (const pf of sel(pv, rule.set)) {
          if (String(pf.v) !== rule.pre.val) continue;
          const k = sel(vb, rule.set).find(f => sameUncovered(f, pf, cb));
          if (k && Number(k.v) !== Number(entityId)) errors.push(rule.msg + ` (entity ${entityId}, KvK ${k.v}) [${rule.id}]`);
        }
      }
    }
    return errors;
  }

  function validate(model, ep, facts, today, entityId) {
    const APP = model.APP;
    const E = APP.eps[ep];
    const errors = [], warnings = [], info = [];
    const rolesOfEp = E.roles.map(r => APP.roles[r]);
    for (const f of facts) {
      const c = APP.concepts[f.c];
      const name = (c ? c.l : f.c) + ` (${f.c.split(':')[1]})`;
      if (!c) { errors.push(`${f.c}: concept does not exist in ${APP.tax || 'VT17'}.`); continue; }
      const fits = rolesOfEp.some(r => r.i.indexOf(f.c) >= 0 && r.x.length === f.d.length && r.x.every(a => {
        const x = f.d.find(y => y[0] === a.a);
        return x && (a.t ? x[1] === 't' : (x[1] === 'e' && a.m.indexOf(x[2]) >= 0));
      }));
      if (!fits) errors.push(`${name}: dimension combination not allowed in ${ep} (${f.d.map(x => x[0].split(':')[1] + '=' + x[2]).join(', ') || 'no dimensions'}).`);
      const isNum = ['monetary', 'decimal', 'percent', 'area', 'length', 'energy', 'volume', 'integer'].indexOf(c.k) >= 0;
      if (isNum && !f.u) errors.push(`${name}: numeric fact without a unit.`);
      if (!isNum && f.u) errors.push(`${name}: unit on a non-numeric fact.`);
      if (isNum && f.u && c.k === 'monetary' && !/^iso4217:[A-Z]{3}$/.test(f.u.join('/'))) errors.push(`${name}: unit ${f.u.join('/')} does not fit a monetary amount (expected iso4217:EUR).`);
      const msg = checkValue(c, f.v);
      if (msg) (msg === 'empty text value' ? warnings : errors).push(`${name}: ${msg}.`);
      for (const x of f.d) if (x[1] === 't' && x[2] === '') errors.push(`${name}: empty value for typed dimension ${x[0]}.`);
    }
    // dubbele feiten
    const seen = new Map();
    for (const f of facts) {
      const k = f.c + '#' + dimKey(f.d.slice().sort());
      if (seen.has(k)) errors.push(seen.get(k) !== f.v ? `${f.c.split(':')[1]}: appears twice with different values (${seen.get(k)} / ${f.v}).` : `${f.c.split(':')[1]}: duplicate fact (same context, value ${f.v}).`);
      seen.set(k, f.v);
    }
    // verplichte velden (existence-assertions uit de taxonomie)
    for (const rule of E.req) {
      const ok = facts.some(f => f.c === rule.c && Object.entries(rule.x).every(([a, m]) => f.d.some(y => y[0] === a && (m === null || y[2] === m))) && rule.t.every(a => f.d.some(y => y[0] === a)) && (rule.n || []).every(spec => {
        const [a, ms] = spec.split('=');
        const mem = ms ? ms.split(',') : null;
        return !f.d.some(y => y[0] === a && (!mem || mem.indexOf(y[2]) >= 0));
      }));
      if (!ok) errors.push(`Required field missing: ${rule.c.split(':')[1]}`);
    }
    // realisme-signalen
    const dcd = facts.find(f => f.c === 'nl-cd:DocumentCreationDate');
    if (dcd) {
      const d = parseIso(dcd.v);
      if (d && today) {
        const days = Math.round((today - d) / 86400000);
        if (days < 0) info.push(`Document creation date is ${-days} day(s) in the future (${fmtNL(d)}).`);
        else if (days > 31) info.push(`Document creation date is ${days} days in the past (${fmtNL(d)}).`);
      }
    } else info.push('Document creation date is missing.');
    if (entityId !== undefined) for (const e of evalConditional(APP, ep, facts, entityId)) errors.push(e);
    return { errors, warnings, info };
  }

  return { Model, pickModel, useCode, generate, validate, serialize, parseDateExpr, isoDate, fmtNL, todayUTC, defaultCaseTarget, caseTargetOptions, checkValue };
});
