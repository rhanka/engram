import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Work-stream C — the in-studio Answer/Search panel. This pins:
 *
 *  - D4 DS-STRICT: the search-input + result cards are DS components, not
 *    invented primitives.
 *  - D1 SEARCH→ANSWER (not chat): a single-shot `Search` + `Retrieve` button
 *    that runs the offline pack, NOT a conversation/chat component.
 *  - D2/D3 the ONLINE PROSE SEAM: a typed `renderAnswer` mount-point + an empty
 *    `.ans-answer-slot` region gated on BOTH `view.answer` and `renderAnswer`,
 *    so OFFLINE (answer === null, no renderAnswer) it renders NOTHING — no
 *    fabricated prose — and the online channel later mounts here untouched.
 *
 * Source-string assertions match the studio's existing component-test style
 * (see appHeader.test.js / entityPanel.test.js).
 */
const panelSource = readFileSync(
  resolve(process.cwd(), "src/components/AnswerPanel.svelte"),
  "utf8",
);

describe("AnswerPanel — DS search→answer surface (work-stream C)", () => {
  it("D4: uses DS Search + Button + Badge + Collapsible (no invented primitives)", () => {
    expect(panelSource).toMatch(
      /import \{[^}]*\b(Badge|Button|Search|Collapsible)\b[^}]*\} from "@sentropic\/design-system-svelte"/,
    );
    for (const cmp of ["Badge", "Button", "Search", "Collapsible"]) {
      expect(panelSource).toContain(cmp);
    }
    // The search input is the DS <Search>, and a DS <Button> runs the retrieval.
    expect(panelSource).toMatch(/<Search\b/);
    expect(panelSource).toMatch(/<Button[\s\S]*onclick=\{run\}/);
  });

  it("D1: SEARCH→ANSWER single-shot, not a chat (submit/Enter runs one pack)", () => {
    // Single submitted query drives one retrieval; no message-list / chat loop.
    expect(panelSource).toMatch(/submitted = query\.trim\(\)/);
    expect(panelSource).toMatch(/event\.key === "Enter"/);
    expect(panelSource).not.toMatch(/messages|conversation|<Chat\b|ChatThread/i);
  });

  it("result cards carry name + type + score + grounding, and open the node in the graph", () => {
    // Ranked entity cards: title (name), type Badge, score, grounding quote.
    expect(panelSource).toMatch(/class="ans-card-title"/);
    expect(panelSource).toMatch(/<Badge[^>]*>\{e\.type\}<\/Badge>/);
    expect(panelSource).toMatch(/formatScore\(e\.score\)/);
    expect(panelSource).toMatch(/class="ans-card-quote"/);
    // Clicking a card focuses that node via the existing selection mechanism.
    expect(panelSource).toMatch(/onclick=\{\(\) => onOpenEntity\?\.\(e\.nodeId\)\}/);
  });

  it("D2/D3: exposes a typed `renderAnswer` mount-point for the deferred online prose", () => {
    // The prop is the typed contract slot (a Svelte Snippet), defaulted off.
    expect(panelSource).toMatch(/renderAnswer = undefined/);
    expect(panelSource).toMatch(/@type \{import\('svelte'\)\.Snippet/);
  });

  it("D3: the answer slot is GATED on both view.answer AND renderAnswer (no fabricated prose offline)", () => {
    // Both must be present for the slot to render → offline (answer null, no
    // renderAnswer) it renders nothing. No bare {@html view.answer} leak.
    expect(panelSource).toMatch(/\{#if view\.answer && renderAnswer\}/);
    expect(panelSource).toMatch(/@render renderAnswer\(\{ answer: view\.answer/);
    expect(panelSource).toMatch(/class="ans-answer-slot"/);
    // The panel never injects view.answer as raw HTML itself (that's the online
    // chat-ui primitive's job, mounted via the snippet).
    expect(panelSource).not.toMatch(/@html\s+view\.answer/);
    expect(panelSource).not.toMatch(/renderInlineMarkdown\(view\.answer\)/);
  });
});
