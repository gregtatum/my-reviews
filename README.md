# My Reviews CLI

A small Node.js tool that prints your current review queue from GitHub and Phabricator so you can keep up with incoming requests from the terminal.

## Example Usage

```sh
# List all current things in my review queue.
revs() {
  my-reviews phabricator "$HOME/dev/firefox" PHID-USER-XXXXXXXXXX
  my-reviews github mozilla translations gregtatum
}
```

Then run:

```sh
➤ revs

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

Phabricator support requires `arc` on your PATH: https://we.phorge.it/book/phorge/article/installation_guide/

Install from npm to get the CLI on your PATH:

```sh
npm install -g my-reviews
```

Or run it ad-hoc with `npx`:

```sh
npx my-reviews github mozilla translations nordzilla
```

## Usage

The CLI exposes two subcommands, `phabricator` and `github`.

### Phabricator reviews

```sh
my-reviews phabricator <path-to-firefox-repo> <phabricator-user-phid>
```

- The first argument must be the Firefox checkout.
- The second argument is your Phabricator user PHID. Find this via `my-reviews phabricator-user <path-to-firefox-repo>`

Example:

```sh
my-reviews phabricator "$HOME/dev/firefox" "PHID-USER-XXXXXXXXXXX"
```

### GitHub reviews

```sh
my-reviews github <org> <repo> <github-username>
```

The command fetches open pull requests for the given repository, printing:
- PRs where you are a requested reviewer and the review is still outstanding.
- Your own open PRs (excluding drafts and WIPs) so you can monitor their status.

Example:

```sh
my-reviews github mozilla translations gregtatum
```

### Ignoring reviews

Add Phabricator or GitHub reviews to a persistent ignore list stored at `~/.my-reviews.json`:

```sh
# Phabricator
my-reviews ignore https://phabricator.services.mozilla.com/D271264
my-reviews ignore D271264
my-reviews ignore Bug 1998228
my-reviews ignore https://bugzilla.mozilla.org/show_bug.cgi?id=1998228

# GitHub
my-reviews ignore https://github.com/mozilla/translations/pull/123
my-reviews ignore mozilla/translations#123
```

## Development

- `npm run typecheck` runs TypeScript against the JSDoc annotations (`phab.js`, `github.js`, and the CLI) to ensure structural typing stays sound.

## Publishing

To publish a new version to npm, login to npm via `npm login` then helper script from the repo root:

```sh
./publish.sh [patch|minor|major]
```
