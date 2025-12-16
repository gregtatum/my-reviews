import { jest, describe, expect, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import { main } from "../src/cli.mjs";
import { stripAnsi } from "./utils/stripAnsi.mjs";

describe("cli --help", () => {
  test("prints help when invoked directly", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await main(["node", "src/cli.mjs", "--help"]);
      const combinedOutput = logSpy.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(stripAnsi(combinedOutput)).toMatchInlineSnapshot(`
"my-reviews — list your review queues

Usage:
- Run all saved configs.
    my-reviews

- Add or delete your Firefox Phabricator user.
    my-reviews phabricator <path_to_firefox_repo>
    my-reviews phabricator <path_to_firefox_repo> --delete

- Add or delete your GitHub repo.
    my-reviews github <org> <repo> <user>
    my-reviews github <org> <repo> <user> --delete

- Ignore a Phabricator diff/bug or GitHub PR.
    my-reviews ignore <target>
    my-reviews ignore <target> --delete

- List ignored entries.
    my-reviews ignore-list

Examples:
  my-reviews
  my-reviews phabricator "$HOME/dev/firefox"
  my-reviews github mozilla translations gregtatum
  my-reviews ignore mozilla/translations#123"
`);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("prints help when run as a subprocess", () => {
    const { stdout, stderr, status } = spawnSync(
      "node",
      ["src/cli.mjs", "--help"],
      { encoding: "utf8" }
    );
    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stripAnsi(stdout)).toMatchInlineSnapshot(`
"my-reviews — list your review queues

Usage:
- Run all saved configs.
    my-reviews

- Add or delete your Firefox Phabricator user.
    my-reviews phabricator <path_to_firefox_repo>
    my-reviews phabricator <path_to_firefox_repo> --delete

- Add or delete your GitHub repo.
    my-reviews github <org> <repo> <user>
    my-reviews github <org> <repo> <user> --delete

- Ignore a Phabricator diff/bug or GitHub PR.
    my-reviews ignore <target>
    my-reviews ignore <target> --delete

- List ignored entries.
    my-reviews ignore-list

Examples:
  my-reviews
  my-reviews phabricator "$HOME/dev/firefox"
  my-reviews github mozilla translations gregtatum
  my-reviews ignore mozilla/translations#123
"
`);
  });
});
