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

- Add or delete your Phabricator user.
    my-reviews phabricator <username> [phabricator_url]
    my-reviews phabricator <username> [phabricator_url] --delete

- Add or delete your Bugzilla account.
    my-reviews bugzilla <email> [bugzilla_url]
    my-reviews bugzilla <email> [bugzilla_url] --delete

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
  my-reviews phabricator gregtatum
  my-reviews phabricator gregtatum https://phabricator.example.com/
  my-reviews bugzilla greg@example.com
  my-reviews github mozilla translations gregtatum
  my-reviews ignore mozilla/translations#123
"
`);
  });

  it("updates the Bugzilla API key without duplicating configs", () => {
    expect(ctx.runCLI("bugzilla greg@example.com --api-key original-key")).toBe(
      "Saved Bugzilla config for greg@example.com (https://bugzilla.mozilla.org).\n",
    );

    expect(ctx.runCLI("bugzilla greg@example.com --api-key new-key")).toBe(
      "Updated Bugzilla config for greg@example.com (https://bugzilla.mozilla.org).\n",
    );

    expect(ctx.readStore().bugzilla).toEqual([
      {
        email: "greg@example.com",
        url: "https://bugzilla.mozilla.org",
      },
    ]);
    expect(ctx.readStore().bugzillaAuth).toEqual([
      {
        email: "greg@example.com",
        url: "https://bugzilla.mozilla.org",
        apiKey: "new-key",
      },
    ]);
  });

  it("can get the phabricator user ID", () => {
    expect(ctx.runCLI("bugzilla greg@example.com --api-key SECRET_TOKEN"))
      .toMatchInlineSnapshot(`
"Saved Bugzilla config for greg@example.com (https://bugzilla.mozilla.org).
"
`);

    expect(ctx.runCLI("phabricator gregtatum")).toMatchInlineSnapshot(`
"Saved Phabricator config for https://phabricator.services.mozilla.com/ (user: gregtatum, PHID: PHID-USER-hch2p624jejt4kddoqow).
"
`);

    expect(ctx.readStore().phabricator).toEqual([
      {
        uri: "https://phabricator.services.mozilla.com/",
        userId: "PHID-USER-hch2p624jejt4kddoqow",
        userName: "gregtatum",
      },
    ]);
    expect(ctx.readStore().bugzilla).toEqual([
      {
        email: "greg@example.com",
        url: "https://bugzilla.mozilla.org",
      },
    ]);
    expect(ctx.readStore().bugzillaAuth).toEqual([
      {
        email: "greg@example.com",
        url: "https://bugzilla.mozilla.org",
        apiKey: "SECRET_TOKEN",
      },
    ]);

    const output = ctx.runCLI("");
    // D303033 has #ai-ondevice-reviewers + a group member individually
    // assigned — suppressed because someone in the group is already handling it.
    expect(output).not.toContain("D303033");
    expect(output).not.toContain("1999999");
    // D274523/D274680 have #ai-ondevice-reviewers + tarek (not a group member)
    // — must still appear.
    expect(output).toContain("D274523");
    expect(output).toContain("D274680");

    expect(output).toMatchInlineSnapshot(`
