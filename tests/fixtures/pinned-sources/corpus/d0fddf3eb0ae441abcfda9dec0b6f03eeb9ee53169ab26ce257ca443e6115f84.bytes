import {chromium} from '/app/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspect,contrast,stressFolds} from './browser-checks.mjs';
import {portableName} from './portable-path.mjs';
const assert=(ok,why)=>{if(!ok)throw Error(why);};
const artifact=process.cwd()+'/dist/'+portableName;
const report={sha256:createHash('sha256').update(readFileSync(artifact)).digest('hex'),matrix:[],interactions:[],contrast:[],errors:[]};
let browser=await chromium.launch({args:['--no-sandbox']});
const allIds=['h2a','surfaces','cluster-mesh','cm-catalog','cat-mcp','cm-storage','cm-security','cm-cluster','engram','design-system'];
const progress=message=>writeFileSync(process.cwd()+'/.cache/browser-progress.txt',message+'\n');
try{
 for(const mobile of [false,true])for(const language of ['fr','en'])for(const theme of ['light','dark']){
  const size=mobile?{width:390,height:844}:{width:1920,height:1080};
  const name=`${mobile?'mobile':'desktop'}-${language}-${theme}`;
  progress(name);
  const context=await browser.newContext({viewport:size,isMobile:mobile,hasTouch:mobile,colorScheme:theme,offline:true});
  const page=await context.newPage();
  page.on('console',message=>{if(message.type()==='error')report.errors.push({name,message:message.text()});});
  page.on('pageerror',e=>report.errors.push({name,message:e.message}));
  const requests=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto('file://'+artifact);
  assert(await page.title(),'Portable title loaded');
  await page.locator('.architecture-figure svg').first().waitFor({state:'visible'});
  assert(await page.locator('html').getAttribute('lang')==='fr','Default language must be French');
  if(language==='en')await page.getByRole('button',{name:'English',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.locator('html').getAttribute('lang')===language,'Language state');
  const figure=page.locator('.architecture-figure').first();
  assert(await figure.locator('.diagram-scroll [data-node]').count()===0,'Initial cards must all be collapsed');
  assert(await figure.locator('.diagram-scroll [data-group]').count()===5,'Five collapsed root frames');
  assert(await page.getByRole('button',{name:/Style des cartes|Card style|Influence/}).count()===0,'Removed render switch');
  assert(await page.locator('.language-switch').count()===1,'One language toggle');
  await figure.getByRole('button',{name:language==='fr'?/^Agrandir :/:/^Enlarge:/}).click();
  const dialog=page.locator('dialog[open]'),viewport=dialog.locator('.viewer-viewport'),svg=viewport.locator('svg').first();
  assert((await viewport.boundingBox()).height>(mobile?200:500),'Diagram viewport receives remaining height');
  for(const state of ['collapsed','expanded']){
   if(state==='expanded')await dialog.getByRole('button',{name:language==='fr'?'Tout déplier':'Expand all',exact:true}).click();
   await inspect(svg,`${name}-${state}`);
   if(state==='collapsed'){
    const expected=language==='fr'?['Harnais et collaboration','Sessions et outils','Canvas UI','Mémoire et savoir']:['Harness and collaboration','Sessions and tools','Canvas UI','Memory and knowledge'];
    const labels=await svg.locator('[data-edge-label]').evaluateAll(es=>es.map(e=>[...e.querySelectorAll('tspan')].map(t=>t.textContent).join(' ')));
    assert(labels.length===10&&expected.every(label=>labels.includes(label)),'All ten main flows and owner labels');
    assert(await svg.locator('[data-edge] path[marker-end]').count()===10,'Every summary flow has an arrowhead');
   }
   const ratio=await svg.evaluate(s=>s.viewBox.baseVal.width/s.viewBox.baseVal.height);
   if(state==='expanded')assert(Math.abs(ratio-16/9)<.001,'16:9 expanded diagram');
   else {
    const compact=await svg.evaluate(s=>{
     const v=s.viewBox.baseVal,boxes=[...s.querySelectorAll('.diagram-group-box,.diagram-edge-pill')].map(e=>e.getBBox());
     const margins=[Math.min(...boxes.map(b=>b.x))-v.x,Math.min(...boxes.map(b=>b.y))-v.y,v.x+v.width-Math.max(...boxes.map(b=>b.x+b.width)),v.y+v.height-Math.max(...boxes.map(b=>b.y+b.height))];
     return margins.every(m=>m>=24&&m<25)&&[...s.querySelectorAll('[data-group] > rect')].every(r=>r.width.baseVal.value===460&&r.height.baseVal.value===272)&&[...s.querySelectorAll('[data-group] > text')].every(t=>{
      const b=t.getBBox(),r=t.parentElement.querySelector('rect').getBBox();
      return b.x>=r.x&&b.y>=r.y&&b.x+b.width<=r.x+r.width&&b.y+b.height<=r.y+r.height&&(t.classList.contains('diagram-detail')||t.classList.contains('diagram-product-kicker')||(getComputedStyle(t).fontWeight==='700'&&getComputedStyle(t).fontFamily.includes('Dossier Inter')));
     });
    });
    assert(compact,'Collapsed bounds, title wrapping and embedded bold headings');
   }
   const zoneHeaders = await svg.evaluate(s => {
    const atomic = s.querySelector('.card-code');
    const style = e => { const c = getComputedStyle(e); return [c.fontSize, c.lineHeight, c.fontWeight, c.fontFamily, c.textTransform, c.letterSpacing, e instanceof SVGElement ? c.fill : c.color]; };
    return [...s.querySelectorAll('[data-group]')].every(g => {
    const kicker = g.querySelector('.diagram-product-kicker');
    if (!kicker) return false;
    const box = g.querySelector('rect').getBBox(), subtitle = g.querySelector('.diagram-detail').getBBox();
    const rule = g.querySelector('line'), c = getComputedStyle(kicker);
    return c.fontWeight === '400' && (!atomic || JSON.stringify(style(kicker)) === JSON.stringify(style(atomic)))
    && (!atomic || JSON.stringify(style(g.querySelector(':scope > text:not(.diagram-detail):not(.diagram-product-kicker)'))) === JSON.stringify(style(s.querySelector('.service-name'))))
    && (!atomic || JSON.stringify(style(g.querySelector('.diagram-detail'))) === JSON.stringify(style(s.querySelector('.card-name'))))
    && subtitle.x >= box.x + 15 && subtitle.x + subtitle.width <= box.x + Math.min(box.width, 460) - 9
    && subtitle.y + subtitle.height < (rule ? +rule.getAttribute('y1') : box.y + box.height)
    && (g.dataset.collapsed === 'true' ? !rule : rule?.classList.contains('diagram-card-rule')
      && rule.getAttribute('vector-effect') === 'non-scaling-stroke')
    && [...g.querySelectorAll(':scope > text')].every(t => {
      const b = t.getBBox();
      return b.x >= box.x && b.y >= box.y && b.x + b.width <= box.x + box.width && b.y + b.height <= box.y + box.height;
    });
    });
    });
    assert(zoneHeaders, 'Every zone uses the card header style; text fits and expanded zones have a footer rule');
   assert(await svg.getAttribute('data-card-style')==='dossier','Dossier render');
   if(state==='expanded'){
    const widths=await svg.locator('[data-node] > rect').evaluateAll(rs=>rs.map(r=>+r.getAttribute('width')));
    assert(widths.length===28&&widths.every(w=>w===460),'All 28 cards use 460 px');
    assert(await svg.locator('[data-group="cm-providers"], [data-node="peer-instance"]').count()===0,'Frame/card merge');
    assert(await svg.locator('[data-node][data-parent="cm-cluster"]').count()===2,'Two Integration cards');
    const c=await contrast(svg);report.contrast.push({name,...c});
    // Reference leaves have a fixed white surface in both themes; assess their
    // border against that surface, while frames retain the surrounding-theme gate.
    for(const tone of Object.values(c.tones))assert(tone.text>=4.5&&tone.secondary>=4.5&&tone.boundaryFill>=3&&(tone.referenceCard||tone.boundaryCanvas>=3&&tone.boundaryParent>=3),'Measured contrast '+name+JSON.stringify(tone));
   }
   const filename=`${name}-${state}-${size.width}x${size.height}.png`;
   await page.screenshot({path:process.cwd()+'/.cache/'+filename});report.matrix.push(filename);
  }
  // A mixed fold previously blocked the click while uncached routing retried.
  // Keep both click and complete layout within the existing 1800ms UI budget.
  for (const id of ['surfaces','engram','design-system','cm-catalog']) {
   const start = Date.now();
   await dialog.locator(`[data-frame-control="${id}"]`).click({timeout:1800});
   await page.waitForFunction(id=>document.querySelector(`dialog[open] [data-group="${id}"]`)?.getAttribute('data-collapsed')==='true',id,{timeout:1800});
   await page.waitForFunction(()=>document.querySelector('.architecture-figure')?.getAttribute('aria-busy')==='false',null,{timeout:1800});
   const ms = Date.now()-start;
   assert(ms<1800,'Mixed frame layout exceeds UI budget: '+id+' '+ms+'ms');
   report.interactions.push({name,id,method:'mixed-fold-latency',ms});
  }
  // Every frame is tested in tree order, from the default collapsed state.
  await dialog.getByRole('button',{name:language==='fr'?'Tout replier':'Collapse all',exact:true}).click();
  for(const id of allIds)for(const expected of ['true','false','true']){
   const control=dialog.locator(`[data-frame-control="${id}"]`);
   const before=await control.getAttribute('aria-expanded'),start=Date.now();
   if(mobile)await control.tap({timeout:1800});else await control.click({timeout:1800});
   await page.waitForFunction(({id,expected})=>document.querySelector(`dialog[open] [data-frame-control="${id}"]`)?.getAttribute('aria-expanded')===expected,{id,expected},{timeout:1800});
   await page.waitForFunction(()=>document.querySelector('.architecture-figure')?.getAttribute('aria-busy')==='false',null,{timeout:1800});
   const box=await control.boundingBox();
   const standard=await control.evaluate(b=>({small:b.classList.contains('st-button--sm'),height:parseFloat(getComputedStyle(b).minHeight)}));
   assert(standard.small&&box.height>=standard.height,'Unscaled DS sm frame control');
   report.interactions.push({name,id,before,after:expected,method:mobile?'touch':'mouse',ms:Date.now()-start});
  }
  assert(await svg.locator('[data-node]').count()===28,'All frames expanded after traversal');
  // In-frame controls use the compact DS icon button, inside the frame border.
  if(!mobile)for(const id of allIds)for(const expected of ['false','true']){
   const button=svg.locator(`[data-group-toggle="${id}"] button`);
   assert(await button.evaluate(b=>b.classList.contains('st-iconButton--sm')),'DS compact icon button '+id);
   await button.click();
   await page.waitForFunction(({id,expected})=>document.querySelector(`dialog[open] [data-group-toggle="${id}"] button`)?.getAttribute('aria-expanded')===expected,{id,expected},{timeout:1800});
   await page.waitForFunction(()=>document.querySelector('.architecture-figure')?.getAttribute('aria-busy')==='false',null,{timeout:1800});
   report.interactions.push({name,id,after:expected,method:'ds-icon-button'});
  }
  if(!mobile){
   const button=svg.locator('[data-group-toggle="h2a"] button');
   await page.keyboard.press('Tab');await button.focus();await button.press('Space');
   await page.waitForFunction(()=>document.querySelector('dialog[open] [data-group="h2a"]')?.getAttribute('data-collapsed')==='true',null,{timeout:1800});
   assert(await button.evaluate(b=>b.matches(':focus-visible')&&getComputedStyle(b).boxShadow!=='none'),'Keyboard toggle retains the DS focus ring');
   await button.click();
   await page.waitForFunction(()=>document.querySelector('dialog[open] [data-group="h2a"]')?.getAttribute('data-collapsed')==='false',null,{timeout:1800});
   assert(await button.evaluate(b=>!b.matches(':focus-visible')&&getComputedStyle(b).boxShadow==='none'),'Mouse toggle after keyboard does not inherit the DS focus ring');
   report.interactions.push({name,method:'keyboard-then-mouse-focus',passed:true});
  }
  await dialog.getByRole('button',{name:language==='fr'?'Tout replier':'Collapse all',exact:true}).click();
  assert(await svg.locator('[data-node]').count()===0,'Collapse all');
  await dialog.getByRole('button',{name:language==='fr'?'Tout déplier':'Expand all',exact:true}).click();
  assert(await svg.locator('[data-node]').count()===28,'Expand all');
  // Exercise touch pinch through Chromium's real input pipeline.
  if(mobile){
   const cdp=await context.newCDPSession(page),r=await viewport.boundingBox();
   const x=r.x+r.width/2,y=r.y+r.height/2;
   const zoom=()=>dialog.locator('output').textContent();const before=await zoom();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y,id:1},{x:x+35,y,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert(await zoom()!==before,'Pinch zoom');
   report.interactions.push({name,method:'pinch-zoom',passed:true});
  }
  await dialog.locator('[data-viewer-close]').click();
  if(language==='en'){
   await page.reload();await page.locator('.architecture-figure svg').first().waitFor();
   assert(await page.locator('html').getAttribute('lang')==='en','Language persists');
   assert(await page.locator('.diagram-scroll [data-node]').count()===0,'Reload starts collapsed');
  }
  assert(!requests.length,'Portable must work offline');
  await context.close();
  writeFileSync(process.cwd()+'/.cache/browser-review.json',JSON.stringify(report,null,2)+'\n');
 }
 for(const language of ['fr','en']) {
  progress('stress-'+language);
  // Isolate strict latency measurements from the preceding browser matrix.
  await browser.close();
  browser=await chromium.launch({args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1920,height:1080},offline:true});
  const page=await context.newPage();
  page.on('console',m=>{if(m.type()==='error')report.errors.push({name:'stress-'+language,message:m.text()});});
  page.on('pageerror',e=>report.errors.push({name:'stress-'+language,message:e.message}));
  await page.goto('file://'+artifact);
  await page.locator('.architecture-figure svg').first().waitFor({state:'visible'});
  if(language==='en')await page.getByRole('button',{name:'English',exact:true}).click();
  await page.getByRole('button',{name:language==='fr'?/^Agrandir :/:/^Enlarge:/}).first().click();
  report.interactions.push(...await stressFolds(page,language));
  await context.close();
 }
 assert(!report.errors.length,JSON.stringify(report.errors));
 report.status='passed';
}finally{writeFileSync(process.cwd()+'/.cache/browser-review.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({status:report.status,matrix:report.matrix.length,interactions:report.interactions.length,sha256:report.sha256}));
