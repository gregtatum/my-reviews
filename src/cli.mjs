// @ts-check
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "url";
import color from "cli-color";
import { runPhabricatorReviews, getPhabricatorUser } from "./phab.mjs";
import { runGithubReviews } from "./github.mjs";
import {
  DEFAULT_BUGZILLA_URL,
  normalizeBugzillaUrl,
  runBugzillaNeedinfos,
} from "./bugzilla.mjs";
import {
  addBugzillaConfig,
  addGithubConfig,
  addIgnoredTarget,
  addPhabricatorConfig,
  getBugzillaAuth,
  getPhabricatorAuth,
  removeBugzillaConfig,
  removeGithubConfig,
  removeIgnoredTarget,
  removePhabricatorConfig,
  getIgnoredEntries,
  getSavedConfigs,
  setBugzillaAuth,
  setPhabricatorAuth,
} from "./store.mjs";

export async function main(argv = process.argv) {
  const [command, ...args] = argv.slice(2);

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp(true /* showHeader */);
    return;
  }

  try {
    switch (command) {
      case undefined: {
        await runSavedConfigurations();
        break;
      }
      case "phabricator": {
        const { isDelete, args: filteredArgs } = parseDeleteArgs(args);
        const [userName, maybeUri] = filteredArgs;
        const conduitURI = normalizeBaseURI(
          maybeUri || "https://phabricator.services.mozilla.com/"
        );
        if (isDelete) {
          const { removed } = removePhabricatorConfig(userName, conduitURI);
          if (removed) {
            console.log(
              `Removed Phabricator config for ${color.green(userName)}.`
            );
          } else {
            console.log(
              `No saved Phabricator config found for ${color.green(userName)}.`
            );
          }
          break;
        }
        if (!userName) {
          throw new Error(
            "Phabricator setup requires a username (e.g. `my-reviews phabricator gregtatum`)."
          );
        }
        await ensurePhabricatorAuth(conduitURI, userName);
        const user = await getPhabricatorUser(conduitURI);
        const { added } = addPhabricatorConfig(
          conduitURI,
          user.phid,
          user.userName
        );
        if (added) {
          console.log(
            `Saved Phabricator config for ${conduitURI} (user: ${user.userName}, PHID: ${user.phid}).`
          );
        } else {
          console.log(
            `Phabricator config already saved for ${conduitURI} (user: ${user.userName}, PHID: ${user.phid}).`
          );
        }
        break;
      }
      case "bugzilla": {
        const {
          isDelete,
          apiKey,
          args: filteredArgs,
        } = parseBugzillaArgs(args);
        const [email, bugzillaUrl = DEFAULT_BUGZILLA_URL] = filteredArgs;
        if (isDelete) {
          const { removed } = removeBugzillaConfig(email, bugzillaUrl);
          if (removed) {
            console.log(
              `Removed Bugzilla config for ${color.green(
                email
              )} (${bugzillaUrl}).`
            );
          } else {
            console.log(
              `No saved Bugzilla config found for ${color.green(
                email
              )} (${bugzillaUrl}).`
            );
          }
        } else {
          if (!email) {
            throw new Error(
              "Bugzilla setup requires an email (e.g. `my-reviews bugzilla greg@example.com`)."
            );
          }
          const authResult = await ensureBugzillaAuth(
            bugzillaUrl,
            email,
            apiKey
          );
          const { added } = addBugzillaConfig(email, bugzillaUrl);
          if (added) {
            console.log(`Saved Bugzilla config for ${email} (${bugzillaUrl}).`);
          } else if (authResult.updated || authResult.added) {
            console.log(
              `Updated Bugzilla config for ${email} (${bugzillaUrl}).`
            );
          } else {
            console.log(
              `Bugzilla config already saved for ${email} (${bugzillaUrl}).`
            );
          }
        }
        break;
      }
      case "github": {
        const { isDelete, args: filteredArgs } = parseDeleteArgs(args);
        const [org, repo, user] = filteredArgs;
        if (isDelete) {
          const { removed } = removeGithubConfig(org, repo, user);
          if (removed) {
            console.log(
              `Removed GitHub config for ${color.green(
                `${org}/${repo}`
              )} (${user}).`
            );
          } else {
            console.log(
              `No saved GitHub config found for ${color.green(
                `${org}/${repo}`
              )} (${user}).`
            );
          }
        } else {
          const { added } = addGithubConfig(org, repo, user);
          if (added) {
            console.log(`Saved GitHub config for ${org}/${repo} (${user}).`);
          } else {
            console.log(
              `GitHub config already saved for ${org}/${repo} (${user}).`
            );
          }
        }
        break;
      }
      case "ignore": {
        if (args.includes("--help") || args.includes("-h")) {
          console.log(
            "Usage: my-reviews ignore <Phabricator URL/ID | Bug number/URL | GitHub pull request URL or owner/repo#123>"
          );
          console.log(
            'Examples: "D123", "Bug 12345", "https://github.com/org/repo/pull/123", "mozilla/translations#123"'
          );
          return;
        }
        const { isDelete, args: filteredArgs } = parseDeleteArgs(args);
        const target = filteredArgs.join(" ").trim();
        if (!target) {
          throw new Error(
            "The ignore command expects a Phabricator URL/ID, Bug number/URL, or GitHub pull request URL or owner/repo#123."
          );
        }
        if (isDelete) {
          const { description, removed } = removeIgnoredTarget(target);
          if (removed) {
            console.log(`Unignored ${description}.`);
          } else {
            console.log(`${description} was not in the ignore list.`);
          }
        } else {
          const { description, alreadyIgnored } = addIgnoredTarget(target);
          if (alreadyIgnored) {
            console.log(`${description} is already ignored.`);
          } else {
            console.log(`Ignoring ${description}.`);
          }
        }
        break;
      }
      case "ignore-list": {
        printIgnoreList();
        break;
      }
      default:
        console.error(`Unknown command: ${String(command)}`);
        printHelp(false /* showHeader */);
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

function isSnapshotMode() {
  return (
    process.env.MOZ_REVIEWS_USE_SNAPSHOTS === "1" ||
    process.env.MOZ_REVIEWS_USE_SNAPSHOTS?.toLowerCase() === "true"
  );
}

/**
 * @param {string} conduitURI
 * @param {string} userName
 */
async function ensurePhabricatorAuth(conduitURI, userName) {
  if (isSnapshotMode()) {
    return;
  }

  const auth = getPhabricatorAuth();
  const normalized = normalizeConduitURI(conduitURI);
  if (auth && normalizeConduitURI(auth.uri) === normalized && auth.token) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "No Phabricator API token configured. Run `my-reviews phabricator <username> [url]` in a terminal to set one."
    );
  }

  const origin = new URL(normalized).origin;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (userName) {
      console.log(
        `Token URL: ${origin}/settings/user/${userName}/page/apitokens/`
      );
    } else {
      console.log(
        `Token URL: ${origin}/settings/user/<your-username>/page/apitokens/`
      );
    }

    const token = (await rl.question("Paste Phabricator API token: ")).trim();
    if (!token) {
      throw new Error("Phabricator API token cannot be empty.");
    }

    setPhabricatorAuth({
      uri: normalized,
      token,
      userName: userName || undefined,
    });
  } finally {
    rl.close();
  }
}

