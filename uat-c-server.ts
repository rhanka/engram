// UAT-only throwaway: HTTP wrapper over work-stream C's offline answer-pack,
// so a human can validate `graphify answer` on the mystery graph in a browser.
// Run: npx tsx uat-c-server.ts <graph.json> <port>
import { createServer } from "http";
import { readFileSync } from "fs";
import { loadGraphFromData } from "./src/graph.js";
import { buildSearchIndex } from "./src/search-index-emitter.js";
import { assembleAnswerPack } from "./src/retrieval/answer-pack.js";

const graphPath = process.argv[2]!;
const PORT = parseInt(process.argv[3] || "8878", 10);
const G = loadGraphFromData(JSON.parse(readFileSync(graphPath, "utf-8")));
const index = buildSearchIndex(G);
console.log(`indexed ${index.docs.length} docs from ${graphPath}`);

const PAGE = `<!doctype html><meta charset=utf-8><title>graphify answer — mystery</title>
<style>body{font:14px system-ui;max-width:900px;margin:2rem auto}input{width:70%;padding:.5rem}
pre{white-space:pre-wrap;background:#f6f8fa;padding:1rem;border-radius:6px}</style>
<h2>graphify answer — mystery (work-stream C)</h2>
<form onsubmit="go(event)"><input id=q placeholder="Who is the murderer in A Study in Scarlet?" autofocus>
<button>answer</button></form><pre id=o>…</pre>
<script>async function go(e){e.preventDefault();o.textContent='…';
const r=await fetch('/answer?q='+encodeURIComponent(q.value));const p=await r.json();
let s='# '+p.question+'\\n';
const top=p.neighborhood&&p.neighborhood[0];
if(p.retrieval.ppr.refused){s+='\\n(no lexical match — nothing to answer)\\n';}
else if(top){s+='\\n══ MOST RELEVANT: '+top.label+(top.type?'  ['+top.type+']':'')+'\\n';
  if(top.grounding&&top.grounding[0])s+='   “'+top.grounding[0].quote+'”\\n';
  s+='   (top of the grounded retrieval below — a host assistant synthesizes the prose answer from this pack)\\n';}
s+='\\nmode='+p.mode+' ppr_iters='+p.retrieval.ppr.iterations+'\\n\\n## seeds (BM25)\\n';
for(const x of p.retrieval.seeds.slice(0,10))s+='  #'+x.fused_rank+' '+x.label+(x.bm25!=null?' (bm25='+x.bm25.toFixed(2)+')':'')+'\\n';
s+='\\n## neighborhood (specificity-ranked, entities first)\\n';for(const n of p.neighborhood){s+='  '+(n.specificity!=null?n.specificity.toFixed(2):n.ppr.toFixed(4))+'  '+n.label+(n.type?' ['+n.type+']':'')+'\\n';
if(n.grounding)for(const g of n.grounding)s+='      ↳ "'+g.quote+'"\\n';}
o.textContent=s;}</script>`;

createServer(async (req, res) => {
  const u = new URL(req.url || "/", "http://x");
  if (u.pathname === "/answer") {
    try {
      const pack = assembleAnswerPack(index, u.searchParams.get("q") || "", {
        mode: "offline", tokenBudget: 2000, neighborhoodSize: 20,
      });
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(pack));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  } else {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  }
}).listen(PORT, "127.0.0.1", () => console.log(`C answer server on http://127.0.0.1:${PORT} (graph=${graphPath})`));
