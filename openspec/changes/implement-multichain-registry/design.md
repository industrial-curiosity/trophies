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

A project creator is its manager. Only that manager issues shares, enables assets, and changes the project's manager pause. Manager pause blocks minting, donations, and transfers; it never blocks claims. The contract owner has an independent global operational pause and global withdrawal pause plus independent per-project equivalents. Effective operational pause is the OR of manager, owner-project, and owner-global flags. Effective withdrawal pause includes only owner withdrawal flags. Managers cannot clear owner flags. Fee collections obey owner withdrawal pauses. Pauses never erase entitlement, change supply, or redirect holder funds. Initially keep manager and owner identities fixed to avoid extra transfer-of-authority machinery.

### Immutability and sponsorship

No EVM proxy or delegatecall upgrade path. Sui publication must irreversibly relinquish UpgradeCap and verify that transaction result before release is considered immutable.

Sponsorship remains part of the change: bind sponsorship to approved registry calls, preserve the user's identity, maintain project budgets separately from donations, and prohibit arbitrary relaying or payouts from holder vaults. EVM uses an existing ERC-4337 paymaster/bundler interface rather than a custom account-abstraction stack; Sui uses protocol-sponsored transactions. Sponsor credentials and funded accounts are external prerequisites. Provider selection and budget reconciliation are still open; no funded gas-pool placeholder will be reported as functioning sponsorship.

### Tooling

Use Docker for both toolchains; no host tool installation is authorized. Pin Foundry v1.8.5 and Sui v1.81.1 images by digest, Solidity 0.8.35 with the Cancun opcode target (MCOPY verified by read-only eth_call on all four EVM targets), OpenZeppelin Contracts v5.7.0, and the Sui framework commit in Move.lock. Advisory scanning covers the pinned OpenZeppelin version; it is not a full framework audit.

## Risks / Trade-offs

- Many registered assets increase transfer cost → manager-controlled registration, cost measurements, and documented practical limits; no silent hard cap.
- A token can change behavior after registration → isolated per-asset claims and exact balance checks, with unsupported behavior clearly documented.
- Owner can pause withdrawals indefinitely → explicit permission tests and documentation of owner trust; immutability does not eliminate administrative powers.
- High precision still has finite arithmetic bounds → boundary tests and checked operations; never accept wrapping.
- Immutable defects cannot be patched in place → adversarial tests, independent security review, and replacement deployment procedures.

## Migration Plan

No stored data exists to migrate. Verify locally, then deploy and exercise independently on Base Sepolia, opBNB Testnet, and Sui Testnet. Preserve network-specific deployment evidence. Mainnet publication requires a separate release action after readiness checks. Replacement deployments do not automatically move previous balances or liabilities.

## Open Questions

- Funded sponsor and deployment access; local Docker execution is authorized.
- Sponsor provider, project budget custody/reconciliation, and funded testnet credentials.
- Practical asset and share bounds established by implementation benchmarks.
