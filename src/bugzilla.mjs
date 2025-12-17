// @ts-check
import color from "cli-color";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { inspect } from "util";

export const DEFAULT_BUGZILLA_URL = "https://bugzilla.mozilla.org";

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
 *     }>;
 *   }>;
 * }} BugSearchResponse
 */

/**
 * @param {string} email
 * @param {string | undefined} bugzillaUrl
 * @returns {Promise<{ needinfos: BugSearchResponse["bugs"] }>}
 */
export async function runBugzillaNeedinfos(
  email,
  bugzillaUrl = DEFAULT_BUGZILLA_URL
) {
  if (!email) {
    throw new Error("The first argument must be your Bugzilla email.");
  }

  const baseUrl = normalizeBugzillaUrl(bugzillaUrl);
  const bugs = await fetchNeedinfoBugs(email, baseUrl);

  if (bugs.length > 0) {
    printHeader(baseUrl);
    for (const bug of bugs) {
      printNeedinfo(bug, baseUrl, email);
    }
  }

  return { needinfos: bugs };
}

/**
 * @param {string} email
 * @param {string} baseUrl
 */
async function fetchNeedinfoBugs(email, baseUrl) {
  const params = new URLSearchParams({
    include_fields: "id,summary,flags",
    f1: "requestees.login_name",
    o1: "equals",
    v1: email,
    f2: "flagtypes.name",
    o2: "equals",
    v2: "needinfo",
  });
  const response = /** @type {BugSearchResponse} */ (
    await fetchBugzilla("needinfo", baseUrl, params)
  );

  if (!response || !Array.isArray(response.bugs)) {
    throw new Error("Bugzilla response missing bug list.");
  }

  const lowerEmail = email.toLowerCase();
  const bugsWithNeedinfo = response.bugs.filter((bug) =>
    bug.flags?.some((flag) => isNeedinfoFor(flag, lowerEmail))
  );

  bugsWithNeedinfo.sort((a, b) => a.id - b.id);
  return bugsWithNeedinfo;
}

/**
 * @param {string} endpoint
 * @param {string} baseUrl
 * @param {URLSearchParams} params
 */
async function fetchBugzilla(endpoint, baseUrl, params) {
  const url = new URL("/rest/bug", baseUrl);
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }

  const safeEndpoint = sanitizeEndpoint(endpoint);
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputDir = path.resolve(dirname, "../tests/utils");
  const outputPath = path.join(outputDir, `bugzilla-${safeEndpoint}.json`);

  if (isSnapshotMode()) {
    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `Snapshot not found for endpoint "${endpoint}" at ${outputPath}`
      );
    }
    const contents = fs.readFileSync(outputPath, "utf8");
    return JSON.parse(contents);
  }

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Bugzilla request failed (${response.status}): ${response.statusText}\n${body}`
    );
  }

  const json = await response.json();
  logBugzillaResponse(endpoint, json);

  if (shouldPersist()) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));
  }

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
  console.log(
    color.cyan(
      `\n======= Bugzilla Needinfo (${url.host}) ===============================================`
    )
  );
}

/**
 * @param {BugSearchResponse["bugs"][number]} bug
 * @param {string} baseUrl
 * @param {string} email
 */
function printNeedinfo(bug, baseUrl, email) {
  console.log("");
  const gray = color.xterm(8);
  console.log(color.yellow(`Bug ${bug.id}: `) + color.whiteBright(bug.summary));
  console.log(
    gray("     url: ") +
      color.blue.underline(`${baseUrl}/show_bug.cgi?id=${bug.id}`)
  );

  for (const flag of bug.flags || []) {
    if (!isNeedinfoFor(flag, email.toLowerCase())) {
      continue;
    }
    const requester = describeUser(flag.setter);
    console.log(gray("request: ") + color.magenta("needinfo? ") + requester);
  }
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
      /** @type {{ login?: string; name?: string; email?: string }} */ (
        input
      );
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
    const user = /** @type {{ name?: string; email?: string; login?: string }} */ (
      input
    );
    return (
      user.name ||
      user.email ||
      user.login ||
      JSON.stringify(user, null, 0 /* replacer */)
    );
  }
  return String(input);
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
