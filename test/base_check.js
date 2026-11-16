const fs=require('fs');const Core=require('../app/core.js');
const APP=JSON.parse(fs.readFileSync(process.argv[2]||require('path').join(__dirname,'../data/appdata-vt17.json'),'utf8'));const model=new Core.Model(APP);
for (const ep of Object.keys(APP.eps)) {
  const b=APP.eps[ep].base;
  const facts=b.facts.map(f=>({c:f.c,d:f.d,v:f.v,u:f.u||null}));
  const v=Core.validate(model,ep,facts,null,b.entity[1]);
  console.log('==',ep,'official example:',v.errors.length,'errors'); v.errors.slice(0,6).forEach(e=>console.log('   ',e.slice(0,220)));
}
