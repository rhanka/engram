const assert=(ok,why)=>{if(!ok)throw Error(why);};
export async function inspect(svg, name) {
  const failures = await svg.evaluate(svg => {
    const saved = svg.getAttribute('style');
    svg.style.width = `${svg.width.baseVal.value}px`; svg.style.maxWidth = 'none';
    const failures = [];
    const within = (a, b) => a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
    const overlap = (a, b) => a.left < b.right - .5 && a.right > b.left + .5 && a.top < b.bottom - .5 && a.bottom > b.top + .5;
    const boxes = [...svg.querySelectorAll('[data-node], [data-group]')];
    const byId = new Map(boxes.map(box => [box.dataset.node || box.dataset.group, box]));
    const card = svg.querySelector('.service-node');
    const rangeBox = element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect(); };
    const scale = svg.getScreenCTM().a;
    // The embedded title font has 1px top / 1.59375px bottom CSS leading.
    const cardGap = card ? (rangeBox(card.querySelector('.card-name')).top - rangeBox(card.querySelector('.service-name')).bottom) / scale : 7.59375;
    for (const group of boxes.filter(box => box.dataset.group)) {
      const title = group.querySelector(':scope > text:not(.diagram-detail):not(.diagram-product-kicker)');
      const subtitle = group.querySelector('.diagram-detail');
      const gap = subtitle.getBBox().y - title.getBBox().y - title.getBBox().height;
      const bodyStyle = getComputedStyle(card?.querySelector('.card-name') || svg);
      for (const text of [subtitle, ...subtitle.querySelectorAll('*')]) {
        const style = getComputedStyle(text);
        if (text.hasAttribute('textLength') || text.hasAttribute('lengthAdjust') || style.letterSpacing !== bodyStyle.letterSpacing || style.wordSpacing !== bodyStyle.wordSpacing) failures.push(`Subtitle spacing differs from card body ${group.dataset.group}`);
      }
      if (group.dataset.collapsed === 'true') {
        const rect = group.querySelector('rect').getBBox(), sub = subtitle.getBBox();
        const kickerTop = +group.querySelector('.diagram-product-kicker').getAttribute('y') - 22;
        const headerBottom = title.getBBox().y + title.getBBox().height + 1.59375;
        const freeTop = Math.max(kickerTop + 70, headerBottom), freeBottom = rect.y + rect.height - 16;
        if (Math.abs(sub.y + sub.height / 2 - (freeTop + freeBottom) / 2) > .02) failures.push(`Collapsed subtitle vertical centre ${group.dataset.group}`);
        if (sub.x < rect.x + 32 - .02 || sub.x + sub.width > rect.x + rect.width - 32 + .02) failures.push(`Collapsed subtitle margins ${group.dataset.group}`);
        const lines = [...subtitle.querySelectorAll('tspan')];
        for (const line of lines) {
          const centre = line.getStartPositionOfChar(0).x + line.getComputedTextLength() / 2;
          if (getComputedStyle(line).textAnchor !== 'middle' || Math.abs(centre - rect.x - rect.width / 2) > .02) failures.push(`Collapsed subtitle line centre ${group.dataset.group}`);
        }
      } else {
        if (Math.abs(gap - cardGap) > .02) failures.push(`Header gap ${group.dataset.group}: ${gap}, card ${cardGap}`);
        const rule = +group.querySelector('.diagram-card-rule').getAttribute('y1');
        const sub = subtitle.getBBox(), rect = group.querySelector('rect').getBBox();
        const children = boxes.filter(box => box.dataset.parent === group.dataset.group).map(box => box.querySelector('rect').getBBox());
        if (Math.abs(rule - sub.y - sub.height - 4) > .02) failures.push(`Subtitle rule gap ${group.dataset.group}`);
        if (children.length) {
          const top = Math.min(...children.map(b => b.y)) - rule;
          const bottom = rect.y + rect.height - Math.max(...children.map(b => b.y + b.height));
          if (Math.abs(top - 16) > .02 || Math.abs(top - bottom) > 2) failures.push(`Unbalanced zone inset ${group.dataset.group}: ${top}/${bottom}`);
        }
      }
      const top = +group.querySelector('.diagram-product-kicker').getAttribute('y') - 22;
      const bottom = title.getBBox().y + title.getBBox().height + 1.59375;
      const iconY = group.querySelector('.diagram-icon').transform.baseVal.consolidate().matrix.f;
      if (Math.abs(iconY - (top + bottom - 70) / 2) > .02) failures.push(`Header icon alignment ${group.dataset.group}`);
    }
    for (const box of boxes) {
      const id = box.dataset.node || box.dataset.group;
      const rect = box.querySelector('rect').getBoundingClientRect();
      if (box.dataset.collapsed === 'true') {
        const size = box.querySelector('rect').getBBox();
        if (size.width !== 460 || size.height !== 272) failures.push(`Nonstandard collapsed card ${id}`);
      }
      const texts = [...box.querySelectorAll('tspan, text:not(:has(tspan)), .service-node span:not(.card-gap, .card-rule), .service-node strong')];
      for (const text of texts) {
        if (!within(text.getBoundingClientRect(), rect)) failures.push(`Text outside ${id}: ${text.textContent}`);
        if (text.closest('.service-node')) {
          const style = getComputedStyle(text);
          if (text.matches('.service-name, .card-name, .card-detail') && (style.whiteSpace !== 'normal' || !(Number(style.webkitLineClamp) > 0))) failures.push(`Missing multiline text budget ${id}: ${text.textContent}`);
          if (text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1) {
            failures.push(`Clipped or ellipsized text ${id}: ${text.textContent}`);
          }
        }
      }
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        if (overlap(texts[i].getBoundingClientRect(), texts[j].getBoundingClientRect())) failures.push(`Text collision ${id}`);
      }
      for (const icon of box.querySelectorAll('.diagram-icon, .diagram-status, [data-group-toggle] button')) {
        for (const text of texts) if (getComputedStyle(icon).visibility !== 'hidden' && overlap(icon.getBoundingClientRect(), text.getBoundingClientRect())) failures.push(`Icon/toggle collision ${id}: ${text.textContent}`);
      }
      if (box.dataset.collapsed === 'true' && boxes.some(child => child.dataset.parent === id)) failures.push(`Visible folded child ${id}`);
      if (box.dataset.node) {
        const card = box.querySelector('.service-node');
        const size = box.querySelector('rect').getBBox();
        if (size.width !== 460 || size.height !== 200) failures.push(`Nonstandard leaf footprint ${id}`);
        const separator = box.querySelector('.diagram-card-rule');
        if (separator?.getAttribute('vector-effect') !== 'non-scaling-stroke') failures.push(`Scaling separator ${id}`);
        const ruleStyle = getComputedStyle(card.querySelector('.card-rule'));
        if (ruleStyle.backgroundColor !== 'rgb(189, 202, 208)' || ruleStyle.marginTop !== '4px' || ruleStyle.marginBottom !== '4px') failures.push(`Reference separator ${id}`);
        const footer = card.querySelector('.repo-label').getBoundingClientRect();
        const rule = card.querySelector('.card-rule').getBoundingClientRect();
        const scale = rect.height / card.offsetHeight;
        const detail = card.querySelector('.card-detail').getBoundingClientRect();
        if (Math.abs((rule.top - detail.bottom) / scale - 4) > .05) failures.push(`Reference rule placement ${id}`);
        if (Math.abs(rule.height / scale - 1) > .05 || Math.abs((footer.top - rule.bottom) / scale - 4) > .05) failures.push(`Footer spacing ${id}`);
        if (Math.abs((rect.bottom - footer.bottom) / scale - parseFloat(getComputedStyle(card).borderBottomWidth) - 9.25) > .05) failures.push(`Footer bottom offset ${id}`);
        for (const text of texts.filter(t => !t.matches('.repo-label'))) {
          if (text.getBoundingClientRect().bottom > rule.top + .5) failures.push(`Text overlaps footer ${id}`);
        }
      }
    }
    const leaves = boxes.filter(box => box.dataset.node || box.dataset.collapsed === 'true');
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      if (overlap(leaves[i].querySelector('rect').getBoundingClientRect(), leaves[j].querySelector('rect').getBoundingClientRect())) failures.push('Card collision');
    }
    const labels = [...svg.querySelectorAll('.diagram-edge-pill')];
    const edges = [...svg.querySelectorAll('[data-edge]')];
    for (const label of labels) {
      const rect = label.querySelector('rect').getBoundingClientRect();
      if (!within(label.querySelector('text').getBoundingClientRect(), rect)) failures.push(`Pill text clipped ${label.dataset.labelFor}`);
      for (const box of leaves) if (overlap(rect, box.querySelector('rect').getBoundingClientRect())) failures.push(`Label on card ${label.dataset.labelFor}`);
      const b = label.querySelector('rect').getBBox();
      const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      let centered = false;
      for (const edge of edges) {
        const path = edge.querySelector('path');
        const commands = [...path.getAttribute('d').matchAll(/([MHV])\s*([-\d.]+)(?:\s+([-\d.]+))?/g)];
        let p;
        for (const [, op, a, c] of commands) {
          const q = op === 'M' ? { x: +a, y: +c } : op === 'H' ? { x: +a, y: p.y } : { x: p.x, y: +a };
          if (p) {
            const carrier = edge.dataset.edge === label.dataset.labelFor && Math.abs((p.x + q.x) / 2 - center.x) < 1 && Math.abs((p.y + q.y) / 2 - center.y) < 1;
            centered ||= carrier;
            if (!carrier && Math.max(p.x, q.x) > b.x - 5 && Math.min(p.x, q.x) < b.x + b.width + 5 && Math.max(p.y, q.y) > b.y - 5 && Math.min(p.y, q.y) < b.y + b.height + 5) failures.push(`Line abuts pill ${label.dataset.labelFor}/${edge.dataset.edge}`);
          }
          p = q;
        }
      }
      if (!centered) failures.push(`Pill not centred on segment ${label.dataset.labelFor}`);
    }
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i].getBoundingClientRect(), labels[j].getBoundingClientRect())) failures.push('Pill collision');
    const endpointBanks = new Map();
    for (const edge of edges) {
      const path = edge.querySelector('path');
      for (const [id, p] of [[edge.dataset.source, path.getPointAtLength(0)], [edge.dataset.target, path.getPointAtLength(path.getTotalLength())]]) {
        const r = byId.get(id)?.querySelector('rect').getBBox();
        const boundary = r && ((Math.abs(p.x - r.x) < 1 || Math.abs(p.x - r.x - r.width) < 1) && p.y >= r.y - 1 && p.y <= r.y + r.height + 1 || (Math.abs(p.y - r.y) < 1 || Math.abs(p.y - r.y - r.height) < 1) && p.x >= r.x - 1 && p.x <= r.x + r.width + 1);
        if (!boundary) failures.push(`Detached edge ${edge.dataset.edge}`);
        if (boundary) {
          const side = Math.abs(p.x-r.x)<.05 ? 'left' : Math.abs(p.x-r.x-r.width)<.05 ? 'right' : Math.abs(p.y-r.y)<.05 ? 'top' : 'bottom';
          const vertical = side==='left'||side==='right';
          const offset = vertical ? p.y-r.y-r.height/2 : p.x-r.x-r.width/2;
          const key=id+':'+side;
          if(!endpointBanks.has(key))endpointBanks.set(key,[]);
          endpointBanks.get(key).push(offset);
        }
      }
    }
    for(const [key,bank]of endpointBanks){
      bank.sort((a,b)=>a-b);
      const step=bank.length>1?(bank.at(-1)-bank[0])/(bank.length-1):0;
      if(bank.some((v,i)=>Math.abs(v-(i-(bank.length-1)/2)*step)>.05)||bank.length>1&&step<12)failures.push('Off-centre endpoint bank '+key);
    }
    svg.setAttribute('style', saved);
    return failures;
  });
  assert(!failures.length, `${name}: ${failures.join('; ')}`);
}

