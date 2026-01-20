// @ts-check
import * as fs from "fs";
import * as path from "path";
import color from "cli-color";
import { inspect } from "util";
import { fileURLToPath } from "url";
import { getPhabricatorAuth, isIgnoredPhabricator } from "./store.mjs";

/** @typedef {unknown} JsonValue */

/**
 * @template T
 * @typedef {(
 *   | { error: null; errorMessage: null; response: T }
 *   | { error: string; errorMessage: string; response: null }
 * )} Response
 */

/**
 * @template T
 * @typedef {Object} Cursor
 * @property {T[]} data
 */

/**
 * @import {Revision} from "./types.d.ts"
 */

/**
 * @template T
 * @typedef {(endpoint: string, data: JsonValue, options?: { conduitURI?: string }) => Promise<Response<T>>} CallConduit
 */

function isSnapshotMode() {
  return (
    process.env.MOZ_REVIEWS_USE_SNAPSHOTS === "1" ||
    process.env.MOZ_REVIEWS_USE_SNAPSHOTS?.toLowerCase() === "true"
  );
}

/**
 * @param {string} endpoint
 */
function sanitizeEndpoint(endpoint) {
  return endpoint.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * @param {string} endpoint
 * @param {JsonValue} data
 * @param {{ conduitURI?: string }} [options]
 * @returns {Promise<Response<any>>}
 */
const callConduit = async function (endpoint, data, options = {}) {
  const useSnapshots = isSnapshotMode();

  if (useSnapshots) {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const outputDir = path.resolve(dirname, "../tests/utils");
    const filename = `phabricator-${sanitizeEndpoint(endpoint)}.json`;
    const outputPath = path.join(outputDir, filename);
    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `Snapshot not found for endpoint "${endpoint}" at ${outputPath}`
      );
    }
    const contents = fs.readFileSync(outputPath, "utf8");
    return JSON.parse(contents);
  }

  const conduitConfig = getConduitConfig(
    options.conduitURI || "https://phabricator.services.mozilla.com/"
  );
  return await callConduitHTTP(conduitConfig, endpoint, data);
};

/**
 * @param {string} endpoint
 * @param {Response<any>} response
 */
function logPhabricatorResponse(endpoint, response) {
  const shouldPersist = process.env.MY_REVIEWS_PERSIST === "phabricator";
  const shouldLog =
    process.env.MY_REVIEWS_LOG === "1" ||
    process.env.MY_REVIEWS_LOG?.toLowerCase() === "true";
  const safeEndpoint = sanitizeEndpoint(endpoint);

  // Persist raw responses when testing flag is enabled.
  if (shouldPersist) {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const outputDir = path.resolve(dirname, "../tests/utils");
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = `phabricator-${safeEndpoint}.json`;
    const outputPath = path.join(outputDir, filename);
    const serialized = JSON.stringify(response, null, 2);
    fs.writeFileSync(outputPath, serialized);
  }

  if (shouldPersist || shouldLog) {
    const pretty = inspect(response, {
      depth: null,
      maxArrayLength: null,
      breakLength: 120,
    });
    console.log(`${endpoint} response`, pretty);
  }
}

/**
 * @param {Revision} revision
 * @returns {string | undefined}
 */
function getBugId(revision) {
  const bugId = /** @type {Record<string, unknown>} */ (revision.fields)[
    "bugzilla.bug-id"
  ];
  return typeof bugId === "string" ? bugId : undefined;
}

/**
 * @param {Revision} revision
 * @param {string} baseURI
 * @param {Map<string, string>} authorNames
 */
function printRevision(revision, baseURI, authorNames) {
  const maxStatusLength = 11;
  const statusName = revision.fields.status.name.replace(
    "Needs Review",
    "Review"
  );
  let status = statusName.padStart(maxStatusLength);
  status = statusName === "Accepted" ? color.green(status) : color.red(status);

  const authorName = authorNames.get(revision.fields.authorPHID) || "Unknown";
  const author = color.cyan(`@${authorName}`);

  console.log(`${status} - ${revision.fields.title}`);

  const indent = "".padStart(maxStatusLength + 2);
  const url = color.blackBright.underline(`${baseURI}D${revision.id}`);

  console.log(`${indent} ${url} ${author}`);
}

/**
 * @param {Revision} revision
 */
