import {readFileSync,writeFileSync} from 'node:fs';
import {nodeRect,segmentCrossesRect,edgeSegments,routeScene} from '../src/architecture-routing.js';
import {sceneFrame,frameHeaderContent} from '../src/architecture-layout.js';
import {aggregateTopLevel} from '../src/governance-summary.js';
const baseline=process.argv.includes('--baseline');
const root=baseline?process.cwd()+'/.cache/baseline':process.cwd();
const presentation=JSON.parse(readFileSync(root+'/src/presentation-scenes.json','utf8'));
const routes=JSON.parse(readFileSync(root+'/src/governance-routes.json','utf8'));
const categories=['crossings','sharedCorridors','headerIntrusions','borderOverlaps','labelCollisions','labelCardCollisions','edgeLabelCollisions','cardIntrusions','cardOverlaps','offCentreEndpoints','detachedEndpoints','detachedLabels','diagonals','selfEdges','missingArrows'];
const report={status:'pending',scenes:0,edgeInstances:0,counts:Object.fromEntries(categories.map(c=>[c,0])),checks:[],failures:[],aggregation:[]};
const eps=.01;
const overlap=(a,b,p=0)=>a.left<b.right+p-eps&&a.right>b.left-p+eps&&a.top<b.bottom+p-eps&&a.bottom>b.top-p+eps;
const near=(a,b)=>Math.abs(a-b)<eps;
function check(scene,name){
 for(const n of scene.nodes)if(n.width!==460||n.height!==200)throw Error(name+': nonstandard leaf footprint '+n.id);
 if(!baseline)for(const g of scene.groups.filter(g=>g.collapsed))if(g.width!==460||g.height!==272)throw Error(name+': collapsed card size '+g.id);
 if(!baseline)for(const g of scene.groups.filter(g=>g.collapsed)){
  const header=frameHeaderContent(g,g.width);
  // The trailing 16-unit padding is not painted text; long approved names may wrap to four lines.
  if(header.headerTextHeight-16>g.height)throw Error(name+': collapsed header overflow '+g.id);
 }
 if(!baseline)for(const g of scene.groups)if(/ · \p{Ll}/u.test(g.title))throw Error(name+': frame title capitalization '+g.id);
 if(!baseline)for(const g of scene.groups.filter(g=>!g.collapsed)){
  const children=[...scene.groups,...scene.nodes].filter(n=>n.parentId===g.id);
  if(children.length){
   const top=Math.min(...children.map(n=>n.position.y))-g.position.y-g.headerTextHeight+8;
   const bottom=g.position.y+g.height-Math.max(...children.map(n=>n.position.y+n.height));
   if(Math.abs(top-16)>eps||Math.abs(top-bottom)>2)throw Error(name+': unbalanced zone inset '+g.id+' '+top+'/'+bottom);
  }
 }
 if(!baseline&&scene.id==='central')for(const ids of [['h2a','surfaces'],['engram','design-system'],['cm-catalog','cm-storage','cm-security','cm-cluster']]){
  const row=scene.groups.filter(g=>ids.includes(g.id));
  if(row.length===ids.length&&new Set(row.map(g=>g.position.y)).size!==1)throw Error(name+': row alignment '+ids.join('/'));
  const expanded=row.filter(g=>!g.collapsed);
  if(expanded.length>1&&Math.max(...expanded.map(g=>g.position.y+g.headerTextHeight))-Math.min(...expanded.map(g=>g.position.y+g.headerTextHeight))>eps)throw Error(name+': child row alignment '+ids.join('/'));
 }
 const frame=sceneFrame(scene);
 const allCollapsed=scene.id==='central'&&!scene.nodes.length&&scene.groups.length&&scene.groups.every(g=>g.collapsed);
 if(!allCollapsed&&Math.abs(frame.width/frame.height-16/9)>.00001)throw Error(name+': aspect ratio');
 if(allCollapsed){
  const boxes=[...scene.groups.map(g=>nodeRect(g)),...scene.edges.map(e=>e.data.labelBox),...scene.edges.flatMap(e=>e.data.routedPoints.map(p=>({left:p.x,right:p.x,top:p.y,bottom:p.y})))];
  const margins=[Math.min(...boxes.map(b=>b.left))-frame.left,Math.min(...boxes.map(b=>b.top))-frame.top,frame.left+frame.width-Math.max(...boxes.map(b=>b.right)),frame.top+frame.height-Math.max(...boxes.map(b=>b.bottom))];
  if(margins.some(m=>m<24||m>=25))throw Error(name+': collapsed padding '+margins);
 }
 const counts=Object.fromEntries(categories.map(c=>[c,0]));
 const fail=(category,detail)=>{counts[category]++;report.counts[category]++;report.failures.push({name,category,detail});};
 const nodes=[...scene.nodes,...scene.groups.filter(g=>g.collapsed)],byId=new Map(nodes.map(n=>[n.id,n]));
 const boxes=nodes.map(n=>nodeRect(n)),segments=scene.edges.flatMap(e=>edgeSegments(e).map(s=>({...s,id:e.id}))),banks=new Map();
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlap(boxes[i],boxes[j]))fail('cardOverlaps',boxes[i].id+'/'+boxes[j].id);
 for(const edge of scene.edges){
  report.edgeInstances++;
  if(edge.source===edge.target)fail('selfEdges',edge.id);
  if(edge.data.summary&&edge.data.marker===false)fail('missingArrows',edge.id);
  const path=edgeSegments(edge),label=edge.data.labelBox,p=edge.data.labelPoint;
  if(!path.some(({from:a,to:b})=>near((a.x+b.x)/2,p.x)&&near((a.y+b.y)/2,p.y)))fail('detachedLabels',edge.id);
  for(const [end,point]of [['source',path[0]?.from],['target',path.at(-1)?.to]]){
   const n=byId.get(edge[end]),r=n&&nodeRect(n);
   const side=r&&point&&(near(point.x,r.left)?'left':near(point.x,r.right)?'right':near(point.y,r.top)?'top':near(point.y,r.bottom)?'bottom':null);
   if(!side||point.x<r.left-eps||point.x>r.right+eps||point.y<r.top-eps||point.y>r.bottom+eps){fail('detachedEndpoints',edge.id+'/'+end);continue;}
   const axis=['left','right'].includes(side)?'y':'x',centre=axis==='y'?(r.top+r.bottom)/2:(r.left+r.right)/2;
   const key=n.id+':'+side;if(!banks.has(key))banks.set(key,[]);
   banks.get(key).push({id:edge.id+'/'+end,offset:point[axis]-centre});
   if(n.collapsed&&side==='top')fail('headerIntrusions',edge.id+'/'+n.id+'/top');
  }
  for(const {from:a,to:b}of path){
   if(!near(a.x,b.x)&&!near(a.y,b.y)){fail('diagonals',edge.id);continue;}
   for(const box of boxes)if(segmentCrossesRect(a,b,box))fail('cardIntrusions',edge.id+'/'+box.id);
   for(const g of [...scene.groups,...scene.nodes]){
    const r=nodeRect(g),h={...r,bottom:r.top+g.headerTextHeight};
    const borderClearance=!g.data&&!g.collapsed?3.99:11.99;
    if(!g.data&&!g.collapsed&&segmentCrossesRect(a,b,h))fail('headerIntrusions',edge.id+'/'+g.id);
    if(near(a.x,b.x)&&Math.max(a.y,b.y)>r.top+eps&&Math.min(a.y,b.y)<r.bottom-eps&&[r.left,r.right].some(x=>Math.abs(a.x-x)<borderClearance))fail('borderOverlaps',edge.id+'/'+g.id);
    const compactTop=scene.groups.some(p=>!p.collapsed&&g.parentId===p.id&&Math.abs(g.position.y-p.position.y-p.headerTextHeight-8)<eps);
    if(near(a.y,b.y)&&Math.max(a.x,b.x)>r.left+eps&&Math.min(a.x,b.x)<r.right-eps&&[r.top,r.bottom].some((y,i)=>Math.abs(a.y-y)<(i===0&&compactTop?3.99:borderClearance)))fail('borderOverlaps',edge.id+'/'+g.id);
   }
  }
  for(const b of boxes)if(overlap(label,b,4))fail('labelCardCollisions',edge.id+'/'+b.id);
  for(const g of scene.groups.filter(g=>!g.collapsed))if(overlap(label,{...nodeRect(g),bottom:g.position.y+g.headerTextHeight+(baseline?0:8)},4))fail('headerIntrusions','label '+edge.id+'/'+g.id);
  for(const s of segments)if(s.id!==edge.id&&segmentCrossesRect(s.from,s.to,{left:label.left-4,right:label.right+4,top:label.top-4,bottom:label.bottom+4}))fail('edgeLabelCollisions',s.id+'/'+edge.id);
 }
 for(const bank of banks.values()){
  bank.sort((a,b)=>a.offset-b.offset);
  const step=bank.length>1?(bank.at(-1).offset-bank[0].offset)/(bank.length-1):0;
  bank.forEach((p,i)=>{if(!near(p.offset,(i-(bank.length-1)/2)*step)||bank.length>1&&step<12)fail('offCentreEndpoints',p.id+' offset='+p.offset);});
 }
 for(let i=0;i<scene.edges.length;i++)for(let j=i+1;j<scene.edges.length;j++)if(overlap(scene.edges[i].data.labelBox,scene.edges[j].data.labelBox,4))fail('labelCollisions',scene.edges[i].id+'/'+scene.edges[j].id);
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j];if(a.id===b.id)continue;
  const av=near(a.from.x,a.to.x),bv=near(b.from.x,b.to.x);
  if(av!==bv){const v=av?a:b,h=av?b:a;if(v.from.x>=Math.min(h.from.x,h.to.x)-eps&&v.from.x<=Math.max(h.from.x,h.to.x)+eps&&h.from.y>=Math.min(v.from.y,v.to.y)-eps&&h.from.y<=Math.max(v.from.y,v.to.y)+eps)fail('crossings',a.id+'/'+b.id);}
  else if(av?near(a.from.x,b.from.x):near(a.from.y,b.from.y)){const k=av?'y':'x';if(Math.min(Math.max(a.from[k],a.to[k]),Math.max(b.from[k],b.to[k]))>Math.max(Math.min(a.from[k],a.to[k]),Math.min(b.from[k],b.to[k]))+eps)fail('sharedCorridors',a.id+'/'+b.id);}
 }
 report.scenes++;report.checks.push({name,edges:scene.edges.length,straight:scene.edges.filter(e=>edgeSegments(e).length===1).length,counts});
}
if(process.argv.includes('--elk')){
 const layouts=JSON.parse(readFileSync(process.cwd()+'/.cache/elk-centred-layouts.json','utf8'));
 for(const [lang,scene]of Object.entries(layouts))check(scene,'elk/'+lang);
}else for(const language of ['fr','en']){
 const central=presentation[language].architectureScenes.central;
 for(const [key,edges]of Object.entries(routes[language]))if(key!=='folded')check({...central,edges},language+'/expanded/'+key);
 for(const [i,fold]of routes[language].folded.entries()){
  const [geometry]=JSON.parse(fold.signature),entries=new Map([...central.groups,...central.nodes].map(n=>[n.id,n]));
  const visible=geometry.map(([id,parentId,x,y,width,height,headerTextHeight,collapsed])=>({...entries.get(id),position:{x,y},width,height,headerTextHeight,collapsed}));
  check({...central,groups:visible.filter(n=>!n.data),nodes:visible.filter(n=>n.data),edges:fold.edges},language+'/fold/'+i);
 }
 for(const [collection,scenes]of Object.entries(presentation[language]))for(const [id,scene]of Object.entries(scenes))if(id!=='central')check(scene,language+'/'+collection+'/'+id);
 if(!baseline){
  const aggregate=aggregateTopLevel(central);
  report.aggregation.push({language,edges:aggregate.map(e=>({id:e.id,source:e.source,target:e.target,label:e.label,relations:e.data.relations}))});
  const ids=aggregate.flatMap(e=>e.data.relations.map(r=>r.id));
  if(ids.length!==new Set(ids).size)throw Error('Duplicated aggregated relations');
  const parents=new Map([...central.nodes,...central.groups].map(n=>[n.id,n.parentId]));
  const owner=id=>parents.get(id)?owner(parents.get(id)):id;
  const expected=central.edges.filter(e=>owner(e.source)!==owner(e.target)).map(e=>e.id).sort();
  if(JSON.stringify([...ids].sort())!==JSON.stringify(expected))throw Error('Missing cross-frame relation');
  for(const a of aggregate)for(const e of a.data.relations)if(owner(e.source)!==a.source||owner(e.target)!==a.target)throw Error('Wrong summary direction');
  const harness=aggregate.find(e=>e.source==='h2a'&&e.target==='surfaces').data.relations;
  if(JSON.stringify(harness.map(e=>e.target).sort())!==JSON.stringify(['surf-ai','surf-cli','surf-cowork']))throw Error('Harness must reach CLI, chat and Cowork');
  if(language==='fr'&&routes.fr.overview.find(e=>e.id==='e-ai-cowork').data.routedPoints.length!==2)throw Error('The aligned Cowork link must stay straight');
 }
}
report.status=report.failures.length?'failed':'passed';
writeFileSync(process.cwd()+'/.cache/'+(process.argv.includes('--elk')?'elk-geometry':baseline?'baseline-geometry':'geometry-review')+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,scenes:report.scenes,edges:report.edgeInstances,counts:report.counts,failures:report.failures.slice(0,10)}));
if(!baseline&&report.failures.length)process.exitCode=1;
