#!/usr/bin/env node
// @ts-check
import { runPhabricatorReviews, getPhabricatorUser } from "./phab.mjs";
import { runGithubReviews } from "./github.mjs";
import {
  addGithubConfig,
  addIgnoredTarget,
  addPhabricatorConfig,
  getSavedConfigs,
} from "./store.mjs";

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    switch (command) {
      case undefined: {
        await runSavedConfigurations();
        break;
      }
      case "phabricator": {
        const [geckoDir] = args;
        const user = await getPhabricatorUser(geckoDir);
        const { added } = addPhabricatorConfig(geckoDir, user.phid);
        if (added) {
          console.log(
            `Saved Phabricator config for ${geckoDir} (user: ${user.userName}, PHID: ${user.phid}).`
          );
        } else {
          console.log(
            `Phabricator config already saved for ${geckoDir} (user: ${user.userName}, PHID: ${user.phid}).`
          );
        }
        break;
      }
      case "github": {
        const [org, repo, user] = args;
        const { added } = addGithubConfig(org, repo, user);
        if (added) {
          console.log(`Saved GitHub config for ${org}/${repo} (${user}).`);
        } else {
          console.log(`GitHub config already saved for ${org}/${repo} (${user}).`);
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
        const target = args.join(" ").trim();
        if (!target) {
          throw new Error(
            "The ignore command expects a Phabricator URL/ID, Bug number/URL, or GitHub pull request URL or owner/repo#123."
          );
        }
        const { description, alreadyIgnored } = addIgnoredTarget(target);
        if (alreadyIgnored) {
          console.log(`${description} is already ignored.`);
        } else {
          console.log(`Ignoring ${description}.`);
        }
        break;
      }
      default:
        console.error(`Unknown command: ${String(command)}`);
        printUsage();
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

function printUsage() {
  console.log(
    `Usage:\n  my-reviews                          # Run using saved configurations\n  my-reviews phabricator <gecko>          # Detect user via arc and save\n  my-reviews github <org> <repo> <user>   # Save a GitHub config\n  my-reviews ignore <phabricator-url-or-id|github-url-or-number>`
  );
}

async function runSavedConfigurations() {
  const { github, phabricator } = getSavedConfigs();
  if (phabricator.length === 0 && github.length === 0) {
    console.log(
      "No configurations saved. Add one with `my-reviews phabricator ...` or `my-reviews github ...`."
    );
    return;
  }

  for (const config of phabricator) {
    await runPhabricatorReviews(config.geckoDir, config.userId);
  }

  for (const config of github) {
    await runGithubReviews(config.owner, config.repo, config.user);
  }
}

main();
