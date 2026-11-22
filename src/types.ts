// Wire types for the platform's /v1 API. Kept in step with meshpoint-dev/platform src/types.ts.

export type Kind = "fact" | "decision" | "gotcha" | "convention" | "status" | "todo";

export const KINDS: readonly Kind[] = ["fact", "decision", "gotcha", "convention", "status", "todo"];

// Verification state: `ok` is unverified or verified, `suspect` means a referenced path changed after
// the item was written, `stale` means a referenced path is gone, `dropped` means enough users saw it
// stale that recall skips it (it stays in storage and in the console).
export type ItemState = "ok" | "suspect" | "stale" | "dropped";

export interface Item {
  id: string;
  branch: string;
  kind: Kind;
  title: string;
  body: string;
  created_at: number;
  confirmations: number;
  retracted: number;
  provenance: string;
  // Repo-relative paths named in the item and present when it was written.
  refs: string[];
  // Repo-relative paths edited on the branch around the time the item was written.
  paths: string[];
  // HEAD when the item was written; empty when unknown.
  commit_sha: string;
  state: ItemState;
  verified_at: number;
  stale_count: number;
}

export interface ItemInput {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  created_at?: number;
  confirmations?: number;
  provenance?: string;
  refs?: string[];
  paths?: string[];
  commit_sha?: string;
}

export type SightingResult = "verified" | "suspect" | "stale";

// One checkout's verdict on one item: every ref present and untouched since the item (verified),
// present but changed since (suspect), or missing (stale).
export interface Sighting {
  id: string;
  result: SightingResult;
}

// Edit-time context for one file: items on the branch that name it, and others on it right now.
export interface ContextResponse {
  items: Item[];
  presence: Presence[];
}

export interface Checkpoint {
  body: string;
  created_at: number;
}

export interface Presence {
  agent: string;
  user: string;
  branch: string;
  paths: string[];
  updated_at: number;
}

export interface RecallResponse {
  project: string;
  branch: string;
  checkpoint: Checkpoint | null;
  items: Item[];
  generated_at: number;
  source: "kv" | "do";
}

export interface TurnInput {
  body: string;
  paths?: string[];
  at?: number;
}

export interface Stats {
  items: number;
  checkpoints: number;
  turn_batches: number;
  buffered: number;
  presence: number;
  bytes: number;
}

export interface ForkResult {
  project: string;
  items: number;
  turn_batches: number;
  ms: number;
}
