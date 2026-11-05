// Platform ids allow [A-Za-z0-9._-] only, so a git remote is flattened to host--owner--repo.
export const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

const SSH_SCP_RE = /^(?:[\w.-]+@)?([\w.-]+):(.+)$/;

// Derives the project id from a git remote URL. Accepts scp-style ssh, ssh://, https:// and git://
// forms. Case is folded and a trailing ".git" dropped so every clone of one repo maps to one project.
export function projectIdFromRemote(remote: string): string {
  const trimmed = remote.trim();
  let host: string;
  let path: string;
  if (/^[a-z+]+:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    host = url.hostname;
    path = url.pathname;
  } else {
    const m = SSH_SCP_RE.exec(trimmed);
    if (!m) throw new Error(`unrecognised git remote: ${remote}`);
    host = m[1]!;
    path = m[2]!;
  }
  const parts = path
    .replace(/\.git\/?$/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) throw new Error(`git remote has no owner/repo path: ${remote}`);
  const id = [host, ...parts].join("--").toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  if (!ID_RE.test(id)) throw new Error(`derived project id is not valid: ${id}`);
  return id;
}
