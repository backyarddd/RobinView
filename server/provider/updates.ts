// Self-update: compares the running version against the latest release/tag on
// the project's GitHub repo, and (on request) pulls + reinstalls in place.
//
// Everything here is keyless: the GitHub REST API allows unauthenticated reads
// (rate-limited to 60/hr per IP, which a once-an-hour check never approaches),
// and the apply step shells out to the local `git` / `npm` already on PATH.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchWithTimeout } from "./util.js";
import type { UpdateInfo, UpdateResult } from "../../shared/types.js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
// server/provider -> project root is two levels up.
const ROOT = join(__dirname, "..", "..");

// Default repo if git/origin can't be resolved. Override with ROBINVIEW_REPO
// ("owner/name") for forks.
const DEFAULT_REPO = "backyarddd/RobinView";

export function currentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

// Parse "owner/name" out of any common GitHub remote URL form.
function parseRepo(remote: string): string | null {
  const m = remote
    .trim()
    .replace(/\.git$/, "")
    .match(/github\.com[:/]([^/]+\/[^/]+)$/);
  return m ? m[1] : null;
}

async function resolveRepo(): Promise<string> {
  if (process.env.ROBINVIEW_REPO) return process.env.ROBINVIEW_REPO;
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], { cwd: ROOT });
    const parsed = parseRepo(stdout);
    if (parsed) return parsed;
  } catch {
    /* not a git checkout, or no origin - fall back */
  }
  return DEFAULT_REPO;
}

// Strip a leading "v" and compare dotted numeric versions. Non-numeric or
// missing segments compare as 0. Returns >0 if a is newer than b.
function cmpVersions(a: string, b: string): number {
  const norm = (s: string) =>
    s.replace(/^v/i, "").split(/[.\-+]/).map((p) => parseInt(p, 10));
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

let cache: { at: number; info: UpdateInfo } | null = null;
const TTL = 10 * 60_000; // 10 min - clients may poll hourly; this de-dupes bursts.

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export async function checkForUpdate(force = false): Promise<UpdateInfo> {
  const current = currentVersion();
  if (!force && cache && Date.now() - cache.at < TTL) {
    return { ...cache.info, current };
  }

  const repo = await resolveRepo();
  const base = `https://api.github.com/repos/${repo}`;
  let info: UpdateInfo = {
    current,
    latest: null,
    hasUpdate: false,
    url: `https://github.com/${repo}`,
    notes: null,
    publishedAt: null,
    channel: "none",
  };

  try {
    // Prefer a published release; fall back to the newest tag.
    const rel = await fetchWithTimeout(`${base}/releases/latest`, { headers: GH_HEADERS }, 8000);
    if (rel.ok) {
      const j: any = await rel.json();
      const latest = j?.tag_name ? String(j.tag_name) : null;
      info = {
        current,
        latest,
        hasUpdate: !!latest && cmpVersions(latest, current) > 0,
        url: j?.html_url || info.url,
        notes: typeof j?.body === "string" ? j.body.slice(0, 4000) : null,
        publishedAt: j?.published_at ? Date.parse(j.published_at) || null : null,
        channel: "release",
      };
    } else if (rel.status === 404) {
      const tags = await fetchWithTimeout(`${base}/tags?per_page=20`, { headers: GH_HEADERS }, 8000);
      if (tags.ok) {
        const arr = (await tags.json()) as any[];
        // Highest semver-ish tag, not just the API's first.
        const newest = arr
          .map((t) => String(t?.name || ""))
          .filter(Boolean)
          .sort((a, b) => cmpVersions(b, a))[0];
        if (newest) {
          info = {
            current,
            latest: newest,
            hasUpdate: cmpVersions(newest, current) > 0,
            url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(newest)}`,
            notes: null,
            publishedAt: null,
            channel: "tag",
          };
        }
      }
    }
  } catch {
    /* offline or rate-limited - return the "unknown" shape, cached briefly */
  }

  cache = { at: Date.now(), info };
  return info;
}

// Pull the latest code and reinstall dependencies in place. Fast-forward only,
// so a dirty working tree or diverged history fails loudly rather than creating
// a merge commit. The dev server (tsx watch + Vite) restarts/HMRs itself when
// files change; a production `npm start` process must be restarted by the user.
export async function applyUpdate(): Promise<UpdateResult> {
  const before = currentVersion();
  const out: string[] = [];
  const run = async (cmd: string, args: string[]) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: ROOT,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    out.push(`$ ${cmd} ${args.join(" ")}\n${stdout}${stderr}`.trim());
  };

  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT });
  } catch {
    return {
      ok: false,
      version: before,
      message: "Not a git checkout - update by pulling the latest code manually.",
      restartRequired: false,
    };
  }

  try {
    await run("git", ["pull", "--ff-only"]);
    await run("npm", ["install", "--no-audit", "--no-fund"]);
  } catch (e: any) {
    return {
      ok: false,
      version: currentVersion(),
      message: `Update failed: ${String(e?.message || e).split("\n")[0]}`,
      restartRequired: false,
      output: [...out, String(e?.stderr || e?.message || e)].join("\n").slice(-4000),
    };
  }

  const after = currentVersion();
  return {
    ok: true,
    version: after,
    message:
      after !== before
        ? `Updated ${before} -> ${after}. Reloading…`
        : "Already on the latest code. Reloading…",
    // tsx watch picks up server changes automatically; a bare `npm start` does not.
    restartRequired: false,
    output: out.join("\n").slice(-4000),
  };
}
