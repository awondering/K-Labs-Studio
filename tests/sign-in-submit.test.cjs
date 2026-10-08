const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','js','supabase-client.js'),'utf8');

function harness({signIn}){
  const els={};
  const make=(id,extra={})=>(els[id]={id,value:'',textContent:'',style:{},attrs:{},listeners:{},
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
    addEventListener(n,f){this.listeners[n]=f;},...extra});
  ['authEmail','authPassword','authMessage','authSignIn','authForgotPassword','authTogglePassword','authScreen','app','authForm'].forEach((id)=>make(id));
  const calls=[];
  const sandbox={
    calls,els,
    console,
    window:{
      supabase:{createClient:()=>({auth:{
        signInWithPassword:(creds)=>{calls.push(creds);return signIn(creds);},
        getSession:async()=>({data:{session:null}}),
        signOut:async()=>({}),
      }})},
      KLABS_SUPABASE:{url:'u',publishableKey:'k'},
      scrollTo(){},
    },
    document:{
      body:{classList:{add(){},remove(){}}},
      getElementById:(id)=>els[id]||null,
      addEventListener:(n,f)=>{if(n==='DOMContentLoaded')sandbox.ready=f;},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox);
  sandbox.ready();
  // Native behaviour: both the submit button and Enter in a field dispatch the form's submit event.
  const submit=()=>els.authForm.listeners.submit({preventDefault(){submit.prevented=true;}});
  return {sandbox,els,calls,submit};
}
const flush=()=>new Promise((r)=>setImmediate(r));

test('markup: one native form with both fields, submit button; other actions stay type=button',()=>{
  const form=html.match(/<form id="authForm"[\s\S]*?<\/form>/)[0];
  assert.match(form,/id="authEmail"/);
  assert.match(form,/id="authPassword"/);
  assert.match(form,/<button id="authSignIn" type="submit">/);
  assert.match(form,/<button id="authForgotPassword" type="button">/);
  assert.match(form,/<button id="authTogglePassword" type="button"/);
  assert.equal((form.match(/type="submit"/g)||[]).length,1);
});

test('submit (button or Enter) signs in once with trimmed email and shows loading',async()=>{
  let release;
  const h=harness({signIn:()=>new Promise((r)=>{release=r;})});
  h.els.authEmail.value='  a@b.co ';
  h.els.authPassword.value='secret';
  h.submit();
  assert.equal(h.submit.prevented,true);
  assert.equal(h.els.authMessage.textContent,'Signing in...');
  assert.equal(h.els.authSignIn.attrs['aria-busy'],'true');
  h.submit();h.submit();
  assert.equal(h.calls.length,1,'duplicates are ignored while pending');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{email:'a@b.co',password:'secret'});
  release({error:null});
  await flush();await flush();
  assert.equal(h.els.authMessage.textContent,'');
  assert.equal(h.els.authSignIn.attrs['aria-busy'],undefined);
  h.submit();
  assert.equal(h.calls.length,2,'a new attempt is allowed after completion');
});

test('failure shows the error, clears loading and allows retry; thrown errors are handled',async()=>{
  let n=0;
  const h=harness({signIn:async()=>{n+=1;if(n===1)return {error:{message:'Invalid login credentials'}};if(n===2)throw new Error('Network down');return {error:null};}});
  h.els.authEmail.value='a@b.co';h.els.authPassword.value='bad';
  h.submit();await flush();await flush();
  assert.equal(h.els.authMessage.textContent,'Invalid login credentials');
  assert.equal(h.els.authSignIn.attrs['aria-busy'],undefined);
  h.submit();await flush();await flush();
  assert.equal(h.els.authMessage.textContent,'Network down');
  h.submit();await flush();await flush();
  assert.equal(h.els.authMessage.textContent,'');
  assert.equal(h.calls.length,3);
});

test('invalid input still reaches the existing auth error path unchanged',async()=>{
  const h=harness({signIn:async(c)=>({error:{message:c.email?'Invalid login credentials':'Missing email'}})});
  h.els.authEmail.value='   ';h.els.authPassword.value='';
  h.submit();await flush();await flush();
  assert.equal(h.els.authMessage.textContent,'Missing email');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{email:'',password:''});
});
