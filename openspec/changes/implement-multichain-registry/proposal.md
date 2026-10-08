# Multichain project registry contracts

## Why

The repository contains agreed product rules but no executable contracts. Implement the same donation and fungible-share behavior on Base, opBNB, and Sui with independently verifiable accounting.

## What Changes

- Add an immutable Solidity registry for Base and opBNB and an immutable Move package for Sui.
- Add unlimited manager-authorized issuance, 18-decimal shares, and on-chain generation records.
- Add multi-asset donations, a flat 0.5% platform fee, retained seller entitlements, and explicit withdrawals.
- Add project-manager pauses and contract-owner emergency controls, including withdrawal pauses.
- Add local verification, sponsorship integration, and deployment preparation for all six networks.

## Capabilities

### New Capabilities

- `project-registry`: Projects, fungible shares, generation records, and permissions.
- `dividend-accounting`: Multi-asset custody, fees, retained entitlements, rounding, and withdrawals.
- `contract-operations`: Emergency controls, immutable releases, sponsorship, and network-specific verification.

### Modified Capabilities

None; no canonical specifications exist yet.

## Impact

New Solidity and Move source, tests, dependency configuration, deployment records, and developer instructions. Testnets are Base Sepolia, opBNB Testnet, and Sui Testnet; mainnets are Base, opBNB, and Sui. Implementation does not authorize live mainnet deployment.

## Non-goals

Frontend, bridges, synchronized cross-chain balances, burning, upgradeable proxies, and individual token provenance.

## Open decisions and constraints

No holder loop is allowed on donation. Transfers and minting may touch the project's funded assets, so their cost must be measured separately. Arbitrary asset behavior needs compatibility checks rather than assumed correctness. Toolchain installation, funded testnet accounts, and sponsorship infrastructure require available access before their checks can complete.
