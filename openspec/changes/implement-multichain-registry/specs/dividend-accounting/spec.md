# Dividend accounting

## ADDED Requirements

### Requirement: Multiple isolated funding assets

Each project SHALL support manager-enabled native currency and multiple compatible token assets without a platform asset allowlist. Custody, indexes, credits, and fees MUST be isolated by project and asset. Donations MUST NOT iterate holders. Unsupported observable token behavior SHALL fail atomically.

#### Scenario: Two assets

- **WHEN** a project receives donations in two enabled assets
- **THEN** holders acquire separate claimable amounts in those assets without conversion

#### Scenario: Empty project

- **WHEN** a donation is attempted with zero share supply or zero amount
- **THEN** it fails without charging fees or allocating rewards

#### Scenario: Cross-project claim

- **WHEN** a wallet claims from a project where it has no entitlement
- **THEN** funds belonging to another project cannot be paid to it

### Requirement: Flat platform fee

The registry SHALL accrue 0.5% of received donations as platform-owner fees in the donation asset, without a dollar cap or price lookup. Fee remainders SHALL be preserved per project/asset so donation splitting does not evade fees. Only net donations SHALL accrue to holders.

#### Scenario: Fee allocation

- **WHEN** a project receives 20,000 base units with no earlier fee remainder
- **THEN** 100 units accrue as platform fees and 19,900 units are used for holder allocation

#### Scenario: Split donations

- **WHEN** equivalent gross amounts are donated in one transaction or multiple transactions to the same project and asset
- **THEN** the cumulative fee and fee remainder are equal

### Requirement: Persistent withdrawable eligibility

Claims SHALL pay only the caller's accrued entitlement for the selected project/asset. Fractional holder remainders SHALL persist; holder entitlement SHALL never expire. A claim SHALL NOT require a positive share balance. Failed payouts MUST revert their accounting effects.

#### Scenario: Claim after selling

- **WHEN** a zero-share former holder claims earned dividends
- **THEN** the holder receives the whole asset units owed and keeps the fractional remainder

#### Scenario: Repeated small claims

- **WHEN** a holder claims repeatedly while accumulating sub-unit earnings
- **THEN** no fractional entitlement is discarded or duplicated

### Requirement: Conservation and ordering

Accounting SHALL follow transaction execution order, including operations within one block. Donation-division dust SHALL remain in custody without being redistributed to newly issued shares. No admin SHALL sweep holder liabilities or unallocated project dust.

#### Scenario: Mint between donations

- **WHEN** shares are minted after one donation and before the next
- **THEN** those shares participate only in the later donation

#### Scenario: Liability conservation

- **WHEN** valid donations, transfers, issuance, fee collections, and claims are interleaved
- **THEN** payouts and remaining liabilities never exceed received funds and every share transfer conserves supply
