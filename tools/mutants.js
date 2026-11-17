/* Mutation corpus for the comparison with Arelle.
 *
 * For every assertion (business rule) of the taxonomy, one valid generated report is changed so that the built-in check
 * reports that assertion: a required fact is deleted, a forbidden fact is added, a total no longer matches its parts, a date
 * comes after the date it must precede, an area gets another unit. The Arelle job in CI validates these files and compares,
 * per file, the assertions reported by Arelle with the ones reported by the built-in check: they must be identical.
 *
 * makeMutants(Core, models, bases) -> [{ name, tax, ep, target, how, xml, errors, assertions }]
 *   bases: [{ tax, id, r }] with r a result of Core.generate() without deviations
 */
'use strict';

const KVK_OTHER = ['12345678', '23456789', '34567891'];

function makeMutants(Core, models, bases) {
  const out = [];
  const coverage = {};
  for (const tax of Object.keys(models)) {
    const model = models[tax], APP = model.APP;
    const mine = bases.filter(b => b.tax === tax && b.r.ok && !b.r.validation.errors.length).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    // unit and decimals per kind of concept, taken from the reports themselves
    const unitOf = {};
    for (const b of mine) for (const f of b.r.facts) { const k = (APP.concepts[f.c] || {}).k; if (f.u && k && !unitOf[k]) unitOf[k] = { u: f.u, dec: f.dec }; }
    const rules = new Map(); // id -> { rule, kind, eps }
    for (const [ep, E] of Object.entries(APP.eps)) {
      for (const r of E.cond) { if (!rules.has(r.id)) rules.set(r.id, { rule: r, kind: 'cond', eps: [] }); rules.get(r.id).eps.push(ep); }
      for (const r of E.req) { if (!rules.has(r.id)) rules.set(r.id, { rule: r, kind: 'req', eps: [] }); rules.get(r.id).eps.push(ep); }
    }
    coverage[tax] = { rules: rules.size, mutated: 0, notApplicable: [] };
    for (const [id, { rule, kind, eps }] of [...rules.entries()].sort()) {
      let done = null;
      for (const b of mine.filter(x => eps.includes(x.r.ep))) {
        for (const cand of candidates(Core, APP, kind, rule, b.r.facts, unitOf).slice(0, 6)) {
          const facts = cand.facts;
          const bad = facts.find(f => f.changed && Core.checkValue(APP.concepts[f.c] || {}, f.v));
          if (bad) continue; // only schema-valid values: invalid values change the formula evaluation in Arelle
          facts.forEach(f => { delete f.changed; });
          const v = Core.validate(model, b.r.ep, facts, new Date(), b.r.entity);
          const ids = Core.assertionIds(v.errors);
          if (!ids.includes(id)) continue;
          done = { name: `${tax}/${id}.xbrl`, tax, ep: b.r.ep, target: id, how: `${cand.how} (from ${b.id} ${b.r.ep})`, base: b.id,
            xml: Core.serialize(APP, b.r.ep, facts, [APP.eps[b.r.ep].base.entity[0], b.r.entity], b.r.peildatum), errors: v.errors, assertions: ids };
          break;
        }
        if (done) break;
      }
      if (done) { out.push(done); coverage[tax].mutated++; } else coverage[tax].notApplicable.push(id);
    }
  }
  return { mutants: out, coverage };
}

const copy = (facts) => facts.map(f => ({ c: f.c, d: f.d.map(x => x.slice()), v: f.v, u: f.u ? f.u.slice() : null, dec: f.dec || null }));
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function sampleValue(c) {
  switch (c.k) {
    case 'enum': return c.enum && c.enum.length ? c.enum[0].v : null;
    case 'date': return '2026-01-01';
    case 'gYear': return '2020';
    case 'boolean': return 'true';
    case 'duration': return 'P1Y';
    case 'monetary': case 'integer': case 'area': case 'length': case 'energy': case 'volume': return '100';
    case 'decimal': return '1.5';
    case 'percent': return '0.05';
    case 'enumSet': return null;
    default: return c.pattern ? null : 'Test';
  }
}

