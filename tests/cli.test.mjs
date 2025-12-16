import { jest, describe, expect, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import { main } from "../src/cli.mjs";

describe("cli --help", () => {
  test("prints help when invoked directly", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await main(["node", "src/cli.mjs", "--help"]);
      const combinedOutput = logSpy.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(combinedOutput).toContain("my-reviews — list your review queues");
      expect(combinedOutput).toContain("Usage:");
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
    expect(stdout).toContain("my-reviews — list your review queues");
    expect(stdout).toContain("Usage:");
  });
});