export async function contrast(svg) {
  return svg.evaluate(svg => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgb = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const canvas = getComputedStyle(svg).backgroundColor;
    const tones = {};
    const all = [...svg.querySelectorAll('[data-node], [data-group]')];
    for (const box of all) {
      const card = box.querySelector('.service-node');
      const tone = `${card ? 'leaf' : 'frame'}:${box.dataset.tone}`;
      const style = getComputedStyle(card || box.querySelector('rect'));
      const fill = card ? style.backgroundColor : style.fill, border = card ? style.borderRightColor : style.stroke;
      const parent = all.find(group => group.dataset.group === box.dataset.parent);
      const surround = parent ? getComputedStyle(parent.querySelector('rect')).fill : canvas;
      const entry = tones[tone] ||= { referenceCard: !!card, text: Infinity, secondary: Infinity, boundaryCanvas: Infinity, boundaryFill: Infinity, boundaryParent: Infinity, fillCanvas: Infinity, samples: 0 };
      entry.boundaryCanvas = Math.min(entry.boundaryCanvas, ratio(border, canvas));
      entry.boundaryFill = Math.min(entry.boundaryFill, ratio(border, fill));
      entry.boundaryParent = Math.min(entry.boundaryParent, ratio(border, surround));
      entry.fillCanvas = Math.min(entry.fillCanvas, ratio(fill, canvas));
      for (const text of box.querySelectorAll('text, .card-code, .service-name, .card-name, .card-detail, .repo-label')) {
        const textColor = getComputedStyle(text)[text.namespaceURI.includes('svg') ? 'fill' : 'color'];
        const measured = ratio(textColor, fill);
        entry.text = Math.min(entry.text, measured);
        if (text.matches('.card-detail, .card-code, .diagram-detail, .diagram-kicker')) entry.secondary = Math.min(entry.secondary, measured);
        entry.samples++;
      }
    }
    const pillText = Math.min(...[...svg.querySelectorAll('.diagram-edge-pill')].map(pill => ratio(getComputedStyle(pill.querySelector('text')).fill, getComputedStyle(pill.querySelector('rect')).fill)));
    return { canvas: rgb(canvas), tones, pillText };
  });
}

