// @ts-check
import * as fs from "fs";
import * as path from "path";
import color from "cli-color";
import { inspect } from "util";
import { fileURLToPath } from "url";
import {
  getPhabricatorAuth,
  isIgnoredPhabricator,
  getCachedPhabricatorUsernames,
  cachePhabricatorUsernames,
} from "./store.mjs";
import { hyperlink, treeConnectors, UnderlineColor } from "./terminal.mjs";

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
 * Strip the trailing reviewer tag(s) (e.g. " r?#foo,bar" or " r=baz") from a
 * revision title, along with the leading "Bug XXXXX - " prefix.
 *
 * @param {string} rawTitle
 * @returns {string}
 */
function cleanTitle(rawTitle) {
  return rawTitle
    .replace(/^Bug \d+\s*-\s*/, "")
    .replace(/\s+r[?=]\S+(?:\s+r[?=]\S+)*\s*$/, "");
}

/**
 * Group revisions by their bug id, preserving the (already sorted) order in
 * which the bugs first appear.
 *
 * @param {Revision[]} revisions
 * @returns {Array<{ bugId: string | undefined; revisions: Revision[] }>}
 */
function groupByBug(revisions) {
  /** @type {Map<string, { bugId: string | undefined; revisions: Revision[] }>} */
  const groups = new Map();
  for (const revision of revisions) {
    const bugId = getBugId(revision);
    const key = bugId ?? "no-bug";
    let group = groups.get(key);
    if (!group) {
      group = { bugId, revisions: [] };
      groups.set(key, group);
    }
    group.revisions.push(revision);
  }
  return [...groups.values()];
}

/**
 * Render revisions as a tree grouped by bug:
 *
 *   ├─ Bug 123456
 *   │  ├─ D111    Accepted @author Some revision title
 *   │  └─ D222      Review @author Another revision title
 *   └─ Bug 234567
 *      └─ D333      Review @author Yet another title
 *
 * The bug number and each diff id are OSC 8 hyperlinks.
 *
 * The diff id is the primary target, so it gets the bright color while the bug
 * number is dimmed. Columns are left-aligned and padded so titles line up.
 *
 * @param {Revision[]} revisions
 * @param {string} baseURI
 * @param {Map<string, string>} authorNames
 * @param {boolean} showAuthor When false (e.g. the "Mine" section) the author
 *   column is omitted since it is implied by the header.
 */
function printRevisionList(revisions, baseURI, authorNames, showAuthor) {
  const groups = groupByBug(revisions);

  const statusOf = (/** @type {Revision} */ r) =>
    r.fields.status.name.replace("Needs Review", "Review");
  const authorOf = (/** @type {Revision} */ r) =>
    `@${authorNames.get(r.fields.authorPHID) || "Unknown"}`;

  // Pad each column to its widest entry so titles line up.
  const diffWidth = Math.max(...revisions.map((r) => `D${r.id}`.length));
  const statusWidth = Math.max(...revisions.map((r) => statusOf(r).length));
  const authorWidth = showAuthor
    ? Math.max(...revisions.map((r) => authorOf(r).length))
    : 0;

  groups.forEach((group, groupIndex) => {
    const isLastBug = groupIndex === groups.length - 1;
    const bug = treeConnectors(isLastBug);

    const bugLabel = group.bugId
      ? hyperlink(
          `https://bugzilla.mozilla.org/show_bug.cgi?id=${group.bugId}`,
          color.blackBright(`Bug ${group.bugId}`),
          UnderlineColor.gray
        )
      : color.blackBright("No Bug");
    console.log(color.blackBright(bug.branch) + bugLabel);

    group.revisions.forEach((revision, revisionIndex) => {
      const isLastRev = revisionIndex === group.revisions.length - 1;
      const rev = treeConnectors(isLastRev);
      const prefix = color.blackBright(bug.stem + rev.branch);

      // The diff id and its status read as one scannable unit: a single
      // hyperlink to the diff, colored by the review status.
      const diffText = `D${revision.id}`;
      const statusName = statusOf(revision);
      const label = `${diffText.padEnd(diffWidth)} ${statusName}`;
      const paint = statusName === "Accepted" ? color.green : color.red;
      const underline =
        statusName === "Accepted" ? UnderlineColor.green : UnderlineColor.red;
      // Keep the right-hand alignment padding outside the hyperlink.
      const unit =
        hyperlink(`${baseURI}${diffText}`, paint(label), underline) +
        " ".repeat(statusWidth - statusName.length);

      const cells = [unit];
      if (showAuthor) {
        cells.push(color.cyan(authorOf(revision).padEnd(authorWidth)));
      }
      cells.push(cleanTitle(revision.fields.title));

      console.log(prefix + cells.join(" "));
    });
  });
}

