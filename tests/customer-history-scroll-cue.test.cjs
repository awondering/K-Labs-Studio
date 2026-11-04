const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function detailHost({scrollHeight=400,clientHeight=200,rows=[]}={}){
  const classes=new Set();
  return {
    scrollHeight,
    clientHeight,
    clientTop:1,
    getBoundingClientRect:()=>({top:100}),
    querySelectorAll:()=>rows,
    classList:{
      add:name=>classes.add(name),
      remove:name=>classes.delete(name),
      contains:name=>classes.has(name),
    },
  };
}

test('history fade appears only while history rows extend below the detail viewport',()=>{
  const context=vm.createContext({});
  vm.runInContext(functionSource('syncCustomerFinderHistoryScrollCue'),context);

  const row={getBoundingClientRect:()=>({bottom:350})};
  const detail=detailHost({rows:[row]});
  context.syncCustomerFinderHistoryScrollCue(detail);
  assert.equal(detail.classList.contains('has-history-more'),true);

  row.getBoundingClientRect=()=>({bottom:300});
  context.syncCustomerFinderHistoryScrollCue(detail);
  assert.equal(detail.classList.contains('has-history-more'),false);

  const emptyHistory=detailHost({rows:[]});
  context.syncCustomerFinderHistoryScrollCue(emptyHistory);
  assert.equal(emptyHistory.classList.contains('has-history-more'),false);

  const noOverflow=detailHost({scrollHeight:200,clientHeight:200,rows:[{getBoundingClientRect:()=>({bottom:350})}]});
  context.syncCustomerFinderHistoryScrollCue(noOverflow);
  assert.equal(noOverflow.classList.contains('has-history-more'),false);
});

test('history scroll cue uses a restrained bottom fade without intercepting interaction',()=>{
  assert.match(css,/\.customer-finder__detail\.has-history-more::after\s*\{[^}]*position:sticky;[^}]*bottom:0;[^}]*pointer-events:none;/s);
  assert.match(css,/\.customer-finder__detail\.has-history-more::after\s*\{[^}]*margin-right:64px;/s);
  assert.match(css,/background:linear-gradient\(180deg,rgba\(11,14,16,0\),rgba\(11,14,16,\.98\)\)/);
});
