/* Q42c public Knowledge Base search (/knowledge/ only; not part of the Studio app).
 * Progressive enhancement: without JavaScript the page is a complete list of topics and articles and the search field
 * stays hidden. With it, the field appears and filters as you type, using the SAME search() and marked() as the Studio
 * Knowledge Base (js/knowledge-base.js), limited to VERIFIED articles: a draft is never shown on a public page.
 * The query is kept in the address (?q=) so Back from an article returns to the same results. textContent only. */
(function(){
  'use strict';
  const KB=window.KLabsKnowledgeBase;
  const form=document.querySelector('[data-knowledge-public-search]');
  if(!KB || !form)return;
  const input=form.querySelector('input[type="search"]');
  const status=form.querySelector('[data-knowledge-public-status]');
  const results=document.querySelector('[data-knowledge-public-results]');
  const browse=[...document.querySelectorAll('[data-knowledge-public-browse]')];
  const categories=new Map(KB.CATEGORIES.map((c)=>[c.id,c.title]));

  function el(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function row(article,query){
    const link=el('a','workshop-tool-launch workshop-tool-launch--landing knowledge-row');
    link.href=`/knowledge/${article.id}/`;
    link.appendChild(KB.marked('span','workshop-tool-launch__title knowledge-row__title',article.title,query));
    link.appendChild(KB.marked('span','workshop-tool-launch__meta',article.summary,query));
    link.appendChild(el('span','knowledge-row__detail',`${categories.get(article.category)||''} · ${KB.readMinutes(article)} min read`));
    return link;
  }
  function render(){
    const query=input.value.trim();
    const searching=query.length>0;
    browse.forEach((section)=>{section.hidden=searching;});
    results.hidden=!searching;
    status.hidden=!searching;
    results.replaceChildren();
    if(searching){
      const found=KB.search(query).filter((r)=>r.article.status==='verified');
      status.textContent=found.length
        ?`${found.length} ${found.length===1?'article':'articles'} for “${query}”`
        :`No articles match “${query}”. Try fewer or different words, or clear the search to browse by topic.`;
      found.forEach((r)=>results.appendChild(row(r.article,query)));
    }
    const url=new URL(location.href);
    if(searching)url.searchParams.set('q',query);else url.searchParams.delete('q');
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  form.hidden=false;
  form.addEventListener('submit',(event)=>{event.preventDefault();input.blur();});
  input.addEventListener('input',render);
  const initial=new URLSearchParams(location.search).get('q');
  if(initial){input.value=initial;render();}
})();
