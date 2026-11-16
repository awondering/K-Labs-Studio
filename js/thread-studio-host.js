/* Thread Design Studio host (Workshop tool).
 * Mounts the self-contained Thread Design Studio (thread-studio/index.html) in an iframe inside the Workshop tool card.
 * The studio shares nothing with the Studio's calculations, customers, builds, quotes, components or sync: it is
 * a separate document with its own storage keys. The only things passed in are the account scope for those keys and a
 * hand-off to the Thread Wrap Designer (tapered blank). The document is fetched (so the service worker can serve it
 * offline) and loaded through srcdoc, which keeps it on the app's origin without a second navigation. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.KLabsThreadStudioHost=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const STUDIO_URL='thread-studio/index.html';
  const MESSAGE_TYPE='klabs-thread-studio';
  // The scope is embedded in a script tag, so only a conservative character set is allowed through.
  function sanitiseScope(scope){
    return String(scope==null?'':scope).replace(/[^A-Za-z0-9_.@:-]/g,'').slice(0,96)||'local';
  }
  function buildSrcdoc(html,scope){
    const config='<script>window.__TDS_HOST__='+JSON.stringify({scope:sanitiseScope(scope)})+';<\/script>';
    const source=String(html||'');
    // Inject the configuration before the studio's own scripts run.
    return /<head[^>]*>/i.test(source)?source.replace(/<head[^>]*>/i,(match)=>match+config):config+source;
  }
  function isStudioMessage(event,frame){
    return !!(event && frame && event.source===frame.contentWindow && event.data && event.data.type===MESSAGE_TYPE);
  }
  function mount(host,options){
    const opts=options||{};
    const doc=host.ownerDocument;
    const win=doc.defaultView;
    const scope=sanitiseScope(opts.scope);
    unmount(host);
    host.setAttribute('data-thread-studio-state','loading');
    host.setAttribute('data-thread-studio-scope',scope);
    host.innerHTML='<p class="thread-studio-status" role="status">Loading Thread Design Studio…</p>';
    const state={scope,frame:null,listener:null,cancelled:false};
    host.__threadStudio=state;
    const fail=()=>{
      if(state.cancelled)return;
      host.setAttribute('data-thread-studio-state','error');
      host.innerHTML='<div class="thread-studio-status thread-studio-status--error" role="alert"><p>Thread Design Studio could not load. It needs to have been opened once while online.</p><button class="ghost-action" type="button" data-thread-studio-retry>Try again</button></div>';
      const retry=host.querySelector('[data-thread-studio-retry]');
      if(retry)retry.addEventListener('click',()=>mount(host,opts));
    };
    (opts.fetchImpl||win.fetch.bind(win))(opts.url||STUDIO_URL,{cache:'no-cache'})
      .then((response)=>{if(!response || !response.ok)throw new Error('studio unavailable');return response.text();})
      .then((html)=>{
        if(state.cancelled)return;
        const frame=doc.createElement('iframe');
        frame.className='thread-studio-frame';
        frame.setAttribute('title','Thread Design Studio');
        frame.setAttribute('data-thread-studio-frame','true');
        frame.setAttribute('allow','');
        frame.srcdoc=buildSrcdoc(html,scope);
        state.listener=(event)=>{
          if(!isStudioMessage(event,frame))return;
          if(event.data.action==='open-taper-designer' && typeof opts.onOpenTaperDesigner==='function')opts.onOpenTaperDesigner();
        };
        win.addEventListener('message',state.listener);
        host.innerHTML='';
        host.appendChild(frame);
        state.frame=frame;
        host.setAttribute('data-thread-studio-state','ready');
      })
      .catch(fail);
    return state;
  }
  function unmount(host){
    const state=host && host.__threadStudio;
    if(!state)return false;
    state.cancelled=true;
    if(state.listener && host.ownerDocument.defaultView)host.ownerDocument.defaultView.removeEventListener('message',state.listener);
    host.innerHTML='';
    host.removeAttribute('data-thread-studio-state');
    host.removeAttribute('data-thread-studio-scope');
    delete host.__threadStudio;
    return true;
  }
  function mountedScope(host){
    return host && host.__threadStudio?host.__threadStudio.scope:null;
  }
  return {STUDIO_URL,MESSAGE_TYPE,sanitiseScope,buildSrcdoc,isStudioMessage,mount,unmount,mountedScope};
});