"
Checking:
Bugzilla    greg@example.com (https://bugzilla.mozilla.org)
Phabricator https://phabricator.services.mozilla.com/ (gregtatum)

======= bugzilla.mozilla.org needinfos ===============================================

Bug 101 - https://bugzilla.mozilla.org/show_bug.cgi?id=101

              Fix crash when opening preference pane
              reporter@example.com

Bug 202 - https://bugzilla.mozilla.org/show_bug.cgi?id=202

              Update tests for new localization pipeline
              module-owner@example.com

======= Phabricator Mine =====================================================

Bug 1998228 - https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

   Accepted - @gregtatum Type check StaticEmbeddingsPipeline.mjs
              https://phabricator.services.mozilla.com/D271264
Needs Revision - @gregtatum Type check MLEngineParent.sys.mjs
              https://phabricator.services.mozilla.com/D271263
   Accepted - @gregtatum Type check MLEngineChild.sys.mjs
              https://phabricator.services.mozilla.com/D271262
   Accepted - @gregtatum Add toolkit/components/ml/tsconfig.json for some initial type checking
              https://phabricator.services.mozilla.com/D271261

======= Phabricator Others =====================================================

Bug 1940906 - https://bugzilla.mozilla.org/show_bug.cgi?id=1940906

     Review - @Unknown Allow getting a Blob of a model file in the HWInference process, cross-process, without copies. r?#ipc-reviewers
              https://phabricator.services.mozilla.com/D268411
     Review - @Unknown Implement the backend for downloading a model file, using ModelHub. r?#ipc-reviewers
              https://phabricator.services.mozilla.com/D268410
     Review - @Unknown Introduce PSPeechRecognition, implement SpeechRecognition.available(). r?#ipc-reviewers
              https://phabricator.services.mozilla.com/D268409
     Review - @Unknown Introduce the HWInference utility process. r?#ipc-reviewers,gerard-majax
              https://phabricator.services.mozilla.com/D268403

Bug 1992232 - https://bugzilla.mozilla.org/show_bug.cgi?id=1992232

     Review - @author2 Part 6/6: Implement Copy Button Functionality r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276138
     Review - @author2 Part 5/6: Implement Copy Button Enabled States r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276137
     Review - @author2 Part 4/6: Add Target Section Copy Button r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276113
     Review - @author2 Part 3/6: Rework about:translations Resizing Logic r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276112
     Review - @author2 Part 2/6: Sort about:translations Elements r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276111
     Review - @author2 Part 1/6: Refactor about:translations Event Handling r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276110

Bug 2003190 - https://bugzilla.mozilla.org/show_bug.cgi?id=2003190

     Review - @Unknown Add policy engine to security layer r=tarek,#ai-ondevice-reviewers
              https://phabricator.services.mozilla.com/D274523

Bug 2003214 - https://bugzilla.mozilla.org/show_bug.cgi?id=2003214

     Review - @Unknown Add security audit logger to AI Window security layer r?tarek,#ai-ondevice-reviewers
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
Bugzilla    greg@example.com (https://bugzilla.mozilla.org)
Phabricator https://phabricator.services.mozilla.com/ (gregtatum)

======= bugzilla.mozilla.org needinfos ===============================================

Bug 101 - https://bugzilla.mozilla.org/show_bug.cgi?id=101

              Fix crash when opening preference pane
              reporter@example.com

Bug 202 - https://bugzilla.mozilla.org/show_bug.cgi?id=202

              Update tests for new localization pipeline
              module-owner@example.com

======= Phabricator Mine =====================================================

Bug 1998228 - https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

   Accepted - @gregtatum Type check StaticEmbeddingsPipeline.mjs
              https://phabricator.services.mozilla.com/D271264
Needs Revision - @gregtatum Type check MLEngineParent.sys.mjs
              https://phabricator.services.mozilla.com/D271263
   Accepted - @gregtatum Type check MLEngineChild.sys.mjs
              https://phabricator.services.mozilla.com/D271262
   Accepted - @gregtatum Add toolkit/components/ml/tsconfig.json for some initial type checking
              https://phabricator.services.mozilla.com/D271261

======= Phabricator Others =====================================================

Bug 1992232 - https://bugzilla.mozilla.org/show_bug.cgi?id=1992232

     Review - @author2 Part 6/6: Implement Copy Button Functionality r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276138
     Review - @author2 Part 5/6: Implement Copy Button Enabled States r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276137
     Review - @author2 Part 4/6: Add Target Section Copy Button r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276113
     Review - @author2 Part 3/6: Rework about:translations Resizing Logic r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276112
     Review - @author2 Part 2/6: Sort about:translations Elements r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276111
     Review - @author2 Part 1/6: Refactor about:translations Event Handling r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276110

Bug 2003190 - https://bugzilla.mozilla.org/show_bug.cgi?id=2003190

     Review - @Unknown Add policy engine to security layer r=tarek,#ai-ondevice-reviewers
              https://phabricator.services.mozilla.com/D274523

Bug 2003214 - https://bugzilla.mozilla.org/show_bug.cgi?id=2003214

     Review - @Unknown Add security audit logger to AI Window security layer r?tarek,#ai-ondevice-reviewers
              https://phabricator.services.mozilla.com/D274680
"
`);

    // And ignore a diff
    ctx.runCLI("ignore D274680");

    expect(ctx.runCLI("")).toMatchInlineSnapshot(`
"
Checking:
Bugzilla    greg@example.com (https://bugzilla.mozilla.org)
Phabricator https://phabricator.services.mozilla.com/ (gregtatum)

======= bugzilla.mozilla.org needinfos ===============================================

Bug 101 - https://bugzilla.mozilla.org/show_bug.cgi?id=101

              Fix crash when opening preference pane
              reporter@example.com

Bug 202 - https://bugzilla.mozilla.org/show_bug.cgi?id=202

              Update tests for new localization pipeline
              module-owner@example.com

======= Phabricator Mine =====================================================

Bug 1998228 - https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

   Accepted - @gregtatum Type check StaticEmbeddingsPipeline.mjs
              https://phabricator.services.mozilla.com/D271264
Needs Revision - @gregtatum Type check MLEngineParent.sys.mjs
              https://phabricator.services.mozilla.com/D271263
   Accepted - @gregtatum Type check MLEngineChild.sys.mjs
              https://phabricator.services.mozilla.com/D271262
   Accepted - @gregtatum Add toolkit/components/ml/tsconfig.json for some initial type checking
              https://phabricator.services.mozilla.com/D271261

======= Phabricator Others =====================================================

Bug 1992232 - https://bugzilla.mozilla.org/show_bug.cgi?id=1992232

     Review - @author2 Part 6/6: Implement Copy Button Functionality r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276138
     Review - @author2 Part 5/6: Implement Copy Button Enabled States r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276137
     Review - @author2 Part 4/6: Add Target Section Copy Button r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276113
     Review - @author2 Part 3/6: Rework about:translations Resizing Logic r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276112
     Review - @author2 Part 2/6: Sort about:translations Elements r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276111
     Review - @author2 Part 1/6: Refactor about:translations Event Handling r=#translations-reviewers!
              https://phabricator.services.mozilla.com/D276110

Bug 2003190 - https://bugzilla.mozilla.org/show_bug.cgi?id=2003190

     Review - @Unknown Add policy engine to security layer r=tarek,#ai-ondevice-reviewers
              https://phabricator.services.mozilla.com/D274523
"
`);
  });
});
