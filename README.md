# My Reviews CLI

A small Node.js tool that prints your current review queue from GitHub, Bugzilla, and Phabricator so you can keep up with incoming requests from the terminal.

## Example Usage

```
➤ my-reviews

======= Phabricator Mine =====================================================

Bug 1998228 - https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

     Review - Bug 1998228 - Type check StaticEmbeddingsPipeline.mjs
              https://phabricator.services.mozilla.com/D271264
     Review - Bug 1998228 - Type check MLEngineParent.sys.mjs
              https://phabricator.services.mozilla.com/D271263
     Review - Bug 1998228 - Type check MLEngineChild.sys.mjs
              https://phabricator.services.mozilla.com/D271262
Needs Revision - Bug 1998228 - Add toolkit/components/ml/tsconfig.json for some initial type checking
              https://phabricator.services.mozilla.com/D271261

======= Phabricator Others =====================================================

Bug 2000885 - https://bugzilla.mozilla.org/show_bug.cgi?id=2000885

     Review - Bug 2000885 - create an ai window singleton registered with BrowserComponents.manifest r=mardak
              https://phabricator.services.mozilla.com/D273122
```

## Installation

Install from npm to get the CLI on your PATH:

```sh
npm install -g my-reviews
```

Or run it ad-hoc with `npx`:

```sh
npx my-reviews
```

Add your projects, you will be prompted for API tokens as needed.


```sh
# Add phabricator.services.mozilla.com support.
my-reviews phabricator gregtatum

# Add phabricator support for a custom domain.
my-reviews phabricator gregtatum https://phabricator.example.com/

# Add support for bugzilla needinfos
my-reviews bugzilla greg@example.com

# Add a github project with the org, repo, and user.
my-reviews github mozilla translations gregtatum

# Ignore reviews that you don't need to look at.
my-reviews ignore mozilla/translations#123
```

## Usage

Save configurations first, then run `my-reviews` to print everything in one go. Subcommands include `phabricator`, `bugzilla`, `github`, `ignore`, and `ignore-list`.

### Command reference (mirrors `my-reviews --help`)

- Run all saved configs  
  `my-reviews`
- Add or delete your Phabricator user  
  `my-reviews phabricator <username> [phabricator_url]`  
  `my-reviews phabricator <username> [phabricator_url] --delete`
- Add or delete your Bugzilla account  
  `my-reviews bugzilla <email> [bugzilla_url]`  
  `my-reviews bugzilla <email> [bugzilla_url] --delete`
- Add or delete a GitHub repo/user combo  
  `my-reviews github <org> <repo> <user>`  
  `my-reviews github <org> <repo> <user> --delete`
- Add or delete an ignored Phabricator diff/bug or GitHub PR  
  `my-reviews ignore <target>`  
  `my-reviews ignore <target> --delete`
- List ignored entries  
  `my-reviews ignore-list`

### Phabricator reviews

```sh
my-reviews phabricator <username> [phabricator_url]
# remove a saved config
my-reviews phabricator --delete <username> [phabricator_url]
```
- The command will prompt for a Phabricator API token (stored locally) the first
  time you run it.
- Tokens can be generated at:
  `https://phabricator.services.mozilla.com/settings/user/<your-username>/page/apitokens/`
- If you use a custom Phabricator URL, use that base URL in the token page.
- The command will detect your Phabricator user via the Conduit API and save it.

Once added, running `my-reviews` will fetch and print the current queue for all saved Phabricator configs.

### Bugzilla needinfo

```sh
my-reviews bugzilla greg@example.com
# custom Bugzilla instance
my-reviews bugzilla greg@example.com https://bugzilla-dev.allizom.org
# remove a saved config
my-reviews bugzilla greg@example.com --delete
```

Get a Bugzilla API key from your Bugzilla user preferences (API Keys section) at `https://bugzilla.mozilla.org/userprefs.cgi?tab=apikey`. The CLI will prompt for the key the first time you configure Bugzilla and store it for future runs, using the JSON-RPC `MyDashboard.run_flag_query` endpoint to fetch open `needinfo?` requests.

### GitHub reviews

```sh
my-reviews github <org> <repo> <github-username>
# remove a saved config
my-reviews github --delete <org> <repo> <github-username>
```

The command saves the configuration and fetches open pull requests for the given repository when you run `my-reviews`, printing:
- PRs where you are a requested reviewer and the review is still outstanding.
- Your own open PRs (excluding drafts and WIPs) so you can monitor their status.

Example:

```sh
my-reviews github mozilla translations gregtatum
```

### Ignoring reviews

Add Phabricator or GitHub reviews to a persistent ignore list

```sh
# Phabricator
my-reviews ignore https://phabricator.services.mozilla.com/D271264
my-reviews ignore D271264
my-reviews ignore Bug 1998228
my-reviews ignore https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

# GitHub
my-reviews ignore https://github.com/mozilla/translations/pull/123
my-reviews ignore mozilla/translations#123
# remove an ignore entry
my-reviews ignore -d mozilla/translations#123
# list ignored entries
my-reviews ignore-list
```

## Development

- `npm run ts` runs TypeScript against the JSDoc annotations.
- Persist or log API responses when working on fixtures:
  - `MY_REVIEWS_PERSIST=phabricator`, `MY_REVIEWS_PERSIST=bugzilla`, or `MY_REVIEWS_PERSIST=github` writes raw responses to `tests/utils/*-<endpoint>.json`.
  - `MY_REVIEWS_LOG=1` logs responses to stdout.
- Update Jest snapshots after fixture or output changes with:
  ```sh
  npm test -- -u
  # or to target a single suite:
  npm test -- --runTestsByPath tests/cli.test.mjs -u
  ```

## Publishing

To publish a new version to npm, login to npm via `npm login` then helper script from the repo root:

```sh
./publish.sh [patch|minor|major]
```
