/**
 * The shape of the ~/.my-reviews.json file
 */
export type Store = {
  ignored: {
    // e.g. "owner/repo#123"
    github: string[];
    // e.g. "D12345"
    phabricator: string[];
  };
};

export type IgnoreTarget =
  | { type: "phabricator"; id: string }
  | { type: "github"; owner: string; repo: string; number: string };
