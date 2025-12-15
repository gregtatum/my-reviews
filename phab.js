// @ts-check
const { exec, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const color = require("cli-color");

/** @typedef {unknown} JsonValue */

/**
 * @template T
 * @typedef {(
 *   | { error: null; errorMessage: null; response: T }
 *   | { error: string; errorMessage: string; response: null }
 * )} Response
 */

/**
 * @template T
 * @typedef {Object} Cursor
 * @property {T[]} data
 */

/**
 * @typedef {Object} RevisionFields
 * @property {string} title
 * @property {string} authorPHID
 * @property {{ value: string; name: string; closed: boolean }} status
 */

/**
 * @typedef {Object} Revision
 * @property {number} id
 * @property {RevisionFields} fields
 */

/**
 * @template T
 * @typedef {(endpoint: string, data: JsonValue, options?: import("child_process").ExecOptions) => Promise<Response<T>>} CallConduit
 */

/**
 * @param {string} cmd
 * @param {import("child_process").ExecOptions} [options]
 * @returns {Promise<string>}
 */
function run(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    /**
     * @param {Error | null} error
     * @param {Buffer | string} stdout
     * @param {Buffer | string} stderr
     */
    const handleExec = (error, stdout, stderr) => {
      if (error) {
        console.log(`Error running: ${cmd}`);
        console.log(stderr);
        return reject(error);
      }
      if (typeof stdout === "string") {
        resolve(stdout);
      } else {
        reject(new Error("stdout was not a string"));
      }
    };

    exec(cmd, options, handleExec);
  });
}

/**
 * @param {JsonValue} data
 * @returns {string}
 */
function stringify(data) {
  const string = JSON.stringify(data);
  if (!string) {
    throw new Error("JSON stringify returned nothing.");
  }
  // Escape the string for bash.
  return string.replace(`'`, `'"'"'`);
}

/**
 * @param {string} endpoint
 * @param {JsonValue} data
 * @param {import("child_process").ExecOptions} [options]
 * @returns {Promise<Response<any>>}
 */
const callConduit = async function (endpoint, data, options = {}) {
  const arcBinary = resolveArcBinary();
  const quotedArc = JSON.stringify(arcBinary);
  const results = await run(
    `echo '${stringify(data)}' | ${quotedArc} call-conduit -- ${endpoint}`,
    options
  );
  return JSON.parse(results);
};

/**
 * @param {Revision} revision
 * @returns {string | undefined}
 */
function getBugId(revision) {
  const bugId = /** @type {Record<string, unknown>} */ (revision.fields)[
    "bugzilla.bug-id"
  ];
  return typeof bugId === "string" ? bugId : undefined;
}

/**
 * @param {Revision} revision
 */
function printRevision(revision) {
  const maxStatusLength = 11;
  const statusName = revision.fields.status.name.replace(
    "Needs Review",
    "Review"
  );
  let status = statusName.padStart(maxStatusLength);
  status = statusName === "Accepted" ? color.green(status) : color.red(status);
  console.log(`${status} - ${revision.fields.title}`);

  const indent = "".padStart(maxStatusLength + 2);
  const url = color.blackBright.underline(
    `https://phabricator.services.mozilla.com/D${revision.id}`
  );

  console.log(`${indent} ${url}`);
}

/**
 * @param {Revision} revision
 */
function printBug(revision) {
  const bugId = getBugId(revision);
  if (!bugId) {
    const bugLabel = color.yellow(`No Bug`);
    console.log(`\n${bugLabel}\n`);
    return;
  }
  const bugLabel = color.yellow(`Bug ${bugId}`);
  const url = color.blue.underline(
    `https://bugzilla.mozilla.org/show_bug.cgi?id=${bugId}`
  );
  console.log(`\n${bugLabel} - ${url}\n`);
}

/**
 * @param {Revision[]} revisions
 */
