/**
 * URL ingestion - fetch URLs (tweet/arxiv/pdf/web/image) and save as annotated markdown.
 *
 * Uses Node.js global fetch, turndown for HTML-to-markdown conversion, and
 * security helpers for safe fetching and URL validation.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve as pathResolve, basename, extname } from "node:path";
import { safeFetch, safeFetchText, validateUrl } from "./security.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yamlStr(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

function safeFilename(url: string, suffix: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `unknown${suffix}`;
  }
  let name = parsed.hostname + parsed.pathname;
  name = name.replace(/[^\w\-]/g, "_").replace(/^_+|_+$/g, "");
  name = name.replace(/_+/g, "_").slice(0, 80);
  return name + suffix;
}

function detectUrlType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "tweet";
  if (lower.includes("arxiv.org")) return "arxiv";
  if (lower.includes("github.com")) return "github";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith(".pdf")) return "pdf";
    if (
      [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) =>
        path.endsWith(ext),
      )
    )
      return "image";
  } catch {
    // fall through
  }
  return "webpage";
}

async function htmlToMarkdown(html: string, _url: string): Promise<string> {
  try {
    const TurndownService = (await import("turndown")).default;
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    return td.turndown(html);
  } catch {
    // Fallback: strip tags
    let text = html.replace(/<script[^>]*>.*?<\/script>/gis, "");
    text = text.replace(/<style[^>]*>.*?<\/style>/gis, "");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    return text.slice(0, 8000);
  }
}

// ---------------------------------------------------------------------------
// URL type handlers
// ---------------------------------------------------------------------------

async function fetchTweet(
  url: string,
  author: string | null,
  contributor: string | null,
): Promise<[string, string]> {
  const oembedUrl = url.replace("x.com", "twitter.com");
  const oembedApi = `https://publish.twitter.com/oembed?url=${encodeURIComponent(oembedUrl)}&omit_script=true`;

  let tweetText: string;
  let tweetAuthor: string;
  try {
    const data = JSON.parse(await safeFetchText(oembedApi)) as Record<
      string,
      unknown
    >;
    tweetText = ((data.html as string) ?? "")
      .replace(/<[^>]+>/g, "")
      .trim();
    tweetAuthor = (data.author_name as string) ?? "unknown";
  } catch {
    tweetText = `Tweet at ${url} (could not fetch content)`;
    tweetAuthor = "unknown";
  }

  const now = new Date().toISOString();
  const content = `---
source_url: ${url}
type: tweet
author: ${tweetAuthor}
captured_at: ${now}
contributor: ${contributor ?? author ?? "unknown"}
---

# Tweet by @${tweetAuthor}

${tweetText}

Source: ${url}
`;
  const filename = safeFilename(url, ".md");
  return [content, filename];
}

async function fetchWebpage(
  url: string,
  author: string | null,
  contributor: string | null,
): Promise<[string, string]> {
  const html = await safeFetchText(url);

  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch
    ? titleMatch[1]!.replace(/\s+/g, " ").trim()
    : url;

  const markdown = await htmlToMarkdown(html, url);
  const now = new Date().toISOString();
  const content = `---
source_url: ${url}
type: webpage
title: "${yamlStr(title)}"
captured_at: ${now}
contributor: ${contributor ?? author ?? "unknown"}
---

# ${title}

Source: ${url}

---

${markdown.slice(0, 12000)}
`;
  const filename = safeFilename(url, ".md");
  return [content, filename];
}

async function fetchArxiv(
  url: string,
  author: string | null,
  contributor: string | null,
): Promise<[string, string]> {
  const arxivMatch = url.match(/(\d{4}\.\d{4,5})/);
  if (!arxivMatch) {
    return fetchWebpage(url, author, contributor);
  }

  const arxivId = arxivMatch[1]!;
  let title = arxivId;
  let abstract = "";
  let paperAuthors = "";

  const apiUrl = `https://export.arxiv.org/abs/${arxivId}`;
  try {
    const html = await safeFetchText(apiUrl);
    const abstractMatch = html.match(
      /class="abstract[^"]*"[^>]*>(.*?)<\/blockquote>/is,
    );
    if (abstractMatch) {
      abstract = abstractMatch[1]!.replace(/<[^>]+>/g, "").trim();
    }
    const titleMatch = html.match(
      /class="title[^"]*"[^>]*>(.*?)<\/h1>/is,
    );
    if (titleMatch) {
      title = titleMatch[1]!.replace(/<[^>]+>/g, " ").trim();
    }
    const authorsMatch = html.match(
      /class="authors"[^>]*>(.*?)<\/div>/is,
    );
    if (authorsMatch) {
      paperAuthors = authorsMatch[1]!.replace(/<[^>]+>/g, "").trim();
    }
  } catch {
    // Use defaults set above
  }

  const now = new Date().toISOString();
  const content = `---
source_url: ${url}
arxiv_id: ${arxivId}
type: paper
title: "${title}"
paper_authors: "${paperAuthors}"
captured_at: ${now}
contributor: ${contributor ?? author ?? "unknown"}
---

# ${title}

**Authors:** ${paperAuthors}
**arXiv:** ${arxivId}

## Abstract

${abstract}

Source: ${url}
`;
  const filename = `arxiv_${arxivId.replace(".", "_")}.md`;
  return [content, filename];
}

async function downloadBinary(
  url: string,
  suffix: string,
  targetDir: string,
): Promise<string> {
  const filename = safeFilename(url, suffix);
  const outPath = pathResolve(targetDir, filename);
  const data = await safeFetch(url);
  writeFileSync(outPath, data);
  return outPath;
}

interface IngestOptions {
  author?: string | null;
  contributor?: string | null;
}

function normalizeIngestOptions(
  authorOrOptions: string | IngestOptions | null | undefined,
  contributor: string | null | undefined,
): { author: string | null; contributor: string | null } {
  if (typeof authorOrOptions === "string" || authorOrOptions == null) {
    return {
      author: authorOrOptions ?? null,
      contributor: contributor ?? null,
    };
  }

  return {
    author: authorOrOptions.author ?? null,
    contributor: authorOrOptions.contributor ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main ingest function
// ---------------------------------------------------------------------------

export async function ingest(
  url: string,
  targetDir: string,
  authorOrOptions: string | IngestOptions | null = null,
  contributor: string | null = null,
): Promise<string> {
  mkdirSync(targetDir, { recursive: true });
  const urlType = detectUrlType(url);
  const { author, contributor: normalizedContributor } = normalizeIngestOptions(
    authorOrOptions,
    contributor,
  );

  await validateUrl(url);

  let content: string;
  let filename: string;

  if (urlType === "pdf") {
    const out = await downloadBinary(url, ".pdf", targetDir);
    console.log(`Downloaded PDF: ${basename(out)}`);
    return out;
  }

  if (urlType === "image") {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    const suffix = extname(parsed.pathname) || ".jpg";
    const out = await downloadBinary(url, suffix, targetDir);
    console.log(`Downloaded image: ${basename(out)}`);
    return out;
  }

  if (urlType === "tweet") {
    [content, filename] = await fetchTweet(url, author, normalizedContributor);
  } else if (urlType === "arxiv") {
    [content, filename] = await fetchArxiv(url, author, normalizedContributor);
  } else {
    [content, filename] = await fetchWebpage(url, author, normalizedContributor);
  }

  let outPath = pathResolve(targetDir, filename);
  let counter = 1;
  while (existsSync(outPath)) {
    const stem = filename.replace(/\.md$/, "");
    outPath = pathResolve(targetDir, `${stem}_${counter}.md`);
    counter++;
  }

  writeFileSync(outPath, content, "utf-8");
  console.log(`Saved ${urlType}: ${basename(outPath)}`);
  return outPath;
}

// ---------------------------------------------------------------------------
// Save query result (memory loop)
// ---------------------------------------------------------------------------

export function saveQueryResult(
  questionOrOptions:
    | string
    | {
      question: string;
      answer: string;
      memoryDir: string;
      queryType?: string;
      sourceNodes?: string[] | null;
    },
  answer?: string,
  memoryDir?: string,
  queryType: string = "query",
  sourceNodes: string[] | null = null,
): string {
  const payload = typeof questionOrOptions === "string"
    ? {
      question: questionOrOptions,
      answer: answer ?? "",
      memoryDir: memoryDir ?? "",
      queryType,
      sourceNodes,
    }
    : {
      question: questionOrOptions.question,
      answer: questionOrOptions.answer,
      memoryDir: questionOrOptions.memoryDir,
      queryType: questionOrOptions.queryType ?? "query",
      sourceNodes: questionOrOptions.sourceNodes ?? null,
    };

  if (!payload.question) throw new Error("saveQueryResult requires a question");
  if (!payload.memoryDir) throw new Error("saveQueryResult requires a memoryDir");

  const effectiveAnswer = payload.answer ?? "";
  mkdirSync(payload.memoryDir, { recursive: true });

  const now = new Date();
  const slug = payload.question
    .toLowerCase()
    .replace(/[^\w]/g, "_")
    .slice(0, 50)
    .replace(/_+$/, "");
  const ts = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
  const filename = `query_${ts}_${slug}.md`;

  const frontmatterLines = [
    "---",
    `type: "${payload.queryType}"`,
    `date: "${now.toISOString()}"`,
    `question: "${yamlStr(payload.question)}"`,
    'contributor: "graphify"',
  ];
  if (payload.sourceNodes && payload.sourceNodes.length > 0) {
    const nodesStr = payload.sourceNodes
      .slice(0, 10)
      .map((n) => `"${n}"`)
      .join(", ");
    frontmatterLines.push(`source_nodes: [${nodesStr}]`);
  }
  frontmatterLines.push("---");

  const bodyLines = [
    "",
    `# Q: ${payload.question}`,
    "",
    "## Answer",
    "",
    effectiveAnswer,
  ];
  if (payload.sourceNodes && payload.sourceNodes.length > 0) {
    bodyLines.push("", "## Source Nodes", "");
    for (const n of payload.sourceNodes) {
      bodyLines.push(`- ${n}`);
    }
  }

  const content = [...frontmatterLines, ...bodyLines].join("\n");
  const outPath = pathResolve(payload.memoryDir, filename);
  writeFileSync(outPath, content, "utf-8");
  return outPath;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isDirectExecution = typeof process !== "undefined" &&
  typeof process.argv[1] === "string" &&
  /^ingest\.(?:js|mjs|cjs|ts)$/.test(basename(process.argv[1]));

if (isDirectExecution) {
  const url = process.argv[2];
  const targetDir = process.argv[3] ?? "./raw";
  const author = process.argv[4] ?? null;
  if (!url) {
    console.error("Usage: ingest <url> [target_dir] [author]");
    process.exit(1);
  }
  ingest(url, targetDir, author)
    .then((out) => console.log(`Ready for graphify: ${out}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
