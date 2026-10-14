# Contract implementation design

## Context

The repo contains product documentation and OpenSpec context, with no contracts or build configuration. Base and opBNB share an EVM implementation; Sui needs Move. Contracts are immutable and network-local.

## Goals / Non-Goals

Implement unlimited issuance, fungible 18-decimal shares, multi-asset distributions, preserved seller entitlements, a 0.5% fee, and two levels of emergency controls. Exclude frontend, burning, upgrade authority, bridges, and unique-token provenance.

## Decisions

### Custody and asset registration

Keep one ledger per project and asset. Managers enable donation assets for their projects without a platform asset allowlist or a one-asset restriction. This prevents strangers from increasing transfer work with unsolicited token types. Native currency is supported alongside compatible tokens. Direct unsolicited transfers do not count as donations or earn rewards.

For EVM assets, use SafeERC20 and require exact balance deltas on deposits and payouts; reject observable fee-on-transfer behavior. Rebasing assets and assets whose transfers can later be arbitrarily disabled are not guaranteed compatible. No wrapper, swap, price oracle, or bridge is introduced. Sui uses typed Coin<T> vaults associated with asset type names. Claims and fee collection are per asset, isolating payout failures from other assets and from share transfers.

### Share and generation representation

Use an ERC-1155 project ID on EVM, with 10^18 base units per full trophy and no burn entry point. Use project-local address balances on Sui; this is fungible ownership rather than unique share objects, with no split/merge API needed. Record description, issuer, recipient, base-unit quantity, and external reference in chain events. The description itself is recorded, not merely a hash. External reference content is not copied on-chain.

When the contributor has a valid address for the selected chain, the manager mints directly to it. Otherwise the manager mints to their own wallet and the project records the contributor, chain, project, quantity, and holding wallet off-chain for later delivery. Give the contributor chain-specific wallet instructions. When the contributor supplies an address, the wallet holding the shares transfers the recorded quantity; it does not mint again. This is manager custody, not an on-chain reservation: fungible units are not segregated and the manager can transfer or claim while holding them. The manager earns donations during custody, and accrued credits remain with that wallet after delivery. Generation metadata records the actual manager recipient, while the project keeps the contributor association off-chain without publishing personal details. The registry rejects prohibited recipients but cannot establish who controls a valid address. Operational pauses can delay minting or delivery.

### Dividend accounting

Use an integer index with scale Q = 10^36 and checked arithmetic. Per asset, donation of net amount D with supply S adds floor(D*Q/S) to the index. Supply and credited amounts use bounded integers; overflows abort without changing state. The implementation must document the chosen bounds and use full-width multiplication/division where supported.

Before minting to or transferring from/to an address, settle each registered asset using the old balance B:

```text
credit_scaled += B * (current_index - checkpoint)
checkpoint = current_index
```

Then change balances. New recipient balances begin at current indexes; existing recipients keep their past credits. A self-transfer cannot duplicate accrual. A claim settles only the requested asset and pays floor(credit_scaled/Q), retaining credit_scaled modulo Q. Zero-share accounts can still claim. No external asset payout occurs during balance changes.

Donation division dust stays unallocated in the vault; it is not carried across supply changes, which would give new shares historic donations. Holder fractional remainders persist indefinitely. There is no sweep of holder liabilities or project dust. Conservation is deposits = payouts + platform fees paid + retained vault funds, with entitlement never exceeding custody. Supply has no product cap but has machine arithmetic limits.

Donations are O(1) in holder count and asset count. Mint/transfer work is O(number of enabled project assets), not O(holder count). Test this distinction; do not claim unlimited asset count implies bounded transaction costs.

### Platform fee

Fees accrue in the donated asset, deducted from received donations. Use 1/200 of gross received amount. Carry fee-division remainder per project/asset so splitting donations does not avoid the fee. Platform fees are accounted separately from holder vault liabilities and collected explicitly by the contract owner. No USD conversion, cap, or external pricing service is needed.

### Authorization and pauses

A project creator is its initial manager. Only the current manager issues shares, enables assets, and changes the project's manager pause. Manager pause blocks minting, donations, and transfers; it never blocks claims. The current contract owner has an independent global operational pause and global withdrawal pause plus independent per-project equivalents. Effective operational pause is the OR of manager, owner-project, and owner-global flags. Effective withdrawal pause includes only owner withdrawal flags. Managers cannot clear owner flags. Fee collections obey owner withdrawal pauses. Pauses never erase entitlement, change supply, or redirect holder funds.

