// @ts-check
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DEFAULT_BUGZILLA_URL, normalizeBugzillaUrl } from "./bugzilla.mjs";

let storagePath = resolveStoragePath();
/**
 * @import {
 *   Store,
 *   IgnoreTarget,
 *   GithubConfig,
 *   PhabricatorConfig,
 *   PhabricatorAuth,
 *   BugzillaConfig,
 *   BugzillaAuth,
 * } from "./types.d.ts"
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
    bugzilla: [],
    github: [],
    phabricator: [],
    bugzillaAuth: [],
    phabricatorAuth: null,
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
  const rawBugzilla = Array.isArray(store.bugzilla) ? store.bugzilla : [];
  const bugzillaAuth = normalizeBugzillaAuthStore(
    store.bugzillaAuth,
    rawBugzilla
  );

  return {
    ignored: {
      github: store.ignored.github.filter(isString),
      phabricator: store.ignored.phabricator.filter(isString),
    },
    bugzilla: rawBugzilla
      .filter(isBugzillaConfig)
      .map(normalizeBugzillaConfig),
    github: (store.github || []).filter(isGithubConfig),
    phabricator: (store.phabricator || []).filter(isPhabricatorConfig),
    bugzillaAuth,
    phabricatorAuth: isPhabricatorAuth(store.phabricatorAuth)
      ? store.phabricatorAuth
      : null,
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
 * Override the default storage path (used for tests).
 * @param {string} newPath
 */
export function setStorePath(newPath) {
  storagePath = path.resolve(newPath);
  cachedStore = null;
}

function resolveStoragePath() {
  const override = process.env.MY_REVIEWS_STORE_PATH;
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".my-reviews.json");
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
    typeof /** @type {any} */ (value).uri === "string" &&
    typeof /** @type {any} */ (value).userId === "string" &&
    typeof /** @type {any} */ (value).userName === "string"
  );
}

/**
 * @param {unknown} value
 * @returns {value is PhabricatorAuth}
 */
function isPhabricatorAuth(value) {
  return (
    !!value &&
    typeof value === "object" &&
    typeof /** @type {any} */ (value).uri === "string" &&
    typeof /** @type {any} */ (value).token === "string"
  );
}

/**
 * @param {unknown} value
 * @returns {value is BugzillaConfig}
 */
function isBugzillaConfig(value) {
  return (
    !!value &&
    typeof value === "object" &&
    typeof /** @type {any} */ (value).email === "string" &&
    typeof /** @type {any} */ (value).url === "string"
  );
}

/**
 * @param {unknown} value
 * @returns {value is BugzillaAuth}
 */
