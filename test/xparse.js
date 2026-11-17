/* Small independent XBRL instance parser for the tests */
'use strict';
// ------------------------------------------------------------------ onafhankelijke XBRL-parser
function parseX(xml) {
  const ctx = {}, units = {}, facts = [];
  const ctxIds = [];
  for (const m of xml.matchAll(/<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g)) {
    const b = m[2], dims = [];
    for (const e of b.matchAll(/<xbrldi:explicitMember dimension="([^"]+)">([^<]+)<\/xbrldi:explicitMember>/g)) dims.push({ a: e[1], k: 'e', m: e[2] });
    for (const t of b.matchAll(/<xbrldi:typedMember dimension="([^"]+)">\s*<([^>\s]+)>([^<]*)<\/[^>]+>\s*<\/xbrldi:typedMember>/g)) dims.push({ a: t[1], k: 't', m: t[3] });
    const inst = (b.match(/<xbrli:instant>([^<]+)</) || [])[1], end = (b.match(/<xbrli:endDate>([^<]+)</) || [])[1], start = (b.match(/<xbrli:startDate>([^<]+)</) || [])[1];
    const ident = (b.match(/<xbrli:identifier scheme="([^"]+)">([^<]+)</) || []);
    ctxIds.push(m[1]);
    ctx[m[1]] = { dims, inst, start, end, scheme: ident[1], id: ident[2] };
  }
  for (const m of xml.matchAll(/<xbrli:unit id="([^"]+)">([\s\S]*?)<\/xbrli:unit>/g)) units[m[1]] = [...m[2].matchAll(/<xbrli:measure>([^<]+)</g)].map(x => x[1]);
  for (const m of xml.matchAll(/<((?:frc-vt-i|nl-cd|frc-vt-enum-i)[^:\s>]*:[A-Za-z0-9_]+)\s+([^>]*?)(\/?)>(?:([\s\S]*?)<\/\1>)?/g)) {
    const attrs = m[2];
    const g = (n) => (attrs.match(new RegExp(n + '="([^"]*)"')) || [])[1];
    facts.push({ c: m[1], ctx: g('contextRef'), unit: g('unitRef'), dec: g('decimals'), nil: /xsi:nil="true"/.test(attrs), v: unesc(m[4] || '') });
  }
  const schema = (xml.match(/<link:schemaRef[^>]*xlink:href="([^"]+)"/) || [])[1];
  return { ctx, ctxIds, units, facts, schema };
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const loc = (q) => String(q).split(':').pop();
const dimsOf = (X, f) => X.ctx[f.ctx] ? X.ctx[f.ctx].dims : [];
const hasAxis = (X, f, ax) => dimsOf(X, f).some(d => loc(d.a) === ax);
const member = (X, f, ax) => (dimsOf(X, f).find(d => loc(d.a) === ax) || {}).m;
const onlyDims = (X, f, spec) => { const ds = dimsOf(X, f); return ds.length === Object.keys(spec).length && ds.every(d => spec[loc(d.a)] !== undefined && (spec[loc(d.a)] === '*' || loc(d.m) === spec[loc(d.a)] || d.m === spec[loc(d.a)])); };
const get = (X, concept, spec) => X.facts.filter(f => loc(f.c) === concept && (!spec || onlyDims(X, f, spec)));


module.exports = { parseX, loc, dimsOf, hasAxis, member, onlyDims, get };
