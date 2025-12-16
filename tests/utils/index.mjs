// @ts-check
import { spawnSync } from "node:child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { setStorePath } from "../../src/store.mjs";
import { stripAnsi } from "./stripAnsi.mjs";

export function setup() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-reviews-test-"));
  const storePath = path.join(tmpDir, "store.json");
  setStorePath(storePath);

  /**
   * @param {string} argsString
   */
  const runCLI = (argsString) => {
    const args = parseArgs(argsString);
    const result = spawnSync("node", ["src/cli.mjs", ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        MY_REVIEWS_STORE_PATH: storePath,
        MOZ_REVIEWS_USE_SNAPSHOTS: "1",
      },
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `CLI exited with ${result.status}: ${result.stderr || result.stdout}`
      );
    }

    return stripAnsi(result.stdout);
  };

  const teardown = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  const readStore = () => {
    const contents = fs.readFileSync(storePath, "utf8");
    return JSON.parse(contents);
  };

  return { runCLI, teardown, readStore };
}

export { stripAnsi } from "./stripAnsi.mjs";

/**
 * Very small arg parser to honor quoted segments in tests.
 * @param {string} argsString
 * @returns {string[]}
 */
function parseArgs(argsString) {
  if (/["']/.test(argsString)) {
    throw new Error("Do not use quoted arguments in runCLI tests.");
  }
  const trimmed = argsString.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}