function isBugzillaAuth(value) {
  return (
    !!value &&
    typeof value === "object" &&
    typeof /** @type {any} */ (value).email === "string" &&
    typeof /** @type {any} */ (value).url === "string" &&
    typeof /** @type {any} */ (value).apiKey === "string"
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
 * @param {string} uri
 * @param {string} userId
 * @param {string} userName
 * @returns {{ added: boolean; config: PhabricatorConfig }}
 */
export function addPhabricatorConfig(uri, userId, userName) {
  if (!uri || !userId || !userName) {
    throw new Error(
      "Phabricator configuration requires a Conduit URI and your Phabricator user PHID."
    );
  }
  const store = loadStore();
  const normalized = { uri, userId, userName };
  const existing = store.phabricator.some(
    (item /** @type {PhabricatorConfig} */) =>
      item.uri === uri && item.userId === userId
  );
  if (!existing) {
    store.phabricator = [...store.phabricator, normalized];
    saveStore(store);
  }
  return { added: !existing, config: normalized };
}

/**
 * @param {string} userName
 * @param {string | undefined} uri
 * @returns {{ removed: boolean; userName: string }}
 */
export function removePhabricatorConfig(userName, uri) {
  if (!userName) {
    throw new Error(
      "Phabricator configuration delete requires the saved username."
    );
  }
  const store = loadStore();
  const before = store.phabricator.length;
  store.phabricator = store.phabricator.filter(
    (item /** @type {PhabricatorConfig} */) =>
      item.userName !== userName || (uri ? item.uri !== uri : false)
  );
  const removed = store.phabricator.length !== before;
  if (removed) {
    saveStore(store);
  }
  return { removed, userName };
}

/**
 * @returns {PhabricatorAuth | null}
 */
export function getPhabricatorAuth() {
  const store = loadStore();
  return store.phabricatorAuth || null;
}

/**
 * @param {PhabricatorAuth} auth
 */
export function setPhabricatorAuth(auth) {
  if (!auth || !auth.uri || !auth.token) {
    throw new Error(
      "Phabricator auth requires a Conduit URI and an API token."
    );
  }
  const store = loadStore();
  store.phabricatorAuth = auth;
  saveStore(store);
}

/**
 * @param {string} email
 * @param {string} url
 * @returns {{ added: boolean; updated: boolean; config: BugzillaConfig }}
 */
export function addBugzillaConfig(email, url) {
  if (!email) {
    throw new Error("Bugzilla configuration requires an email address.");
  }
  const store = loadStore();
  const normalizedUrl = normalizeBugzillaUrl(url || DEFAULT_BUGZILLA_URL);
  const existingIndex = store.bugzilla.findIndex(
    (item /** @type {BugzillaConfig} */) =>
      item.email === email && item.url === normalizedUrl
  );
  const config = {
    email,
    url: normalizedUrl,
  };

  if (existingIndex === -1) {
    store.bugzilla = [...store.bugzilla, config];
    saveStore(store);
    return { added: true, updated: false, config };
  }

  return { added: false, updated: false, config };
}

/**
 * @param {string} email
 * @param {string} url
 * @returns {{ removed: boolean; config: BugzillaConfig }}
 */
export function removeBugzillaConfig(email, url) {
  if (!email) {
    throw new Error(
      "Bugzilla configuration delete requires the email address that was saved."
    );
  }
  const normalized = {
    email,
    url: normalizeBugzillaUrl(url || DEFAULT_BUGZILLA_URL),
  };
  const store = loadStore();
  const before = store.bugzilla.length;
  store.bugzilla = store.bugzilla.filter(
    (item /** @type {BugzillaConfig} */) =>
      item.email !== normalized.email || item.url !== normalized.url
  );
  const removed = store.bugzilla.length !== before;
  if (removed) {
    saveStore(store);
  }
  return { removed, config: normalized };
}

/**
 * @param {BugzillaConfig} config
 * @returns {BugzillaConfig}
 */
function normalizeBugzillaConfig(config) {
  return {
    email: config.email,
    url: normalizeBugzillaUrl(config.url || DEFAULT_BUGZILLA_URL),
  };
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function normalizeApiKey(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * @param {string} email
 * @param {string} url
 * @returns {BugzillaAuth | null}
 */
export function getBugzillaAuth(email, url) {
  if (!email) {
    return null;
  }
  const store = loadStore();
  const normalizedUrl = normalizeBugzillaUrl(url || DEFAULT_BUGZILLA_URL);
  const auth = store.bugzillaAuth?.find(
    (item) => item.email === email && item.url === normalizedUrl
  );
  return auth || null;
}

/**
 * @param {BugzillaAuth} auth
 * @returns {{ added: boolean; updated: boolean; auth: BugzillaAuth }}
 */
export function setBugzillaAuth(auth) {
  const apiKey = normalizeApiKey(auth?.apiKey);
  if (!auth || !auth.email || !auth.url || !apiKey) {
    throw new Error("Bugzilla auth requires an email, URL, and API key.");
  }
  const store = loadStore();
  const normalizedAuth = {
    email: auth.email,
    url: normalizeBugzillaUrl(auth.url || DEFAULT_BUGZILLA_URL),
    apiKey,
  };
  const existingIndex = (store.bugzillaAuth || []).findIndex(
    (item) =>
      item.email === normalizedAuth.email && item.url === normalizedAuth.url
  );
  if (existingIndex === -1) {
    store.bugzillaAuth = [...(store.bugzillaAuth || []), normalizedAuth];
    saveStore(store);
    return { added: true, updated: false, auth: normalizedAuth };
  }
  const existing = store.bugzillaAuth[existingIndex];
  const updated = existing.apiKey !== normalizedAuth.apiKey;
  if (updated) {
    store.bugzillaAuth[existingIndex] = normalizedAuth;
    saveStore(store);
  }
  return { added: false, updated, auth: normalizedAuth };
}

/**
 * @param {unknown} authStore
 * @param {unknown[]} legacyBugzilla
 * @returns {BugzillaAuth[]}
 */
function normalizeBugzillaAuthStore(authStore, legacyBugzilla) {
  /** @type {Map<string, BugzillaAuth>} */
  const authByKey = new Map();

  for (const item of legacyBugzilla) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const apiKey = normalizeApiKey(/** @type {any} */ (item).apiKey);
    const email = /** @type {any} */ (item).email;
    const url = /** @type {any} */ (item).url;
    if (!email || !url || !apiKey) {
      continue;
    }
    const normalized = {
      email,
      url: normalizeBugzillaUrl(url || DEFAULT_BUGZILLA_URL),
      apiKey,
    };
    authByKey.set(`${normalized.email}::${normalized.url}`, normalized);
  }

  if (Array.isArray(authStore)) {
    for (const entry of authStore) {
      if (!isBugzillaAuth(entry)) {
        continue;
      }
      const normalized = {
        email: entry.email,
        url: normalizeBugzillaUrl(entry.url || DEFAULT_BUGZILLA_URL),
        apiKey: normalizeApiKey(entry.apiKey),
      };
      if (!normalized.apiKey) {
        continue;
      }
      authByKey.set(`${normalized.email}::${normalized.url}`, normalized);
    }
  }

  return [...authByKey.values()];
}

/**
 * @returns {Pick<Store, "github" | "phabricator" | "bugzilla">}
 */
export function getSavedConfigs() {
  const store = loadStore();
  return {
    bugzilla: store.bugzilla,
    github: store.github,
    phabricator: store.phabricator,
  };
}

/**
 * @returns {{ github: string[]; phabricator: string[] }}
 */
export function getIgnoredEntries() {
  const store = loadStore();
  return {
    github: [...store.ignored.github],
    phabricator: [...store.ignored.phabricator],
  };
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
