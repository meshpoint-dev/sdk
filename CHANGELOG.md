# Changelog

## 1.4.0

Distillation prompts and parsers shared with the CLI and the platform: `DISTILL_SYSTEM`, `DISTILL_RULES`, `renderTranscript()`, `sessionPrompt()`, `consolidatePrompt()`, `parseProposed()`, `parseProposedWith()`, `parseMerged()`, `jsonBlock()`, with the `ProposedItem`, `MergedItem`, `TranscriptLine`, `SessionMeta` and `LiveItem` types. Pure functions over text; `meshpoint import sessions` and the console's Distill action send the same prompt.

## 1.3.0

`ClientOptions.session`: the harness session id, sent with every capture so the platform groups turns into sessions exactly.

## 1.2.0

Items carry `key`, `superseded_by` and `confirmed_at`; `ItemInput` takes `key` and `supersedes`; `state` gains `superseded`. `putItems()` answers `{count, superseded}`. `isExpired()`, `lastSeenAt()`, `DECAY_KINDS`, `DECAY_MS` exported: status and todo items unconfirmed for 30 days leave recall.

## 1.1.0

Items carry `refs`, `paths`, `commit_sha` and a verification `state`. New client methods: `verify(sightings)`, `confirm(id)`, `restore(id)`, `context(path)`, and `presence({ all: true })`. New types `ItemState`, `Sighting`, `SightingResult`, `ContextResponse`.

## 1.0.0

First stable release. Client for the Meshpoint platform: captures, recall, items, presence, device-code login, client-side secret redaction. Same API surface as 1.0.0-rc.3.
