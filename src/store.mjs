// @ts-check
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const storagePath = path.join(os.homedir(), ".my-reviews.json");
/**
 * @import {Store, IgnoreTarget} from "./types"
 */

/** @type {Store | null} */
let cachedStore = null;

/** @returns {Store} */
function loadStore() {
  if (cachedStore) {
    return cachedStore;
  }

  try {
    const raw = fs.readFileSync(storagePath, "utf8");
    const parsed = JSON.parse(raw);
    if (isValidStore(parsed)) {
      cachedStore = normalizeStore(parsed);
      return cachedStore;
    }
  } catch (error) {
    // Missing file or invalid JSON will fall through to default store.
  }

  cachedStore = { ignored: { github: [], phabricator: [] } };
  return cachedStore;
}

/**
 * @param {Store} store
 */
function saveStore(store) {
  cachedStore = store;
  const content = JSON.stringify(store, null, 2);
  fs.writeFileSync(storagePath, `${content}\n`, "utf8");
}

/**
 * @param {unknown} value
 * @returns {value is Store}
 */
function isValidStore(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ignored = /** @type {any} */ (value).ignored;
  return (
    ignored &&
    Array.isArray(ignored.github) &&
    Array.isArray(ignored.phabricator)
  );
}

/**
 * @param {Store} store
 * @returns {Store}
 */
function normalizeStore(store) {
  return {
    ignored: {
      github: store.ignored.github.filter((item) => typeof item === "string"),
      phabricator: store.ignored.phabricator.filter(
        (item) => typeof item === "string"
      ),
    },
  };
}

/**
 * @param {string} input
 * @returns {IgnoreTarget | null}
 */
function parseIgnoreTarget(input) {
  const target = input.trim();
  if (!target) {
    return null;
  }

  const phabUrlMatch = target.match(
    /phabricator\.services\.mozilla\.com\/D(\d+)/i
  );
  if (phabUrlMatch) {
    return { type: "phabricator", id: phabUrlMatch[1] };
  }

  const phabIdMatch = target.match(/^D(\d+)$/i);
  if (phabIdMatch) {
    return { type: "phabricator", id: phabIdMatch[1] };
  }

  const bugzillaUrlMatch = target.match(
    /bugzilla\.mozilla\.org\/show_bug\.cgi\?id=(\d+)/i
  );
  if (bugzillaUrlMatch) {
    return { type: "bug", id: bugzillaUrlMatch[1] };
  }

  const bugPrefixMatch = target.match(/^bug\s+(\d+)/i);
  if (bugPrefixMatch) {
    return { type: "bug", id: bugPrefixMatch[1] };
  }

  const githubUrlMatch = target.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i
  );
  if (githubUrlMatch) {
    const [, owner, repo, number] = githubUrlMatch;
    return { type: "github", owner, repo, number };
  }

  const githubShortMatch = target.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/i);
  if (githubShortMatch) {
    const [, owner, repo, number] = githubShortMatch;
    return { type: "github", owner, repo, number };
  }

  return null;
}

/**
 * @param {string} phabricatorId
 * @param {string | undefined} bugId
 * @returns {boolean}
 */
export function isIgnoredPhabricator(phabricatorId, bugId) {
  const store = loadStore();
  const key = `D${String(phabricatorId).replace(/^D/i, "")}`;
  const bugKey = bugId ? `Bug ${bugId}` : null;
  return (
    store.ignored.phabricator.includes(key) ||
    (!!bugKey && store.ignored.phabricator.includes(bugKey))
  );
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @returns {boolean}
 */
export function isIgnoredGithub(owner, repo, pullNumber) {
  const store = loadStore();
  const key = `${owner}/${repo}#${pullNumber}`;
  return store.ignored.github.includes(key);
}

/**
 * @param {string} input
 * @returns {{ description: string; alreadyIgnored: boolean }}
 */
export function addIgnoredTarget(input) {
  const parsed = parseIgnoreTarget(input);
  if (!parsed) {
    throw new Error(
      "Could not understand what to ignore. Pass a Phabricator URL or ID (e.g. D123), Bug number or URL (e.g. Bug 123), or a GitHub pull request URL or owner/repo#123."
    );
  }

  const store = loadStore();
  const { key, bucket } = getIgnoreEntry(parsed);
  const existing = new Set(store.ignored[bucket]);
  const alreadyIgnored = existing.has(key);
  if (!alreadyIgnored) {
    existing.add(key);
    store.ignored[bucket] = Array.from(existing);
    saveStore(store);
  }

  const description = describeTarget(parsed);
  return { description, alreadyIgnored };
}

/**
 * @param {IgnoreTarget} target
 */
function getIgnoreEntry(target) {
  if (target.type === "phabricator") {
    return {
      bucket: /** @type {const} */ ("phabricator"),
      key: `D${target.id}`,
    };
  }
  if (target.type === "bug") {
    return {
      bucket: /** @type {const} */ ("phabricator"),
      key: `Bug ${target.id}`,
    };
  }
  return {
    bucket: /** @type {const} */ ("github"),
    key: `${target.owner}/${target.repo}#${target.number}`,
  };
}

/**
 * @param {IgnoreTarget} target
 */
function describeTarget(target) {
  if (target.type === "phabricator") {
    return `Phabricator D${target.id}`;
  }
  if (target.type === "bug") {
    return `Bug ${target.id}`;
  }
  return `GitHub ${target.owner}/${target.repo}#${target.number}`;
}