function printBug(revision) {
  const bugId = getBugId(revision);
  if (!bugId) {
    const bugLabel = color.yellow(`No Bug`);
    console.log(`\n${bugLabel}\n`);
    return;
  }
  const bugLabel = color.yellow(`Bug ${bugId}`);
  const url = color.blue.underline(
    `https://bugzilla.mozilla.org/show_bug.cgi?id=${bugId}`
  );
  console.log(`\n${bugLabel} - ${url}\n`);
}

/**
 * @param {Revision[]} revisions
 * @param {string} baseURI
 * @param {Map<string, string>} authorNames
 */
function printRevisionList(revisions, baseURI, authorNames) {
  let prevBug = null;
  for (const revision of revisions) {
    const thisBug = getBugId(revision) || "no bug";
    if (prevBug !== thisBug) {
      printBug(revision);
    }
    prevBug = thisBug;
    printRevision(revision, baseURI, authorNames);
  }
}

/**
 * @param {string} text
 */
function printHeader(text) {
  console.log(
    color.cyan(
      `\n======= Phabricator ${text} =====================================================`
    )
  );
}

/**
 * @param {string} conduitURI
 * @param {string} userId
 * @returns {Promise<{ mine: Revision[]; others: Revision[] }>}
 */
export async function runPhabricatorReviews(conduitURI, userId) {
  if (!conduitURI) {
    throw new Error(
      "The first argument must be the Phabricator Conduit URI."
    );
  }

  if (!userId) {
    throw new Error(
      "The second argument must be the PHID of the user running the command."
    );
  }

  ensureConduitConfig(conduitURI);
  const baseURI = normalizeBaseURI(conduitURI);

  const response = /** @type {Response<Cursor<Revision>>} */ (
    await callConduit(
      "differential.revision.search",
      {
        queryKey: "active",
        attachments: {
          reviewers: true,
        },
      },
      { conduitURI }
    )
  );

  logPhabricatorResponse("differential.revision.search", response);

  if (response.error || response.response === null) {
    throw new Error(response.errorMessage);
  }

  // Filter out the ignored Phabricator reviews.
  const data = response.response.data.filter((revision) => {
    const bugId = getBugId(revision);
    return !isIgnoredPhabricator(String(revision.id), bugId);
  });

  // Sort them by Bug IDs so that diffs will be correctly grouped.
  data.sort((a, b) => {
    const bugA = Number(getBugId(a) || 0);
    const bugB = Number(getBugId(b) || 0);
    return bugA - bugB;
  });

  // Collect all unique author PHIDs to fetch usernames
  const authorPHIDs = [...new Set(data.map((r) => r.fields.authorPHID))];
  const authorNames = await getUsernames(conduitURI, authorPHIDs);

  // Get any reviews that aren't marked as WIP that are "mine".
  const mine = data.filter((revision) => {
    const { title, authorPHID } = revision.fields;
    if (userId !== authorPHID) {
      return false;
    }
    if (!title) {
      return true;
    }
    return !title.match(/\bWIP\b/);
  });

  if (mine.length > 0) {
    printHeader("Mine");
    printRevisionList(mine, baseURI, authorNames);
  }

  const userProjects = await getUserProjects(conduitURI, userId);

  const others = data.filter((revision) => {
    if (userId === revision.fields.authorPHID) {
      return false;
    }
    if (revision.fields.status.value !== "needs-review") {
      return false;
    }
    const reviewers =
      /** @type {{ reviewerPHID: string; status: string }[]} */ (
        revision.attachments?.reviewers?.reviewers || []
      );
    const actionableStatuses = new Set(["added", "blocking", "rejected"]);
    const actionableReviewers = reviewers.filter((reviewer) =>
      actionableStatuses.has(reviewer.status)
    );
    return actionableReviewers.some(
      (reviewer) =>
        reviewer.reviewerPHID === userId ||
        userProjects.has(reviewer.reviewerPHID)
    );
  });

  if (others.length > 0) {
    printHeader("Others");
    printRevisionList(others, baseURI, authorNames);
  }

  return { mine, others };
}

/**
 * @param {string} conduitURI
 * @returns {Promise<{ phid: string; userName: string }>}
 */
export async function getPhabricatorUser(conduitURI) {
  if (!conduitURI) {
    throw new Error(
      "The first argument must be the Phabricator Conduit URI."
    );
  }

  ensureConduitConfig(conduitURI);

  const response = /** @type {Response<{ phid: string; userName: string }>} */ (
    await callConduit(
      "user.whoami",
      {},
      {
        conduitURI,
      }
    )
  );

  logPhabricatorResponse("user.whoami", response);

  if (response.error || response.response === null) {
    throw new Error(response.errorMessage);
  }

  return response.response;
}

