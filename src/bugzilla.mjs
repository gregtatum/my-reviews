// @ts-check
import color from "cli-color";
import { hyperlink, treeConnectors, UnderlineColor } from "./terminal.mjs";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { inspect } from "util";

export const DEFAULT_BUGZILLA_URL = "https://bugzilla.mozilla.org";
const SNAPSHOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/utils"
);

/**
 * @typedef {{
 *   bugs: Array<{
 *     id: number;
 *     summary: string;
 *     flags?: Array<{
 *       name?: string;
 *       status?: string;
 *       requestee?: unknown;
 *       setter?: unknown;
 *       updatedFancy?: string;
 *       updatedEpoch?: number;
 *     }>;
 *   }>;
 * }} BugSearchResponse
 */

/**
 * @param {string} email
 * @param {string | undefined} bugzillaUrl
 * @param {string | undefined} apiKey
 * @returns {Promise<{ needinfos: BugSearchResponse["bugs"] }>}
 */
export async function runBugzillaNeedinfos(
  email,
  bugzillaUrl = DEFAULT_BUGZILLA_URL,
  apiKey
) {
  if (!email) {
    throw new Error("The first argument must be your Bugzilla email.");
  }

  const baseUrl = normalizeBugzillaUrl(bugzillaUrl);
  const bugs = await fetchNeedinfoBugs(email, baseUrl, apiKey);

  if (bugs.length > 0) {
    printHeader(baseUrl);
    bugs.forEach((bug, index) => {
      printNeedinfo(bug, baseUrl, email, index === bugs.length - 1);
    });
  }

  return { needinfos: bugs };
}

/**
 * @param {string} email
 * @param {string} baseUrl
 * @param {string | undefined} apiKey
 */
async function fetchNeedinfoBugs(email, baseUrl, apiKey) {
  if (!apiKey) {
    throw new Error(
      "Missing Bugzilla API key. Run `my-reviews bugzilla <email> [bugzilla_url]` to set one."
    );
  }

  const bugs = await fetchNeedinfoBugsViaRpc(email, baseUrl, apiKey);

  const lowerEmail = email.toLowerCase();
  const bugsWithNeedinfo = bugs.filter((bug) =>
    bug.flags?.some(
      (/** @type {unknown} */ flag) => isNeedinfoFor(flag, lowerEmail)
    )
  );

  bugsWithNeedinfo.sort((a, b) => a.id - b.id);
  return bugsWithNeedinfo;
}

/**
 * @param {string} email
 * @param {string} baseUrl
 */
/**
 * @param {string} email
 * @param {string} baseUrl
 * @param {string} apiKey
 */
async function fetchNeedinfoBugsViaRpc(email, baseUrl, apiKey) {
  const body = {
    method: "MyDashboard.run_flag_query",
    params: {
      Bugzilla_api_key: apiKey,
      type: "requestee",
      name: "needinfo",
      statuses: ["?"],
      requestees: [email],
      include_fields: ["id", "summary", "flags"],
    },
    id: "my-reviews",
    version: "1.1",
  };
  const response = await fetchBugzillaRpc(
    "needinfo-rpc",
    baseUrl,
    body,
    apiKey
  );
  const bugs = response?.result?.bugs;
  if (Array.isArray(bugs)) {
    return bugs;
  }
  const requestee = response?.result?.result?.requestee;
  if (Array.isArray(requestee)) {
    return coerceNeedinfoFlagsToBugs(requestee);
  }
  throw new Error("Bugzilla RPC response missing bug list.");
}

/**
 * @param {unknown[]} items
 * @returns {BugSearchResponse["bugs"]}
 */
