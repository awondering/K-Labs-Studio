// Loads the REAL ui.js record functions (and everything they call) into an isolated context, so job-record tests
// exercise the shipped load/save logic rather than hand-written copies. Only environment lookups are stubbed.
// Used by tests/job-kind-compatibility.test.cjs.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','..','js','ui.js'),'utf8');
const FUNCTION_NAMES=new Set([...source.matchAll(/^function ([A-Za-z0-9_$]+)\(/gm)].map((m)=>m[1]));
const CONST_NAMES=new Set([...source.matchAll(/^(?:const|let) ([A-Za-z0-9_$]+)=/gm)].map((m)=>m[1]));

function functionSource(name){
  const start=source.indexOf(`\nfunction ${name}(`)+1;
  if(start<=0)throw new Error(`Missing function ${name}`);
  const lineEnd=source.indexOf('\n',start);
  if(source.slice(start,lineEnd).trimEnd().endsWith('}'))return source.slice(start,lineEnd);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
function constSource(name){
  const match=new RegExp(`^(?:const|let) ${name.replace(/\$/g,'\\$')}=`,'m').exec(source);
  if(!match)throw new Error(`Missing const ${name}`);
  const rest=source.slice(match.index);
  const end=rest.search(/\n(?=(?:const |let |function |async function |\/\/|window\.|document\.))/);
  return rest.slice(0,end<0?rest.length:end);
}

// Environment-dependent names are supplied by the caller and never pulled from ui.js.
const ENVIRONMENT=['activeTaxEnabled','activeTaxRate','activeDefaultLabourRate','findCurrentSavedBuildTarget',
  'reconcileCommittedBuildStock','buildsStorageKey','studioTaxonomyId','quote','pendingComponentDraftRows','studioSettings','Store','window'];

function loadRecordFunctions(seeds,environment={}){
  const stop=new Set([...ENVIRONMENT,...Object.keys(environment)]);
  const seen=new Set();
  const chunks=[];
  const visit=(name,kind,seed=false)=>{
    if(seen.has(name)||(stop.has(name)&&!seed))return;
    seen.add(name);
    const body=kind==='function'?functionSource(name):constSource(name);
    for(const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)){
      const id=match[1];
      if(id===name)continue;
      if(FUNCTION_NAMES.has(id))visit(id,'function');
      else if(CONST_NAMES.has(id))visit(id,'const');
    }
    chunks.push(kind==='const'?body.replace(/^(?:const|let) /,'var '):body);
  };
  // A name asked for directly is always loaded from ui.js, even if it is normally an environment stub.
  seeds.forEach((name)=>visit(name,'function',true));
  const context=vm.createContext({
    activeTaxEnabled:()=>true,
    activeTaxRate:()=>15,
    activeDefaultLabourRate:()=>60,
    studioTaxonomyId:(prefix)=>`${prefix}-generated`,
    pendingComponentDraftRows:new Set(),
    studioSettings:{},
    quote:null,
    console,
    ...environment,
  });
  vm.runInContext(chunks.join('\n'),context,{filename:'ui.js (record functions)'});
  return context;
}

module.exports={loadRecordFunctions,functionSource};
