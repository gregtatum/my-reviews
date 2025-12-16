#!/usr/bin/env node
// @ts-check
const {
  runPhabricatorReviews,
  runGithubReviews,
  getPhabricatorUser,
} = require('../index');
const { addIgnoredTarget } = require('../ignore-store');

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'phabricator': {
        const [geckoDir, userId] = args;
        await runPhabricatorReviews(geckoDir, userId);
        break;
      }
      case 'phabricator-user': {
        const [geckoDir] = args;
        const user = await getPhabricatorUser(geckoDir);
        console.log(`Phabricator username: ${user.userName}`);
        console.log(`Phabricator PHID: ${user.phid}`);
        break;
      }
      case 'github': {
        const [org, repo, user] = args;
        await runGithubReviews(org, repo, user);
        break;
      }
      case 'ignore': {
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
        console.error(`Unknown command: ${command}`);
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
    `Usage:\n  my-reviews phabricator <path-to-gecko> <phabricator-user-phid>\n  my-reviews phabricator-user <path-to-gecko>\n  my-reviews github <org> <repo> <github-username>\n  my-reviews ignore <phabricator-url-or-id|github-url-or-number>`
  );
}

main();
