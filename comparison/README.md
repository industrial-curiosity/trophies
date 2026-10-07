# Intended product versus current repository

Snapshot: 2026-10-07, local checkout at commit `aa11608`. This is a source-based assessment, not a certification of a running deployment.

The repository aims to make an employee's company-endorsed contribution history portable and publicly verifiable while keeping the underlying evidence off-chain. Its current implementation is a small Ethereum-compatible contribution ledger and a Next.js interface for issuing, looking up, and verifying records. The core MVP design is represented in code; dependable public deployment, stronger identity guarantees, and the wider reputation or compensation vision remain outside what this checkout establishes.

## Documents

- [Intended product](intended-product.md): purpose, trust model, promised MVP, and explicit exclusions.
- [Current repository](current-repository.md): complete tracked-file inventory, implemented flows, and available verification assets.
- [Convergence and divergence](convergence-and-divergence.md): detailed evidence for alignment, mismatches, and limits.

## Side-by-side comparison

“Implemented” means the inspected source contains the behavior. It does not mean tests were run or a deployment was reached during this assessment.

| Area | What the repo is meant to achieve | What currently exists | Assessment |
| --- | --- | --- | --- |
| Product purpose | Portable company-endorsed records of employee contributions | A ledger indexed by hashed employee identifier, with issuance, lookup, and verification pages | Core MVP alignment; portability depends on identifier reuse and continued chain access |
| Company authority | Only approved company wallets issue records | Immutable deployer admin controls an address allowlist; issuance checks the caller | Implemented wallet authority; real company identity is an external trust assumption |
| Contribution record | Preserve who, which company, type, evidence fingerprint, issuer, and time | `Contribution` stores both identifier hashes, a type string, proof hash, issuer address, and block timestamp | Implemented |
| Immutability | Records cannot be edited or deleted | Append-only array; no update, delete, or upgrade mechanism in the contract | Implemented at contract level; the local demo chain is disposable |
| Evidence privacy | Keep raw Jira/Git/internal evidence off-chain | Browser computes a hash and submits that hash; no evidence storage service | Implemented off-chain evidence boundary; retrieval and preservation are external responsibilities |
| Exact evidence matching | Hash verbatim evidence and later prove an exact match | `hashEvidence` hashes `s.trim()` | Divergence: leading and trailing whitespace are discarded |
| Employee history | Look up an employee's full contribution history | Employee page normalizes the identifier, retrieves all IDs, and fetches all records | Implemented for the supplied identifier; no identity ownership or pagination |
| Public verification | Check existence, issuer, current authorization, and optional evidence without a wallet | Verify page calls a public view function; reads use an injected wallet provider or localhost RPC | Local flow represented; wallet-free Sepolia reads need a matching public RPC |
| Revocation | Stop future issuance without invalidating old records | Issuance checks current authorization; verification returns existence and current authorization separately | Implemented, with a dedicated contract test |
| Deployment | Run locally and optionally deploy to Sepolia | Hardhat scripts deploy, authorize the deployer, and export address/network/ABI | Deployment tooling exists; checked-in metadata is localhost and does not prove a live contract |
| Verification confidence | README reports automated tests, a local end-to-end test, and a clean web build | Four contract tests and a web build script; no committed end-to-end or frontend test suite | Partial reproducible evidence; historical success claims were not revalidated |
| Wider vision | Support future reputation, references, or contribution-linked compensation | No scoring, tokens, vesting, compensation, or integrations | Deliberate exclusion, not an unfinished MVP requirement |

## What the comparison establishes

The strongest convergence is the trust model: the chain records an authorized wallet's attestation rather than deciding whether the work happened. The contract preserves issued records even when a wallet loses permission to issue new ones, and the web interface exposes the intended three workflows.

The main divergences are evidence normalization, network configuration, and the gap between README verification claims and committed reproducible checks. Identity privacy and genuine company identity are acknowledged or external limitations rather than guarantees delivered by hashing and an address allowlist.

## Method and limits

The review read the root README, every tracked application/configuration/test source file, deployment metadata, and the license header. `git ls-files` established the inventory, `git status --short` showed a clean starting checkout, and `git log -5` identified the snapshot commit. Package manifests establish declared dependency ranges; lockfiles were inventoried without a dependency or security audit.

No `.codegraph/` directory was present. No contract tests, website build, browser flow, or RPC deployment check was run. Neither project had a local `node_modules` directory; dependencies were not installed for this documentation task. Findings concern the local checkout and do not assert the state of hosted services or later remote changes.
