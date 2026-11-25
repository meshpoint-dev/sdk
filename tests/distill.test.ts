import { describe, expect, it } from "vitest";
import { BRANCH_ITEMS_MAX, consolidatePrompt, DISTILL_RULES, HEAD_CHARS, jsonBlock, parseMerged, parseProposed, parseProposedWith, renderTranscript, sessionPrompt, TAIL_CHARS } from "../src/distill.js";

describe("distill prompts and parsing", () => {
  it("renders a transcript with head and tail when it is long", () => {
    const long = [{ role: "user", text: "a".repeat(HEAD_CHARS), paths: [] }, { role: "assistant", text: "b".repeat(TAIL_CHARS + 100), paths: [] }];
    const text = renderTranscript(long);
    expect(text).toContain("characters omitted");
    expect(text.length).toBeLessThan(HEAD_CHARS + TAIL_CHARS + 100);
    expect(renderTranscript([{ role: "user", text: "hi", paths: ["src/a.ts"] }])).toBe("[user] hi\n(files: src/a.ts)");
  });

  it("builds the same session prompt from the same rendered transcript", () => {
    const meta = { harness: "claude-code", cwd: "/repo", branch: "master", startedAt: 1_700_000_000_000 };
    const prompt = sessionPrompt(meta, "[user] hi");
    expect(prompt.startsWith(DISTILL_RULES)).toBe(true);
    expect(prompt).toContain("Harness: claude-code. Repository directory: /repo. Branch: master. Session started 2023-11-14T22:13:20.000Z.");
    expect(prompt.endsWith("Transcript:\n[user] hi")).toBe(true);
    expect(sessionPrompt({ ...meta, cwd: null, branch: null }, "x")).toContain("Repository directory: unknown. Branch: unknown.");
  });

  it("parses proposed items, redacts secrets, drops bad kinds and empty titles", () => {
    expect(parseProposed('```json\n[{"kind":"gotcha","title":"T","body":"B secret sk-abcdefghijklmnopqrstuvwxyz1234","key":"bad key"},{"kind":"rumor","title":"x","body":"y"},{"kind":"todo","title":"","body":"y"}]\n```', "sess")).toEqual([
      { kind: "gotcha", title: "T", body: expect.stringContaining("[REDACTED:"), sessions: ["sess"] },
    ]);
    expect(parseProposed("not json", "sess")).toEqual([]);
    expect(parseProposed('{"kind":"fact"}', "sess")).toEqual([]);
  });

  it("keeps only items whose evidence quote is in the transcript", () => {
    const transcript = "[user] please run npm test\n\n[assistant] done";
    const checked = parseProposedWith('[{"kind":"fact","title":"A","body":"b","evidence":"run npm test"},{"kind":"fact","title":"B","body":"b","evidence":"never said"},{"kind":"fact","title":"C","body":"b"}]', "sess", transcript);
    expect(checked.items.map((i) => i.title)).toEqual(["A"]);
    expect(checked.items[0]?.evidence).toBe("run npm test");
    expect(checked.unsupported).toBe(2);
  });

  it("builds the merge prompt and parses merged items without status", () => {
    const prompt = consolidatePrompt([{ kind: "fact", title: "t", body: "b", sessions: ["a"] }], [{ id: "live1", kind: "fact", title: "old", body: "x" }]);
    expect(prompt).toContain('"id":"live1"');
    expect(prompt).toContain(`at most ${BRANCH_ITEMS_MAX} items`);
    const merged = parseMerged('[{"kind":"convention","title":"Tests","body":"npm test","key":"test-runner","recurring":true,"supersedes":["live1"],"sessions":["a","b"]},{"kind":"status","title":"wip","body":"x","sessions":["a"]}]', []);
    expect(merged).toEqual([{ kind: "convention", title: "Tests", body: "npm test", key: "test-runner", recurring: true, supersedes: ["live1"], sessions: ["a", "b"] }]);
    expect(parseMerged('[{"kind":"fact","title":"A","body":"b","evidence":"  kept  quote ","sessions":["a"]}]', [])[0]?.evidence).toBe("kept quote");
    expect(parseMerged("garbage", [{ kind: "fact", title: "t", body: "b", sessions: ["a"] }, { kind: "status", title: "s", body: "b", sessions: ["a"] }])).toHaveLength(1);
  });

  it("finds the JSON block in a chatty reply", () => {
    expect(jsonBlock("Here you go:\n[1,2]")).toEqual([1, 2]);
    expect(jsonBlock("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });
});
