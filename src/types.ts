// Wire types for the platform's /v1 API. Kept in step with meshpoint-dev/platform src/types.ts.

export type Kind = "fact" | "decision" | "gotcha" | "convention" | "status" | "todo";

export const KINDS: readonly Kind[] = ["fact", "decision", "gotcha", "convention", "status", "todo"];

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
}

export interface ItemInput {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  created_at?: number;
  confirmations?: number;
  provenance?: string;
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
