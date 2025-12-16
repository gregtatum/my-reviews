/**
 * The shape of the ~/.my-reviews.json file
 */
export type Store = {
  ignored: {
    // e.g. "owner/repo#123"
    github: string[];
    // e.g. "D12345" or "Bug 12345"
    phabricator: string[];
  };
};

export type IgnoreTarget =
  | { type: "phabricator"; id: string }
  | { type: "bug"; id: string }
  | { type: "github"; owner: string; repo: string; number: string };

export type RevisionFields = {
  title: string;
  authorPHID: string;
  status: { value: string; name: string; closed: boolean };
};

export type Revision = {
  id: number;
  fields: RevisionFields;
  attachments?: {
    reviewers?: {
      reviewers?: { reviewerPHID: string; status: string }[];
    };
  };
};
