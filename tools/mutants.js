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
        for (const cand of candidates(Core, APP, kind, rule, b.r.facts, unitOf).slice(0, 10)) {
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

const NUMERIC = ['monetary', 'decimal', 'percent', 'area', 'length', 'energy', 'volume', 'integer'];

/** A schema-valid value for a concept (null when none of the tried values fits its type and facets). */
function sampleValue(Core, c) {
  const byKind = {
    enum: c.enum && c.enum.length ? [c.enum[0].v] : [], date: ['2026-01-01'], gYear: ['2020'], boolean: ['true'], duration: ['P1Y'],
    monetary: ['100'], integer: ['1'], area: ['100'], length: ['10'], energy: ['100'], volume: ['100'], decimal: ['1.5'], percent: ['0.05'], enumSet: [],
  };
  let list = byKind[c.k] || ['Test', '12', '1234AB', 'A', '12345678', 'NLD', '123'];
  if (c.pattern) { const m = /^\(*([0-9A-Za-z]+)[|)]/.exec(c.pattern); if (m) list = [m[1]].concat(list); }
  const v = list.find(x => !Core.checkValue(c, x));
  return v === undefined ? null : v;
}

/** Ways to break one rule in one report, most direct first. Each: { how, facts } (facts that were changed carry changed:true). */
function candidates(Core, APP, kind, rule, base, unitOf) {
  const H = Core.ruleHelpers(APP, base);
  const C = (q) => APP.concepts[q] || {};
  const label = (q) => q.split(':').pop();
  const res = [];
  const without = (gone, how) => { const s = new Set(gone); res.push({ how, facts: copy(base.filter(f => !s.has(f))) }); };
  // a new fact for concept q with dimensions d (value: v, or a valid sample value); null when no valid value exists
  const newFact = (q, d, v) => {
    const c = C(q);
    if (!c.k) return null;
    if (v === undefined) v = sampleValue(Core, c);
    if (v === null || Core.checkValue(c, v)) return null;
    const u = NUMERIC.includes(c.k) ? (unitOf[c.k] || { u: c.k === 'monetary' ? ['iso4217:EUR'] : ['xbrli:pure'], dec: 'INF' }) : null;
    return { c: q, d: d.map(x => x.slice()), v, u: u ? u.u.slice() : null, dec: u ? u.dec : null, changed: true };
  };
  const conceptOf = (v) => { const f = v && v.f.find(x => x.t === 'c' && !x.not); return f && f.q.length ? f.q[0] : null; };
  // dimension sets under which a var could bind: those of existing facts that pass the var's non-concept filters and the set filters
  const dimsFor = (v) => {
    const seen = new Map();
    for (const f of base) {
      if (!rule.set.every(x => H.match(f, x)) || !v.f.every(x => x.t === 'c' || x.t === 'or' || x.t === 'cov' || H.match(f, x))) continue;
      const k = JSON.stringify(f.d.slice().sort());
      if (!seen.has(k)) seen.set(k, f.d);
    }
    return [...seen.values()].slice(0, 3);
  };
  const withDims = (d, v) => { // add the explicit members a var or the set filters require
    const out = d.map(x => x.slice());
    for (const flt of (v ? v.f : []).concat(rule.set)) if (flt.t === 'e' && !flt.not && flt.m.length && !out.some(x => x[0] === flt.a)) out.push([flt.a, 'e', flt.m[0]]);
    return out;
  };
  const plus = (extra, how, edit) => { const facts = copy(base); if (edit) edit(facts); const add = extra.filter(Boolean); if (add.length !== extra.length) return; res.push({ how, facts: facts.concat(add) }); };
  const premNames = Object.keys(rule.vars || {}).filter(n => n !== rule.concl && n !== rule.items && !rule.vars[n].fb);
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
      // a premise with a value condition ("when X is 'Ja' then Y must be reported"): give X that value
      if (rule.pre && rule.pre.v) {
        for (const p of sel(rule.pre.v).filter(f => String(f.v) !== rule.pre.val && !Core.checkValue(C(f.c), rule.pre.val)).slice(0, 3)) {
          const i = base.indexOf(p);
          plus([], `${label(p.c)} set to '${rule.pre.val}'`, (fs) => { fs[i].v = rule.pre.val; fs[i].changed = true; });
          const gone = new Set(cand), keep = copy(base.filter(f => !gone.has(f) || f === p));
          const j = keep.findIndex(f => f.c === p.c && JSON.stringify(f.d) === JSON.stringify(p.d));
          if (j >= 0) { keep[j].v = rule.pre.val; keep[j].changed = true; res.push({ how: `${label(p.c)} set to '${rule.pre.val}' and ${label(conceptOf(cv) || 'the conclusion')} deleted`, facts: keep }); }
        }
      }
      // a premise that does not occur in the report: add it (the conclusion is then missing)
      for (const n of premNames.slice(0, 1)) {
        const q = conceptOf(rule.vars[n]);
        if (!q || sel(n).length) continue;
        for (const d of dimsFor(rule.vars[n])) plus([newFact(q, withDims(d, rule.vars[n]), rule.pre && rule.pre.v === n ? rule.pre.val : undefined)], `added ${label(q)}`);
      }
      break;
    }
    case 'notexists': {
      const cv = rule.vars[rule.concl];
      const qc = conceptOf(cv);
      if (!qc) break;
      const pn = premNames[0], qp = pn && conceptOf(rule.vars[pn]);
      const preVal = (n) => (rule.pre && rule.pre.v === n ? rule.pre.val : undefined);
      // the forbidden fact next to an existing premise
      for (const p of (pn ? sel(pn) : []).slice(0, 4)) {
        const i = base.indexOf(p);
        const needVal = rule.pre && rule.pre.v === pn && String(p.v) !== rule.pre.val;
        plus([newFact(qc, withDims(p.d, cv))], `added ${label(qc)} next to ${label(p.c)}${needVal ? ` and set ${label(p.c)} to '${rule.pre.val}'` : ''}`,
          needVal ? (fs) => { fs[i].v = rule.pre.val; fs[i].changed = true; } : null);
      }
      // the premise next to an existing fact that it forbids
      if (qp && !sel(pn).length) for (const f of sel(rule.concl).slice(0, 3)) plus([newFact(qp, withDims(f.d, rule.vars[pn]), preVal(pn))], `added ${label(qp)} next to ${label(f.c)}`);
      // neither occurs: add both
      if (qp && !sel(pn).length && !sel(rule.concl).length) for (const d of dimsFor(rule.vars[pn])) {
        plus([newFact(qp, withDims(d, rule.vars[pn]), preVal(pn)), newFact(qc, withDims(d, cv))], `added ${label(qp)} and ${label(qc)}`);
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
      const partVar = rule.test === 'sum' ? rule.b : rule.db, part = conceptOf(rule.vars[partVar]), total = conceptOf(rule.vars[rule.a]);
      const cov = H.covered(rule.vars[partVar]);
      if (part && total) {
        for (const pf of sel(rule.a).slice(0, 2)) {
          if (sel(partVar).some(f => H.sameUncovered(f, pf, cov)) || !/^\d+$/.test(String(pf.v))) continue;
          plus([newFact(part, pf.d, String(BigInt(pf.v) + 1n))], `added ${label(part)} = ${BigInt(pf.v) + 1n} under ${label(pf.c)} = ${pf.v}`);
        }
        if (!sel(rule.a).length) {
          for (const f of sel(partVar).slice(0, 2)) if (/^\d+$/.test(String(f.v))) plus([newFact(total, f.d, String(BigInt(f.v) + 1n))], `added ${label(total)} = ${BigInt(f.v) + 1n} above ${label(f.c)} = ${f.v}`);
          if (!sel(partVar).length) for (const d of dimsFor(rule.vars[rule.a])) plus([newFact(total, withDims(d), '5'), newFact(part, withDims(d), '3')], `added ${label(total)} = 5 and ${label(part)} = 3`);
        }
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
