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
  bugzilla: BugzillaConfig[];
  github: GithubConfig[];
  phabricator: PhabricatorConfig[];
  bugzillaAuth?: BugzillaAuth[] | null;
  phabricatorAuth?: PhabricatorAuth | null;
};

export type IgnoreTarget =
  | { type: "phabricator"; id: string }
  | { type: "bug"; id: string }
  | { type: "github"; owner: string; repo: string; number: string };

export type GithubConfig = {
  owner: string;
  repo: string;
  user: string;
};

export type PhabricatorConfig = {
  uri: string;
  userId: string;
  userName: string;
};

export type PhabricatorAuth = {
  uri: string;
  token: string;
  userName?: string;
};

export type BugzillaConfig = {
  email: string;
  url: string;
};

export type BugzillaAuth = {
  email: string;
  url: string;
  apiKey: string;
};

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