/**
 * @param {string} text
 */
function printHeader(text) {
  console.log(color.cyan(`\nPhabricator ${text}`));
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

  // Collect all unique author PHIDs to fetch usernames. Include our own PHID so
  // the reviewer section headers can use our username.
  const authorPHIDs = [
    ...new Set([...data.map((r) => r.fields.authorPHID), userId]),
  ];
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
    const meName = authorNames.get(userId) || "me";
    printHeader(`author: @${meName}`);
    printRevisionList(mine, baseURI, authorNames, false /* showAuthor */);
  }

  const { groupPhids, groupMembers, groupSlugs } = await getUserProjects(
    conduitURI,
    userId
  );

  // Classify each review request into exactly one bucket:
  //   - the individual bucket, keyed by INDIVIDUAL, when we are personally a
  //     requested reviewer (highest signal), or
  //   - a group bucket, keyed by the winning group's PHID, when we are only on
  //     the review via review group(s) we belong to.
  const INDIVIDUAL = "__individual__";
  /** @type {Map<string, Revision[]>} */
  const buckets = new Map();
  const pushToBucket = (/** @type {string} */ key, /** @type {Revision} */ revision) => {
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(revision);
  };

  for (const revision of data) {
    if (userId === revision.fields.authorPHID) {
      continue;
    }
    if (revision.fields.status.value !== "needs-review") {
      continue;
    }
    const reviewers =
      /** @type {{ reviewerPHID: string; status: string }[]} */ (
        revision.attachments?.reviewers?.reviewers || []
      );
    const actionableStatuses = new Set(["added", "blocking", "rejected"]);
    const actionableReviewers = reviewers.filter((reviewer) =>
      actionableStatuses.has(reviewer.status)
    );

    // Being personally requested always wins over any group.
    if (actionableReviewers.some((r) => r.reviewerPHID === userId)) {
      pushToBucket(INDIVIDUAL, revision);
      continue;
    }

    const matchingGroups = actionableReviewers
      .filter((r) => groupPhids.has(r.reviewerPHID))
      .map((r) => r.reviewerPHID);

    if (matchingGroups.length === 0) {
      continue;
    }

    // If another group member is already individually assigned, skip this revision.
    const individualPhids = actionableReviewers
      .filter((r) => r.reviewerPHID !== userId && !groupPhids.has(r.reviewerPHID))
      .map((r) => r.reviewerPHID);

    const suppressed = matchingGroups.some((groupPhid) => {
      const members = groupMembers.get(groupPhid) ?? new Set();
      return individualPhids.some((phid) => members.has(phid));
    });
    if (suppressed) {
      continue;
    }

    // Multiple of our groups can be on the same review. Pick a single winner so
    // the revision only appears once: the smallest (most specialized) group,
    // breaking ties alphabetically by slug.
    const winner = matchingGroups.slice().sort((a, b) => {
      const sizeA = (groupMembers.get(a) ?? new Set()).size;
      const sizeB = (groupMembers.get(b) ?? new Set()).size;
      if (sizeA !== sizeB) {
        return sizeA - sizeB;
      }
      return (groupSlugs.get(a) ?? "").localeCompare(groupSlugs.get(b) ?? "");
    })[0];

    pushToBucket(winner, revision);
  }

  // Print the individual bucket first (highest signal), then group buckets
  // ordered alphabetically by slug.
  const individual = buckets.get(INDIVIDUAL) ?? [];
  if (individual.length > 0) {
    const meName = authorNames.get(userId) || "me";
    printHeader(`reviewer: @${meName}`);
    printRevisionList(individual, baseURI, authorNames, true /* showAuthor */);
  }

  const groupKeys = [...buckets.keys()]
    .filter((key) => key !== INDIVIDUAL)
    .sort((a, b) =>
      (groupSlugs.get(a) ?? "").localeCompare(groupSlugs.get(b) ?? "")
    );

  for (const groupPhid of groupKeys) {
    const revisions = buckets.get(groupPhid) ?? [];
    printHeader(`reviewer: #${groupSlugs.get(groupPhid) ?? groupPhid}`);
    printRevisionList(revisions, baseURI, authorNames, true /* showAuthor */);
  }

  // Preserve the previous return shape: every non-authored review request.
  const others = [
    ...individual,
    ...groupKeys.flatMap((key) => buckets.get(key) ?? []),
  ];

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
 * Look up project PHIDs the user belongs to, plus the member lists and slug
 * (hashtag) for each group.
 * @param {string} conduitURI
 * @param {string} userId
 * @returns {Promise<{ groupPhids: Set<string>; groupMembers: Map<string, Set<string>>; groupSlugs: Map<string, string> }>}
 */
