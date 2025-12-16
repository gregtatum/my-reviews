// @ts-check
import { Octokit } from "@octokit/rest";
import color from "cli-color";
import { isIgnoredGithub } from "./store.mjs";

/** @typedef {import("@octokit/rest").RestEndpointMethodTypes["pulls"]["list"]["response"]} PullsResponse */
/** @typedef {PullsResponse["data"][number]} PullRequest */
/** @typedef {import("@octokit/rest").RestEndpointMethodTypes["pulls"]["listReviews"]["response"]} ReviewResponse */
/** @typedef {ReviewResponse["data"][number]} Review */

/** @type {import("@octokit/rest").Octokit} */
const octokit = new Octokit();

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} me
 * @returns {Promise<{ prsToHandle: PullRequest[]; myPrs: PullRequest[] }>}
 */
export async function runGithubReviews(owner, repo, me) {
  if (!owner || !repo || !me) {
    throw new Error(
      "GitHub reviews requires the owner, repo, and user passed as arguments."
    );
  }

  const response /* :PullsResponse */ = await octokit.pulls.list({
    owner,
    repo,
  });
  const openPrs = response.data.filter(
    ({ title }) =>
      !title.includes("[wip]") &&
      !title.includes("(wip)") &&
      !title.includes("[deploy-preview]") &&
      !title.includes("(deploy-preview)") &&
      !title.includes("[deploy preview]") &&
      !title.includes("(deploy preview)")
  );
  const visiblePrs = openPrs.filter(
    (pr) => !isIgnoredGithub(owner, repo, pr.number)
  );

  /** @type {PullRequest[]} */
  const prsToHandle = [];
  /** @type {PullRequest[]} */
  const myPrs = [];
  for (const pr of visiblePrs) {
    if (pr.user && pr.user.login === me && !pr.draft) {
      myPrs.push(pr);
    }
    for (const reviewer of pr.requested_reviewers ?? []) {
      if (reviewer.login === me) {
        prsToHandle.push(pr);
        break;
      }
    }
  }

  if (prsToHandle.length > 0) {
    printHeader(owner, repo, "To Review");
    for (const pr of prsToHandle) {
      await printPR(owner, repo, pr);
    }
  }

  if (myPrs.length > 0) {
    printHeader(owner, repo, "My PRs");
    for (const pr of myPrs) {
      await printPR(owner, repo, pr);
    }
  }

  return { prsToHandle, myPrs };
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {PullRequest} pr
 */
async function printPR(owner, repo, pr) {
  console.log("");
  const gray = color.xterm(8);
  console.log(color.yellow(`PR #${pr.number}: `) + color.whiteBright(pr.title));
  console.log(gray("     url: ") + color.blue.underline(pr.html_url));
  const author = pr.user ? pr.user.login : "unknown";
  console.log(gray("  author: ") + author);
  console.log(gray("  branch: ") + pr.head.ref);

  const reviewResponse = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number: pr.number,
  });

  for (const review of reviewResponse.data) {
    let state = review.state;
    switch (review.state) {
      case "APPROVED":
        state = color.green(state);
        break;
      case "COMMENTED":
        // state = color.cyan(state);
        // Skip comments, they aren't really useful.
        continue;
      default:
    }
    const reviewerName = review.user ? review.user.login : "unknown";
    console.log(gray("reviewer: ") + state + " " + reviewerName);
  }

  // Print out the requested reviewers.
  for (const reviewer of pr.requested_reviewers ?? []) {
    console.log(
      gray("reviewer: ") + color.magenta("REQUESTED ") + reviewer.login
    );
  }
}
/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} text
 */
function printHeader(owner, repo, text) {
  console.log(
    color.cyan(
      `\n======= ${text} (${owner}/${repo}) =====================================================`
    )
  );
}
