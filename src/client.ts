import type { ContextResponse, ForkResult, ItemInput, Presence, RecallResponse, Sighting, Stats, TurnInput } from "./types.js";
import { redact } from "./redact.js";

export interface ClientOptions {
  baseUrl: string;
  token: string;
  project: string;
  branch: string;
  // The harness session these turns belong to; sent with every capture so the console can show runs.
  session?: string;
  // Buffered turns are sent this often and on close(). Default 60s, matching the platform's own flush.
  flushIntervalMs?: number;
  // A buffer this long is sent at once instead of waiting for the interval.
  flushMaxTurns?: number;
  fetch?: typeof fetch;
  // Background failures (flush, presence prefetch) are reported here instead of thrown.
  onError?: (err: Error) => void;
}

export class MeshpointError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MeshpointError";
  }
}

const DEFAULT_FLUSH_INTERVAL_MS = 60_000;
const DEFAULT_FLUSH_MAX_TURNS = 200;
const BUFFER_HARD_CAP_MULTIPLIER = 10;

export class MeshpointClient {
  private readonly baseUrl: string;
  private readonly token: string;
  readonly project: string;
  readonly branch: string;
  private readonly session: string | undefined;
  private readonly flushIntervalMs: number;
  private readonly flushMaxTurns: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onError: (err: Error) => void;