/** Ways to break one rule in one report, most direct first. Each: { how, facts } (facts that were changed carry changed:true). */
function candidates(Core, APP, kind, rule, base, unitOf) {
  const H = Core.ruleHelpers(APP, base);
  const C = (q) => APP.concepts[q] || {};
  const label = (q) => q.split(':').pop();
  const res = [];
  const without = (gone, how) => { const s = new Set(gone); res.push({ how, facts: copy(base.filter(f => !s.has(f))) }); };
  if (kind === 'req') {
    const hit = base.filter(f => rule.f.every(x => H.match(f, x)) && rule.set.every(x => H.match(f, x)));
    if (hit.length) without(hit, `deleted ${hit.length} fact(s) ${[...new Set(hit.map(f => label(f.c)))].join(', ')}`);
    return res;
  }
  const sel = (n) => H.sel(rule.vars[n], rule.set);
  switch (rule.test) {
    case 'exists': {
      const cv = rule.vars[rule.concl];
      const cand = sel(rule.concl);
      const axisOnly = !cv.f.some(x => x.t === 'c' || x.t === 'or');
      if (axisOnly && cand.length) without(cand, `deleted all ${cand.length} facts with ${cv.f.filter(x => x.t === 't').map(x => label(x.a)).join(', ')}`);
      for (const f of cand) without([f], `deleted ${label(f.c)} (${f.d.map(x => label(x[0]) + '=' + label(x[2])).join(', ')})`);
      // when several facts satisfy the conclusion for the same premise, delete all of them
      if (cand.length > 1) without(cand, `deleted all ${cand.length} facts ${[...new Set(cand.map(f => label(f.c)))].join(', ')}`);
      break;
    }
    case 'notexists': {
      const cv = rule.vars[rule.concl];
      const cf = cv.f.find(x => x.t === 'c' && !x.not);
      if (!cf) break;
      const prem = Object.keys(rule.vars).filter(n => n !== rule.concl && !rule.vars[n].fb);
      const pf = prem.length ? sel(prem[0]) : [];
      for (const p of pf) {
        const q = cf.q[0], c = C(q), v = sampleValue(c);
        if (v === null || !c.k) continue;
        const d = p.d.map(x => x.slice());
        for (const flt of cv.f.concat(rule.set)) if (flt.t === 'e' && !flt.not && flt.m.length && !d.some(x => x[0] === flt.a)) d.push([flt.a, 'e', flt.m[0]]);
        const isNum = ['monetary', 'decimal', 'percent', 'area', 'length', 'energy', 'volume', 'integer'].includes(c.k);
        const u = isNum ? (unitOf[c.k] || { u: c.k === 'monetary' ? ['iso4217:EUR'] : ['xbrli:pure'], dec: 'INF' }) : null;
        const facts = copy(base);
        facts.push({ c: q, d, v, u: u ? u.u.slice() : null, dec: u ? u.dec : null, changed: true });
        res.push({ how: `added ${label(q)} = ${v} next to ${label(p.c)}`, facts });
      }
      break;
    }
    case 'datele': {
      const cb = H.covered(rule.vars[rule.b]);
      for (const fa of sel(rule.a)) for (const fb of sel(rule.b)) {
        if (!H.sameUncovered(fb, fa, cb) || !/^\d{4}-\d{2}-\d{2}$/.test(fb.v)) continue;
        const facts = copy(base), i = base.indexOf(fa);
        facts[i].v = addDays(fb.v, 1); facts[i].changed = true;
        res.push({ how: `${label(fa.c)} set to the day after ${label(fb.c)} (${facts[i].v})`, facts });
      }
      break;
    }
    case 'identifier': {
      for (const fk of sel(rule.b)) {
        const facts = copy(base), i = base.indexOf(fk);
        facts[i].v = KVK_OTHER.find(k => k !== String(fk.v)); facts[i].changed = true;
        res.push({ how: `${label(fk.c)} changed to ${facts[i].v}`, facts });
      }
      break;
    }
    case 'sum': case 'sumdc': {
      for (const pf of sel(rule.a)) {
        if (!/^-?\d+(\.\d+)?$/.test(String(pf.v))) continue;
        const facts = copy(base), i = base.indexOf(pf);
        facts[i].v = String(BigInt(String(pf.v).split('.')[0]) + 1n) + (String(pf.v).includes('.') ? '.' + String(pf.v).split('.')[1] : '');
        facts[i].changed = true;
        res.push({ how: `${label(pf.c)} changed from ${pf.v} to ${facts[i].v}, so it no longer equals its parts`, facts });
      }
      break;
    }
    case 'unit': {
      for (const f of sel(rule.a)) {
        if (!f.u) continue;
        const facts = copy(base), i = base.indexOf(f);
        facts[i].u = ['utr:ha'];
        res.push({ how: `unit of ${label(f.c)} changed from ${f.u.join('*')} to utr:ha`, facts });
      }
      break;
    }
  }
  return res;
}

/** Control files: changes that the taxonomy allows, so neither Arelle nor the built-in check may report an assertion. */
function makeControls(Core, models, bases) {
  const out = [];
  for (const tax of Object.keys(models)) {
    const model = models[tax], APP = model.APP;
    const b = bases.find(x => x.tax === tax && x.r.ok && !x.r.validation.errors.length && x.r.facts.some(f => (APP.concepts[f.c] || {}).k === 'area' && f.u));
    if (!b) continue;
    // an area in hectares: VT17 has no unit rule for areas; in VT15 this is the counterpart of the Report_AllMeasureEqualToParam1 mutant
    const facts = copy(b.r.facts);
    const f = facts.find(x => (APP.concepts[x.c] || {}).k === 'area' && x.u);
    f.u = ['utr:ha'];
    const v = Core.validate(model, b.r.ep, facts, new Date(), b.r.entity);
    out.push({ name: `${tax}/control-area-in-hectares.xbrl`, tax, ep: b.r.ep, target: '', how: `unit of ${f.c.split(':').pop()} changed to utr:ha (from ${b.id} ${b.r.ep})`,
      base: b.id, xml: Core.serialize(APP, b.r.ep, facts, [APP.eps[b.r.ep].base.entity[0], b.r.entity], b.r.peildatum), errors: v.errors, assertions: Core.assertionIds(v.errors) });
  }
  return out;
}

module.exports = { makeMutants, makeControls };
