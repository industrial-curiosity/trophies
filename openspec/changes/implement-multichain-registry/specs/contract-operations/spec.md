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

### Requirement: Immutable independent releases

Contracts SHALL be independently deployable on Base Sepolia, Base, opBNB Testnet, opBNB, Sui Testnet, and Sui. EVM deployments SHALL have no proxy upgrade path; Sui releases SHALL retain no usable UpgradeCap. Mainnet readiness MUST include passing local and three-testnet checks plus independent security review.

#### Scenario: Release evidence

- **WHEN** a Sui deployment is recorded as immutable
- **THEN** its publication evidence proves relinquishment of upgrade authority

### Requirement: Funded sponsorship

Sponsored calls SHALL preserve caller authorization and spend only an explicitly funded sponsorship budget. Sponsor policy SHALL validate registry target, operation, network, and project budget. Donation vaults SHALL NOT fund sponsorship.

#### Scenario: Sponsored issuance

- **WHEN** an authorized manager issues trophies using funded sponsorship on a supported testnet
- **THEN** the transaction succeeds without charging the manager gas and project sponsorship spending is recorded separately from donation liabilities

#### Scenario: Unauthorized sponsored call

- **WHEN** a caller requests sponsorship for an unauthorized operation or exhausted budget
- **THEN** sponsorship is rejected without exposing sponsor credentials or spending holder funds
