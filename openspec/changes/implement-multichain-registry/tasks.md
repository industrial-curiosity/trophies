# Contract delivery tasks

## 1. Reproducible tooling

- [x] 1.1 Add containerized Solidity and Sui toolchains with pinned dependencies and documented commands.
- [x] 1.2 Verify fresh compilation and dependency security checks without installing host tools.

## 2. Contract implementations

- [x] 2.1 Implement EVM registry, fungible issuance metadata, multi-asset custody and fees, retained credits, and both pause authorities.
- [x] 2.2 Implement corresponding Move behavior and immutable-publication preparation.
- [x] 2.3 Add network-specific deployment configuration for all six targets without real credentials.

## 3. Local correctness and cost verification

- [x] 3.1 Test issuance authorization, full and fractional transfers, self-transfers, and generation records on both implementations.
- [x] 3.2 Test fee splitting, reward remainders, asset and project isolation, payout failures, and arithmetic bounds.
- [x] 3.3 Test manager and owner pause precedence, withdrawal access, no burning, and no upgrade path.
- [x] 3.4 Run adversarial accounting sequences and conservation checks on both implementations.
- [ ] 3.5 Measure donation cost against holder count and mint/transfer cost against asset count; document supported practical bounds.

## 4. Sponsorship and release preparation

- [ ] 4.1 Select and wire funded EVM paymaster and Sui sponsor paths with registry call validation and isolated project budgets.
- [ ] 4.2 Verify sponsor exhaustion and unauthorized-call rejection; update developer and operator documentation.
- [ ] 4.3 Deploy and run funded end-to-end checks on Base Sepolia, opBNB Testnet, and Sui Testnet; record fresh evidence and Sui immutability.
- [ ] 4.4 Complete independent security review and deployment rehearsal, then prepare mainnet release records. Actual mainnet publication requires a separate release instruction.

## Verification evidence (2026-10-08)

- Docker Foundry v1.8.5 / Solidity 0.8.35: 24 tests passed, no failures or skips; the conservation fuzz test ran 256 cases. Two cost tests were rerun after changing only their diagnostic event names; both passed.
- Docker Sui v1.81.1: 19 tests passed, no failures. Includes generation metadata, full and fractional transfers, fee remainders, project isolation, pause permissions, arithmetic overflow, and a deterministic donation/transfer/claim sequence.
- EVM cold-call measurements: donations with 1 and 100 holders each use 140,433 gas; transfers with 1 and 6 enabled, unfunded assets use 88,505 and 164,855 gas. These are local execution measurements, not total network fees or Sui measurements; task 3.5 remains open.
- Read-only RPC simulations verified chain IDs 8453, 84532, 204, and 5611 and successfully executed MCOPY using eth_call creation data `0x6001600060205e60006000f3`. No deployment or funded transaction occurred.
- OSV query for npm `@openzeppelin/contracts` 5.7.0 returned no known advisories. Solidity dependency commit is `a6c749156e87b7b2f159c87a0ca19d323fcf35ac`. No comprehensive Sui-framework or container-image vulnerability scan has been completed.
- Compiler/linter diagnostics were reviewed. Exact token balance checks, authorized native payouts, per-item batch validation, guarded post-callback events, and Sui's direct wallet payout produce documented lint warnings; no blanket suppression was added.
- Strict OpenSpec validation and shell syntax checks passed. Funded sponsorship, testnet execution, and independent security review remain unperformed; this change is not ready to archive or publish on mainnet.
