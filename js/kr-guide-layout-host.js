/* KR Guide Layout host (Workshop tool).
 * Mounts the self-contained KR Guide Layout document (kr-guide-layout/index.html) inside the Workshop tool card.
 * The tool is an independent document with no storage, network or account access: it cannot touch builds, customers,
 * quotes, components, Guide Setup or sync. The only thing passed in is the Studio Settings measurement preference
 * (metric / decimal inch / fractional inch) as a three-value unit: embedded in the document at mount, and pushed again by
 * postMessage only when the global preference itself changes. Nothing is read back, so a unit chosen inside the tool
 * is temporary and never changes the Settings preference. The document is
 * fetched (so the service worker can serve it offline) and loaded through srcdoc. The frame grows to its content so
 * the Workshop page scrolls as it does for every other tool, with no second scroll area inside it. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.KLabsKrGuideLayoutHost=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const TOOL_URL='kr-guide-layout/index.html';
  const MESSAGE_TYPE='klabs-kr-guide';
  // Settings display mode (metric / decimal-inch / fractional-inch) -> the tool's unit. Anything else, including a missing preference, is metric.
  function unitForMode(mode){
    const next=String(mode||'').trim().toLowerCase();
    return next==='decimal-inch'?'in':next==='fractional-inch'?'frac':'mm';
  }
  // The tool's body fills the viewport (min-height:100vh); inside a frame that would make the frame and content chase each other.
  // The card gives the frame the full width of the Workshop column; the tool's own side padding is tightened to match so its numeric rows have the room they were designed for.
  const FRAME_STYLE='<style>html,body{min-height:0!important;height:auto!important}main{padding-left:8px!important;padding-right:8px!important}</style>';
  function buildSrcdoc(html,unit){
    const source=String(html||'');
    const config='<script>window.__KR_HOST__='+JSON.stringify({unit:unit==='in'||unit==='frac'?unit:'mm'})+';<\/script>';
    return /<head[^>]*>/i.test(source)?source.replace(/<head[^>]*>/i,(match)=>match+config+FRAME_STYLE):config+FRAME_STYLE+source;
  }
  function contentHeight(doc){
    if(!doc || !doc.documentElement)return 0;
    const main=doc.querySelector('main');
    const rect=main?main.getBoundingClientRect():null;
    const body=doc.body?doc.body.getBoundingClientRect():null;
    const tallest=Math.max(rect?rect.bottom:0,body?body.bottom:0,doc.documentElement.scrollHeight||0);
    return Math.ceil(tallest);
  }
  function post(frame,unit){
    try{if(frame && frame.contentWindow)frame.contentWindow.postMessage({type:MESSAGE_TYPE,action:'set-unit',unit},'*');}catch(error){}
  }
  // Called on every Workshop render with the current Settings mode. Pushes only when the global preference changed, so an unrelated
  // render never overrides a unit the builder picked temporarily inside the tool.
  function syncMode(host,mode){
    const state=host && host.__krGuide;
    if(!state)return false;
    const unit=unitForMode(mode);
    if(unit===state.unit)return false;
    state.unit=unit;
    post(state.frame,unit);
    return true;
  }
  function mount(host,options){
    const opts=options||{};
    const doc=host.ownerDocument;
    const win=doc.defaultView;
    unmount(host);
    host.setAttribute('data-kr-guide-state','loading');
    host.innerHTML='<p class="kr-guide-status" role="status">Loading KR Guide Layout…</p>';
    const unit=unitForMode(opts.mode);
    const state={frame:null,observer:null,cancelled:false,unit};
    host.__krGuide=state;
    const fail=()=>{
      if(state.cancelled)return;
      host.setAttribute('data-kr-guide-state','error');
      host.innerHTML='<div class="kr-guide-status kr-guide-status--error" role="alert"><p>KR Guide Layout could not load. It needs to have been opened once while online.</p><button class="ghost-action" type="button" data-kr-guide-retry>Try again</button></div>';
      const retry=host.querySelector('[data-kr-guide-retry]');
      if(retry)retry.addEventListener('click',()=>mount(host,opts));
    };
    (opts.fetchImpl||win.fetch.bind(win))(opts.url||TOOL_URL,{cache:'no-cache'})
      .then((response)=>{if(!response || !response.ok)throw new Error('tool unavailable');return response.text();})
      .then((html)=>{
        if(state.cancelled)return;
        const frame=doc.createElement('iframe');
        frame.className='kr-guide-frame';
        frame.setAttribute('title','KR Guide Layout');
        frame.setAttribute('data-kr-guide-frame','true');
        frame.setAttribute('scrolling','no');
        frame.srcdoc=buildSrcdoc(html,unit);
        const resize=()=>{
          if(state.cancelled)return;
          const height=contentHeight(frame.contentDocument);
          if(height>0)frame.style.height=`${height}px`;
        };
        frame.addEventListener('load',()=>{
          post(frame,state.unit);
          resize();
          const inner=frame.contentWindow;
          if(inner && typeof inner.ResizeObserver==='function' && frame.contentDocument.body){
            state.observer=new inner.ResizeObserver(resize);
            state.observer.observe(frame.contentDocument.body);
            const main=frame.contentDocument.querySelector('main');
            if(main)state.observer.observe(main);
          }
        });
        host.innerHTML='';
        host.appendChild(frame);
        state.frame=frame;
        host.setAttribute('data-kr-guide-state','ready');
      })
      .catch(fail);
    return state;
  }
  function unmount(host){
    const state=host && host.__krGuide;
    if(!state)return false;
    state.cancelled=true;
    if(state.observer && typeof state.observer.disconnect==='function')state.observer.disconnect();
    host.innerHTML='';
    host.removeAttribute('data-kr-guide-state');
    delete host.__krGuide;
    return true;
  }
  function isMounted(host){return !!(host && host.__krGuide);}
  return {TOOL_URL,MESSAGE_TYPE,unitForMode,buildSrcdoc,contentHeight,mount,unmount,isMounted,syncMode};
});
