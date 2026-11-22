# apps/extension (planned, Milestone 5)

WebExtensions (MV3 for Chromium, Firefox manifest) built on `packages/browser-adapter`. Not implemented yet.

Security rules this extension must follow are fixed in `docs/ARCHITECTURE.md` section 12.3 (no credentials, exact-origin bridge, validated messages, handshake nonce, URL scheme allowlist, least privilege).
Safari packaging needs macOS and Xcode and is a stretch goal.
