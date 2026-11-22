# Changelog

## 1.2.0

Items carry `key`, `superseded_by` and `confirmed_at`; `ItemInput` takes `key` and `supersedes`; `state` gains `superseded`. `putItems()` answers `{count, superseded}`. `isExpired()`, `lastSeenAt()`, `DECAY_KINDS`, `DECAY_MS` exported: status and todo items unconfirmed for 30 days leave recall.

## 1.1.0

Items carry `refs`, `paths`, `commit_sha` and a verification `state`. New client methods: `verify(sightings)`, `confirm(id)`, `restore(id)`, `context(path)`, and `presence({ all: true })`. New types `ItemState`, `Sighting`, `SightingResult`, `ContextResponse`.

## 1.0.0

First stable release. Client for the Meshpoint platform: captures, recall, items, presence, device-code login, client-side secret redaction. Same API surface as 1.0.0-rc.3.
