import { redact } from "./redact.js";
import { KINDS, type Kind } from "./types.js";

// Turning a session transcript into items: the prompt the CLI sends to the user's own agent CLI
// (`meshpoint import sessions`) and the platform sends to the model API (console Distill). One copy
// here keeps both sides identical; the bench in meshpoint-bench measures it.

export interface TranscriptLine {
  role: string;
  text: string;
  paths?: readonly string[];
}

export interface SessionMeta {
  // The harness that recorded the session (claude-code, codex, ...), or the agent name on the platform.
  harness: string;
  cwd: string | null;
  branch: string | null;
  startedAt: number;
}

export interface ProposedItem {
  kind: Kind;
  title: string;
  body: string;
  key?: string;
  recurring?: boolean;
  // A verbatim transcript quote the item rests on; items without one in the transcript are dropped.
  evidence?: string;
  sessions: string[];
}

export interface MergedItem extends ProposedItem {
  supersedes?: string[];
}

export const DISTILL_SYSTEM = "You are a careful assistant. Follow the instructions in the message exactly. No tools, no preamble, output only what is asked.";

// Transcript text kept per call: the start sets the task, the end holds what was established.
export const HEAD_CHARS = 20_000;
export const TAIL_CHARS = 40_000;
export const SESSION_ITEMS_MAX = 20;
export const BRANCH_ITEMS_MAX = 60;
export const EVIDENCE_CHARS = 200;
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export const DISTILL_RULES = `Write what a teammate's agent would need to resume work in this repository correctly, as items.
Each item is {"kind", "title", "body", "evidence"}. kind is one of: decision (a choice made and why), gotcha (something that bit or will bite), convention (how things are done here), fact (a stable truth about the code or environment), status (where the work stands), todo (an agreed next step).
title is one line. body is one to three sentences, concrete: file names by repo-relative path, commands, values, reasons.
evidence is a quote of at most ${EVIDENCE_CHARS} characters copied verbatim from the transcript that supports the item; an item without a real quote is discarded.
Rules: only what this session established, never invent; prefer durable knowledge over moment-to-moment detail; at most one status; no secrets, tokens or credentials; skip chit-chat and anything true of every project.`;

export function renderTranscript(entries: readonly TranscriptLine[]): string {
  const lines = entries.map((e) => `[${e.role}] ${e.text}${e.paths && e.paths.length ? `\n(files: ${e.paths.slice(0, 8).join(", ")})` : ""}`);
  const text = lines.join("\n\n");
  if (text.length <= HEAD_CHARS + TAIL_CHARS) return text;
  return `${text.slice(0, HEAD_CHARS)}\n\n[... ${text.length - HEAD_CHARS - TAIL_CHARS} characters omitted ...]\n\n${text.slice(-TAIL_CHARS)}`;
}

