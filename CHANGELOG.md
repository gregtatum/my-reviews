# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.1] - 2026-08-07

### Fixed
- Bugzilla needinfos failed with a "404 Not Found" after Bugzilla removed its legacy JSON-RPC endpoint; the tool now fetches them through the REST API

## [3.4.0] - 2026-07-21

### Changed
- Reworked the output into a compact tree layout: a "Review Sources" overview, grouped sections, and tree connectors
- Bugzilla needinfos now show a relative timestamp for each request (e.g. "1 hour ago")
- Reworked the "update available" notice

### Fixed
- Terminal hyperlink underlines are now tinted to match the link text color instead of the terminal's default white underline

## [3.3.0] - 2026-06-01

### Changed
- Group reviews that are already assigned to someone in the group are now ignored

## [3.2.0] - 2026-01-20

### Added
- Automatic update checker: The tool now checks once per week for new versions and notifies you how to update

## [3.1.0] - 2026-01-20

### Added
- Phabricator reviews now display the author's username for each differential
- Username caching: Author usernames are now cached locally for 30 days to reduce API calls

### Changed
- Phabricator review titles no longer include the "Bug XXXXX - " prefix (bug numbers are already shown in section headers)
- Author usernames now appear at the beginning of the title line (e.g., "@username Title") instead of at the end of the URL line

## [3.0.0] - Previous Release

_See git history for earlier changes_
