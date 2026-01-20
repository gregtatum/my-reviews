# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-01-20

### Added
- Phabricator reviews now display the author's username for each differential
- Username caching: Author usernames are now cached locally for 30 days to reduce API calls

### Changed
- Phabricator review titles no longer include the "Bug XXXXX - " prefix (bug numbers are already shown in section headers)
- Author usernames now appear at the beginning of the title line (e.g., "@username Title") instead of at the end of the URL line

## [3.0.0] - Previous Release

_See git history for earlier changes_
