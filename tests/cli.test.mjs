import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import { setup } from "./utils/index.mjs";

describe("cli", () => {
  /** @type {ReturnType<typeof setup>} */
  let ctx;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.teardown();
  });

  it("prints --help", () => {
    const output = ctx.runCLI("--help");
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

  it("can get the phabricator user ID", () => {
    expect(ctx.runCLI("phabricator /fakepath/firefox")).toMatchInlineSnapshot(`
"Saved Phabricator config for /fakepath/firefox (user: gregtatum, PHID: PHID-USER-hch2p624jejt4kddoqow).
"
`);

    expect(ctx.readStore().phabricator).toEqual([
      {
        geckoDir: "/fakepath/firefox",
        userId: "PHID-USER-hch2p624jejt4kddoqow",
      },
    ]);

    expect(ctx.runCLI("")).toMatchInlineSnapshot(`
"
Checking:
Phabricator /fakepath/firefox (PHID-USER-hch2p624jejt4kddoqow)

======= Phabricator Mine =====================================================

Bug 1998228 - https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

   Accepted - Bug 1998228 - Type check StaticEmbeddingsPipeline.mjs
              https://phabricator.services.mozilla.com/D271264
Needs Revision - Bug 1998228 - Type check MLEngineParent.sys.mjs
              https://phabricator.services.mozilla.com/D271263
   Accepted - Bug 1998228 - Type check MLEngineChild.sys.mjs
              https://phabricator.services.mozilla.com/D271262
   Accepted - Bug 1998228 - Add toolkit/components/ml/tsconfig.json for some initial type checking
              https://phabricator.services.mozilla.com/D271261

======= Phabricator Others =====================================================

Bug 1940906 - https://bugzilla.mozilla.org/show_bug.cgi?id=1940906

     Review - Bug 1940906 - Allow getting a Blob of a model file in the HWInference process, cross-process, without copies. r?#ipc-reviewers
              https://phabricator.services.mozilla.com/D268411
     Review - Bug 1940906 - Implement the backend for downloading a model file, using ModelHub. r?#ipc-reviewers
              https://phabricator.services.mozilla.com/D268410
     Review - Bug 1940906 - Introduce PSPeechRecognition, implement SpeechRecognition.available(). r?#ipc-reviewers
              https://phabricator.services.mozilla.com/D268409
     Review - Bug 1940906 - Introduce the HWInference utility process. r?#ipc-reviewers,gerard-majax
              https://phabricator.services.mozilla.com/D268403

Bug 1992232 - https://bugzilla.mozilla.org/show_bug.cgi?id=1992232

     Review - Bug 1992232 - Part 6/6: Implement Copy Button Functionality r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276138
     Review - Bug 1992232 - Part 5/6: Implement Copy Button Enabled States r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276137
     Review - Bug 1992232 - Part 4/6: Add Target Section Copy Button r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276113
     Review - Bug 1992232 - Part 3/6: Rework about:translations Resizing Logic r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276112
     Review - Bug 1992232 - Part 2/6: Sort about:translations Elements r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276111
     Review - Bug 1992232 - Part 1/6: Refactor about:translations Event Handling r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276110

Bug 2003214 - https://bugzilla.mozilla.org/show_bug.cgi?id=2003214

     Review - Bug 2003214 - Add security audit logger to AI Window security layer r?tarek,#ai-ondevice-reviewers
              https://phabricator.services.mozilla.com/D274680
"
`);

    expect(ctx.runCLI("ignore Bug 1940906")).toMatchInlineSnapshot(`
"Ignoring Bug 1940906.
"
`);

    expect(ctx.runCLI("")).toMatchInlineSnapshot(`
"
Checking:
Phabricator /fakepath/firefox (PHID-USER-hch2p624jejt4kddoqow)

======= Phabricator Mine =====================================================

Bug 1998228 - https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

   Accepted - Bug 1998228 - Type check StaticEmbeddingsPipeline.mjs
              https://phabricator.services.mozilla.com/D271264
Needs Revision - Bug 1998228 - Type check MLEngineParent.sys.mjs
              https://phabricator.services.mozilla.com/D271263
   Accepted - Bug 1998228 - Type check MLEngineChild.sys.mjs
              https://phabricator.services.mozilla.com/D271262
   Accepted - Bug 1998228 - Add toolkit/components/ml/tsconfig.json for some initial type checking
              https://phabricator.services.mozilla.com/D271261

======= Phabricator Others =====================================================

Bug 1992232 - https://bugzilla.mozilla.org/show_bug.cgi?id=1992232

     Review - Bug 1992232 - Part 6/6: Implement Copy Button Functionality r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276138
     Review - Bug 1992232 - Part 5/6: Implement Copy Button Enabled States r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276137
     Review - Bug 1992232 - Part 4/6: Add Target Section Copy Button r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276113
     Review - Bug 1992232 - Part 3/6: Rework about:translations Resizing Logic r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276112
     Review - Bug 1992232 - Part 2/6: Sort about:translations Elements r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276111
     Review - Bug 1992232 - Part 1/6: Refactor about:translations Event Handling r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276110

Bug 2003214 - https://bugzilla.mozilla.org/show_bug.cgi?id=2003214

     Review - Bug 2003214 - Add security audit logger to AI Window security layer r?tarek,#ai-ondevice-reviewers
              https://phabricator.services.mozilla.com/D274680
"
`);

    // And ignore a diff
    ctx.runCLI("ignore D274680");

    expect(ctx.runCLI("")).toMatchInlineSnapshot(`
"
Checking:
Phabricator /fakepath/firefox (PHID-USER-hch2p624jejt4kddoqow)

======= Phabricator Mine =====================================================

Bug 1998228 - https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

   Accepted - Bug 1998228 - Type check StaticEmbeddingsPipeline.mjs
              https://phabricator.services.mozilla.com/D271264
Needs Revision - Bug 1998228 - Type check MLEngineParent.sys.mjs
              https://phabricator.services.mozilla.com/D271263
   Accepted - Bug 1998228 - Type check MLEngineChild.sys.mjs
              https://phabricator.services.mozilla.com/D271262
   Accepted - Bug 1998228 - Add toolkit/components/ml/tsconfig.json for some initial type checking
              https://phabricator.services.mozilla.com/D271261

======= Phabricator Others =====================================================

Bug 1992232 - https://bugzilla.mozilla.org/show_bug.cgi?id=1992232

     Review - Bug 1992232 - Part 6/6: Implement Copy Button Functionality r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276138
     Review - Bug 1992232 - Part 5/6: Implement Copy Button Enabled States r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276137
     Review - Bug 1992232 - Part 4/6: Add Target Section Copy Button r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276113
     Review - Bug 1992232 - Part 3/6: Rework about:translations Resizing Logic r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276112
     Review - Bug 1992232 - Part 2/6: Sort about:translations Elements r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276111
     Review - Bug 1992232 - Part 1/6: Refactor about:translations Event Handling r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276110
"
`);
  });
});
