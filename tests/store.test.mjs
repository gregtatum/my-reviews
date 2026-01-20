import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  addBugzillaConfig,
  getBugzillaAuth,
  getSavedConfigs,
  setStorePath,
  setBugzillaAuth,
  getCachedPhabricatorUsernames,
  cachePhabricatorUsernames,
} from "../src/store.mjs";

describe("store bugzilla api keys", () => {
  /** @type {string} */
  let tmpDir = "";
  /** @type {string} */
  let storePath = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-reviews-store-"));
    storePath = path.join(tmpDir, "store.json");
    setStorePath(storePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores api keys separately while preserving configs", () => {
    const first = addBugzillaConfig("greg@example.com", undefined);
    expect(first.added).toBe(true);
    expect(first.updated).toBe(false);
    expect(first.config).toEqual({
      email: "greg@example.com",
      url: "https://bugzilla.mozilla.org",
    });

    const updated = setBugzillaAuth({
      email: "greg@example.com",
      url: "https://bugzilla.mozilla.org",
      apiKey: "  api-key-value ",
    });
    expect(updated.added).toBe(true);
    expect(updated.updated).toBe(false);

    const untouched = addBugzillaConfig("greg@example.com", undefined);
    expect(untouched.updated).toBe(false);
    expect(getSavedConfigs().bugzilla).toEqual([
      {
        email: "greg@example.com",
        url: "https://bugzilla.mozilla.org",
      },
    ]);

    expect(getBugzillaAuth("greg@example.com", "https://bugzilla.mozilla.org"))
      .toEqual({
        email: "greg@example.com",
        url: "https://bugzilla.mozilla.org",
        apiKey: "api-key-value",
      });
  });

  it("normalizes stored api keys and urls when loading", () => {
    const legacyStore = {
      ignored: { github: [], phabricator: [] },
      bugzilla: [
        {
          email: "legacy@example.com",
          url: "bugzilla.mozilla.org",
          apiKey: null,
        },
        {
          email: "keep@example.com",
          url: "https://bugzilla.mozilla.org/",
          apiKey: " spaced ",
        },
      ],
      bugzillaAuth: [
        {
          email: "auth@example.com",
          url: "bugzilla.mozilla.org/",
          apiKey: " explicit ",
        },
      ],
      github: [],
      phabricator: [],
    };
    fs.writeFileSync(storePath, JSON.stringify(legacyStore));

    expect(getSavedConfigs().bugzilla).toEqual([
      {
        email: "legacy@example.com",
        url: "https://bugzilla.mozilla.org",
      },
      {
        email: "keep@example.com",
        url: "https://bugzilla.mozilla.org",
      },
    ]);

    expect(getBugzillaAuth("keep@example.com", "bugzilla.mozilla.org")).toEqual({
      email: "keep@example.com",
      url: "https://bugzilla.mozilla.org",
      apiKey: "spaced",
    });
    expect(getBugzillaAuth("auth@example.com", "bugzilla.mozilla.org")).toEqual({
      email: "auth@example.com",
      url: "https://bugzilla.mozilla.org",
      apiKey: "explicit",
    });
  });
});

describe("phabricator username cache", () => {
  /** @type {string} */
  let tmpDir = "";
  /** @type {string} */
  let storePath = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-reviews-cache-"));
    storePath = path.join(tmpDir, "store.json");
    setStorePath(storePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("caches usernames and returns them on subsequent requests", () => {
    const phids = ["PHID-USER-1", "PHID-USER-2", "PHID-USER-3"];

    // First check - nothing cached
    const firstCheck = getCachedPhabricatorUsernames(phids);
    expect(firstCheck.cached.size).toBe(0);
    expect(firstCheck.uncached).toEqual(phids);

    // Cache some usernames
    const usernames = new Map([
      ["PHID-USER-1", "user1"],
      ["PHID-USER-2", "user2"],
      ["PHID-USER-3", "user3"],
    ]);
    cachePhabricatorUsernames(usernames);

    // Second check - all cached
    const secondCheck = getCachedPhabricatorUsernames(phids);
    expect(secondCheck.cached.size).toBe(3);
    expect(secondCheck.cached.get("PHID-USER-1")).toBe("user1");
    expect(secondCheck.cached.get("PHID-USER-2")).toBe("user2");
    expect(secondCheck.cached.get("PHID-USER-3")).toBe("user3");
    expect(secondCheck.uncached).toEqual([]);
  });

  it("expires cached usernames after 30 days", () => {
    const phids = ["PHID-USER-1"];

    // Manually write a stale cache entry (31 days old)
    const staleTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000);
    const staleStore = {
      ignored: { github: [], phabricator: [] },
      bugzilla: [],
      github: [],
      phabricator: [],
      phabricatorUsernames: {
        "PHID-USER-1": {
          username: "staleuser",
          fetchedAt: staleTimestamp,
        },
      },
    };
    fs.writeFileSync(storePath, JSON.stringify(staleStore));

    // Reset the cached store so it reads from disk
    setStorePath(storePath);

    // Check - should be uncached due to age
    const check = getCachedPhabricatorUsernames(phids);
    expect(check.cached.size).toBe(0);
    expect(check.uncached).toEqual(phids);
  });

  it("returns mix of cached and uncached usernames", () => {
    // Cache only some usernames
    const usernames = new Map([
      ["PHID-USER-1", "user1"],
      ["PHID-USER-2", "user2"],
    ]);
    cachePhabricatorUsernames(usernames);

    // Request more than what's cached
    const phids = ["PHID-USER-1", "PHID-USER-2", "PHID-USER-3", "PHID-USER-4"];
    const check = getCachedPhabricatorUsernames(phids);

    expect(check.cached.size).toBe(2);
    expect(check.cached.get("PHID-USER-1")).toBe("user1");
    expect(check.cached.get("PHID-USER-2")).toBe("user2");
    expect(check.uncached).toEqual(["PHID-USER-3", "PHID-USER-4"]);
  });
});
