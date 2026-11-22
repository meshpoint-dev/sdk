# Changelog

## 1.1.0

Items carry `refs`, `paths`, `commit_sha` and a verification `state`. New client methods: `verify(sightings)`, `confirm(id)`, `restore(id)`, `context(path)`, and `presence({ all: true })`. New types `ItemState`, `Sighting`, `SightingResult`, `ContextResponse`.

## 1.0.0

First stable release. Client for the Meshpoint platform: captures, recall, items, presence, device-code login, client-side secret redaction. Same API surface as 1.0.0-rc.3.
