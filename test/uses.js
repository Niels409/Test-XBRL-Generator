const fs=require('fs');const Core=require('../app/core.js');
const M={VT17:new Core.Model(JSON.parse(fs.readFileSync(require('path').join(__dirname,'../data/appdata-vt17.json'),'utf8'))),VT15:new Core.Model(JSON.parse(fs.readFileSync(require('path').join(__dirname,'../data/appdata-vt15.json'),'utf8')))};
const V=['0363010000000001','0363010000000002','0363010000000003','0363010000000004'];
const S=[
 ['VT17','Commercial',[V[0],V[1]],[],[1500000,900000]],
 ['VT17','Residential',[V[0],V[1]],[],[350000,410000]],
 ['VT17','Mixed use',[V[0],V[1],V[2]],['Commercial','Residential','Unlinked'],[1000000,400000,20000]],
 ['VT17','Agricultural',[V[0],V[1]],['Agricultural','Unlinked'],[2500000,30000]],
 ['VT17','',[V[0]],['Unlinked'],[]],
 ['VT15','Commercial',[V[0],V[1]],[],[1500000,900000]],
 ['VT15','Residential',[V[0],V[1]],[],[350000,410000]],
 ['VT15','Mixed use',[V[0],V[1]],[],[1000000,400000]],
 ['VT15','Agricultural',[V[0]],[],[1]],
];
const only=process.argv[2];
S.forEach((s,i)=>{ if(only && String(i)!==only) return;
  const sc={id:'T'+i,taxonomy:s[0],dataproduct:'Taxatierapport',caseId:'CASE-'+i,vbos:s[2],vboUses:s[3],vboValues:s[4],fixed:{useType:s[1],postcode:'3511AB',straat:'Oudegracht',huisnummer:'12',waardepeildatum:'01-11-2026',valuerKvk:'12345678',valuerReportId:'VR-1'}};
  const r=Core.generate(M,sc,{today:new Date(Date.UTC(2026,10,13))});
  const tags={};(r.facts||[]).forEach(f=>{tags[f.g||'-']=(tags[f.g||'-']||0)+1});
  console.log(`== ${i} ${s[0]} ${s[1]||'(none)'} ok=${r.ok} facts=${(r.facts||[]).length} tags=${JSON.stringify(tags)} val=${r.validation?r.validation.errors.length:'-'}`);
  (r.errors||[]).forEach(e=>console.log('  ERR',e));(r.warnings||[]).forEach(e=>console.log('  WARN',e));
  if(r.validation) r.validation.errors.slice(0,8).forEach(e=>console.log('  VAL',e.slice(0,200)));
  if(process.env.LOG) r.log.forEach(e=>console.log('  LOG',e));
  if(r.xml){fs.mkdirSync(__dirname+'/out',{recursive:true});fs.writeFileSync(__dirname+`/out/T${i}_${s[0]}.xbrl`,r.xml);}
});
