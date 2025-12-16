// @ts-check
const os = require("os");
const path = require("path");
const { LocalStorage } = require("node-localstorage");

const storageDir = path.join(os.homedir(), ".my-reviews");
const storage = new LocalStorage(storageDir);
const IGNORED_KEY = "ignored-items";

/** @type {Set<string> | null} */
let cachedIgnored = null;

function getIgnoredSet() {
  if (cachedIgnored) {
    return cachedIgnored;
  }
  const raw = storage.getItem(IGNORED_KEY);
  if (!raw) {
    cachedIgnored = new Set();
    return cachedIgnored;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cachedIgnored = new Set(parsed.filter((item) => typeof item === "string"));
      return cachedIgnored;
    }
  } catch (error) {
    // Ignore invalid JSON and reset the cache below.
  }
  cachedIgnored = new Set();
  return cachedIgnored;
}

/**
 * @param {Set<string>} set
 */
function persistIgnored(set) {
  cachedIgnored = set;
  storage.setItem(IGNORED_KEY, JSON.stringify(Array.from(set)));
}

/**
 * @param {string} input
 * @returns {{
 *  type: "phabricator";
 *  id: string;
 * } | {
 *  type: "github";
 *  owner: string | null;
 *  repo: string | null;
 *  number: string;
 * } | null}
 */
function parseIgnoreTarget(input) {
  const target = input.trim();
  if (!target) {
    return null;
  }

  const phabUrlMatch = target.match(/phabricator\.services\.mozilla\.com\/D(\d+)/i);
  if (phabUrlMatch) {
    return { type: "phabricator", id: phabUrlMatch[1] };
  }

  const phabIdMatch = target.match(/^D(\d+)$/i);
  if (phabIdMatch) {
    return { type: "phabricator", id: phabIdMatch[1] };
  }

  const githubUrlMatch = target.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i
  );
  if (githubUrlMatch) {
    const [, owner, repo, number] = githubUrlMatch;
    return { type: "github", owner, repo, number };
  }

  return null;
}

/**
 * @param {string} phabricatorId
 * @returns {boolean}
 */
function isIgnoredPhabricator(phabricatorId) {
  return getIgnoredSet().has(`phabricator:${phabricatorId}`);
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @returns {boolean}
 */
function isIgnoredGithub(owner, repo, pullNumber) {
  const prNumber = String(pullNumber);
  return getIgnoredSet().has(`github:${owner}/${repo}#${prNumber}`);
}

/**
 * @param {string} input
 * @returns {{ description: string; alreadyIgnored: boolean }}
 */
function addIgnoredTarget(input) {
  const parsed = parseIgnoreTarget(input);
  if (!parsed) {
    throw new Error(
      "Could not understand what to ignore. Pass a Phabricator URL or ID (e.g. D123) or a GitHub pull request URL or number."
    );
  }

  const ignored = getIgnoredSet();
  const keys = getIgnoreKeys(parsed);
  let alreadyIgnored = true;
  for (const key of keys) {
    if (!ignored.has(key)) {
      ignored.add(key);
      alreadyIgnored = false;
    }
  }
  persistIgnored(ignored);

  const description = describeTarget(parsed);
  return { description, alreadyIgnored };
}

/**
 * @param {{ type: "phabricator"; id: string } | { type: "github"; owner: string | null; repo: string | null; number: string }} target
 * @returns {string[]}
 */
function getIgnoreKeys(target) {
  if (target.type === "phabricator") {
    return [`phabricator:${target.id}`];
  }
  return [`github:${target.owner}/${target.repo}#${target.number}`];
}

/**
 * @param {{ type: "phabricator"; id: string } | { type: "github"; owner: string | null; repo: string | null; number: string }} target
 */
function describeTarget(target) {
  if (target.type === "phabricator") {
    return `Phabricator D${target.id}`;
  }
  return `GitHub ${target.owner}/${target.repo}#${target.number}`;
}

module.exports = {
  addIgnoredTarget,
  isIgnoredGithub,
  isIgnoredPhabricator,
};
