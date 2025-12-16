#!/usr/bin/env node
// @ts-check
import color from "cli-color";
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

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp({ showHeader: true });
    return;
  }

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
          console.log(
            `GitHub config already saved for ${org}/${repo} (${user}).`
          );
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
  console.log(color.green("- Add your Firefox Phabricator user."));
  console.log(
    color.red("    my-reviews phabricator ") +
      color.blue("<path_to_firefox_repo>\n")
  );
  console.log(color.green("- Add your GitHub repo."));
  console.log(
    color.red("    my-reviews github ") + color.blue("<org> <repo> <user>\n")
  );
  console.log(color.green("- Ignore a Phabricator diff/bug or GitHub PR."));
  console.log(color.red("    my-reviews ignore ") + color.blue("<target>\n"));
  console.log("");
  console.log(color.yellow("Examples:"));

  console.log("  my-reviews");
  console.log('  my-reviews phabricator "$HOME/dev/firefox"');
  console.log("  my-reviews github mozilla translations gregtatum");
  console.log("  my-reviews ignore mozilla/translations#123");
}

async function runSavedConfigurations() {
  const { github, phabricator } = getSavedConfigs();
  if (phabricator.length === 0 && github.length === 0) {
    console.log("No configurations saved.");
    printHelp(false /* showHeader */);
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