async function getUserProjects(conduitURI, userId) {
  const response = /** @type {Response<Cursor<{ phid: string; fields: { slug: string; name: string }; attachments: { members: { members: { phid: string }[] } } }>>} */ (
    await callConduit(
      "project.search",
      {
        constraints: {
          members: [userId],
        },
        attachments: {
          members: true,
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

  const groupPhids = new Set();
  const groupMembers = new Map();
  const groupSlugs = new Map();
  for (const project of response.response.data) {
    groupPhids.add(project.phid);
    const members = project.attachments?.members?.members ?? [];
    groupMembers.set(project.phid, new Set(members.map((m) => m.phid)));
    groupSlugs.set(project.phid, project.fields?.slug || project.fields?.name || project.phid);
  }
  return { groupPhids, groupMembers, groupSlugs };
}

/**
 * Look up usernames for a list of PHIDs, using cache when available.
 * @param {string} conduitURI
 * @param {string[]} phids
 * @returns {Promise<Map<string, string>>}
 */
async function getUsernames(conduitURI, phids) {
  if (phids.length === 0) {
    return new Map();
  }

  // Check cache first
  const { cached, uncached } = getCachedPhabricatorUsernames(phids);

  // If all usernames are cached, return early
  if (uncached.length === 0) {
    return cached;
  }

  // Fetch uncached usernames
  const response = /** @type {Response<Cursor<{ phid: string; fields: { username: string } }>>} */ (
    await callConduit(
      "user.search",
      {
        constraints: {
          phids: uncached,
        },
      },
      { conduitURI }
    )
  );

  logPhabricatorResponse("user.search", response);

  if (response.error || response.response === null) {
    throw new Error(response.errorMessage);
  }

  // Combine cached and newly fetched usernames
  const freshlyFetched = new Map();
  for (const user of response.response.data) {
    freshlyFetched.set(user.phid, user.fields.username);
  }

  // Cache the newly fetched usernames
  cachePhabricatorUsernames(freshlyFetched);

  // Merge cached and freshly fetched
  const result = new Map(cached);
  for (const [phid, username] of freshlyFetched.entries()) {
    result.set(phid, username);
  }

  return result;
}
