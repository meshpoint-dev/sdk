# @meshpoint/sdk

TypeScript client for Meshpoint, shared agent memory for developer teams (`meshpoint-dev/platform`). Fetch-based, no Node-only dependencies, so it runs in Node 22+, Bun, Deno and Workers.

```ts
import { MeshpointClient, projectIdFromRemote } from "@meshpoint/sdk";

const client = new MeshpointClient({
  baseUrl: "https://api.meshpoint.dev",
  token: process.env.MESHPOINT_TOKEN!,
  project: projectIdFromRemote("git@github.com:acme/web.git"), // github.com--acme--web
  branch: "master",
});

// Session start: items now, teammates in the background.
const { recall, presence } = await client.sessionStart({ budget: 3000 });
inject(recall.items, recall.checkpoint);
presence.then(showTeammates);

// During the session: buffered, sent every 60s and on close.
client.capture({ body: turnText, paths: ["src/app.ts"] });
client.checkpoint("what we are doing and why");

// Distilled knowledge, written directly. refs are the repo-relative paths the item depends on.
await client.putItems([{ id: "dec-1", kind: "decision", title: "Use KV for recall", body: "...", refs: ["src/recall.ts"], commit_sha: head }]);

// After checking the refs against the checkout: confirms, marks suspect, or reports stale.
await client.verify([{ id: "dec-1", result: "verified" }]);

// Before editing one file: items that name it, and anyone else on it right now.
const { items, presence: onFile } = await client.context("src/recall.ts");

await client.close();
```

## Behaviour

- `capture()` never sends by itself. Turns go out every `flushIntervalMs` (default 60s), when the buffer reaches `flushMaxTurns` (default 200), on `flush()`, and on `close()`.
- A failed flush keeps the turns, in order, for the next attempt and reports to `onError`. After ten intervals of failure the oldest turns are dropped.
- `recall()` is served from the edge and can be up to 60s stale at a far region. `recall({ fresh: true })` reads the origin.
- `sessionStart()` returns recall and a presence promise that never rejects. `presence({ all: true })` covers every branch of the project.
- Items carry `refs` (paths named in the text), `paths` (files edited around the checkpoint), `commit_sha`, and a `state`: `ok`, `suspect` (a ref changed since), `stale` (a ref is gone), `dropped` (three users saw it stale; recall skips it). `verify()` sends one checkout's sightings; `confirm()` adds a confirmation; `restore()` (admins) clears a stale state.
- Credentials are masked before they leave the process: `capture()`, `checkpoint()` and `putItems()` run every body through `redact()`, which replaces known token shapes (AWS, GitHub, Slack, Stripe, Google, `sk-` API keys, JWTs, Meshpoint tokens), private key blocks, passwords in URLs, bearer headers and values assigned to secret-looking names with `[REDACTED:<kind>]`. Git SHAs and prose are left alone. `redact()` is exported for callers that store text elsewhere first.
- `projectIdFromRemote()` flattens any clone URL of one repo to one id: `host--owner--repo`.

## Develop

```
npm install
npm run check   # typecheck + tests
npm run build   # dist/
```

## License

MIT. See [LICENSE](LICENSE).