function printRevisionList(revisions) {
  let prevBug = null;
  for (const revision of revisions) {
    const thisBug = getBugId(revision) || "no bug";
    if (prevBug !== thisBug) {
      printBug(revision);
    }
    prevBug = thisBug;
    printRevision(revision);
  }
}

/**
 * @param {string} text
 */
function printHeader(text) {
  console.log(
    color.cyan(
      `\n======= Phabricator ${text} =====================================================`
    )
  );
}

/**
 * @param {string} geckoDir
 * @param {string} userId
 * @returns {Promise<{ mine: Revision[]; others: Revision[] }>}
 */
async function runPhabricatorReviews(geckoDir, userId) {
  if (!geckoDir) {
    throw new Error(
      "The first argument must be the path to the gecko directory where arcanist is configured."
    );
  }

  if (!userId) {
    throw new Error(
      "The second argument must be the PHID of the user running the command."
    );
  }

  ensureArcAvailable();

  const response = /** @type {Response<Cursor<Revision>>} */ (
    await callConduit(
      "differential.revision.search",
      {
        queryKey: "active",
        attachments: {
          reviewers: true,
        },
      },
      { cwd: geckoDir }
    )
  );

  if (response.error || response.response === null) {
    throw new Error(response.errorMessage);
  }
  const { data } = response.response;

  data.sort((a, b) => {
    const bugA = Number(getBugId(a) || 0);
    const bugB = Number(getBugId(b) || 0);
    return bugA - bugB;
  });

  const mine = data.filter((revision) => {
    const { title, authorPHID } = revision.fields;
    if (userId !== authorPHID) {
      return false;
    }
    if (!title) {
      return true;
    }
    return !title.match(/\bWIP\b/);
  });

  const others = data.filter((revision) => {
    if (userId === revision.fields.authorPHID) {
      return false;
    }
    if (revision.fields.status.value !== "needs-review") {
      return false;
    }
    const reviewers = revision.attachments?.reviewers?.reviewers || [];
    return reviewers.some(
      (reviewer) =>
        reviewer.reviewerPHID === userId &&
        (reviewer.status === "added" || reviewer.status === "blocking")
    );
  });

  if (mine.length > 0) {
    printHeader("Mine");
    printRevisionList(mine);
  }

  if (others.length > 0) {
    printHeader("Others");
    printRevisionList(others);
  }

  return { mine, others };
}

/**
 * @param {string} geckoDir
 * @returns {Promise<{ phid: string; userName: string }>}
 */
async function getPhabricatorUser(geckoDir) {
  if (!geckoDir) {
    throw new Error(
      "The first argument must be the path to the gecko directory where arcanist is configured."
    );
  }

  ensureArcAvailable();

  const response = /** @type {Response<{ phid: string; userName: string }>} */ (
    await callConduit(
      "user.whoami",
      {},
      {
        cwd: geckoDir,
      }
    )
  );

  if (response.error || response.response === null) {
    throw new Error(response.errorMessage);
  }

  return response.response;
}

module.exports = { runPhabricatorReviews, getPhabricatorUser };

function ensureArcAvailable() {
  const arcBinary = resolveArcBinary();
  const result = spawnSync(arcBinary, ["help"], { stdio: "ignore" });
  const spawnError = /** @type {NodeJS.ErrnoException | undefined} */ (
    result.error || undefined
  );
  if (spawnError && spawnError.code === "ENOENT") {
    throw new Error(
      "Could not find the `arc` binary. Install Arcanist by following https://we.phorge.it/book/phorge/article/installation_guide/."
    );
  }
}

/**
 * @returns {string}
 */
function resolveArcBinary() {
  if (process.env.MY_REVIEWS_ARC_PATH) {
    return process.env.MY_REVIEWS_ARC_PATH;
  }

  const localArc = path.join(__dirname, "arcanist", "bin", "arc");
  if (fs.existsSync(localArc)) {
    return localArc;
  }

  return "arc";
}