Both manager and platform-owner authority use separate two-step handoffs: the current authority nominates a valid different address, can cancel or replace that nomination, and the nominee accepts. No renunciation to a zero address. Existing authority remains until acceptance; the old address loses that role on acceptance. Emit nomination, cancellation, and acceptance events. Keep balances, credits, fees, and pause flags unchanged. The new platform owner controls uncollected fees. Manager-role transfer does not move shares held by the former manager, including undelivered contributor shares, or historical credits. Before a manager handoff, the project must reconcile outstanding delivery records and arrange custody transfers; the contract cannot enforce off-chain obligations or move the old wallet's shares automatically. Update the mint workflow credential after acceptance.

### Immutability and transaction fees

No EVM proxy or delegatecall upgrade path. Sui publication must irreversibly relinquish UpgradeCap and verify that transaction result before release is considered immutable.

The signer pays each network fee in native currency. The manager pays to register and mint; the donor pays to donate; holders pay to transfer and claim. A manager delivering shares held in their wallet pays as that holder. No gas deposit or sponsor infrastructure is included. Each network needs its own funded wallet, and donated assets, holder liabilities, and platform fees never pay gas.

Store one approved contribution per `trophies/YYYYMMDDHHmmss-<branch-slug>.json` file. The record contains a unique external reference, network, project, optional recipient, human-readable decimal trophy quantity, and description. Require pull-request review and branch protection for `main`. A push to `main` after a merge detects added or modified files in that directory from the pushed commit range, validates their UTC timestamps, safe branch slugs, and decimal quantities without secrets, converts quantities exactly to 18-decimal base units, and creates one mint job per record. The workflow checks out that exact merge revision, validates the deployment and current manager address, checks chain state for the reference, then submits a manager-signed transaction. Project-and-network-specific GitHub environments provide the signing keys. Serialize transactions per network to avoid wallet nonce conflicts across merged pull requests; preserve pending runs in the queue. A separate manager wallet dedicated to automation limits exposure from the CI key, although manager-held shares and accrued credits in that wallet remain at risk if the key is compromised. Do not log the credential or contributor identity. For uncertain submissions, query chain state before retrying. Preserve the transaction hash and effective recipient in a durable, access-controlled off-chain record; a missing address creates an outstanding delivery obligation there. After a manager handoff, rotate the workflow credential to the new manager before processing another contribution.

### Tooling

Use Docker for both toolchains; no host tool installation is authorized. Pin Foundry v1.8.5 and Sui v1.81.1 images by digest, Solidity 0.8.35 with the Cancun opcode target (MCOPY verified by read-only eth_call on all four EVM targets), OpenZeppelin Contracts v5.7.0, and the Sui framework commit in Move.lock. Advisory scanning covers the pinned OpenZeppelin version; it is not a full framework audit.

## Risks / Trade-offs

- Many registered assets increase transfer cost → manager-controlled registration, cost measurements, and documented practical limits; no silent hard cap.
- A token can change behavior after registration → isolated per-asset claims and exact balance checks, with unsupported behavior clearly documented.
- Owner can pause withdrawals indefinitely → explicit permission tests and documentation of owner trust; immutability does not eliminate administrative powers.
- High precision still has finite arithmetic bounds → boundary tests and checked operations; never accept wrapping.
- Immutable defects cannot be patched in place → adversarial tests, independent security review, and replacement deployment procedures.
- Manager-held shares depend on the holding wallet for later delivery; role handoff does not recover them → record outstanding deliveries and reconcile custody before accepting a handoff.
- Automated manager credentials can mint or move manager-held shares if compromised → use a dedicated wallet with limited gas, protected secrets, reviewed contribution pull requests, and branch protection; rotate credentials after a handoff.

## Migration Plan

No stored data exists to migrate. Verify locally, then deploy and exercise independently on Base Sepolia, opBNB Testnet, and Sui Testnet. Preserve network-specific deployment evidence. Mainnet publication requires a separate release action after readiness checks. Replacement deployments do not automatically move previous balances or liabilities.

Follow the [immutable release process](../../../docs/testnet-guide.md#immutable-release-process-from-testnet-iterations-to-mainnet)
for fresh testnet iterations, frozen release candidates, independent review,
deployment verification and small-value mainnet exercises. Passing tests or an
audit cannot guarantee the absence of defects; retain evidence for the exact release.

## Open Questions

- Manager signing credentials and funded testnet deployment access; local Docker execution is authorized.
- Access-controlled durable delivery record and its operator for a production workflow.
- Practical asset and share bounds established by implementation benchmarks.