/**
 * @param {string} conduitURI
 */
function ensureConduitConfig(conduitURI) {
  if (isSnapshotMode()) {
    return;
  }
  getConduitConfig(conduitURI);
}

/**
 * @param {string} conduitURI
 * @returns {{ conduitURI: string; token: string | null }}
 */
function getConduitConfig(conduitURI) {
  if (!conduitURI) {
    throw new Error("The Phabricator Conduit URI is required.");
  }
  const auth = getPhabricatorAuth();
  const normalized = normalizeConduitURI(conduitURI);
  const token =
    auth && normalizeConduitURI(auth.uri) === normalized ? auth.token : null;

  return { conduitURI, token };
}
/**
 * @param {string} value
 * @returns {string}
 */
function normalizeConduitURI(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeBaseURI(value) {
  const normalized = normalizeConduitURI(value);
  if (normalized.endsWith("/api/")) {
    return normalized.slice(0, -"/api/".length) + "/";
  }
  return normalized;
}

/**
 * @param {{ conduitURI: string; token: string | null }} conduitConfig
 * @param {string} endpoint
 * @param {JsonValue} data
 * @returns {Promise<Response<any>>}
 */
async function callConduitHTTP(conduitConfig, endpoint, data) {
  const { conduitURI, token } = conduitConfig;
  if (!token) {
    throw new Error(
      "Missing Phabricator API token. Run `my-reviews phabricator <username> [url]` to set it."
    );
  }

  const payload = /** @type {Record<string, unknown>} */ (
    typeof data === "object" && data !== null ? { ...data } : {}
  );

  const conduitMeta = /** @type {Record<string, unknown>} */ (
    typeof payload.__conduit__ === "object" && payload.__conduit__ !== null
      ? payload.__conduit__
      : {}
  );
  conduitMeta.token = token;
  payload.__conduit__ = conduitMeta;

  const body = new URLSearchParams();
  body.set("params", JSON.stringify(payload));
  body.set("output", "json");
  body.set("__conduit__", "true");

  const url = new URL(`/api/${endpoint}`, normalizeConduitURI(conduitURI));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Conduit request failed (${response.status} ${response.statusText})`
    );
  }

  const rawBody = await response.text();
  const shield = "for(;;);";
  const jsonBody = rawBody.startsWith(shield)
    ? rawBody.slice(shield.length)
    : rawBody;

  /** @type {{ error_code: string | null; error_info: string | null; result: any }} */
  const parsed = JSON.parse(jsonBody);
  if (parsed.error_code) {
    return {
      error: parsed.error_code,
      errorMessage: parsed.error_info || "Unknown Conduit error",
      response: null,
    };
  }

  return {
    error: null,
    errorMessage: null,
    response: parsed.result,
  };
}

/**
 * Look up project PHIDs the user belongs to so we can match reviewer groups.
 * @param {string} conduitURI
 * @param {string} userId
 * @returns {Promise<Set<string>>}
 */
async function getUserProjects(conduitURI, userId) {
  const response = /** @type {Response<Cursor<{ phid: string }>>} */ (
    await callConduit(
      "project.search",
      {
        constraints: {
          members: [userId],
        },
        limit: 100,
      },
      { conduitURI }
    )
  );

  logPhabricatorResponse("project.search", response);

  if (response.error || response.response === null) {
    throw new Error(response.errorMessage);
  }

  const set = new Set();
  for (const project of response.response.data) {
    set.add(project.phid);
  }
  return set;
}

/**
 * Look up usernames for a list of PHIDs.
 * @param {string} conduitURI
 * @param {string[]} phids
 * @returns {Promise<Map<string, string>>}
 */
async function getUsernames(conduitURI, phids) {
  if (phids.length === 0) {
    return new Map();
  }

  const response = /** @type {Response<Cursor<{ phid: string; fields: { username: string } }>>} */ (
    await callConduit(
      "user.search",
      {
        constraints: {
          phids: phids,
        },
      },
      { conduitURI }
    )
  );

  logPhabricatorResponse("user.search", response);

  if (response.error || response.response === null) {
    throw new Error(response.errorMessage);
  }

  const map = new Map();
  for (const user of response.response.data) {
    map.set(user.phid, user.fields.username);
  }
  return map;
}
