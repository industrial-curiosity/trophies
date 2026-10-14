# Trophies

Immutable project registry contracts for Base, opBNB, and Sui. Managers issue
fungible trophies with 18 decimal places and unlimited ongoing issuance. Donations
accrue to holders at the time of donation; transfers preserve the seller's earned
withdrawal eligibility. Manager and platform-owner roles support two-step handoffs.
The platform fee is 0.5% in the donation asset.

The implementation is under active verification. Local tests do not constitute
an audit or mainnet readiness. No network deployment has been performed.

Contract fixes require fresh deployments. Follow the
[immutable release process](docs/testnet-guide.md#immutable-release-process-from-testnet-iterations-to-mainnet)
for testnet iterations, release-candidate verification, and mainnet launch gates.

## Development

Use Docker; no host Solidity or Move compiler is required. The wrapper pins
Foundry v1.8.5 and Sui v1.81.1 images by digest. Sui runs under amd64 emulation
on Apple Silicon. Setup fetches the images and OpenZeppelin Contracts v5.7.0;
Move dependencies are pinned by the committed lockfile.

```bash
scripts/contracts.sh setup
scripts/contracts.sh test
scripts/contracts.sh evm fmt --check
scripts/contracts.sh sui move build
```

For an interactive testnet deployment and native-currency smoke run, use
`npm run testnet:deploy`. It prompts for the selected testnet, RPC, disposable
wallet funding, donation amount, and a dedicated testnet owner key. See the
[testnet guide](docs/testnet-guide.md) for its coverage and limits.

Builds use ignored local caches. The Move build configuration is keyless and
uses a dummy local RPC endpoint; tests do not access funded wallets or live
chains. Do not use this build configuration for publication.

## Contract layout

- `contracts/evm/src/ProjectRegistry.sol`: ERC-1155 registry shared by Base and opBNB.
- `contracts/sui/sources/registry.move`: project-local fungible address ledger and typed asset vaults.
- `contracts/evm/test` and `contracts/sui/tests`: isolated local contract tests.
- `deployments/networks.json`: six separate deployment targets; null identifiers mean undeployed.
- [Contract behavior and release procedure](docs/contracts.md).
- [Contributor wallet setup for Base, opBNB, and Sui](docs/contributor-wallets.md).
- [Manager-signed contribution mint workflow](docs/mint-automation.md).
- [Contract review, testnet deployment, wallet testing, and fixes](docs/testnet-guide.md).
- [Product overview](docs/overview.md).
- [Active implementation tasks](openspec/changes/implement-multichain-registry/tasks.md).

## Verification scope

The tests exercise minting, transfers, dividends, fees, remainders, permissions,
and pauses. Each signer pays their own network fees; merging a reviewed
timestamped trophy file into protected `main` triggers a manager-signed testnet mint
after deployment and secret setup.
Funded testnet end-to-end checks and independent security review remain release
requirements.