/**
 * @param {string} bugzillaUrl
 * @param {string} email
 * @param {string | undefined} apiKey
 * @returns {Promise<{ added: boolean; updated: boolean }>}
 */
async function ensureBugzillaAuth(bugzillaUrl, email, apiKey) {
  const normalizedUrl = normalizeBugzillaUrl(bugzillaUrl);
  if (apiKey) {
    const { added, updated } = setBugzillaAuth({
      email,
      url: normalizedUrl,
      apiKey,
    });
    return { added, updated };
  }

  if (isSnapshotMode()) {
    return { added: false, updated: false };
  }

  const existing = getBugzillaAuth(email, normalizedUrl);
  if (existing?.apiKey) {
    return { added: false, updated: false };
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "No Bugzilla API key configured. Run `my-reviews bugzilla <email> [bugzilla_url]` in a terminal to set one."
    );
  }

  const origin = new URL(normalizedUrl).origin;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`API key URL: ${origin}/userprefs.cgi?tab=apikey`);
    const token = (await rl.question("Paste Bugzilla API key: ")).trim();
    if (!token) {
      throw new Error("Bugzilla API key cannot be empty.");
    }
    const { added, updated } = setBugzillaAuth({
      email,
      url: normalizedUrl,
      apiKey: token,
    });
    return { added, updated };
  } finally {
    rl.close();
  }
}

/**
 * @param {string} uri
 * @returns {string}
 */
function normalizeConduitURI(uri) {
  return uri.endsWith("/") ? uri : `${uri}/`;
}

/**
 * @param {string} uri
 * @returns {string}
 */
function normalizeBaseURI(uri) {
  const normalized = normalizeConduitURI(uri);
  if (normalized.endsWith("/api/")) {
    return normalized.slice(0, -"/api/".length) + "/";
  }
  return normalized;
}

/**
 * @param {boolean} showHeader
 */
