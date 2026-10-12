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

### Requirement: Contributor delivery with or without an address

For a contributor who supplies an address on the selected chain, the manager SHALL mint directly to that address. If the contributor has no address, the manager SHALL still mint the intended quantity to the manager's own wallet and the project SHALL record the contributor, chain, project, quantity, and holding wallet needed for later delivery. The project SHALL give the contributor wallet creation and address-sharing instructions for Base, opBNB, and Sui. After the contributor supplies an address, the wallet holding their shares SHALL transfer the recorded quantity to it. This workflow is a project obligation: fungible shares are not segregated by contributor on-chain, and the registry cannot verify that a supplied address belongs to the contributor. Invalid recipient addresses SHALL fail atomically.

#### Scenario: Contributor has no address

- **WHEN** an active project is ready to issue shares for a contributor who has not provided an address on the selected chain
- **THEN** the manager mints to their own wallet, the generation record names the manager as issuer and recipient, and the project records the outstanding delivery obligation and provides wallet setup instructions

#### Scenario: Contributor supplies an address

- **WHEN** the contributor provides a valid address for the selected chain before issuance
- **THEN** the manager mints directly to it and the generation record identifies that address as the recipient

#### Scenario: Delivery after manager-held mint

- **WHEN** the contributor later provides a valid address and the holding wallet transfers the recorded quantity while transfers are enabled
- **THEN** the contributor receives those shares without a second mint or supply change, and earns donations only from the time they hold the shares

#### Scenario: Manager custody earnings

- **WHEN** donations occur after shares are minted to the manager but before delivery to the contributor
- **THEN** those donation entitlements remain claimable by the manager's wallet after transfer and are not automatically reassigned to the contributor

#### Scenario: Manager role changes before delivery

- **WHEN** the project manager role moves to another address while undelivered shares remain in the former manager's wallet
- **THEN** the role transfer does not move those shares or their accrued credits, and delivery still requires authorization by the wallet holding the shares

### Requirement: Generation record

Every successful mint SHALL record description, issuer, recipient, quantity, and external reference on-chain. A nonempty external reference SHALL identify at most one successful mint per project, so retrying an automated contribution cannot create duplicate shares. Empty references remain permitted for manual minting. Fungible balances SHALL NOT require tracking the identity of individual units.

#### Scenario: Mint metadata

- **WHEN** the manager successfully mints a fractional amount
- **THEN** an issuance record contains the supplied description and external reference, actual issuer and recipient, and exact base-unit quantity

#### Scenario: Duplicate contribution reference

- **WHEN** the manager attempts another mint in the same project with an external reference used by an earlier successful mint
- **THEN** the second mint fails without changing supply or balances, including when the recipient or quantity differs

### Requirement: Fungible ownership transfer

Only the holder or an explicitly authorized operator SHALL transfer shares. Transfers SHALL conserve project supply and preserve sender and recipient accrued entitlement, including fractional remainders. Transfers SHALL NOT pay donation assets automatically.

#### Scenario: Complete transfer

- **WHEN** a holder transfers all shares after earning rewards
- **THEN** their share balance becomes zero and their previous earnings remain withdrawable by their wallet while the recipient receives no seller earnings

#### Scenario: Self transfer

- **WHEN** a holder transfers to themselves
- **THEN** supply, balance, and total entitlement are unchanged
