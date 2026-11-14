# @meshpoint/sdk

TypeScript client for the Meshpoint platform (`meshpoint-dev/platform`). Fetch-based, no Node-only dependencies, so it runs in Node 22+, Bun, Deno and Workers.

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

// Distilled knowledge, written directly.
await client.putItems([{ id: "dec-1", kind: "decision", title: "Use KV for recall", body: "..." }]);

await client.close();
```

## Behaviour

- `capture()` never sends by itself. Turns go out every `flushIntervalMs` (default 60s), when the buffer reaches `flushMaxTurns` (default 200), on `flush()`, and on `close()`.
- A failed flush keeps the turns, in order, for the next attempt and reports to `onError`. After ten intervals of failure the oldest turns are dropped.
- `recall()` is served from the edge and can be up to 60s stale at a far region. `recall({ fresh: true })` reads the origin.
- `sessionStart()` returns recall and a presence promise that never rejects.
- Credentials are masked before they leave the process: `capture()`, `checkpoint()` and `putItems()` run every body through `redact()`, which replaces known token shapes (AWS, GitHub, Slack, Stripe, Google, `sk-` API keys, JWTs, Meshpoint tokens), private key blocks, passwords in URLs, bearer headers and values assigned to secret-looking names with `[REDACTED:<kind>]`. Git SHAs and prose are left alone. `redact()` is exported for callers that store text elsewhere first.
- `projectIdFromRemote()` flattens any clone URL of one repo to one id: `host--owner--repo`.

## Develop

```
npm install
npm run check   # typecheck + tests
npm run build   # dist/
```