function coerceNeedinfoFlagsToBugs(items) {
  /** @type {Map<number, BugSearchResponse["bugs"][number]>} */
  const bugsById = new Map();

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const type =
      /** @type {any} */ (item).type ||
      /** @type {any} */ (item).flag_type ||
      /** @type {any} */ (item).name;
    if (type && String(type) !== "needinfo") {
      continue;
    }
    const idValue =
      /** @type {any} */ (item).bug_id ??
      /** @type {any} */ (item).id ??
      /** @type {any} */ (item).bugId;
    const bugId = Number(idValue);
    if (!Number.isFinite(bugId)) {
      continue;
    }
    const summaryValue =
      /** @type {any} */ (item).bug_summary ??
      /** @type {any} */ (item).summary ??
      "";
    const summary = String(summaryValue || "");
    const flagName =
      /** @type {any} */ (item).flag_name ||
      /** @type {any} */ (item).flag ||
      /** @type {any} */ (item).name ||
      "needinfo";
    const status =
      /** @type {any} */ (item).flag_status ||
      /** @type {any} */ (item).status ||
      "?";
    const requestee =
      /** @type {any} */ (item).requestee ??
      /** @type {any} */ (item).requestee_email ??
      /** @type {any} */ (item).requestee_name ??
      /** @type {any} */ (item).requestee_login;
    const setter =
      /** @type {any} */ (item).requester ??
      /** @type {any} */ (item).setter ??
      /** @type {any} */ (item).setter_email ??
      /** @type {any} */ (item).setter_name ??
      /** @type {any} */ (item).setter_login;
    const updatedFancy =
      /** @type {any} */ (item).updated_fancy ??
      /** @type {any} */ (item).updatedFancy;
    const updatedEpochRaw =
      /** @type {any} */ (item).updated_epoch ??
      /** @type {any} */ (item).updatedEpoch;
    const updatedEpoch =
      typeof updatedEpochRaw === "number"
        ? updatedEpochRaw
        : Number(updatedEpochRaw);

    let bug = bugsById.get(bugId);
    if (!bug) {
      bug = { id: bugId, summary, flags: [] };
      bugsById.set(bugId, bug);
    } else if (!bug.summary && summary) {
      bug.summary = summary;
    }

    bug.flags = bug.flags || [];
    bug.flags.push({
      name: String(flagName),
      status: String(status),
      requestee,
      setter,
      ...(updatedFancy ? { updatedFancy: String(updatedFancy) } : {}),
      ...(Number.isFinite(updatedEpoch) ? { updatedEpoch } : {}),
    });
  }

  return [...bugsById.values()];
}

/**
 * @param {string} endpoint
 * @param {string} baseUrl
 * @param {unknown} body
 * @param {string} apiKey
 */
