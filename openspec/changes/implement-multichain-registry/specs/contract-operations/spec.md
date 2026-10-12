# Contract operations

## ADDED Requirements

### Requirement: Separate emergency authorities

Managers SHALL pause minting, donations, and transfers for their own projects but SHALL NOT pause withdrawals. The contract owner SHALL independently pause operations or withdrawals across all projects or for selected projects. Managers SHALL NOT override owner controls. Pauses MUST preserve balances and entitlements.

#### Scenario: Manager pause

- **WHEN** a manager pauses their project
- **THEN** minting, donations, and transfers fail while holder claims remain available unless owner withdrawal controls are active

#### Scenario: Owner withdrawal pause

- **WHEN** the owner pauses withdrawals and a manager clears their own pause
- **THEN** claims remain blocked until the owner clears the withdrawal pause and no credit is lost

### Requirement: Two-step authority handoff

On all three chains, the current manager SHALL be able to nominate a replacement manager for their project, and the current platform owner SHALL be able to nominate a replacement platform owner. Only the nominated address SHALL be able to accept its respective role. A nomination SHALL be cancellable or replaceable by the current authority before acceptance. Zero, invalid, and current-authority nominations SHALL fail. Renouncing either role without a successor SHALL NOT be supported. The old authority SHALL retain control until acceptance; after acceptance, only the new authority SHALL hold that role. Nomination, cancellation, and acceptance SHALL be observable. Handoffs SHALL preserve project balances, entitlements, fees, and pauses. A manager handoff SHALL NOT move shares or accrued credits held by the former manager. A platform-owner handoff SHALL give the new owner authority over uncollected platform fees and owner pause controls.

#### Scenario: Manager handoff

- **WHEN** the current manager nominates a new address and that address accepts
- **THEN** the new manager can mint, enable assets, and change the manager pause while the former manager can no longer perform those manager operations

#### Scenario: Platform-owner handoff

- **WHEN** the current platform owner nominates a new address and that address accepts
- **THEN** the new owner controls owner pauses and uncollected fee claims while the former owner no longer has those powers

#### Scenario: Unaccepted or unauthorized handoff

- **WHEN** a different address attempts to nominate or accept a handoff, or a nomination is cancelled before acceptance
- **THEN** the current authority remains in control and no balances, credits, fees, or pauses change

#### Scenario: Handoff while operations are paused

- **WHEN** the current authority nominates a replacement and that address accepts while operational or withdrawal pauses are active
- **THEN** the handoff completes without clearing any pause or changing balances, credits, or fees

### Requirement: Immutable independent releases

Contracts SHALL be independently deployable on Base Sepolia, Base, opBNB Testnet, opBNB, Sui Testnet, and Sui. EVM deployments SHALL have no proxy upgrade path; Sui releases SHALL retain no usable UpgradeCap. Mainnet readiness MUST include passing local and three-testnet checks plus independent security review.

#### Scenario: Release evidence

- **WHEN** a Sui deployment is recorded as immutable
- **THEN** its publication evidence proves relinquishment of upgrade authority

### Requirement: Caller-paid transaction fees

On each network, the signer who submits a transaction SHALL pay its network fee from their own wallet. The manager SHALL pay for registration and manager-authorized minting, including minting to their own wallet when a contributor lacks an address. A donor SHALL pay the network fee for their donation. A holder SHALL pay to claim or transfer their shares; if the manager holds shares awaiting delivery, the manager SHALL pay for that later transfer. Each signer SHALL maintain sufficient native gas currency on the selected network. No project gas deposit, paymaster, relayer, or sponsored transaction SHALL be required for release. Gas fees SHALL remain separate from donated assets, holder liabilities, and platform fees.

#### Scenario: Manager registers and mints

- **WHEN** a manager registers a project and later signs a mint to a contributor or their own holding wallet
- **THEN** that manager pays the gas for each transaction from their wallet on that network

#### Scenario: Donor and holder actions

- **WHEN** a donor submits a donation or a holder submits a transfer or claim
- **THEN** the submitting wallet pays the network fee; a manager transferring manager-held shares pays as the holder

#### Scenario: Insufficient gas funds

- **WHEN** the signer lacks enough native gas currency on the selected network
- **THEN** the transaction cannot be submitted or executed until that wallet is funded; no donation or holder funds are redirected to gas

### Requirement: Manager-signed contribution mint workflow

A trusted GitHub Actions workflow SHALL detect added or modified JSON contribution records under `trophies/` when a contribution pull request is merged into protected `main`. Each file SHALL be named `YYYYMMDDHHmmss-<branch-slug>.json`, using a valid UTC timestamp and the source branch name normalized to lowercase letters, digits, and hyphens, and SHALL contain one approved record with a unique external reference, target network and project, contributor address when available, human-readable decimal trophy quantity, and description. The workflow SHALL accept up to 18 fractional decimal places, convert one trophy to 10^18 base units exactly, and reject zero, negative, scientific-notation, over-precision, and out-of-range quantities before signing. The workflow SHALL validate each changed file before granting a signing job access to secrets and SHALL process all valid changed records, including records targeting different networks, without executing unmerged pull-request code. It SHALL use the current on-chain manager's wallet credentials supplied through protected GitHub secrets to sign a single mint on Base, opBNB, or Sui. If the contributor has no valid address, it SHALL mint to the manager's own address and record the undelivered obligation off-chain. It SHALL validate deployed registry identifiers, verify the signing address is the current project manager, and check for an existing successful mint with the same external reference before submitting. A retry after an uncertain result SHALL reconcile chain state before minting again. It SHALL record a transaction reference and effective recipient without exposing credentials or personal contributor details publicly. A manager handoff SHALL require replacing the workflow credential before subsequent automated minting.

#### Scenario: Merged contribution file with an address

- **WHEN** a pull request adds a valid contribution file with an address and is merged into protected `main`, and no matching successful mint exists
- **THEN** it mints once to that address using the current manager's signer and records the transaction reference

#### Scenario: Merged contribution file without an address

- **WHEN** the merged contribution file has no contributor address and no matching successful mint
- **THEN** it mints once to the manager's wallet and records the quantity and outstanding delivery obligation for later holder-authorized transfer

#### Scenario: Retry or invalid request

- **WHEN** a record was already minted, the manager credential is stale, the target deployment is unknown, or an input is invalid
- **THEN** the workflow does not submit another mint and reports the reason without revealing the signing credential

#### Scenario: Merge contains multiple contribution files

- **WHEN** a merge adds or modifies several valid contribution files across supported networks
- **THEN** each file is routed to its own project and network signing environment and receives a separate mint result; a validation failure prevents signing with any manager credential

#### Scenario: Human-readable trophy quantity

- **WHEN** a merged trophy record requests `1.5` trophies
- **THEN** the workflow mints exactly `1500000000000000000` base units and records both the human quantity and converted base units in its result

#### Scenario: Invalid trophy filename or quantity

- **WHEN** the timestamp is not a valid UTC date, the branch slug is unsafe, or the quantity cannot be represented exactly with 18 decimal places
- **THEN** validation fails before any manager credential is used