function printHelp(showHeader) {
  if (showHeader) {
    const header = color.cyan("my-reviews — list your review queues");
    console.log(header);
  }
  console.log("");
  console.log(color.yellow("Usage:"));
  console.log(color.green("- Run all saved configs."));
  console.log(color.red("    my-reviews\n"));
  console.log(color.green("- Add or delete your Phabricator user."));
  console.log(
    color.red("    my-reviews phabricator ") +
      color.blue("<username> [phabricator_url]") +
      "\n" +
      color.red("    my-reviews phabricator ") +
      color.blue("<username> [phabricator_url]") +
      color.red(" --delete\n")
  );
  console.log(color.green("- Add or delete your Bugzilla account."));
  console.log(
    color.red("    my-reviews bugzilla ") +
      color.blue("<email> [bugzilla_url]") +
      "\n" +
      color.red("    my-reviews bugzilla ") +
      color.blue("<email> [bugzilla_url]") +
      color.red(" --delete\n")
  );
  console.log(color.green("- Add or delete your GitHub repo."));
  console.log(
    color.red("    my-reviews github ") +
      color.blue("<org> <repo> <user>") +
      "\n" +
      color.red("    my-reviews github ") +
      color.blue("<org> <repo> <user>") +
      color.red(" --delete\n")
  );
  console.log(color.green("- Ignore a Phabricator diff/bug or GitHub PR."));
  console.log(
    color.red("    my-reviews ignore ") +
      color.blue("<target>") +
      "\n" +
      color.red("    my-reviews ignore ") +
      color.blue("<target>") +
      color.red(" --delete\n")
  );
  console.log(color.green("- List ignored entries."));
  console.log(color.red("    my-reviews ignore-list\n"));
  console.log(color.yellow("Examples:"));

  console.log("  my-reviews");
  console.log("  my-reviews phabricator gregtatum");
  console.log(
    "  my-reviews phabricator gregtatum https://phabricator.example.com/"
  );
  console.log("  my-reviews bugzilla greg@example.com");
  console.log("  my-reviews github mozilla translations gregtatum");
  console.log("  my-reviews ignore mozilla/translations#123");
}

async function runSavedConfigurations() {
  const { bugzilla, github, phabricator } = getSavedConfigs();
  if (
    bugzilla.length === 0 &&
    phabricator.length === 0 &&
    github.length === 0
  ) {
    console.log("No configurations saved.");
    printHelp(false /* showHeader */);
    return;
  }

  console.log(color.cyan("\nChecking:"));
  for (const config of bugzilla) {
    const label = "Bugzilla   ";
    const email = color.green(config.email);
    const url = color.blackBright(`(${config.url})`);
    console.log(`${label} ${email} ${url}`);
  }
  for (const config of phabricator) {
    const label = "Phabricator";
    const uri = color.green(config.uri);
    const user = color.blackBright(`(${config.userName})`);
    console.log(`${label} ${uri} ${user}`);
  }
  for (const config of github) {
    const label = "GitHub     ";
    const repo = color.green(`${config.owner}/${config.repo}`);
    const user = color.blackBright(`(${config.user})`);
    console.log(`${label} ${repo} ${user}`);
  }

  for (const config of bugzilla) {
    const auth = getBugzillaAuth(config.email, config.url);
    await runBugzillaNeedinfos(config.email, config.url, auth?.apiKey);
  }

  for (const config of phabricator) {
    await runPhabricatorReviews(config.uri, config.userId);
  }

  for (const config of github) {
    await runGithubReviews(config.owner, config.repo, config.user);
  }
}

function printIgnoreList() {
  const ignored = getIgnoredEntries();
  console.log(color.cyan("\nIgnored entries:"));
  if (ignored.phabricator.length === 0 && ignored.github.length === 0) {
    console.log(color.blackBright("  (none)"));
    return;
  }
  if (ignored.phabricator.length > 0) {
    console.log(color.yellow("  Phabricator:"));
    for (const item of ignored.phabricator) {
      console.log(`    ${color.green(item)}`);
    }
  }
  if (ignored.github.length > 0) {
    console.log(color.magenta("  GitHub:"));
    for (const item of ignored.github) {
      console.log(`    ${color.green(item)}`);
    }
  }
}

/**
 * @param {string[]} args
 * @returns {{ isDelete: boolean; apiKey: string | undefined; args: string[] }}
 */
function parseBugzillaArgs(args) {
  const filtered = [];
  let apiKey;
  let isDelete = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-d" || arg === "--delete") {
      isDelete = true;
      continue;
    }
    if (arg === "--api-key") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("The --api-key flag requires a value.");
      }
      apiKey = value;
      index++;
      continue;
    }
    filtered.push(arg);
  }
  return { isDelete, apiKey, args: filtered };
}

/**
 * @param {string[]} args
 * @returns {{ isDelete: boolean; args: string[] }}
 */
function parseDeleteArgs(args) {
  const filtered = [];
  let isDelete = false;
  for (const arg of args) {
    if (arg === "-d" || arg === "--delete") {
      isDelete = true;
      continue;
    }
    filtered.push(arg);
  }
  return { isDelete, args: filtered };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
