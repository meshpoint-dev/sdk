import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeshpointClient, MeshpointError } from "../src/client.js";

type Call = { method: string; url: string; body: unknown };

function fakeFetch(handler: (call: Call) => { status: number; body?: unknown } = () => ({ status: 202, body: { accepted: 1 } })) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const out = handler(call);
    return new Response(out.body === undefined ? "" : JSON.stringify(out.body), { status: out.status });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof MeshpointClient>[0]> = {}) {
  return new MeshpointClient({
    baseUrl: "https://api.test/",
    token: "tok",
    project: "github.com--acme--web",
    branch: "master",
    fetch: fetchImpl,
    ...extra,
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("MeshpointClient", () => {
  it("recall builds the query, sends the bearer token, and honours fresh", async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { items: [], source: "kv" } }));
    const c = client(fn);
    await c.recall({ budget: 1500 });
    await c.recall({ fresh: true });
    expect(calls[0]?.url).toBe("https://api.test/v1/recall?project=github.com--acme--web&branch=master&budget=1500");
    expect(calls[1]?.url).toContain("fresh=1");
    const init = (fn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("buffers turns and sends one capture request at the interval", async () => {
    const { fn, calls } = fakeFetch();
    const c = client(fn, { flushIntervalMs: 1000 });
    c.capture({ body: "one", paths: ["a.ts"] });
    c.capture({ body: "two" });
    c.checkpoint("summary");
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.test/v1/capture");
    expect(calls[0]?.body).toEqual({
      project: "github.com--acme--web",
      branch: "master",
      turns: [{ body: "one", paths: ["a.ts"] }, { body: "two" }],
      checkpoint: "summary",
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
  });

  it("sends the session id with each capture when given", async () => {
    const { fn, calls } = fakeFetch();
    const c = client(fn, { session: "sess-1" });
    c.capture({ body: "hi" });
    await c.flush();
    expect(calls[0]?.body).toMatchObject({ session: "sess-1", turns: [{ body: "hi" }] });
    const plain = client(fakeFetch().fn);
    plain.capture({ body: "hi" });
    await plain.flush();
  });

  it("flushes at once when the buffer reaches the size cap", async () => {
    const { fn, calls } = fakeFetch();
    const c = client(fn, { flushMaxTurns: 3 });
    c.capture({ body: "1" });
    c.capture({ body: "2" });
    expect(calls).toHaveLength(0);
    c.capture({ body: "3" });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect((calls[0]?.body as { turns: unknown[] }).turns).toHaveLength(3);
  });

  it("close() sends what is left and refuses later captures", async () => {
    const { fn, calls } = fakeFetch();
    const c = client(fn);
    c.capture({ body: "last" });
    await c.close();
    expect(calls).toHaveLength(1);
    expect(() => c.capture({ body: "late" })).toThrow(/closed/);
    await c.close();
    expect(calls).toHaveLength(1);
  });

  it("keeps turns in order after a failed flush and reports the error", async () => {
    let fail = true;
    const { fn, calls } = fakeFetch(() => (fail ? { status: 503, body: { error: "down" } } : { status: 202, body: {} }));
    const errors: Error[] = [];
    const c = client(fn, { flushIntervalMs: 1000, onError: (e) => errors.push(e) });
    c.capture({ body: "a" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(MeshpointError);
    expect((errors[0] as MeshpointError).status).toBe(503);

    c.capture({ body: "b" });
    fail = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);
    expect((calls[1]?.body as { turns: { body: string }[] }).turns.map((t) => t.body)).toEqual(["a", "b"]);
  });

  it("sessionStart awaits recall and fetches presence in the background without rejecting", async () => {
    const { fn, calls } = fakeFetch((call) =>
      call.url.includes("/v1/presence") ? { status: 500, body: { error: "boom" } } : { status: 200, body: { items: [{ id: "i1" }], source: "kv" } },
    );
    const errors: Error[] = [];
    const c = client(fn, { onError: (e) => errors.push(e) });
    const { recall, presence } = await c.sessionStart({ budget: 3000 });
    expect(recall.items).toHaveLength(1);
    expect(await presence).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(calls.map((c) => c.url.split("?")[0])).toEqual(["https://api.test/v1/presence", "https://api.test/v1/recall"]);
  });

  it("presence takes all branches on request, context asks about one file, verify and confirm hit their routes", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("/v1/presence")) return { status: 200, body: { presence: [{ agent: "a" }] } };
      if (call.url.includes("/v1/context")) return { status: 200, body: { items: [], presence: [] } };
      if (call.url.endsWith("/v1/items/verify")) return { status: 202, body: { applied: 2 } };
      return { status: 202, body: { found: true } };
    });
    const c = client(fn);
    await c.presence();
    await c.presence({ all: true });
    await c.context("src/auth.ts");
    expect(await c.verify([{ id: "i1", result: "verified" }, { id: "i2", result: "stale" }])).toEqual({ applied: 2 });
    expect(await c.confirm("i1")).toEqual({ found: true });
    expect(await c.restore("i1")).toEqual({ found: true });
    expect(calls.map((x) => x.url.replace("https://api.test", ""))).toEqual([
      "/v1/presence?project=github.com--acme--web&branch=master",
      "/v1/presence?project=github.com--acme--web&all=1",
      "/v1/context?project=github.com--acme--web&branch=master&path=src%2Fauth.ts",
      "/v1/items/verify",
      "/v1/items/confirm",
      "/v1/items/restore",
    ]);
    expect(calls[3]?.body).toEqual({ project: "github.com--acme--web", sightings: [{ id: "i1", result: "verified" }, { id: "i2", result: "stale" }] });
    expect(calls[4]?.body).toEqual({ project: "github.com--acme--web", id: "i1" });
  });

  it("retract treats 404 as not found instead of throwing", async () => {
    const { fn } = fakeFetch(() => ({ status: 404, body: { found: false } }));
    expect(await client(fn).retract("nope")).toEqual({ found: false });
  });

  it("throws MeshpointError with the server message on other failures", async () => {
    const { fn } = fakeFetch(() => ({ status: 401, body: { error: "unauthorized" } }));
    await expect(client(fn).stats()).rejects.toThrow(/401: unauthorized/);
  });
});