// Start collapsed: this sequence reaches uncached folds missed by tree traversal,
// including the slow security fold after change 81. Keep the existing UI budget.
export async function stressFolds(page, language) {
 const dialog=page.locator('dialog[open]'), timings=[];
 for(let i=0;i<120;i++) {
  const controls=dialog.locator('[data-frame-control]');
  const control=controls.nth((i*7+Math.floor(i/11))%await controls.count());
  const id=await control.getAttribute('data-frame-control');
  const before=await control.getAttribute('aria-expanded'),start=Date.now();
  try {await control.click({timeout:1800});}
  catch(error){throw Error(`Stress fold ${language} ${i} ${id}: ${error.message}`,{cause:error});}
  await page.waitForFunction(({id,before})=>document.querySelector(`dialog[open] [data-frame-control="${id}"]`)?.getAttribute('aria-expanded')!==before,{id,before},{timeout:1800});
  await page.waitForFunction(()=>document.querySelector('.architecture-figure')?.getAttribute('aria-busy')==='false',null,{timeout:1800});
  const ms=Date.now()-start;
  if(ms>=1800)throw Error(`Stress fold ${language} ${i} ${id} exceeds UI budget: ${ms}ms`);
  timings.push({name:language,id,index:i,method:'stress-fold-latency',ms});
 }
 return timings;
}

