const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

function harness(){
  const elements=new Map();
  for(const id of ['workshopDcDiameter','workshopDcCircumference','workshopDcWraps',
    'workshopDcWrapsMinus','workshopDcWrapsPlus','workshopDcPrimaryLabel',
    'workshopDcPrimaryValue','workshopDcWrapLength','workshopToolsPanel']){
    elements.set(id,{
      value:'',textContent:'',attributes:{},listeners:{},
      getAttribute(name){return this.attributes[name];},
      setAttribute(name,value){this.attributes[name]=value;},
      addEventListener(type,handler){this.listeners[type]=handler;},
      querySelectorAll(selector){return [elements.get(selector.slice(1))].filter(Boolean);},
    });
  }
  const c=vm.createContext({
    document:{activeElement:null},
    $:id=>elements.get(id),
    workshopToolsState:{diameter:{diameterMm:28,wraps:1,lastEdited:'diameter',unit:'metric',imperialDisplay:'decimal'}},
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3,decimalsImperial:3},
    activeMeasurementUnits:()=> 'metric',
    activeImperialDisplay:()=> 'decimal',
  });
  for(const name of [
    'numberOrZero','mmToInches','inchesToMm','trimTrailingZeroes','formatDecimal',
    'normalizeWorkshopUnit','normalizeWorkshopImperialDisplay','workshopUnitSuffix',
    'parseWorkshopMeasurementMm','formatWorkshopMeasurementNumber','formatWorkshopMeasurementValue',
    'workshopMeasurementInputText','bindWorkshopCalculatorInput','bindWorkshopToggleButtons',
    'syncWorkshopMeasurementInput','renderDiameterCircumferenceTool','bindDiameterCircumferenceInputs',
  ]){
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0);
    const lineEnd=source.indexOf('\n',start);
    const end=source.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),c);
  }
  c.renderWorkshopCalculator=()=>c.renderDiameterCircumferenceTool();
  c.bindDiameterCircumferenceInputs();
  c.renderDiameterCircumferenceTool();
  const input=(id,value)=>{
    const element=elements.get(id);
    c.document.activeElement=element;
    element.value=value;
    element.listeners.input();
  };
  const click=id=>{
    c.document.activeElement=elements.get(id);
    elements.get(id).listeners.click();
  };
  return {c,e:id=>elements.get(id),input,click};
}

test('live bidirectional conversion and 10 mm / 2.50 wraps reference result',()=>{
  const {c,e,input}=harness();
  assert.equal(e('workshopDcWraps').value,'1.00');
  input('workshopDcDiameter','10');
  assert.equal(e('workshopDcCircumference').value,'31.416');
  input('workshopDcWraps','2.50');
  assert.equal(e('workshopDcWrapLength').textContent,'78.5 mm');
  assert.equal(e('workshopDcPrimaryValue').textContent,'31.416 mm');
  input('workshopDcCircumference',String(20*Math.PI));
  assert.ok(Math.abs(c.workshopToolsState.diameter.diameterMm-20)<1e-10);
  assert.equal(e('workshopDcDiameter').value,'20');
  assert.equal(e('workshopDcPrimaryLabel').textContent,'Diameter');
  assert.equal(e('workshopDcWrapLength').textContent,'157.1 mm');
});

test('quarter-turn shared controls, half turns and minimum',()=>{
  const {e,input,click}=harness();
  click('workshopDcWrapsPlus');
  assert.equal(e('workshopDcWraps').value,'1.25');
  click('workshopDcWrapsPlus');
  assert.equal(e('workshopDcWraps').value,'1.50');
  input('workshopDcWraps','2.50');
  click('workshopDcWrapsMinus');
  assert.equal(e('workshopDcWraps').value,'2.25');
  input('workshopDcWraps','0.25');
  click('workshopDcWrapsMinus');
  assert.equal(e('workshopDcWraps').value,'0.25');
  click('workshopDcWrapsPlus');
  assert.equal(e('workshopDcWraps').value,'0.50');
});

test('empty/invalid measurements and wraps clear results without stale values or NaN',()=>{
  const {e,input}=harness();
  for(const id of ['workshopDcDiameter','workshopDcCircumference']){
    for(const invalid of ['','abc','0','-2','Infinity']){
      input('workshopDcDiameter','10');
      input(id,invalid);
      assert.match(e('workshopDcWrapLength').textContent,/Enter valid/);
      assert.match(e('workshopDcPrimaryValue').textContent,/Enter a valid/);
      assert.equal(e(id==='workshopDcDiameter'?'workshopDcCircumference':'workshopDcDiameter').value,'');
      assert.doesNotMatch(e('workshopDcWrapLength').textContent,/NaN|Infinity|78.5/);
    }
  }
  input('workshopDcDiameter','10');
  for(const invalid of ['','abc','0','0.1','-1','Infinity']){
    input('workshopDcWraps',invalid);
    assert.match(e('workshopDcWrapLength').textContent,/Enter valid/);
    assert.equal(e('workshopDcPrimaryValue').textContent,'31.416 mm');
  }
  input('workshopDcWraps','2.50');
  assert.equal(e('workshopDcWrapLength').textContent,'78.5 mm');
});
