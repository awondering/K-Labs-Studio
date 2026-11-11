const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness(){
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','js','guarded-build-transport.js'),'utf8'),{window});
  const calls=[];
  let response={data:[{client_id:'build-1',updated_at:'revision-2'}],error:null};
  let current=true;
  const context={userId:'account-a',isCurrent:()=>current};
  const client={
    from(table){
      const call={table,filters:{}};calls.push(call);
      const query={
        insert(row){call.action='insert';call.row=row;return query;},
        update(row){call.action='update';call.row=row;return query;},
        delete(){call.action='delete';return query;},
        eq(key,value){call.filters[key]=value;return query;},
        select(){return Promise.resolve(response);},
      };
      return query;
    },
    rpc(name,args){calls.push({name,args});return Promise.resolve(response);},
  };
  return {transport:window.KLABS_GUARDED_BUILD_TRANSPORT,client,context,calls,
    setResponse(value){response=value;},setCurrent(value){current=value;}};
}

test('update uses the exact server revision and stable ID without mutating the local build',async()=>{
  const h=harness();
  const record={id:'build-1',buildNumber:'BUILD-901',payments:[{amount:10}]};
  await h.transport.save(h.client,h.context,record,'2026-01-01T00:00:00.123456+00:00');
  const call=h.calls[0];
  assert.equal(call.action,'update');
  assert.equal(call.filters.user_id,'account-a');
  assert.equal(call.filters.client_id,'build-1');
  assert.equal(call.filters.updated_at,'2026-01-01T00:00:00.123456+00:00');
  assert.equal(call.row.payload._expectedBuildRevision,call.filters.updated_at);
  assert.equal(record._expectedBuildRevision,undefined);
  assert.deepEqual(record.payments,[{amount:10}]);
});

test('duplicate insertion, stale updates and network errors are never reported as success',async()=>{
  const h=harness();
  h.setResponse({data:null,error:{code:'23505',message:'duplicate key'}});
  await assert.rejects(h.transport.save(h.client,h.context,{id:'build-1'},null),/duplicate key/);
  h.setResponse({data:[],error:null});
  await assert.rejects(h.transport.save(h.client,h.context,{id:'build-1'},'rev'),/Review both versions/);
  h.setResponse({data:null,error:{message:'network interrupted'}});
  await assert.rejects(h.transport.save(h.client,h.context,{id:'build-1'},'rev'),/network interrupted/);
});
test('guarded creates send a transient protocol marker; compatibility creates do not',async()=>{
  const h=harness();
  const record={id:'build-1',payments:[{amount:10}]};
  await h.transport.save(h.client,h.context,record,null,'guarded');
  assert.equal(h.calls[0].row.payload._buildGuardCreate,1);
  assert.equal(record._buildGuardCreate,undefined);
  await h.transport.save(h.client,h.context,record,null,'compatibility');
  assert.equal(h.calls[1].row.payload._buildGuardCreate,undefined);
});

test('delete requires a revision and reports conflicts or server errors',async()=>{
  const h=harness();
  await assert.rejects(h.transport.remove(h.client,h.context,'build-1',''),/verified revision/);
  h.setResponse({data:false,error:null});
  await assert.rejects(h.transport.remove(h.client,h.context,'build-1','rev'),/Review before deleting/);
  h.setResponse({data:null,error:{message:'offline'}});
  await assert.rejects(h.transport.remove(h.client,h.context,'build-1','rev'),/offline/);
  h.setResponse({data:true,error:null});
  await h.transport.remove(h.client,h.context,'build-1','rev');
  assert.equal(h.calls.at(-1).args.p_revision,'rev');
});

test('account changes before or during a save prevent successful completion',async()=>{
  const h=harness();
  h.setCurrent(false);
  await assert.rejects(h.transport.save(h.client,h.context,{id:'build-1'},'rev'),/account changed/);
  assert.equal(h.calls.length,0);
  h.setCurrent(true);
  let resolve;
  h.client.from=()=>({
    update(){return this;},
    eq(){return this;},
    select(){return new Promise(done=>{resolve=done;});},
  });

  test('compatibility updates and deletes use exact revisions without storing guard tokens',async()=>{
    const h=harness();
    await h.transport.save(h.client,h.context,{id:'build-1',payments:[{amount:10}]},'2026-01-01T00:00:00.123456Z','compatibility');
    assert.equal(h.calls[0].row.payload._expectedBuildRevision,undefined);
    assert.ok(Date.parse(h.calls[0].row.updated_at)>Date.parse('2026-01-01T00:00:00.123456Z'));
    h.setResponse({data:[{client_id:'build-1'}],error:null});
    await h.transport.remove(h.client,h.context,'build-1','2026-01-01T00:00:00.123456Z','compatibility');
    assert.equal(h.calls[1].action,'delete');
    assert.equal(h.calls[1].filters.updated_at,'2026-01-01T00:00:00.123456Z');
    h.setResponse({data:[],error:null});
    await assert.rejects(h.transport.remove(h.client,h.context,'build-1','rev','compatibility'),/Review before deleting/);
  });
  const pending=h.transport.save(h.client,h.context,{id:'build-1'},'rev');
  h.setCurrent(false);
  resolve({data:[{client_id:'build-1'}],error:null});
  await assert.rejects(pending,/account changed/);
});
