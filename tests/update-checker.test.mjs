import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { checkForUpdates } from "../src/update-checker.mjs";
import { setStorePath, getLastUpdateCheck } from "../src/store.mjs";

describe("update checker", () => {
  let tmpDir = "";
  let storePath = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-reviews-update-"));
    storePath = path.join(tmpDir, "store.json");
    setStorePath(storePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores update check timestamp in store on first run", async () => {
    expect(getLastUpdateCheck()).toBe(0);

    await checkForUpdates();

    const lastCheck = getLastUpdateCheck();
    expect(lastCheck).toBeGreaterThan(0);
    expect(Date.now() - lastCheck).toBeLessThan(5000); // Within 5 seconds
  });

  it("does not check again within one week", async () => {
    // Perform an initial check
    await checkForUpdates();
    const firstCheck = getLastUpdateCheck();

    // Try to check again immediately
    await checkForUpdates();

    // Timestamp should not have changed
    expect(getLastUpdateCheck()).toBe(firstCheck);
  });

  it("checks again after one week", async () => {
    // Manually set an old check timestamp (8 days ago) in the store
    const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);
    const oldStore = {
      ignored: { github: [], phabricator: [] },
      bugzilla: [],
      github: [],
      phabricator: [],
      lastUpdateCheck: oldTimestamp,
    };
    fs.writeFileSync(storePath, JSON.stringify(oldStore));

    // Reset the store cache to pick up the new file
    setStorePath(storePath);

    await checkForUpdates();

    // Timestamp should have been updated
    const newCheck = getLastUpdateCheck();
    expect(newCheck).toBeGreaterThan(oldTimestamp);
  });
});