  private buffer: TurnInput[] = [];
  private pendingCheckpoint: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<void> | undefined;
  private closed = false;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.project = opts.project;
    this.branch = opts.branch;
    this.session = opts.session;
    this.flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.flushMaxTurns = opts.flushMaxTurns ?? DEFAULT_FLUSH_MAX_TURNS;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.onError = opts.onError ?? (() => undefined);
  }

  // Items for the session-start inject. Served from the edge unless `fresh` is set.
  recall(opts: { budget?: number; fresh?: boolean } = {}): Promise<RecallResponse> {
    const q = new URLSearchParams({ project: this.project, branch: this.branch });
    if (opts.budget !== undefined) q.set("budget", String(opts.budget));
    if (opts.fresh) q.set("fresh", "1");
    return this.request<RecallResponse>("GET", `/v1/recall?${q}`);
  }

  // Live agents on this branch, or on every branch of the project with `all`.
  async presence(opts: { all?: boolean } = {}): Promise<Presence[]> {
    const q = new URLSearchParams({ project: this.project });
    if (opts.all) q.set("all", "1");
    else q.set("branch", this.branch);
    const out = await this.request<{ presence: Presence[] }>("GET", `/v1/presence?${q}`);
    return out.presence;
  }

  // What to know before editing one repo-relative file: items naming it and others on it now.
  context(filePath: string): Promise<ContextResponse> {
    const q = new URLSearchParams({ project: this.project, branch: this.branch, path: filePath });
    return this.request<ContextResponse>("GET", `/v1/context?${q}`);
  }

  // Recall is awaited; presence comes from the origin and is fetched in the background so a far
  // origin never delays the inject. The presence promise never rejects: failures go to onError.
  async sessionStart(opts: { budget?: number } = {}): Promise<{ recall: RecallResponse; presence: Promise<Presence[]> }> {
    const presence = this.presence().catch((err: unknown) => {
      this.onError(toError(err));
      return [] as Presence[];
    });
    const recall = await this.recall(opts);
    return { recall, presence };
  }

  // Buffers a turn; nothing is sent until the interval, the size cap, flush() or close().
  // Credentials are masked here, before the turn is buffered; see redact.ts.
  capture(turn: TurnInput): void {
    if (this.closed) throw new Error("client is closed");
    this.buffer.push({ ...turn, body: redact(turn.body) });
    if (this.buffer.length >= this.flushMaxTurns) {
      void this.flush();
      return;
    }
    this.armTimer();
  }

  // Attached to the next flush; a later call before the flush replaces it.
  checkpoint(body: string): void {
    if (this.closed) throw new Error("client is closed");
    this.pendingCheckpoint = redact(body);
    this.armTimer();
  }

  // Sends buffered turns and any pending checkpoint. Flushes never overlap. On failure the turns
  // go back to the front of the buffer for the next attempt and the error is reported to onError.
  flush(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.sendBuffer().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  setPresence(paths: string[]): Promise<void> {
    return this.request<unknown>("POST", "/v1/presence", { project: this.project, branch: this.branch, paths }).then(() => undefined);
  }

  putItems(items: ItemInput[]): Promise<{ count: number; superseded: number }> {
    const clean = items.map((i) => ({ ...i, title: redact(i.title), body: redact(i.body) }));
    return this.request<{ count: number; superseded: number }>("POST", "/v1/items", { project: this.project, branch: this.branch, items: clean });
  }

  retract(id: string): Promise<{ found: boolean }> {
    return this.request<{ found: boolean }>("POST", "/v1/retract", { project: this.project, id }, [202, 404]);
  }

  // Verification results from this checkout; the platform adjusts confirmations and state.
  verify(sightings: Sighting[]): Promise<{ applied: number }> {
    return this.request<{ applied: number }>("POST", "/v1/items/verify", { project: this.project, sightings });
  }

  confirm(id: string): Promise<{ found: boolean }> {
    return this.request<{ found: boolean }>("POST", "/v1/items/confirm", { project: this.project, id }, [202, 404]);
  }

  // Admin action: clears a stale or dropped state so the item returns to recall.
  restore(id: string): Promise<{ found: boolean }> {
    return this.request<{ found: boolean }>("POST", "/v1/items/restore", { project: this.project, id }, [202, 404]);
  }

  fork(target: string, mode: "items" | "full" = "items"): Promise<ForkResult> {
    return this.request<ForkResult>("POST", "/v1/fork", { project: this.project, target, mode });
  }

  stats(): Promise<Stats> {
    return this.request<Stats>("GET", `/v1/stats?${new URLSearchParams({ project: this.project })}`);
  }

  // Final flush, then no more captures. Safe to call more than once.
  async close(): Promise<void> {
    this.closed = true;
    this.disarmTimer();
    await this.flush();
  }

  private armTimer(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.flushIntervalMs);
    (this.timer as { unref?: () => void }).unref?.();
  }

  private disarmTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async sendBuffer(): Promise<void> {
    this.disarmTimer();
    if (this.buffer.length === 0 && this.pendingCheckpoint === undefined) return;
    const turns = this.buffer;
    const checkpoint = this.pendingCheckpoint;
    this.buffer = [];
    this.pendingCheckpoint = undefined;
    try {
      await this.request<unknown>("POST", "/v1/capture", {
        project: this.project,
        branch: this.branch,
        turns,
        ...(checkpoint === undefined ? {} : { checkpoint }),
        ...(this.session === undefined ? {} : { session: this.session }),
      });
    } catch (err) {
      this.buffer = [...turns, ...this.buffer];
      if (checkpoint !== undefined && this.pendingCheckpoint === undefined) this.pendingCheckpoint = checkpoint;
      const cap = this.flushMaxTurns * BUFFER_HARD_CAP_MULTIPLIER;
      if (this.buffer.length > cap) {
        const dropped = this.buffer.length - cap;
        this.buffer = this.buffer.slice(dropped);
        this.onError(new Error(`dropped ${dropped} oldest buffered turns after repeated flush failures`));
      }
      this.onError(toError(err));
      if (!this.closed) this.armTimer();
    }
  }

  private async request<T>(method: string, path: string, body?: unknown, okStatuses: number[] = [200, 201, 202]): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    if (!okStatuses.includes(res.status)) {
      const message = (parsed as { error?: string } | undefined)?.error ?? text ?? res.statusText;
      throw new MeshpointError(res.status, `${method} ${path} -> ${res.status}: ${message}`);
    }
    return parsed as T;
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
