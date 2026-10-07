# Intended product

The owning source for product intent is the [root README](../README.md), especially “What we built, in plain words,” “Contract,” and “Extension points.” No separate product specification is tracked in this checkout. This document distinguishes that stated intent from broader possibilities; it does not introduce new requirements.

## Purpose

An employee's track record usually stays inside employers' private systems. The proposed ledger preserves a portable record that a company vouched for a contribution, so an employee or third party can inspect that attestation later.

The contribution might be shipping code, resolving an incident, creating documentation, designing something, or mentoring. The underlying Jira ticket, pull request, or internal document remains private. The public record holds its fingerprint rather than its contents.

## Intended trust model

There are four roles:

| Role | Intended responsibility |
| --- | --- |
| Admin | Decide which company wallets may issue records |
| Company issuer | Attest to an employee's contribution using an authorized wallet |
| Employee | Look up contribution history using an employee identifier |
| Public verifier | Check a record and, when given evidence, compare its fingerprint |

The blockchain is intended to prove who attested and when. It does not assess the truth or quality of the contribution. Trust in the claim comes from the company behind the signing wallet.

“Signed record” here means an attestation submitted in a wallet-signed blockchain transaction. The README does not specify a separate downloadable signature format or off-chain signed credential.

## Stated MVP

| Capability | Intended outcome | README source |
| --- | --- | --- |
| Authorize and revoke company wallets | One admin controls who can issue | “The three pieces”; “Contract” |
| Issue a contribution | Store employee hash, company hash, type, proof hash, issuer, and time | “The three pieces”; “Contract” |
| Preserve records | No edit or delete operation; revocation leaves old records intact | “Contract” |
| Employee lookup | Show history for the supplied employee identifier | Website description; “Try the flow” |
| Public verification | Report existence, signing issuer, current issuer authorization, and optional evidence match | Website description; “Contract” |
| Identifier convention | Trim and lowercase employee/company identifiers before keccak256 hashing | “Identifier convention” |
| Evidence convention | Hash verbatim evidence text | “Identifier convention”; “Try the flow” |
| Local demo | Run Hardhat, deploy, connect MetaMask for issuance, and open the Next.js app | “How to run” |
| Sepolia deployment | Deploy with environment-supplied RPC URL and private key | “Deploy to Sepolia” |

## Deliberate exclusions

The README explicitly places these outside the MVP:

- An admin UI for authorizing companies.
- Employee-controlled identity using wallet signatures.
- Salted employee identifiers, while acknowledging that unsalted email hashes can be enumerated.
- Jira/GitHub integrations.
- Scoring, tokens, and vesting.

The introductory vision also mentions reputation, references, and eventual compensation tied to verified contribution. These are possible uses of the ledger rather than implemented MVP features.

## Boundaries of the promise

The README describes records surviving company departures and being checked years later. Meeting that outcome in practice requires durable access to the chosen chain and preservation of any evidence needed for later comparison. The documented local chain resets on restart, so it serves as a demonstration rather than durable storage.

The README's hashing explanation should be read alongside its own enumeration warning: omitting plaintext identifiers is useful, but predictable identifiers are not made secret merely by hashing them. The intended product already acknowledges the need for a stronger identity/privacy approach before real-world use.
