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
external metadata server. In the current source, manager and platform-owner
roles support separate two-step handoffs: the current authority nominates an
address, may cancel or replace it, and the nominee accepts. The old authority
remains active until acceptance. Role handoffs do not clear pauses or move shares,
credits, or vault funds. Immutability does not remove administrative pause powers.

If a contributor has an address on the selected chain, the manager mints directly
to it. Otherwise the manager mints to their own wallet, records the undelivered
quantity and contributor off-chain, and transfers that quantity after the
contributor supplies an address; see [Contributor wallet setup](contributor-wallets.md).
The contracts permit these actions but do not reserve or segregate the manager's
fungible shares for a contributor. The contract rejects invalid recipients but
cannot prove who controls a valid address. Donations made while the manager holds
the shares accrue to the manager's wallet, and those credits stay there after
the shares transfer. Manager-role handoff will not move these shares or credits.

## Manager-held delivery record

When minting to the manager for a contributor without a wallet, the project must
maintain a private delivery record with the contribution reference, chain and
network, project ID, contributor identity, quantity in base units, holding wallet,
mint transaction, and delivery status. When the contributor provides an address,
record it and the transfer transaction. Compare the recorded quantity and holding
wallet with the on-chain mint and transfer events. Do not put personal identity or
recovery credentials in the on-chain description or external reference.

Before accepting a manager-role handoff, reconcile every undelivered allocation.
The holding wallet must remain available to authorize delivery or transfer the
shares to a successor wallet. The role handoff itself cannot move the holdings;
the former manager can still transfer shares as their holder wallet afterward.
The registry cannot enforce these private delivery records or the manager's
promise to deliver.

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

## Network fees

Each transaction signer pays gas from their own wallet on the selected network.
The manager pays to register and mint, including mints to their own wallet for
contributors without an address. Donors pay to donate. Holders pay to transfer
and claim; a manager delivering shares from their wallet pays as that holder.
The manager should keep native gas currency on every network where they mint.
Gas does not come from donation custody or platform fees. There is no gas pool,
paymaster, or sponsored transaction path in this release.

The [contribution mint workflow](mint-automation.md) signs from a configured
manager wallet on the three testnets. Nonempty external references are unique
per project on-chain; a retry cannot mint the same contribution twice. Empty
references remain valid for manual mints. The workflow cannot run against a
network until its deployment identifiers and manager credential are configured.

## Deployment procedure

Use the [testnet walkthrough](testnet-guide.md) for container commands, faucet
links, wallet exercises with expected results, and replacement deployments.

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
   both pause authorities, and manager-signed contribution mints on all three testnets.
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
these enforce the asset compatibility and authorized claim rules. Per-item batch
validation also produces loop-revert hints; those checks enforce atomic rejection
of invalid projects, pauses, amounts, and supply overflow. Post-callback mint and
donation events are guarded against accounting reentrancy. Do not suppress
diagnostics globally; review them with the relevant authorization and rollback tests.

## Local verification measurements

On 2026-10-12, the Solidity cost fixtures measured 140,455 gas for donations
with both 1 and 100 holders. Minting with a nonempty contribution reference
measured 126,424 gas with one enabled asset and 174,587 gas with six enabled
assets. Transfers measured 88,527 and 164,877 gas at those same asset counts.
These local cold-call measurements use unfunded assets; funded assets can add
credit writes. They exclude deployment
setup and EVM L2 data charges. The
five-asset difference increased mint cost by 48,163 gas and transfer cost by
76,350 gas in this fixture. There is no universal safe asset count: test the
actual project asset set and maximum transaction size on each target network
before enabling more assets. Sui transaction cost measurements and practical
network limits are still pending funded testnet checks.

The pinned OpenZeppelin 5.7.0 version had no known advisories returned by an OSV
package/version query on that date. This check does not cover the complete Sui
framework or container images and does not replace contract security review.

Read-only eth_call simulations executed MCOPY successfully on Base, Base Sepolia,
opBNB, and opBNB Testnet, with chain IDs matching the deployment configuration.
The Cancun compilation target is required by the selected OpenZeppelin dependency.
These simulations did not deploy contracts or exercise the registry end to end.
