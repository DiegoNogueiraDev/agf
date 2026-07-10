---
domain: crypto
topic: common-mistakes
triggers: [encryption, hashing, key_management, jwt, tls]
discovered_at: 2026-04-30T00:00:00.000Z
source_task: extracta-paper2code
confidence: 0.85
---

# Cryptography — Common Mistakes

Patterns where the code uses crypto APIs correctly _as documented_ but
the security property does not hold. These all have one rule: when in
doubt, use the high-level construct (libsodium, age, Tink) instead of
hand-rolling primitives.

## Encryption

- **ECB mode** — leaks data patterns. Default to AES-GCM (authenticated)
  or ChaCha20-Poly1305. Never use raw AES-ECB or AES-CBC without an
  encrypt-then-MAC.
- **Static IV / nonce reuse** — GCM nonce reuse is catastrophic (plaintext
  recovery). Generate per-message; persist last-used counter or use
  random 96-bit nonces.
- **Key derived from password without KDF** — use Argon2id (or scrypt /
  PBKDF2 with high iterations). Never feed a password directly to a
  symmetric cipher key slot.

## Hashing & signatures

- **MD5 / SHA-1 still in use** — collision-vulnerable. Use SHA-256 minimum;
  BLAKE2/3 for performance.
- **HMAC instead of signature for cross-trust-boundary auth** — HMAC
  requires a shared secret. For multi-party verification, use an
  asymmetric signature (Ed25519).
- **String comparison on MAC / token** — `===` is timing-leaky. Use
  `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python).

## Tokens / sessions

- **JWT `alg: none`** — accept-any-algorithm libraries let an attacker
  set `alg: none` and forge tokens. Pin allowed algorithms.
- **JWT signed with HMAC, public key as secret** — RS256 token verified
  as HS256 with the public key as the "secret" lets the attacker sign
  tokens. Pin algorithm AND key type.
- **Session ID in URL** — leaks via Referer headers + browser history.
  Use cookies with `Secure; HttpOnly; SameSite`.

## Key management

- **Hard-coded keys in source** — every public-repo scan finds them.
  Use env vars (or KMS). Rotate after exposure.
- **Same key for encryption and signing** — separate keys per purpose;
  failures in one don't compromise the other.
- **No key rotation plan** — every key needs a rotation cadence written
  down before deploy. "We'll rotate when we need to" = never.

## Randomness

- **`Math.random()` / `random.random()` for secrets** — not
  cryptographically secure. Use `crypto.randomBytes` (Node), `secrets`
  module (Python), `crypto/rand` (Go).
- **Truncating UUIDs for IDs** — UUIDv4 randomness is in 122 bits;
  truncating to 8 chars (32 bits) gives birthday collisions at ~65k
  values.

## When to escalate

If a task touches authentication, encryption, or session management,
require explicit answers to: which library, which algorithm, which key
lifecycle. "Use whatever is standard" is UNSPECIFIED.
