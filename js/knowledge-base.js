/* Q42 Knowledge Base (Workshop tool).
 * Three views inside the Workshop card #workshopToolKnowledge: the category home, search results (and a category's
 * articles), and the article reader. Content is structured data (ARTICLES below, verified only): no network, storage,
 * account or build access, and it is cached offline with the rest of the app shell. Everything is rendered with
 * textContent, never HTML, so article text cannot inject markup.
 * Articles carry a review status. ARTICLES holds VERIFIED articles only, because every file in this repository is served
 * publicly. Drafts are kept in a private store (scripts/knowledge-drafts.cjs) and appear only in Studio running on a
 * local address, from the git-ignored js/knowledge-drafts.local.js, labelled Draft · Unverified on the row and article.
 * Q42b: scripts/build-knowledge-pages.cjs turns the VERIFIED articles here into static public pages under /knowledge/
 * (status 'verified' only; drafts are never published). updated (YYYY-MM-DD) feeds the sitemap and page metadata.
 * A category's intro is the opening line (and search description) of its public page. js/knowledge-public.js reuses
 * search() and marked() for the public search, limited to verified articles. Search also matches an article's aliases
 * (other ways of asking the same question); an alias is never a page of its own. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.KLabsKnowledgeBase=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  const CATEGORIES=Object.freeze([
    {id:'faqs',title:'FAQs',meta:'Quick answers for customers and the bench.',
      intro:'Short answers to the questions rod builders and their customers ask most often.'},
    {id:'techniques',title:'Techniques',meta:'Methods for building and finishing a rod.',
      intro:'Step-by-step methods for building and finishing a custom fishing rod, from layout to the final coat.'},
    {id:'troubleshooting',title:'Troubleshooting',meta:'Find the cause before you fix it.',
      intro:'How to find the cause of common rod-building faults before you start fixing them.'},
    {id:'components',title:'Component Selection',meta:'Choosing guides, seats, grips and blanks.',
      intro:'How to choose rod guides, reel seats, grips and blanks for the way a rod will be fished.'},
    {id:'repairs',title:'Repairs',meta:'Assess, dismantle and rebuild safely.',
      intro:'Fishing rod repairs: assessing damage, taking parts off safely and rebuilding without harming the blank.'}
  ]);

  // VERIFIED articles only. This file ships with the website, so it never holds a draft: unverified articles live in
  // the private draft store and reach Studio only on this computer, through the git-ignored local review file (below).
  // An article is added here only after technical review, with status 'verified'.
  const ARTICLES=Object.freeze([
    {
      // Verified 27 Nov 2026 under the K-Labs evidence rules: every claim is a calculation (recomputed by
      // tests/knowledge-articles.test.cjs) or a statement about Studio checked against its code. Merges two drafts.
      id:'how-do-i-convert-circumference-to-diameter',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'How to convert between diameter and circumference',
      summary:'Circumference is diameter multiplied by pi, and diameter is circumference divided by pi. Worked examples, rounding, and shapes that are not round.',
      aliases:['How do I convert circumference to diameter','convert circumference to diameter','How to convert circumference to diameter',
        'How do I calculate circumference from diameter','calculate circumference from diameter','How to calculate circumference from diameter'],
      tags:['diameter','circumference','pi','measurement','calculator','blank','grip'],
      source:'Mathematics: pi is the ratio of a circle\'s circumference to its diameter. The worked examples are recalculated by K-Labs automated tests.',
      related:[],
      sections:[
        {heading:'The formulas',blocks:[
          {type:'p',text:'Pi (π) is the ratio of any circle\'s circumference to its diameter, about 3.14159. So:'},
          {type:'list',items:['Circumference = π × diameter','Diameter = circumference ÷ π']},
          {type:'p',text:'Use the same unit for both. The answer is in the unit you measured in: millimetres in, millimetres out.'}
        ]},
        {heading:'Worked examples',blocks:[
          {type:'list',items:[
            'A blank 12.0 mm in diameter: 12.0 × π = 37.70 mm around.',
            'A grip that measures 100 mm around: 100 ÷ π = 31.83 mm in diameter.',
            'A blank 0.500 in in diameter: 0.500 × π = 1.571 in around.'
          ]}
        ]},
        {heading:'Rounding',blocks:[
          {type:'p',text:'Keep π to at least 3.1416 and round only the final answer. Using 3.14 puts every result about 0.05% out, which is 0.02 mm on the circumference of a 12 mm blank.'}
        ]},
        {heading:'Shapes that are not round',blocks:[
          {type:'p',text:'The formulas describe circles only. For an oval or irregular section, circumference ÷ π gives the diameter of a circle with the same distance around, not the section\'s actual width in any direction.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'Workshop → Diameter & Circumference converts either way: enter one value and Studio calculates the other, in the measurement units chosen in Settings.'}
        ]}
      ]
    }
  ]);

  // ---------- search ----------
  const SYNONYMS=Object.freeze({reelseat:'reel seat',reelseats:'reel seat',crosswrap:'cross wrap',buttwrap:'butt wrap',
    'fore grip':'foregrip','x wrap':'cross wrap',seats:'seat',guides:'guide',grips:'grip',wraps:'wrap'});
  function normalise(text){
    let value=String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
      .replace(/[^a-z0-9°]+/g,' ').trim();
    for(const [from,to] of Object.entries(SYNONYMS))value=value.replace(new RegExp(`\\b${from}\\b`,'g'),to);
    return value.replace(/\s+/g,' ');
  }
  function tokens(query){
    return normalise(query).split(' ').filter((t)=>t.length>0);
  }
  function articleBody(article){
    return article.sections.map((s)=>[s.heading,...s.blocks.map((b)=>b.text||(b.items||[]).join(' '))].join(' ')).join(' ');
  }
  // Studio's articles: the verified ones, plus drafts for local review when present (never on the live site).
  let drafts=[];
  let all=ARTICLES;
  function buildIndex(list){
    return list.map((article)=>({
      article,
      title:normalise(article.title),
      aliases:normalise((article.aliases||[]).join(' | ')),
      tags:normalise((article.tags||[]).join(' ')),
      summary:normalise(article.summary),
      body:normalise(articleBody(article))
    }));
  }
  let INDEX=buildIndex(all);
  function useDrafts(list){
    const ids=new Set(ARTICLES.map((a)=>a.id));
    drafts=Object.freeze((Array.isArray(list)?list:[]).filter((a)=>a && a.id && a.status!=='verified' && !ids.has(a.id)));
    all=Object.freeze([...ARTICLES,...drafts]);
    INDEX=buildIndex(all);
    return drafts.length;
  }
  function articles(){
    return all;
  }
  // Every word of the query must appear somewhere (title, tags, summary or body); title words count most.
  function search(query){
    const words=tokens(query);
    if(!words.length)return [];
    const results=[];
    for(const entry of INDEX){
      let score=0;
      let all=true;
      for(const word of words){
        const has=(field)=>(` ${entry[field]}`).includes(` ${word}`);
        const wordScore=(has('title')?8:0)+(has('aliases')?6:0)+(has('tags')?5:0)+(has('summary')?3:0)+(has('body')?1:0);
        if(!wordScore){all=false;break;}
        score+=wordScore;
      }
      if(all)results.push({article:entry.article,score});
    }
    return results.sort((a,b)=>b.score-a.score||a.article.title.localeCompare(b.article.title));
  }
  function articlesIn(categoryId){
    return all.filter((a)=>a.category===categoryId);
  }
  function categoryOf(article){
    return CATEGORIES.find((c)=>c.id===article.category)||{title:''};
  }
  function readMinutes(article){
    const words=(article.title+' '+article.summary+' '+articleBody(article)).split(/\s+/).length;
    return Math.max(1,Math.round(words/200));
  }

  // ---------- rendering ----------
  const states=new WeakMap();
  function el(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  // Text with the query's words marked (textContent only).
  function marked(tag,className,text,query){
    const node=el(tag,className);
    const words=tokens(query).filter((w)=>w.length>1);
    const source=String(text||'');
    if(!words.length){node.textContent=source;return node;}
    const folded=source.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const ranges=[];
    for(const word of words){
      for(const part of word.split(' ')){
        let from=0;
        let at;
        while(part && (at=folded.indexOf(part,from))!==-1){ranges.push([at,at+part.length]);from=at+part.length;}
      }
    }
    ranges.sort((a,b)=>a[0]-b[0]);
    let cursor=0;
    for(const [start,end] of ranges){
      if(start<cursor)continue;
      if(start>cursor)node.appendChild(document.createTextNode(source.slice(cursor,start)));
      node.appendChild(el('mark','knowledge-mark',source.slice(start,end)));
      cursor=end;
    }
    if(cursor<source.length)node.appendChild(document.createTextNode(source.slice(cursor)));
    return node;
  }
  function backButton(label,onClick){
    const button=el('button','workshop-tool-nav-back knowledge-back');
    button.type='button';
    button.setAttribute('aria-label',`Back to ${label}`);
    button.appendChild(el('span','workshop-tool-nav-back__arrow','‹')).setAttribute('aria-hidden','true');
    button.appendChild(el('span','',label.toUpperCase()));
    button.addEventListener('click',onClick);
    return button;
  }
  function articleRow(article,query,host,from){
    const row=el('button','workshop-tool-launch workshop-tool-launch--landing knowledge-row');
    row.type='button';
    row.setAttribute('data-knowledge-article',article.id);
    const head=el('span','knowledge-row__head');
    head.appendChild(marked('span','workshop-tool-launch__title knowledge-row__title',article.title,query));
    if(article.status!=='verified')head.appendChild(el('span','knowledge-status','Draft'));
    row.appendChild(head);
    row.appendChild(marked('span','workshop-tool-launch__meta',article.summary,query));
    row.appendChild(el('span','knowledge-row__detail',`${categoryOf(article).title} · ${readMinutes(article)} min read`));
    row.addEventListener('click',()=>show(host,{view:'article',articleId:article.id,from}));
    return row;
  }
  function renderHome(host,state,body){
    const list=el('div','knowledge-list');
    list.setAttribute('aria-label','Knowledge Base categories');
    for(const category of CATEGORIES){
      const count=articlesIn(category.id).length;
      const row=el('button','workshop-tool-launch workshop-tool-launch--landing knowledge-row');
      row.type='button';
      row.setAttribute('data-knowledge-category',category.id);
      row.appendChild(el('span','workshop-tool-launch__title',category.title));
      row.appendChild(el('span','workshop-tool-launch__meta',category.meta));
      row.appendChild(el('span','knowledge-row__detail',count?`${count} ${count===1?'article':'articles'}`:'No articles yet'));
      row.addEventListener('click',()=>show(host,{view:'category',categoryId:category.id}));
      list.appendChild(row);
    }
    body.appendChild(list);
  }
  function renderResults(host,state,body){
    const results=search(state.query);
    const status=el('p','knowledge-count');
    status.setAttribute('role','status');
    status.textContent=results.length
      ?`${results.length} ${results.length===1?'article':'articles'} for “${state.query.trim()}”`
      :`Nothing matches “${state.query.trim()}”. Try reel seat, repair or cross wrap.`;
    body.appendChild(status);
    const list=el('div','knowledge-list');
    for(const {article} of results)list.appendChild(articleRow(article,state.query,host,{view:'home',query:state.query}));
    body.appendChild(list);
  }
  function renderCategory(host,state,body){
    const category=CATEGORIES.find((c)=>c.id===state.categoryId)||CATEGORIES[0];
    body.appendChild(backButton('Knowledge Base',()=>show(host,{view:'home'})));
    body.appendChild(el('h4','knowledge-heading',category.title));
    const articles=articlesIn(category.id);
    if(!articles.length){
      body.appendChild(el('p','knowledge-count','No articles in this category yet.'));
      return;
    }
    const list=el('div','knowledge-list');
    for(const article of articles)list.appendChild(articleRow(article,'',host,{view:'category',categoryId:category.id}));
    body.appendChild(list);
  }
  function renderArticle(host,state,body){
    const article=all.find((a)=>a.id===state.articleId);
    if(!article){show(host,{view:'home'});return;}
    const from=state.from||{view:'home'};
    const backLabel=from.view==='category'?(CATEGORIES.find((c)=>c.id===from.categoryId)||{title:'Knowledge Base'}).title:(from.query?'Results':'Knowledge Base');
    body.appendChild(backButton(backLabel,()=>show(host,from)));
    const doc=el('article','knowledge-article');
    doc.setAttribute('data-knowledge-reader',article.id);
    doc.appendChild(el('p','knowledge-article__kicker',`${categoryOf(article).title} · ${readMinutes(article)} min read`));
    doc.appendChild(el('h4','knowledge-article__title',article.title));
    if(article.status!=='verified'){
      const draft=el('p','knowledge-article__draft');
      draft.setAttribute('data-knowledge-draft','');
      draft.appendChild(el('strong','','Draft · Unverified. '));
      draft.appendChild(document.createTextNode('Not yet reviewed by K-Labs. Do not rely on it for customer work.'));
      doc.appendChild(draft);
    }
    const brief=el('div','knowledge-article__brief');
    brief.appendChild(el('span','knowledge-article__label','In brief'));
    brief.appendChild(el('p','',article.summary));
    doc.appendChild(brief);
    for(const section of article.sections){
      const part=el('section','knowledge-article__section');
      part.appendChild(el('h5','knowledge-article__heading',section.heading));
      for(const block of section.blocks){
        if(block.type==='p')part.appendChild(el('p','',block.text));
        else if(block.type==='caution'){
          const caution=el('p','knowledge-article__caution');
          caution.appendChild(el('strong','','Caution. '));
          caution.appendChild(document.createTextNode(block.text));
          part.appendChild(caution);
        }else{
          const list=el(block.type==='steps'?'ol':'ul',block.type==='steps'?'knowledge-article__steps':'knowledge-article__list');
          for(const item of block.items)list.appendChild(el('li','',item));
          part.appendChild(list);
        }
      }
      doc.appendChild(part);
    }
    doc.appendChild(el('p','knowledge-article__source',article.source));
    const related=(article.related||[]).map((id)=>all.find((a)=>a.id===id)).filter(Boolean);
    if(related.length){
      const part=el('section','knowledge-article__section');
      part.appendChild(el('h5','knowledge-article__heading','Related'));
      const list=el('div','knowledge-list');
      for(const other of related)list.appendChild(articleRow(other,'',host,from));
      part.appendChild(list);
      doc.appendChild(part);
    }
    body.appendChild(doc);
  }
  function render(host){
    const state=states.get(host);
    if(!state)return;
    const searchWrap=host.querySelector('[data-knowledge-search-wrap]');
    if(searchWrap)searchWrap.hidden=state.view==='article'||state.view==='category';
    const body=host.querySelector('[data-knowledge-body]');
    body.replaceChildren();
    const searching=state.view==='home' && state.query.trim();
    if(state.view==='article')renderArticle(host,state,body);
    else if(state.view==='category')renderCategory(host,state,body);
    else if(searching)renderResults(host,state,body);
    else renderHome(host,state,body);
  }
  function show(host,next){
    const state=states.get(host);
    if(!state)return;
    state.view=next.view||'home';
    state.categoryId=next.categoryId||'';
    state.articleId=next.articleId||'';
    state.from=next.from||null;
    if(next.view==='home')state.query=next.query!==undefined?next.query:'';
    const input=host.querySelector('[data-knowledge-search]');
    if(input && input.value!==state.query)input.value=state.query;
    render(host);
    const card=host.closest('.workshop-tool-card')||host;
    if(next.view!=='home' || next.scroll!==false){
      try{card.scrollIntoView({block:'start'});}catch{}
    }
  }
  // Local review: on this computer only (file:, localhost, 127.0.0.1, 0.0.0.0), Studio asks once for the git-ignored
  // drafts file. The live site never requests it, and it cannot be deployed because it is never committed.
  const LOCAL_DRAFTS='js/knowledge-drafts.local.js';
  function isLocalReviewHost(location){
    if(!location)return false;
    return location.protocol==='file:' || ['localhost','127.0.0.1','0.0.0.0'].includes(location.hostname);
  }
  let localDrafts=null;
  function loadLocalDrafts(){
    if(localDrafts)return localDrafts;
    const doc=typeof document!=='undefined'?document:null;
    if(!doc || !isLocalReviewHost(typeof location!=='undefined'?location:null)){localDrafts=Promise.resolve(0);return localDrafts;}
    localDrafts=new Promise((resolve)=>{
      const script=doc.createElement('script');
      script.src=LOCAL_DRAFTS;
      script.onload=()=>resolve(useDrafts(typeof window!=='undefined'?window.KLabsKnowledgeDrafts:[]));
      script.onerror=()=>resolve(0);
      doc.head.appendChild(script);
    });
    return localDrafts;
  }
  function mount(host){
    if(!host || states.has(host))return;
    loadLocalDrafts().then((count)=>{if(count && states.has(host))render(host);});
    states.set(host,{view:'home',query:'',categoryId:'',articleId:'',from:null});
    host.replaceChildren();
    const searchWrap=el('div','knowledge-search');
    searchWrap.setAttribute('data-knowledge-search-wrap','');
    const input=el('input','studio-components-shell__search knowledge-search__input');
    input.type='search';
    input.placeholder='Search the Knowledge Base';
    input.autocomplete='off';
    input.spellcheck=false;
    input.setAttribute('enterkeyhint','search');
    input.setAttribute('aria-label','Search the Knowledge Base');
    input.setAttribute('data-knowledge-search','');
    input.addEventListener('input',()=>{
      const state=states.get(host);
      state.query=input.value;
      state.view='home';
      render(host);
    });
    input.addEventListener('keydown',(event)=>{if(event.key==='Enter')input.blur();});
    searchWrap.appendChild(input);
    host.appendChild(searchWrap);
    const body=el('div','knowledge-body');
    body.setAttribute('data-knowledge-body','');
    host.appendChild(body);
    render(host);
  }
  function unmount(host){
    if(!host || !states.has(host))return;
    states.delete(host);
    host.replaceChildren();
  }
  function isMounted(host){
    return !!host && states.has(host);
  }
  return Object.freeze({CATEGORIES,ARTICLES,articles,useDrafts,isLocalReviewHost,normalise,search,readMinutes,marked,mount,unmount,isMounted,show});
});
