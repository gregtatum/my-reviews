// @flow
/*::
import type { PullsResponse } from './github';
*/
const { Octokit } = require("@octokit/rest");
const octokit = new Octokit();

function UNSAFE_openUrl(unsafeUrlString) {
  require('child_process').execSync('open ' + unsafeUrlString);
}

async function run() {
  const [owner, repo, me, branch] = process.argv.slice(2);

  if (!owner || !repo || !me || !branch) {
    owner, repo, me
    console.warn('This command requires 4 arguments, The GitHub owner, repo, user, and branch respectively.');
    console.warn(`For instance: node open-pr.js 'firefox-devtools' 'profiler' 'gregtatum' 'my-branch-name'`);
    process.exit(1);
  }

  const response /* :PullsResponse */ = await octokit.pulls.list({
    owner,
    repo,
  });

  const pr = response.data.find(pr => pr.head.ref === branch && pr.user.login === me)
  if (!pr) {
    console.warn('Could not find the PR for:');
    console.warn({owner, repo, me, branch});
    process.exit(1);
    return;
  }
  const url = `https://github.com/${owner}/${repo}/pull/${+pr.number}`;

  console.log('Opening:', url);
  UNSAFE_openUrl(url);
}

run().catch(error => console.error(error));
