# Project registry

## ADDED Requirements

### Requirement: Authorized unlimited issuance

On all three chains the registry SHALL associate each project with a manager. Only that manager SHALL mint fungible trophies, with 18 decimal places and no product supply cap or permanent issuance closure. Invalid project IDs, zero quantities, invalid recipients, and arithmetic overflow MUST fail atomically. No holder or manager SHALL burn or revoke shares.

#### Scenario: Continued issuance

- **WHEN** the manager issues additional shares after previous donations
- **THEN** supply increases and existing entitlements remain intact while the new shares receive no earlier donations

#### Scenario: Unauthorized issuance

- **WHEN** a different wallet attempts to mint
- **THEN** the operation fails without changing balances or supply

### Requirement: Generation record

Every successful mint SHALL record description, issuer, recipient, quantity, and external reference on-chain. Fungible balances SHALL NOT require tracking the identity of individual units.

#### Scenario: Mint metadata

- **WHEN** the manager successfully mints a fractional amount
- **THEN** an issuance record contains the supplied description and external reference, actual issuer and recipient, and exact base-unit quantity

### Requirement: Fungible ownership transfer

Only the holder or an explicitly authorized operator SHALL transfer shares. Transfers SHALL conserve project supply and preserve sender and recipient accrued entitlement, including fractional remainders. Transfers SHALL NOT pay donation assets automatically.

#### Scenario: Complete transfer

- **WHEN** a holder transfers all shares after earning rewards
- **THEN** their share balance becomes zero and their previous earnings remain withdrawable by their wallet while the recipient receives no seller earnings

#### Scenario: Self transfer

- **WHEN** a holder transfers to themselves
- **THEN** supply, balance, and total entitlement are unchanged
