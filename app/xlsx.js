/* Minimale xlsx-lezer en zip-schrijver zonder externe bibliotheken (browser + Node 18+). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VT17Xlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buf) {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let eocd = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) {
      if (u.length > 8 && u[0] === 0xD0 && u[1] === 0xCF && u[2] === 0x11 && u[3] === 0xE0) throw new Error('This is an old Excel file (.xls) or a password-protected workbook. Save it as .xlsx without a password and try again.');
      throw new Error('This is not a valid Excel file (.xlsx).');
    }
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The Excel file is damaged.');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true);
      const start = off + 30 + lnlen + lelen;
      const data = u.subarray(start, start + csize);
      files[name] = { method, data };
      p += 46 + nlen + elen + clen;
    }
    return {
      names: Object.keys(files),
      async text(name) {
        const f = files[name];
        if (!f) return null;
        const raw = f.method === 8 ? await inflateRaw(f.data) : f.data;
        return new TextDecoder().decode(raw);
      },
    };
  }

  function decodeXml(s) {
    return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, e) => {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      if (e[1] === 'x') return String.fromCodePoint(parseInt(e.slice(2), 16));
      return String.fromCodePoint(parseInt(e.slice(1), 10));
    });
  }
  function textOf(fragment) {
    let out = '';
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    let m;
    while ((m = re.exec(fragment))) out += m[1] ? decodeXml(m[1]) : '';
    return out;
  }
  function colIndex(ref) {
    const letters = /^[A-Z]+/.exec(ref)[0];
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  /** Lees het eerste werkblad als array van rijen (array van celwaarden; getallen blijven getallen). */
  async function readFirstSheet(buf) {
    const z = await unzip(buf);
    const wb = await z.text('xl/workbook.xml');
    if (!wb) throw new Error('This is not a valid Excel file (.xlsx).');
    // alle werkbladen in volgorde; het eerste blad met de sjabloonkop wint (anders het eerste blad)
    const rels = await z.text('xl/_rels/workbook.xml.rels');
    const paths = [];
    const shRe = /<sheet\b[^>]*?(?:r:id|\bid)="([^"]+)"[^>]*>/g;
    let sm;
    while ((sm = shRe.exec(wb))) {
      const rid = (/r:id="([^"]+)"/.exec(sm[0]) || [])[1] || sm[1];
      const rel = rels && new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*>').exec(rels);
      if (rel) { const t = /Target="([^"]+)"/.exec(rel[0])[1]; paths.push(t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '')); }
    }
    if (!paths.length) paths.push('xl/worksheets/sheet1.xml');
    const sst = [];
    const ss = await z.text('xl/sharedStrings.xml');
    if (ss) {
      const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
      let m;
      while ((m = re.exec(ss))) {
        // fonetische hints (<rPh>) overslaan
        sst.push(textOf((m[1] || '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
      }
    }
    let firstRows = null;
    for (const path of paths) {
      const xml = await z.text(path);
      if (!xml) continue;
      const rows = parseSheet(xml, sst);
      if (!firstRows) firstRows = rows;
      if (rows.some(r => r.some(c => typeof c === 'string' && /^(data ?product|test id|scenario-id)/i.test(c.trim())))) return rows;
    }
    if (!firstRows) throw new Error('No worksheet found in the Excel file.');
    return firstRows;
  }

  function parseSheet(xml, sst) {
    const rows = [];
    const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const rn = /\br="(\d+)"/.exec(rm[1]);
      const ri = rn ? parseInt(rn[1], 10) - 1 : rows.length;
      const row = [];
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm;
      while ((cm = cellRe.exec(rm[2]))) {
        const attrs = cm[1], body = cm[2] || '';
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
        if (!ref) continue;
        const ci = colIndex(ref[1]);
        const t = (/\bt="([^"]+)"/.exec(attrs) || [])[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        let val = null;
        if (t === 's') val = v ? sst[parseInt(v[1], 10)] : null;
        else if (t === 'inlineStr') val = textOf(body);
        else if (t === 'str' || t === 'e') val = v ? decodeXml(v[1]) : null;
        else if (t === 'b') val = v ? v[1] === '1' : null;
        else if (v) { const num = parseFloat(v[1]); val = isNaN(num) ? decodeXml(v[1]) : num; }
        row[ci] = val;
      }
      rows[ri] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  }

  function cellStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    return String(v).trim();
  }

  /** Rijen -> scenario's volgens het sjabloon (kop met 'Scenario-ID'). */
  function rowsToScenarios(rows) {
    const norm = (h) => (h === null || h === undefined) ? '' : String(h).replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isHeaderCell = (h) => /^(scenario-id|test id( nr| no\.?)?|data ?product)$/.test(h);
    let hr = -1;
    for (let i = 0; i < rows.length && hr < 0; i++) {
      if (Array.from(rows[i] || [], norm).some(isHeaderCell)) hr = i;
    }
    if (hr < 0) throw new Error('Column "Data product" not found. Please use the template from step 1.');
    const head = Array.from(rows[hr], norm);
    const col = (pred) => head.findIndex(pred);
    const C = {
      id: col(h => /^(scenario-id|test id( nr| no\.?)?)$/.test(h)),
      oms: col(h => h.startsWith('omschrijving') || h.includes('description')),
      ep: col(h => h.startsWith('dataproduct') || h.startsWith('data product')),
      cas: col(h => h.startsWith('case')),
      valuerReportId: col(h => h.startsWith('valuer report')),
      useType: col(h => (h.startsWith('use') && !/^use vbo/.test(h)) || h.startsWith('commercial')),
      tax: col(h => h.startsWith('taxonom')),
      vbo: col(h => h === 'vbo-id(\'s)' || h.startsWith('eerste vbo') || h.startsWith('first vbo')),
      peil: col(h => h.startsWith('peildatum')),
      postcode: col(h => h.startsWith('postcode')),
      straat: col(h => h.startsWith('straat') || h.startsWith('street')),
      huisnummer: col(h => h === 'huisnummer' || h === 'house number' || h === 'huisnummer object'),
      toevoeging: col(h => h.startsWith('house number addition') || h.startsWith('huisnummertoevoeging') || h.startsWith('addition')),
      marktwaarde: col(h => /^(marktwaarde|market value)( \(eur\))?$/.test(h)),
      waardepeildatum: col(h => h.startsWith('waardepeildatum') || h.startsWith('valuation date')),
      valuerKvk: col(h => h.startsWith('valuer coc') || h.startsWith('valuer chamber') || h.startsWith('chamber of commerce')),
      kvk: col(h => h.startsWith('kvk')),
      exp: col(h => h.startsWith('verwacht') || h.startsWith('expected')),
    };
    // VBO ID n + Market value VBO n
    const vboCols = [];
    head.forEach((h, i) => {
      const m = /^vbo id (\d+)$/.exec(h);
      if (m) vboCols.push({ n: +m[1], id: i, mv: head.findIndex(x => new RegExp('^market value vbo ' + m[1] + '( \\(eur\\))?$').test(x)), use: head.findIndex(x => new RegExp('^use vbo ' + m[1] + '\\b').test(x)) });
    });
    vboCols.sort((a, b) => a.n - b.n);
    const out = [];
    const seen = {};
    for (let i = hr + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const raw = (k) => (C[k] >= 0 ? r[C[k]] : null);
      const ep = cellStr(raw('ep'));
      const caseId = cellStr(raw('cas'));
      const idCell = cellStr(raw('id'));
      const any = r.some(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (!any || (!ep && !idCell && !caseId)) continue;
      let vbos = cellStr(raw('vbo')).split(/[;,\s]+/).map(s => s.trim()).filter(Boolean);
      const vboValues = [];
      const vboUses = vbos.map(() => '');
      for (const vc of vboCols) {
        let id = cellStr(r[vc.id]);
        // Excel zet een VBO-ID als getal om en laat dan de voorloopnul vallen (15 i.p.v. 16 cijfers): herstellen
        if (typeof r[vc.id] === 'number' && /^\d{15}$/.test(id)) id = '0' + id;
        const mv = vc.mv >= 0 ? r[vc.mv] : null;
        const use = vc.use >= 0 ? cellStr(r[vc.use]) : '';
        if (!id && !use && (mv === null || mv === undefined || String(mv).trim() === '')) continue;
        vbos.push(id || '');
        vboUses.push(use);
        vboValues.push(mv === null || mv === undefined || String(mv).trim() === '' ? null : (typeof mv === 'string' ? mv.trim() : mv));
      }
      const fixed = {};
      for (const k of ['postcode', 'straat', 'huisnummer', 'toevoeging', 'marktwaarde', 'waardepeildatum', 'kvk', 'valuerReportId', 'useType', 'valuerKvk']) {
        const v = raw(k);
        if (v !== null && v !== undefined && String(v).trim() !== '') fixed[k] = typeof v === 'string' ? v.trim() : v;
      }
      let id = idCell || caseId || ('row ' + (i + 1));
      if (seen[id]) id = id + '_row' + (i + 1);
      seen[id] = 1;
      out.push({ fixed, vboValues, vboUses, taxonomy: cellStr(raw('tax')) || 'VT17',
        row: i + 1, id, omschrijving: cellStr(raw('oms')), dataproduct: ep,
        caseId, vbos, peildatum: raw('peil'), verwacht: cellStr(raw('exp')), opmerking: '', changes: [],
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- zip schrijven (zonder compressie)
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zip(files) { // files: [{name, data: string|Uint8Array}]
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, x) => s + x.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  return { readFirstSheet, rowsToScenarios, zip, unzip };
});
