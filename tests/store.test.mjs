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