export function sessionPrompt(meta: SessionMeta, transcript: string): string {
  return [
    DISTILL_RULES,
    "",
    `Harness: ${meta.harness}. Repository directory: ${meta.cwd ?? "unknown"}. Branch: ${meta.branch ?? "unknown"}. Session started ${new Date(meta.startedAt).toISOString()}.`,
    "",
    `Output only a JSON array of at most ${SESSION_ITEMS_MAX} items. Output [] if the session established nothing worth keeping.`,
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

// The first JSON array or object in a model reply, code fences tolerated.
export function jsonBlock(text: string): unknown {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.includes("\n") ? s.slice(s.indexOf("\n") + 1) : s.slice(3);
    s = s.lastIndexOf("```") >= 0 ? s.slice(0, s.lastIndexOf("```")) : s;
  }
  const starts = [s.indexOf("["), s.indexOf("{")].filter((i) => i >= 0);
  const start = starts.length ? Math.min(...starts) : 0;
  return JSON.parse(s.slice(start));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// Items whose quote is not in the transcript are unsupported and left out.
export function parseProposedWith(raw: string, session: string, transcript?: string): { items: ProposedItem[]; unsupported: number } {
  let parsed: unknown;
  try {
    parsed = jsonBlock(raw);
  } catch {
    return { items: [], unsupported: 0 };
  }
  if (!Array.isArray(parsed)) return { items: [], unsupported: 0 };
  const haystack = transcript === undefined ? null : squash(transcript);
  const items: ProposedItem[] = [];
  let unsupported = 0;
  for (const v of parsed) {
    if (!isRecord(v) || typeof v.kind !== "string" || !(KINDS as readonly string[]).includes(v.kind)) continue;
    if (typeof v.title !== "string" || !v.title.trim() || typeof v.body !== "string" || !v.body.trim()) continue;
    const quote = typeof v.evidence === "string" ? squash(v.evidence).slice(0, EVIDENCE_CHARS) : "";
    if (haystack !== null && (!quote || !haystack.includes(quote))) {
      unsupported++;
      continue;
    }
    const item: ProposedItem = { kind: v.kind as Kind, title: redact(v.title.trim().slice(0, 200)), body: redact(v.body.trim().slice(0, 2000)), sessions: [session] };
    if (typeof v.key === "string" && KEY_RE.test(v.key)) item.key = v.key;
    if (v.recurring === true) item.recurring = true;
    if (quote) item.evidence = redact(quote);
    items.push(item);
    if (items.length >= SESSION_ITEMS_MAX) break;
  }
  return { items, unsupported };
}

export function parseProposed(raw: string, session: string, transcript?: string): ProposedItem[] {
  return parseProposedWith(raw, session, transcript).items;
}

export interface LiveItem {
  id: string;
  kind: string;
  title: string;
  body: string;
}

export function consolidatePrompt(items: readonly ProposedItem[], live: readonly LiveItem[]): string {
  return [
    "You merge knowledge items proposed from several coding sessions on one repository branch into one list.",
    "Input items carry the ids of the sessions that produced them. Rules:",
    '- Merge duplicates and near-duplicates into one item; keep every session id in "sessions".',
    "- When a fact or decision changed across sessions, keep only the newest statement (later session ids are newer in the list).",
    '- Give conventions a short stable "key" (letters, digits, . _ : / -) such as test-runner or deploy-target.',
    '- Mark a gotcha "recurring": true when the same problem appears in two or more sessions.',
    "- Drop every status item (they describe a past moment) and todos that read as finished.",
    '- Keep "evidence" (a verbatim transcript quote) from the newest source item that was merged; never write new evidence.',
    '- Items already live on the branch are listed; do not repeat them, and when a proposed item supersedes a live one, add "supersedes": ["<live id>"].',
    `- Output only a JSON array of at most ${BRANCH_ITEMS_MAX} items: {"kind","title","body","evidence"?,"key"?,"recurring"?,"supersedes"?,"sessions"}.`,
    "",
    `Live items on the branch:\n${JSON.stringify(live.map((i) => ({ id: i.id, kind: i.kind, title: i.title, body: i.body })))}`,
    "",
    `Proposed items:\n${JSON.stringify(items)}`,
  ].join("\n");
}

// A status describes a past moment; an import never writes one, since a new status supersedes the
// branch's current one on write.
const IMPORT_KINDS: readonly string[] = KINDS.filter((k) => k !== "status");

export function parseMerged(raw: string, fallback: readonly ProposedItem[]): MergedItem[] {
  let parsed: unknown;
  try {
    parsed = jsonBlock(raw);
  } catch {
    return fallback.filter((i) => i.kind !== "status");
  }
  if (!Array.isArray(parsed)) return fallback.filter((i) => i.kind !== "status");
  const out: MergedItem[] = [];
  for (const v of parsed) {
    if (!isRecord(v) || typeof v.kind !== "string" || !IMPORT_KINDS.includes(v.kind)) continue;
    if (typeof v.title !== "string" || !v.title.trim() || typeof v.body !== "string" || !v.body.trim()) continue;
    const item: MergedItem = {
      kind: v.kind as Kind,
      title: redact(v.title.trim().slice(0, 200)),
      body: redact(v.body.trim().slice(0, 2000)),
      sessions: Array.isArray(v.sessions) ? v.sessions.filter((x): x is string => typeof x === "string").slice(0, 50) : [],
    };
    if (typeof v.key === "string" && KEY_RE.test(v.key)) item.key = v.key;
    if (v.recurring === true) item.recurring = true;
    if (typeof v.evidence === "string" && v.evidence.trim()) item.evidence = redact(squash(v.evidence).slice(0, EVIDENCE_CHARS));
    if (Array.isArray(v.supersedes)) item.supersedes = v.supersedes.filter((x): x is string => typeof x === "string").slice(0, 20);
    out.push(item);
    if (out.length >= BRANCH_ITEMS_MAX) break;
  }
  return out;
}
