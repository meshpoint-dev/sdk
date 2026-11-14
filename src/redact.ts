// Credential scrubbing before anything leaves the machine. Patterns are chosen for precision: a
// known token prefix, a key block, a password inside a URL, a bearer header, or a value assigned
// to a secret-looking name. Plain hex (git SHAs) and long words are left alone. The platform only
// ever receives the masked text, so a leaked prompt stays on the machine it was typed on.

interface Rule {
  label: string;
  re: RegExp;
  // Replacement for the match; defaults to the whole match becoming the mask.
  keep?: (m: RegExpExecArray) => string;
}

export const REDACTED_PREFIX = "[REDACTED:";

const mask = (label: string) => `${REDACTED_PREFIX}${label}]`;

const RULES: Rule[] = [
  { label: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { label: "aws-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g },
  { label: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: "stripe-key", re: /\b(?:[sr]k_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,})\b/g },
  { label: "google-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: "api-key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.(?:eyJ)?[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  // Meshpoint's own tokens: base64url JSON claims, a dot, a base64url signature.
  { label: "token", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\b/g },
  { label: "url-password", re: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)([^\s/@]+)@/gi, keep: (m) => `${m[1]}${mask("url-password")}@` },
  { label: "bearer", re: /(\bauthorization\s*[:=]\s*["']?bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, keep: (m) => `${m[1]}${mask("bearer")}` },
  {
    label: "secret",
    re: /(\b[A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|pwd|private[_-]?key|access[_-]?key|credential)s?\b\s*[=:]\s*["']?)([^\s"'`,;]{8,})/gi,
    keep: (m) => `${m[1]}${mask("secret")}`,
  },
];

// Masks credentials in free text. Returns the input unchanged when nothing matches.
export function redact(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, (...args) => {
      const m = args as unknown as RegExpExecArray;
      return rule.keep ? rule.keep(m) : mask(rule.label);
    });
  }
  return out;
}