async function fetchBugzillaRpc(endpoint, baseUrl, body, apiKey) {
  const url = new URL("/jsonrpc.cgi", baseUrl);

  if (isSnapshotMode()) {
    return readSnapshot(endpoint);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bugzilla-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Bugzilla RPC request failed (${response.status}): ${response.statusText}\n${text}`
    );
  }

  const json = await response.json();
  if (json.error) {
    const message =
      json.error?.message ||
      json.error?.messageText ||
      JSON.stringify(json.error, null, 2);
    throw new Error(`Bugzilla RPC error: ${message}`);
  }
  logBugzillaResponse(endpoint, json);
  persistSnapshot(endpoint, json);

  return json;
}

/**
 * @param {string} bugzillaUrl
 * @returns {string}
 */
export function normalizeBugzillaUrl(bugzillaUrl) {
  const trimmed = bugzillaUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

/**
 * @param {string} text
 */
function printHeader(text) {
  const url = new URL(text);
  console.log(color.cyan(`\n${url.host} needinfos`));
}

/**
 * Render a needinfo as a tree node grouped by bug:
 *
 *   ├─ Bug 12345 Some bug summary
 *   │  └─ from Requester Name · 3 days ago
 *   └─ Bug 67890 Another summary
 *      └─ from Someone Else
 *
 * The bug number is an OSC 8 hyperlink.
 *
 * @param {BugSearchResponse["bugs"][number]} bug
 * @param {string} baseUrl
 * @param {string} email
 * @param {boolean} isLastBug
 */
function printNeedinfo(bug, baseUrl, email, isLastBug) {
  const bugConnectors = treeConnectors(isLastBug);
  const bugLink = hyperlink(
    `${baseUrl}/show_bug.cgi?id=${bug.id}`,
    color.yellow(`Bug ${bug.id}`),
    UnderlineColor.yellow
  );
  console.log(
    color.blackBright(bugConnectors.branch) +
      bugLink +
      (bug.summary ? " " + color.whiteBright(bug.summary) : "")
  );

  const flags = (bug.flags || []).filter((flag) =>
    isNeedinfoFor(flag, email.toLowerCase())
  );
  flags.forEach((flag, index) => {
    const flagConnectors = treeConnectors(index === flags.length - 1);
    const prefix = color.blackBright(
      bugConnectors.stem + flagConnectors.branch
    );
    const requester = describeUser(flag.setter);
    const age = describeAge(flag);
    const detail = age ? `from ${requester} · ${age}` : `from ${requester}`;
    console.log(prefix + color.blackBright(detail));
  });
}

/**
 * @param {unknown} flag
 * @param {string} lowerEmail
 */
function isNeedinfoFor(flag, lowerEmail) {
  if (!flag || typeof flag !== "object") {
    return false;
  }
  const flagName = /** @type {{ name?: string }} */ (flag).name;
  const status = /** @type {{ status?: string }} */ (flag).status;
  if (flagName !== "needinfo" || status !== "?") {
    return false;
  }
  const requestee = /** @type {{ requestee?: unknown }} */ (flag).requestee;
  return matchUser(requestee, lowerEmail);
}

/**
 * @param {unknown} input
 * @param {string} lowerEmail
 */
function matchUser(input, lowerEmail) {
  if (!input) {
    return false;
  }
  if (typeof input === "string") {
    return input.toLowerCase() === lowerEmail;
  }
  if (typeof input === "object") {
    const candidate =
      /** @type {{ login?: string; name?: string; email?: string }} */ (input);
    const values = [candidate.login, candidate.name, candidate.email];
    return values.some(
      (value) => typeof value === "string" && value.toLowerCase() === lowerEmail
    );
  }
  return false;
}

/**
 * @param {unknown} input
 */
function describeUser(input) {
  if (!input) {
    return "unknown";
  }
  if (typeof input === "string") {
    return input;
  }
  if (typeof input === "object") {
    const user =
      /** @type {{ name?: string; email?: string; login?: string }} */ (input);
    return (
      user.name ||
      user.email ||
      user.login ||
      JSON.stringify(user, null, 0 /* replacer */)
    );
  }
  return String(input);
}

/**
 * @param {{ updatedFancy?: string; updatedEpoch?: number }} flag
 * @returns {string | null}
 */
function describeAge(flag) {
  if (flag.updatedFancy) {
    return flag.updatedFancy;
  }
  if (typeof flag.updatedEpoch === "number") {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const seconds = Math.max(0, nowSeconds - flag.updatedEpoch);
    const days = Math.floor(seconds / 86400);
    if (days > 0) {
      return `${days} day${days === 1 ? "" : "s"} ago`;
    }
    const hours = Math.floor(seconds / 3600);
    if (hours > 0) {
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }
    return "just now";
  }
  return null;
}

function isSnapshotMode() {
  return (
    process.env.MOZ_REVIEWS_USE_SNAPSHOTS === "1" ||
    process.env.MOZ_REVIEWS_USE_SNAPSHOTS?.toLowerCase() === "true"
  );
}

function shouldPersist() {
  return process.env.MY_REVIEWS_PERSIST === "bugzilla";
}

/**
 * @param {string} endpoint
 */
function readSnapshot(endpoint) {
  const outputPath = resolveSnapshotPath(endpoint);
  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `Snapshot not found for endpoint "${endpoint}" at ${outputPath}`
    );
  }
  const contents = fs.readFileSync(outputPath, "utf8");
  return JSON.parse(contents);
}

/**
 * @param {string} endpoint
 * @param {unknown} json
 */
function persistSnapshot(endpoint, json) {
  if (!shouldPersist()) {
    return;
  }
  const outputPath = resolveSnapshotPath(endpoint);
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));
}

/**
 * @param {string} endpoint
 * @param {unknown} response
 */
function logBugzillaResponse(endpoint, response) {
  const shouldLog =
    process.env.MY_REVIEWS_LOG === "1" ||
    process.env.MY_REVIEWS_LOG?.toLowerCase() === "true" ||
    shouldPersist();
  if (!shouldLog) {
    return;
  }
  const pretty = inspect(response, {
    depth: null,
    maxArrayLength: null,
    breakLength: 120,
  });
  console.log(`${endpoint} response`, pretty);
}

/**
 * @param {string} endpoint
 */
function sanitizeEndpoint(endpoint) {
  return endpoint.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * @param {string} endpoint
 */
function resolveSnapshotPath(endpoint) {
  const safeEndpoint = sanitizeEndpoint(endpoint);
  return path.join(SNAPSHOT_DIR, `bugzilla-${safeEndpoint}.json`);
}
