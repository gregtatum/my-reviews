import { describe, expect, test, afterAll } from "@jest/globals";
import { setup } from "./utils/index.mjs";

describe("cli --help", () => {
  const { runCLI, teardown } = setup();
  afterAll(teardown);

  test("prints help when run as a subprocess", () => {
    const output = runCLI("--help");
    expect(output).toMatchInlineSnapshot(`
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

describe("cli phabricator snapshots", () => {
  const { runCLI, teardown } = setup();
  afterAll(teardown);

  test("runs phabricator with snapshots and fake path", () => {
    const output = runCLI("phabricator /fakepath/firefox");
    expect(output).toMatchInlineSnapshot(`
"Saved Phabricator config for /fakepath/firefox (user: gregtatum, PHID: PHID-USER-hch2p624jejt4kddoqow).
"
`);
  });
});
