import { describe, expect, it } from "vitest";
import { redact } from "../src/redact.js";

describe("redact", () => {
  it("masks known token shapes and keeps the surrounding text", () => {
    const cases: Array<[string, string]> = [
      ["key AKIAIOSFODNN7EXAMPLE here", "key [REDACTED:aws-key] here"],
      ["ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij12", "[REDACTED:github-token]"],
      ["github_pat_11ABCDEFG0123456789_abcdefghijklmnop", "[REDACTED:github-token]"],
      ["xoxb-1234567890-abcdefghijk", "[REDACTED:slack-token]"],
      ["sk_live_abcdefghijklmnop", "[REDACTED:stripe-key]"],
      ["whsec_abcdefghijklmnop", "[REDACTED:stripe-key]"],
      ["AIzaSyA1234567890abcdefghijklmnopqrstuv", "[REDACTED:google-key]"],
      ["sk-proj-abcdefghijklmnopqrstuvwxyz0123", "[REDACTED:api-key]"],
      ["sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "[REDACTED:api-key]"],
      ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", "[REDACTED:jwt]"],
      ["postgres://app:hunter2secret@db.internal:5432/x", "postgres://app:[REDACTED:url-password]@db.internal:5432/x"],
      ["Authorization: Bearer abcdefghijklmnop0123456789", "Authorization: Bearer [REDACTED:bearer]"],
      ["export STRIPE_API_KEY=abcd1234efgh5678", "export STRIPE_API_KEY=[REDACTED:secret]"],
      ['password: "correct-horse-battery"', 'password: "[REDACTED:secret]"'],
      ["client_secret=Q1w2E3r4T5y6U7i8", "client_secret=[REDACTED:secret]"],
    ];
    for (const [input, expected] of cases) expect(redact(input), input).toBe(expected);
  });

  it("masks a Meshpoint token and a private key block", () => {
    const token = `eyJvcmciOiJvX2FiYyIsInVzZXIiOiJ1X3h5eiJ9.${"A".repeat(86)}`;
    expect(redact(`token=${token}`)).toBe("token=[REDACTED:secret]");
    expect(redact(`got ${token} back`)).toBe("got [REDACTED:token] back");
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
    expect(redact(`cat key.pem\n${pem}\ndone`)).toBe("cat key.pem\n[REDACTED:private-key]\ndone");
  });

  it("leaves ordinary text alone: git shas, short values, prose about tokens", () => {
    for (const text of [
      "commit 71f0c53a9b1e2d3c4f5a6b7c8d9e0f1a2b3c4d5e fixed the token refresh",
      "the password field is required",
      "set token: abc (too short)",
      "https://github.com/meshpoint-dev/platform",
      "CHECKPOINT_TURNS = 20",
      "secret_santa=enabled",
    ]) {
      expect(redact(text)).toBe(text);
    }
  });
});
