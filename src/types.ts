// Wire types for the platform's /v1 API. Kept in step with meshpoint-dev/platform src/types.ts.

export type Kind = "fact" | "decision" | "gotcha" | "convention" | "status" | "todo";

export const KINDS: readonly Kind[] = ["fact", "decision", "gotcha", "convention", "status", "todo"];

// Verification state: `ok` is unverified or verified, `suspect` means a referenced path changed after
// the item was written, `stale` means a referenced path is gone, `dropped` means enough users saw it
// stale that recall skips it (it stays in storage and in the console).
export type ItemState = "ok" | "suspect" | "stale" | "dropped" | "superseded";

// Session-level kinds leave recall once nobody has confirmed them for this long. Derived, not stored.
export const DECAY_KINDS: readonly Kind[] = ["status", "todo"];
export const DECAY_MS = 30 * 86_400_000;

export function lastSeenAt(item: Pick<Item, "created_at" | "verified_at" | "confirmed_at">): number {
  return Math.max(item.created_at, item.verified_at, item.confirmed_at);
}

export function isExpired(item: Pick<Item, "kind" | "created_at" | "verified_at" | "confirmed_at">, now: number): boolean {
  return DECAY_KINDS.includes(item.kind) && now - lastSeenAt(item) > DECAY_MS;
}

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
  // Optional slot per branch and kind; a new item with the same key supersedes the old one.
  key: string;
  // Id of the item that replaced this one, when state is superseded.
  superseded_by: string;
  // Last explicit confirmation; verified sightings update verified_at.
  confirmed_at: number;
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
  key?: string;
  // Full ids of items this one replaces; the platform marks them superseded.
  supersedes?: string[];
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
