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
      related:['how-should-i-record-measurements-in-millimetres-and-inches','why-do-calculations-differ-from-measurements-on-the-rod','how-do-i-verify-a-printed-wrap-template-is-to-scale'],
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
    },
    {
      // Verified 27 Nov 2026 (batch 01): NIST definition of the inch, calculations recomputed by
      // tests/knowledge-articles.test.cjs, and Studio statements checked against its code. Merges two drafts.
      id:'how-should-i-record-measurements-in-millimetres-and-inches',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'Recording rod measurements in millimetres and inches',
      summary:'One inch is exactly 25.4 mm. Label every figure with its unit and the point it is measured from, and convert from the original measurement.',
      aliases:['How should I record measurements in millimetres and inches','convert inches to millimetres','convert millimetres to inches',
        'inches to mm','mm to inches','How do I prevent inconsistent measurements across a build','inconsistent measurements'],
      tags:['measurement','units','millimetres','inches','conversion','reference point'],
      source:'NIST, "SI Units – Length": the inch is exactly equivalent to 25.4 mm, effective 1 July 1959. The worked figures are recalculated by K-Labs automated tests; the Studio statements are checked against Studio itself.',
      related:['how-do-i-convert-circumference-to-diameter','how-should-i-measure-guide-positions','why-do-calculations-differ-from-measurements-on-the-rod'],
      sections:[
        {heading:'The exact conversion',blocks:[
          {type:'p',text:'Since 1959 the inch has been defined as exactly 25.4 mm, so converting between the two is exact arithmetic:'},
          {type:'list',items:['Millimetres = inches × 25.4','Inches = millimetres ÷ 25.4']}
        ]},
        {heading:'Worked examples',blocks:[
          {type:'list',items:[
            'A 7 ft rod is 84 in: 84 × 25.4 = 2133.6 mm.',
            'A 300 mm grip: 300 ÷ 25.4 = 11.811 in.',
            'Fractions convert exactly too: 1/8 in = 0.125 in = 3.175 mm, and 5/16 in = 0.3125 in = 7.9375 mm.'
          ]}
        ]},
        {heading:'Convert once, from the original',blocks:[
          {type:'p',text:'Rounding before converting adds error. 300 mm rounded to 11.8 in converts back to 299.72 mm, 0.28 mm short. Keep the figure you measured and convert from that, rounding only the result.'}
        ]},
        {heading:'Label the unit and the reference point',blocks:[
          {type:'p',text:'A length means nothing without the point it is measured from. On a 2133.6 mm rod, a position 300 mm from the tip is 1833.6 mm from the butt. Write the unit, the end it is measured from, and whether a fraction or a decimal was used beside every figure.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'Settings → Measurement Units offers Metric (mm), Decimal Inches and Fractional Inches. Guide Setup lists guide positions from the tip; a build\'s reel seat position is recorded from the butt.'}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): calculations recomputed by tests; Studio statement checked against its code. Merges two drafts.
      id:'how-should-i-measure-guide-positions',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'How to measure guide positions and spacing',
      summary:'Measure every guide from the same end of the rod to the same point on each guide. Spacing is then the difference between neighbouring positions.',
      aliases:['How should I measure guide positions','What does effective guide spacing mean','guide spacing','measure guide spacing',
        'guide positions from the tip','effective guide spacing'],
      tags:['guides','guide spacing','layout','measurement','reference point'],
      source:'Arithmetic on positions measured from one end of the rod. The worked figures are recalculated by K-Labs automated tests; the Studio statement is checked against Studio itself.',
      related:['how-should-i-record-measurements-in-millimetres-and-inches','why-do-calculations-differ-from-measurements-on-the-rod'],
      sections:[
        {heading:'Position and spacing',blocks:[
          {type:'p',text:'A guide\'s position is its distance from one fixed end of the rod. The spacing between two guides is the difference between their positions. For guides at 110, 235 and 380 mm from the tip:'},
          {type:'list',items:['Tip to guide 1: 110 mm','Guide 1 to guide 2: 235 − 110 = 125 mm','Guide 2 to guide 3: 380 − 235 = 145 mm']}
        ]},
        {heading:'Use the same point on every guide',blocks:[
          {type:'p',text:'Measure to the same feature on every guide, such as the ring centre. If one guide is measured to its foot instead, both spacings next to it are wrong by the distance from foot to ring centre: one too long, the other too short.'}
        ]},
        {heading:'From the tip or from the butt',blocks:[
          {type:'p',text:'The two are linked by the rod\'s length: distance from the butt = rod length − distance from the tip. On a 2100 mm rod, a guide 380 mm from the tip is 1720 mm from the butt. Spacings come out the same either way, but a list that mixes the two does not add up.'}
        ]},
        {heading:'Comparing two layouts',blocks:[
          {type:'p',text:'Before comparing guide tables from different sources, check that both measure from the same end, to the same point on each guide, in the same unit. Otherwise one rod can look like two different layouts.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'Workshop → Guide Setup lists each guide\'s position measured from the tip, in the measurement units chosen in Settings.'}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): calculations recomputed by tests; Studio template statements checked against its code.
      id:'how-do-i-verify-a-printed-wrap-template-is-to-scale',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'How to check a printed wrap template is to scale',
      summary:'Measure the printed template\'s width and compare it with the circumference printed on it. If they differ, the print was scaled; work out by how much.',
      aliases:['How do I verify a printed wrap template is to scale','print template at 100%','printed template wrong size','wrap template scale','actual size printing'],
      tags:['thread wrap','template','printing','scale','circumference','Thread Design Studio'],
      source:'Arithmetic: a full-size wrap template is one circumference wide. The worked figures are recalculated by K-Labs automated tests; the Thread Design Studio statements are checked against Studio itself.',
      related:['how-do-i-convert-circumference-to-diameter'],
      sections:[
        {heading:'Why the width matters',blocks:[
          {type:'p',text:'A wrapping template is drawn at full size, so its width equals the rod\'s circumference and it goes once around the rod. If the print is scaled, the width and every mark spacing change in the same proportion, and the pattern no longer meets itself.'}
        ]},
        {heading:'The check',blocks:[
          {type:'steps',items:[
            'Print with page scaling turned off (actual size, or 100%).',
            'Measure the template\'s outlined width with a ruler.',
            'Compare it with the circumference printed with the template.'
          ]}
        ]},
        {heading:'Working out the scale',blocks:[
          {type:'p',text:'Scale = measured width ÷ stated circumference × 100. A template stating 37.7 mm that measures 35.8 mm was printed at 95%. Reprint with scaling turned off rather than correcting by hand.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'Thread Design Studio\'s wrapping template prints the rod diameter, the circumference, the number of marks and their spacing, with the instruction to print at 100% (no scaling). The outlined pattern is drawn one circumference wide.'}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): every figure is a calculation recomputed by tests.
      id:'why-do-calculations-differ-from-measurements-on-the-rod',
      category:'troubleshooting',
      status:'verified',
      updated:'2026-11-27',
      title:'Why calculated and measured figures differ',
      summary:'Rounded inputs, mixed units and different reference points make a correct calculation disagree with the rod. Check each before doubting the formula.',
      aliases:['Why do calculations differ from measurements on the rod','calculation does not match measurement','calculator wrong','measurement mismatch'],
      tags:['measurement','calculator','rounding','units','reference point'],
      source:'Arithmetic. The worked figures are recalculated by K-Labs automated tests.',
      related:['how-should-i-record-measurements-in-millimetres-and-inches','how-should-i-measure-guide-positions','how-do-i-convert-circumference-to-diameter'],
      sections:[
        {heading:'Inputs that are slightly off',blocks:[
          {type:'p',text:'A calculation is only as close as its inputs. A blank measured as 12.0 mm that is really 12.1 mm gives a circumference of 37.70 mm instead of 38.01 mm: 0.31 mm short.'}
        ]},
        {heading:'Mixed units',blocks:[
          {type:'p',text:'A figure in inches read as millimetres is 25.4 times too small: 12 in is 304.8 mm, not 12 mm. Errors this large usually mean a unit mix-up.'}
        ]},
        {heading:'Different reference points',blocks:[
          {type:'p',text:'If the calculation counts from the tip and the rod is measured from the butt, or to a different point on a component, every position is shifted. A shift that is the same for every position points to a reference mix-up rather than a wrong formula.'}
        ]},
        {heading:'Check in this order',blocks:[
          {type:'steps',items:[
            'Confirm both figures are in the same unit.',
            'Confirm both are measured from the same end and to the same point.',
            'Re-measure the inputs, then recalculate from the new figures.'
          ]}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): every figure is a calculation recomputed by tests.
      id:'how-should-i-compare-component-cost-and-selling-price',
      category:'faqs',
      status:'verified',
      updated:'2026-11-27',
      title:'Margin and markup: what is the difference?',
      summary:'Markup is profit as a share of the cost; margin is profit as a share of the selling price. The same sale gives two different percentages.',
      aliases:['How should I compare component cost and selling price','margin vs markup','markup vs margin','markup percentage','margin percentage','price for a target margin'],
      tags:['pricing','margin','markup','profit','cost','tax'],
      source:'Arithmetic. The worked figures are recalculated by K-Labs automated tests.',
      related:[],
      sections:[
        {heading:'The formulas',blocks:[
          {type:'list',items:['Profit = selling price − cost','Markup = profit ÷ cost × 100','Margin = profit ÷ selling price × 100']}
        ]},
        {heading:'Worked example',blocks:[
          {type:'p',text:'A component bought for $40 and sold for $60 makes $20 profit. That is a 50% markup but a 33.3% margin.'}
        ]},
        {heading:'Converting between them',blocks:[
          {type:'list',items:['Margin = markup ÷ (100 + markup) × 100','Markup = margin ÷ (100 − margin) × 100']},
          {type:'p',text:'A 50% markup is a 33.3% margin, and a 50% margin needs a 100% markup.'}
        ]},
        {heading:'Pricing for a target margin',blocks:[
          {type:'p',text:'Selling price = cost ÷ (1 − margin ÷ 100). For a 40% margin on a $40 cost: $40 ÷ 0.6 = $66.67.'}
        ]},
        {heading:'Leave tax out of both figures',blocks:[
          {type:'p',text:'Compare like with like. If the selling price includes a sales tax such as GST, take the tax out before working out margin or markup: at a 15% rate, a $69.00 tax-inclusive price is $60.00 before tax.'}
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
