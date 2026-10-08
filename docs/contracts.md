# Contract behavior and release procedure

## Ownership and units

One full trophy is 10^18 base units on all chains. A project's creator is its
manager; only that manager mints or enables additional funding assets. There is
no product supply cap and no burn or revocation operation. EVM balances use an
ERC-1155 ID per project with operator approvals; Sui uses a project-local address
ledger and direct sender-authorized transfers, rather than a freely transferable
Coin or NFT. This keeps historical earnings attached to wallets without transfer
hooks that users could bypass.

Each mint records description, issuer, recipient, quantity, and external reference
in an on-chain event. Neither implementation maintains per-unit provenance or an
external metadata server. Manager and platform-owner identities are fixed for the
initial implementation. Immutability does not remove administrative pause powers.

## Multi-asset donations and accounting

Projects support native currency and manager-enabled compatible token assets.
There is no platform allowlist or one-asset limit. Manager enablement prevents
unsolicited tokens from increasing every holder's transfer cost. Direct transfers
outside the donation API do not create entitlements and are not recoverable through
an administrative sweep.

Each project/asset has its own cumulative index, custody, platform fees, and holder
credits. Donations use the asset's own base units, without valuation or conversion.
The fee is one part in 200, retained in that asset for owner collection. Division
remainders carry between donations for that project/asset, preventing fee evasion
by splitting a donation. Only net donations increase the reward index.

Minting and transfers accrue the affected wallets' credits using their old balances
before changing ownership. They do not pay funds. A seller who transfers all shares
can still claim past earnings. Recipients keep their own previous credits but never
receive a seller's history. Claims and fee collection operate one asset at a time.

Rewards use a 10^36 internal scale. Whole asset units are paid; holder fractional
remainders persist indefinitely. Donation-division dust stays unallocated in the
vault and is not reassigned to later minted shares. There is no liability or dust
sweep. Finite arithmetic bounds are enforced even though issuance has no product
cap: share supply is u128-sized; EVM cumulative receipts per project/asset are at
most 2^128-1. Sui Coin/Balance amounts additionally have u64 limits. Overflow fails
atomically.

EVM deposits and payouts require exact token balance changes. SafeERC20 accommodates
standard return-value variations, but fee-on-transfer and rebasing assets are not
guaranteed compatible. A token issuer can also block transfers later. Failed payouts
revert claim effects; other asset claims and trophy transfers remain independent.
Sui vaults hold typed Coin<T> balances. No asset swaps, wrappers, or price oracles
are required.

Donation work does not iterate holders or assets. Minting and share transfers touch
every enabled asset for the project, so their cost grows with asset count. Practical
network limits require testnet measurements; an unlimited product asset policy does
not make arbitrarily large transfers executable.

## Emergency controls

| Authority | Scope | Can block |
| --- | --- | --- |
| Manager | Own project | Minting, donations, transfers, and asset enablement |
| Contract owner | Selected project or globally | Operations and withdrawals independently |

Withdrawal controls also cover platform fee collection. Manager pauses never block
claims. Effective pauses combine independent flags; a manager cannot clear an owner
pause. Owner withdrawal pauses can prevent claims indefinitely, but cannot erase
credits, burn shares, or confiscate holder funds. Pause changes emit events.

## Sponsorship

Gas sponsorship is not implemented yet. The contracts preserve caller authorization
for account-based issuance on EVM and protocol-sponsored transactions on Sui, but
that alone does not supply gas. A funded sponsor, call policy, and isolated project
budgets must be implemented and verified before this milestone is complete.

## Deployment procedure

1. Run both container test suites, review dependency advisories, inspect compiler
   diagnostics, and complete independent security review. Stop on unexplained failures.
2. Select the target from `deployments/networks.json`; prepare a dedicated funded
   deployer through a secure wallet/keystore workflow. Keep credentials out of the
   repository and command arguments.
3. For EVM, use `contracts/evm/script/DeployRegistry.s.sol`. Set non-secret
   `EXPECTED_CHAIN_ID` and `OWNER_ADDRESS`; the script rejects a chain mismatch.
   Configure the approved RPC and keystore in the container without using the local
   test configuration. Rehearse before broadcasting and verify the deployed owner.
4. For Sui, publish using a dedicated client configuration for the selected network.
   Locate the generated Registry object and UpgradeCap in publication effects. Call
   `0x2::package::make_immutable` with that UpgradeCap and verify finalization on-chain.
   Publication alone is not an immutable release; stop if relinquishment fails.
5. Record contract/package and registry IDs, transaction identifiers, network,
   source revision, toolchain versions, immutable-release evidence, and test results.
   Exercise registration, issuance, multi-asset donation, transfer, claims, fees,
   both pause authorities, and funded sponsorship on all three testnets.
6. Mainnet publication is a separate release action after all readiness checks.
   Each chain has independent balances and vaults. Replacement releases require
   explicit migration design; they cannot repair earlier immutable deployments.

## Diagnostics and dependencies

OpenZeppelin Contracts v5.7.0 is the pinned Solidity dependency. Its upstream test
submodules are fetched by Foundry setup but are not contract runtime dependencies.
Sui's framework and standard library revisions are recorded in Move.lock. Advisory
scans cannot establish correctness of these contracts or every framework dependency.

The Sui linter flags claim's direct transfer to the sender as non-composable. That
is intentional wallet payout behavior: no user-managed payout object is required.
Foundry may flag exact token-balance comparisons and caller-directed native payouts;
these enforce the asset compatibility and authorized claim rules. Per-item batch\nvalidation also produces loop-revert hints; those checks enforce atomic rejection\nof invalid projects, pauses, amounts, and supply overflow. Post-callback mint and\ndonation events are guarded against accounting reentrancy. Do not suppress
diagnostics globally; review them with the relevant authorization and rollback tests.

## Local verification measurements

On 2026-10-08, the Solidity suite passed 24 tests including 256 fuzz cases, and
the Move suite passed 19 tests. The Solidity cost fixtures measured 140,433 gas
for donations with both 1 and 100 holders; transfers measured 88,505 gas with
one enabled asset and 164,855 gas with six enabled, unfunded assets. Funded asset
transfers incur additional credit writes. These local cold-call measurements
exclude deployment setup and do not estimate total L2 fees or dollar costs.
Sui cost measurements and practical testnet limits are still pending.

The pinned OpenZeppelin 5.7.0 version had no known advisories returned by an OSV
package/version query on that date. This check does not cover the complete Sui
framework or container images and does not replace contract security review.

Read-only eth_call simulations executed MCOPY successfully on Base, Base Sepolia,
opBNB, and opBNB Testnet, with chain IDs matching the deployment configuration.
The Cancun compilation target is required by the selected OpenZeppelin dependency.
These simulations did not deploy contracts or exercise the registry end to end.
