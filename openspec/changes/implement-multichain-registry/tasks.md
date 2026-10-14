# Contract delivery tasks

## 1. Reproducible tooling

- [x] 1.1 Add containerized Solidity and Sui toolchains with pinned dependencies and documented commands.
- [x] 1.2 Verify fresh compilation and dependency security checks without installing host tools.

## 2. Contract implementations

- [x] 2.1 Implement EVM registry, fungible issuance metadata, multi-asset custody and fees, retained credits, and both pause authorities.
- [x] 2.2 Implement corresponding Move behavior and immutable-publication preparation.
- [x] 2.3 Add network-specific deployment configuration for all six targets without real credentials.
- [x] 2.4 Add two-step manager and platform-owner handoffs to EVM and Move registries, preserving pauses, fees, balances, and credits.
- [x] 2.5 Document and exercise manager-held issuance, off-chain delivery records, and later holder-authorized transfer on both chains.
- [x] 2.6 Reject reused nonempty generation references per project on EVM and Sui; verify failed retries preserve supply and balances.

## 3. Local correctness and cost verification

- [x] 3.1 Test issuance authorization, full and fractional transfers, self-transfers, and generation records on both implementations.
- [x] 3.2 Test fee splitting, reward remainders, asset and project isolation, payout failures, and arithmetic bounds.
- [x] 3.3 Test manager and owner pause precedence, withdrawal access, no burning, and no upgrade path.
- [x] 3.4 Run adversarial accounting sequences and conservation checks on both implementations.
- [ ] 3.5 Measure donation cost against holder count and mint/transfer cost against asset count; document supported practical bounds.
- [x] 3.6 Test handoff nomination, cancellation, acceptance, unauthorized attempts, and post-handoff permissions on both chains; test that role changes do not move manager-held shares or credits.

## 4. Contribution automation and release preparation

- [x] 4.1 Detect and parse added or modified timestamped trophy files after merge to protected `main`; add trusted GitHub Actions mint jobs and chain-specific signer commands for Base, opBNB, and Sui, using protected manager credentials, deployment and manager checks, and duplicate-mint reconciliation.
- [x] 4.2 Verify timestamped branch-slug filenames, exact decimal conversion, merged-file detection, multi-record routing, direct and manager-held automated issuance, invalid inputs, uncertain retries, credential handoff, and caller-paid donation, transfer, and claim flows; update developer and operator documentation.
- [ ] 4.3 Deploy and run funded end-to-end checks on Base Sepolia, opBNB Testnet, and Sui Testnet; record fresh evidence and Sui immutability.
- [ ] 4.4 Complete independent security review and deployment rehearsal, then prepare mainnet release records. Actual mainnet publication requires a separate release instruction.

## Verification evidence (2026-10-08)

- Docker Foundry v1.8.5 / Solidity 0.8.35: 24 tests passed, no failures or skips; the conservation fuzz test ran 256 cases. Two cost tests were rerun after changing only their diagnostic event names; both passed.
- Docker Sui v1.81.1: 19 tests passed, no failures. Includes generation metadata, full and fractional transfers, fee remainders, project isolation, pause permissions, arithmetic overflow, and a deterministic donation/transfer/claim sequence.
- EVM cold-call measurements: donations with 1 and 100 holders each use 140,433 gas; transfers with 1 and 6 enabled, unfunded assets use 88,505 and 164,855 gas. These are local execution measurements, not total network fees or Sui measurements; task 3.5 remains open.
- Read-only RPC simulations verified chain IDs 8453, 84532, 204, and 5611 and successfully executed MCOPY using eth_call creation data `0x6001600060205e60006000f3`. No deployment or funded transaction occurred.
- OSV query for npm `@openzeppelin/contracts` 5.7.0 returned no known advisories. Solidity dependency commit is `a6c749156e87b7b2f159c87a0ca19d323fcf35ac`. No comprehensive Sui-framework or container-image vulnerability scan has been completed.
- Compiler/linter diagnostics were reviewed. Exact token balance checks, authorized native payouts, per-item batch validation, guarded post-callback events, and Sui's direct wallet payout produce documented lint warnings; no blanket suppression was added.
- Strict OpenSpec validation and shell syntax checks passed. Funded sponsorship, testnet execution, and independent security review were unperformed under the 2026-10-08 requirements; sponsorship was removed from scope on 2026-10-12. This change is not ready to archive or publish on mainnet.

## Verification evidence (2026-10-12)

- Two-step manager and owner handoffs are implemented in both registries, with nomination replacement, cancellation, acceptance, and post-handoff authority tests. Local manager-held issuance and later holder-authorized delivery preserve earlier credits in the holding wallet. The off-chain delivery record is specified in `docs/contracts.md` and exercised in the testnet guide; it is an operator record, not contract storage.
- Docker Foundry v1.8.5 / Solidity 0.8.35: 29 tests passed, including 256 conservation fuzz runs. Docker Sui v1.81.1: 31 tests passed. The Sui suite retains the known direct-wallet-claim lint warning.
- Local EVM cost fixtures: donations with 1 or 100 holders each used 140,455 gas; minting with nonempty references and 1 or 6 enabled assets used 126,424 or 174,587 gas; transfers used 88,527 or 164,877 gas. Sui network cost, L2 data fees, and practical transaction bounds still require funded testnet measurements, so task 3.5 remains open.
- The 2026-10-12 requirement revision replaced sponsorship with manager-signed GitHub Actions issuance and caller-paid network fees. Contribution automation, funded testnet deployment, and independent security review remain unperformed; tasks 4.1–4.4 remain open.

## Verification evidence (2026-10-12, caller-paid revision)

- Nonempty generation references are unique per project in both contracts; empty references remain valid for manual issuance. The duplicate EVM test verifies supply and balances remain unchanged; the Move abort test verifies duplicate rejection.
- A push to protected `main` detects added or modified timestamped trophy files from the pushed range. A secret-free job validates and routes each record to its network-specific signing environment. The Node mint helper validates inputs, configured testnet deployment, network identity, current manager, and prior reference before signing. A submitted EVM transaction hash is saved before receipt polling; retries cannot mint twice because the contracts enforce the reference guard. Results are retained as a 90-day artifact and must be copied to the project's durable delivery record.
- Local verification after the revision: 30 Foundry tests passed, including 256 fuzz runs; 32 Move tests passed; 6 mint helper and merged-file tests passed. Foundry formatting, strict OpenSpec validation, YAML parsing, `git diff --check`, and npm audit (zero reported advisories across 40 installed packages) passed. No funded GitHub Actions run or live transaction has occurred.
- The contribution source is one reviewed `trophies/YYYYMMDDHHmmss-<branch-slug>.json` file per record merged into protected `main`. Tasks 3.5, 4.3, and 4.4 remain open for real network cost bounds, funded testnet checks, and independent security review.
- Trophy record quantities are plain decimal strings: `1` converts to 10^18 base units, `0.5` to 5×10^17, and the smallest accepted fraction to one base unit. Filename parsing checks valid UTC timestamps and safe branch slugs before a signing job receives credentials; the source branch association is reviewed in the pull request because the merged push event does not provide the original branch name.
- An interactive testnet runner now prompts for a dedicated owner key and funding amounts, derives disposable signer wallets, checkpoints public transaction references, and implements native-asset deployment, payout, pause, role-handoff, and optional second-asset sequences for EVM and Sui. Local runner tests and the EVM contract suite pass. The Sui bytecode-export command cannot resolve `MoveStdlib` from the pinned container, even outside the sandbox, so Sui publication and funded end-to-end checks remain unverified; task 4.3 stays open.
