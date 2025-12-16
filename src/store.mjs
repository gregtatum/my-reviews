// @ts-check
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const storagePath = path.join(os.homedir(), ".my-reviews.json");
/**
 * @import {Store, IgnoreTarget, GithubConfig, PhabricatorConfig} from "./types.d.ts"
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

  cachedStore = {
    ignored: { github: [], phabricator: [] },
    github: [],
    phabricator: [],
  };
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
      github: store.ignored.github.filter(isString),
      phabricator: store.ignored.phabricator.filter(isString),
    },
    github: (store.github || []).filter(isGithubConfig),
    phabricator: (store.phabricator || []).filter(isPhabricatorConfig),
  };
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is GithubConfig}
 */
function isGithubConfig(value) {
  return (
    !!value &&
    typeof value === "object" &&
    typeof /** @type {any} */ (value).owner === "string" &&
    typeof /** @type {any} */ (value).repo === "string" &&
    typeof /** @type {any} */ (value).user === "string"
  );
}

/**
 * @param {unknown} value
 * @returns {value is PhabricatorConfig}
 */
function isPhabricatorConfig(value) {
  return (
    !!value &&
    typeof value === "object" &&
    typeof /** @type {any} */ (value).geckoDir === "string" &&
    typeof /** @type {any} */ (value).userId === "string"
  );
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
 * @param {string} input
 * @returns {{ description: string; removed: boolean }}
 */
export function removeIgnoredTarget(input) {
  const parsed = parseIgnoreTarget(input);
  if (!parsed) {
    throw new Error(
      "Could not understand what to delete. Pass a Phabricator URL or ID (e.g. D123), Bug number or URL (e.g. Bug 123), or a GitHub pull request URL or owner/repo#123."
    );
  }

  const store = loadStore();
  const { key, bucket } = getIgnoreEntry(parsed);
  const before = store.ignored[bucket].length;
  store.ignored[bucket] = store.ignored[bucket].filter((item) => item !== key);
  const removed = store.ignored[bucket].length !== before;
  if (removed) {
    saveStore(store);
  }

  const description = describeTarget(parsed);
  return { description, removed };
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} user
 * @returns {{ added: boolean; config: GithubConfig }}
 */
export function addGithubConfig(owner, repo, user) {
  if (!owner || !repo || !user) {
    throw new Error(
      "GitHub configuration requires the owner, repo, and GitHub username."
    );
  }
  const store = loadStore();
  const normalized = { owner, repo, user };
  const existing = store.github.some(
    (item /** @type {GithubConfig} */) =>
      item.owner === normalized.owner &&
      item.repo === normalized.repo &&
      item.user === normalized.user
  );
  if (!existing) {
    store.github = [...store.github, normalized];
    saveStore(store);
  }
  return { added: !existing, config: normalized };
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} user
 * @returns {{ removed: boolean; config: GithubConfig }}
 */
export function removeGithubConfig(owner, repo, user) {
  if (!owner || !repo || !user) {
    throw new Error(
      "GitHub configuration delete requires the owner, repo, and GitHub username."
    );
  }
  const store = loadStore();
  const normalized = { owner, repo, user };
  const before = store.github.length;
  store.github = store.github.filter(
    (item /** @type {GithubConfig} */) =>
      item.owner !== normalized.owner ||
      item.repo !== normalized.repo ||
      item.user !== normalized.user
  );
  const removed = store.github.length !== before;
  if (removed) {
    saveStore(store);
  }
  return { removed, config: normalized };
}

/**
 * @param {string} geckoDir
 * @param {string} userId
 * @returns {{ added: boolean; config: PhabricatorConfig }}
 */
export function addPhabricatorConfig(geckoDir, userId) {
  if (!geckoDir || !userId) {
    throw new Error(
      "Phabricator configuration requires the path to Gecko and your Phabricator user PHID."
    );
  }
  const store = loadStore();
  const normalized = { geckoDir, userId };
  const existing = store.phabricator.some(
    (item /** @type {PhabricatorConfig} */) =>
      item.geckoDir === geckoDir && item.userId === userId
  );
  if (!existing) {
    store.phabricator = [...store.phabricator, normalized];
    saveStore(store);
  }
  return { added: !existing, config: normalized };
}

/**
 * @param {string} geckoDir
 * @returns {{ removed: boolean; geckoDir: string }}
 */
export function removePhabricatorConfig(geckoDir) {
  if (!geckoDir) {
    throw new Error(
      "Phabricator configuration delete requires the path to Gecko that was saved."
    );
  }
  const store = loadStore();
  const before = store.phabricator.length;
  store.phabricator = store.phabricator.filter(
    (item /** @type {PhabricatorConfig} */) => item.geckoDir !== geckoDir
  );
  const removed = store.phabricator.length !== before;
  if (removed) {
    saveStore(store);
  }
  return { removed, geckoDir };
}

/**
 * @returns {Pick<Store, "github" | "phabricator">}
 */
export function getSavedConfigs() {
  const store = loadStore();
  return { github: store.github, phabricator: store.phabricator };
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
