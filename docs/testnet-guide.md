# Reviewing and testing Trophies on testnets

This guide covers the implemented contracts, deploying them yourself, checking
their behavior with wallets, and replacing a deployment after a defect. Commands
run from the repository root unless stated otherwise. Toolchains stay
inside Docker. Deployment commands spend testnet funds and publish permanent
public records; they have not been executed as part of writing this guide.

## What exists today

There are two implementations: Solidity for Base and opBNB, and Move for Sui.
Each deployment owns independent projects, balances, and vaults. Deploying to
three chains does not synchronize shares or let someone withdraw the same donation
on a different chain. Testnets also have no shared state with mainnets.

The recorded local verification on October 12, 2026 was 29 Solidity tests, including
256 conservation fuzz cases, and 31 Move tests. These are local checks, not evidence
of funded testnet success. All six identifiers in `deployments/networks.json` are
still null. Sui and network cost measurements, funded testnet exercises, and
independent security review remain unfinished. Every signing account in this guide
pays its own gas.

After recording a test contribution, use the [manager-signed mint workflow](mint-automation.md)
to exercise automated issuance. Configure the manager secret and deployment
identifiers first; the workflow has not yet been executed with funded wallets.

## Interactive testnet deployment

Run `npm run testnet:deploy` from the repository root. The script
locates the repository from its own file, prompts for the testnet and RPC choice,
the amount of native currency to fund each disposable test wallet, the donation
amount, an optional second ERC-20 address or Sui coin type T
(`0x...::module::TOKEN`) and amount, and one
dedicated, funded testnet owner private key. The owner must already hold the
optional token on that testnet. Enter the key at the
hidden terminal prompt; it is not placed in arguments, logs, or the checkpoint.
If you choose a custom HTTPS RPC, its URL is also entered at a hidden prompt
and only a digest of it is saved in the checkpoint.
Use a testnet-only key. The script derives manager, Alice, and Bob test wallets
from it and keeps their keys in memory. Enter the same owner key to resume the
same run.

After collecting inputs, the script runs the selected chain's local suite. For
EVM it compiles with the pinned Foundry container, deploys, funds the test
wallets, registers a project, mints one trophy each, donates twice, transfers,
claims, collects fees, checks balances and authorization, exercises pause controls,
and hands both roles away and back. If you supply a second asset, it also enables,
funds, donates, claims, and collects fees for that asset. For Sui it builds
with the pinned Sui container, publishes and consumes the UpgradeCap in one
transaction, then runs the same native SUI sequence. It records public transaction
references under ignored `.tool-cache/testnet/runs/` after each step and writes
the successful registry ID into `deployments/networks.json`. The owner pays publication
and funding gas and funds three wallets; each wallet pays gas for its own actions,
and the manager makes two donations. The script displays
the planned funding and donation amounts before its final RUN prompt. No added
service charge is required; network gas and any RPC provider charge still apply.

The run stops on an uncertain transaction and leaves its checkpoint for inspection
so a retry cannot silently create a second deployment or donation. This automated
smoke run always covers the native asset. If you leave the second asset blank,
its compatibility check remains undone. Explorer source verification and
independent security review in
this guide remain separate release checks. The Sui bytecode-export path has not
been verified with a funded deployment; the pinned container currently fails to
fetch `MoveStdlib` for that export and stops before spending funds. Resolve that
dependency access before attempting Sui publication.

## Immutable release process: from testnet iterations to mainnet

Each contract iteration is a fresh deployment with its own address or package and
independent state. Testnet projects and tokens are disposable; mainnet starts
with new projects rather than importing testnet holdings. Successful tests and an
independent audit reduce risk but cannot guarantee that the release has no bugs.
Evidence must identify the exact code and configuration being released.

1. **Define acceptance criteria before testing.** Cover manager-only minting,
   missing-wallet delivery to the manager, the 0.5% fee, retained seller earnings,
   no historical rewards for new shares, project/asset isolation, and emergency
   permissions. Calculate expected results independently of the contract's own
   calculations. Include the eventual transfer of manager-held contributor shares.
2. **Verify locally.** Run both contract suites, regression tests, accounting
   boundary checks and randomized transaction sequences. Include unauthorized
   calls, invalid quantities, failed payouts, fractional credits, fee remainders,
   donation dust and conservation across multiple projects/assets. Verify mint
   workflow validation and retry handling before granting it signing credentials.
3. **Deploy iteration A to all three testnets.** Use Base Sepolia, opBNB Testnet
   and Sui Testnet, record the exact source/build and deployed identifiers, and
   confirm the deployment matches them. Reproduce the intended immutable
   architecture, including relinquishing Sui UpgradeCap. Seed disposable projects
   and exercise the full lifecycle with separate wallets, native currency and
   supported additional assets. Include a real merged trophy file processed by
   GitHub Actions, later delivery, donations, transfers, claims, fees, pauses and
   authority handoffs. Record actual gas, expected results and transaction evidence.
4. **Fix defects and deploy iteration B.** Preserve A's evidence, reproduce the
   defect with a failing regression test, fix it, and rerun local checks. Publish
   B as a new instance and recreate its test state. Repeat the failing case and
   complete release scenario. Mark A superseded only when choosing B as the
   replacement; never overwrite the historical record. An RPC-only correction
   needs reconciliation/retry, not necessarily a new contract. See the
   [replacement procedure](#replacing-an-immutable-deployment-after-a-code-fix).
5. **Freeze a release candidate and obtain independent review.** Pin its source
   revision, compiler/settings, dependency versions, build artifacts and hashes,
   deployment scripts and intended configuration. Have Solidity, Move, accounting,
   permissions and signing/deployment paths reviewed. Resolve findings with
   evidence. A source, dependency, compiler or relevant configuration change
   creates a revised candidate requiring affected checks and the complete final
   release scenario again; passing results for an older candidate are insufficient.
6. **Rehearse the mainnet procedure.** From a clean environment, reproduce the
   candidate and run the complete deployment/test sequence on all three testnets.
   Use the intended custody and permission arrangement with distinct test keys.
   Verify target chain IDs, owner addresses, dependencies, RPC configuration and
   gas requirements. Use mainnet forks or simulation where available to check
   actual supported assets; mock-token success does not establish mainnet token
   compatibility. Document gaps and unsupported asset behavior explicitly.
7. **Deploy and verify mainnet one network at a time.** Mainnet broadcasting
   requires its separate release authorization. Deploy the frozen candidate,
   verify source/build correspondence and initial configuration, and record
   actual owner/deployment identities. Account explicitly for network-specific
   dependency addresses and deployment inputs rather than assuming every byte is
   identical across chains. Verify the absence of an EVM upgrade path and the Sui
   immutability transaction. Use a small amount of real funds to exercise the full
   lifecycle before promoting public use. Public deployment itself is accessible
   to others; delayed promotion is not an on-chain access restriction.
8. **Monitor and retain incident procedures.** Check transaction failures, mint
   results, gas funding, custody and claim behavior. Exercise the intended pause
   procedure before launch. Pausing can contain a problem but cannot repair code
   or recover funds already lost. An immutable mainnet defect can require a new
   deployment and a separately designed migration; no automatic migration exists.

These gates follow the distinction between testing, audit and deployed-source
verification in [OpenZeppelin's mainnet guidance](https://docs.openzeppelin.com/contracts/5.x/learn/preparing-for-mainnet),
and the final rehearsal, deployment verification and small-value exercise in
[Sui's production-readiness guidance](https://docs.sui.io/develop/production-readiness).

Retain a release report per candidate with each gate marked passed, failed, or
not yet verified, plus the matching source/build/configuration and evidence links.
Unresolved failures or missing required evidence block release readiness. Include
review findings and their disposition; a report is not an audit or proof of safety.

The current `npm run testnet:deploy` runner implements part of this process: an
interactive deployment, selected local tests, scripted testnet exercises and
transaction checkpoints. It does not provide guided replacement, a complete
release report, mainnet deployment, or the funded GitHub workflow test. It refuses
an existing different deployment ID or a checkpoint from changed source. Preserve
and inspect those records before preparing a fresh iteration; do not delete them
blindly to bypass an uncertain transaction. The Sui export blocker described above,
funded end-to-end verification and independent review remain outstanding. Fully
automating iteration management and release reports is future work, not behavior
provided by documenting this process.

## Where to look and what to check

Read the current rules in `docs/contracts.md`, then the implementation and tests.
The code sketches in `docs/overview.md` are historical, not deployable source.
OpenSpec design, requirements, and remaining tasks are in
`openspec/changes/implement-multichain-registry/`.

| Question | Solidity: `contracts/evm/src/ProjectRegistry.sol` | Move: `contracts/sui/sources/registry.move` |
| --- | --- | --- |
| Who owns a project? | `registerProject`, `mint`, `enableAsset` | `new_project`, `mint`, `enable_asset` |
| How is the fee calculated? | `_donate` | `donate` |
| Why does the seller keep past earnings? | `_update` → `_settle` → `_accrue` | `transfer_shares` → `settle` → `accrue_asset` |
| How are funds withdrawn? | `entitlement`, `claim`, `_pay` | `entitlement`, `claim` |
| Can newly issued shares claim old donations? | `_update` settles before `_mint` changes balances | `mint` settles before increasing shares |
| Can an administrator prevent withdrawals? | `setManagerPause`, `setOwnerPause`, `setGlobalPause`, `_requireWithdrawals` | Corresponding `set_*_pause` and `require_withdrawals` functions |
| Where is generation metadata? | `TrophiesGenerated` event in `mint` | `Generated` event in `mint` |

The accounting keeps a cumulative reward index for each project and asset.
Conceptually, ignoring rounding:

```text
net donation = gross donation - 0.5% fee
index increase = net donation / current share supply
wallet credit increase = old wallet shares × index change since last settlement
```

Actual arithmetic uses integers and a 10^36 reward scale. Before minting or
transferring, affected wallets accumulate credit using their OLD balances. Only
then do share balances change. Claims consume whole asset units and retain the
wallet's fractional credit. A wallet with zero shares can still claim earned funds.
Remainders from dividing donations across supply can remain unallocated in custody.
Fees carry their own remainder, so splitting donations does not bypass the fee.

The most useful tests to read first are:

- Solidity `testPastEarningsStayWithSellerAfterFullTransfer`,
  `testFractionalTransferAndMintDoNotGrantOldRewards`,
  `testManagerPauseAllowsWithdrawal`, and
  `testFuzzDonationTransferClaimConservation` in `contracts/evm/test/ProjectRegistry.t.sol`.
- Move `earnings_survive_full_transfer_and_later_donations`,
  `new_shares_do_not_receive_past_donations`,
  `owner_pause_precedence_and_unpause_preserve_credits`, and
  `deterministic_adversarial_sequence` in `contracts/sui/tests/registry_tests.move`.

Review these deliberate consequences before release:

- Managers can dilute future earnings by issuing more shares forever. Past credit
  is preserved. There is no burn or revoke operation.
- The manager and platform-owner roles can each be handed off through nomination
  and acceptance. Neither handoff moves the former manager's shares or credits.
  This is verified locally but still needs funded testnet exercise.
- Owner withdrawal pauses can last indefinitely. Pausing does not move or refund funds.
- Funding assets require manager enablement. EVM fee-on-transfer and rebasing tokens
  are not guaranteed compatible. Every enabled asset adds work to share transfers;
  there is no asset-removal function to undo excessive enablement.
- ERC-1155 is the EVM interface, but 18 decimal places are an application convention.
  Generic wallets may show raw quantities or no useful trophy display. Use contract
  reads for verification. Sui trophies are a project ledger, not owned Coin/NFT objects.
- Immutable contracts cannot be patched at the old address. Existing custody and
  credits do not move automatically when a replacement is deployed.

## Local checks before spending testnet funds

Start Docker Desktop. On a fresh checkout, run setup once; it fetches pinned images
and dependencies. Existing installations can begin with the test command.

```bash
scripts/contracts.sh setup
scripts/contracts.sh test
scripts/contracts.sh evm fmt --check
scripts/contracts.sh sui move build
```

Success means both suites complete without failures and compilation succeeds.
The documented lint warnings in `docs/contracts.md` are not a reason to ignore new
warnings. To investigate a particular accounting failure:

```bash
scripts/contracts.sh evm test --match-test testPastEarningsStayWithSellerAfterFullTransfer -vvvv
scripts/contracts.sh sui move test earnings_survive_full_transfer_and_later_donations
```

## Wallets, networks, and free test funds

For contributors, [wallet setup and address-sharing instructions](contributor-wallets.md)
explain direct minting or later delivery from the manager's wallet. This section
creates separate test accounts for contract verification.

Create four test accounts: **Owner**, **Manager**, **Alice**, and **Bob**. Keeping
Owner and Manager separate proves their permissions are separate. Manager can also
act as donor. Fund every account that will sign a transaction, including holders
who only transfer or claim. Receiving shares needs no gas; claiming them does.

Use dedicated test wallets. Faucets need public addresses, never recovery phrases.
Save those phrases privately and do not include them in logs or deployment records.

For Base and opBNB, use MetaMask's network selector → add a custom network. UI
wording can vary. Use the following values and check the selected chain before signing:

| Network | RPC | Chain ID | Gas token | Explorer |
| --- | --- | --- | --- | --- |
| Base Sepolia | `https://sepolia.base.org` | 84532 | ETH | `https://sepolia.basescan.org` |
| opBNB Testnet | `https://opbnb-testnet-rpc.bnbchain.org` | 5611 | tBNB | `https://testnet.opbnbscan.com` |
| BSC Testnet, only for funding the opBNB bridge | `https://data-seed-prebsc-1-s1.bnbchain.org:8545` | 97 | tBNB | `https://testnet.bscscan.com` |

Network references: [Base connection information](https://docs.base.org/get-started/connect-to-base)
and [BNB Chain wallet configuration](https://docs.bnbchain.org/bnb-opbnb/get-started/wallet-configuration/).

**Base Sepolia:** sign in to the [Coinbase Developer Platform faucet](https://portal.cdp.coinbase.com/products/faucet),
select Base Sepolia and ETH, and enter the wallet address. Follow its current
eligibility and request limits. Request directly for each account or distribute
from one funded test account using MetaMask Send. Ethereum Sepolia ETH is on a
different network and does not automatically fund Base Sepolia.
[Coinbase's faucet instructions](https://docs.cdp.coinbase.com/wallets/demos/demo-app-tutorial)
link to this portal.

**opBNB Testnet:** request tBNB from the [BNB Chain testnet faucet](https://www.bnbchain.org/en/testnet-faucet).
For funds received on BSC Testnet, connect MetaMask to the
[official opBNB testnet bridge](https://opbnb-testnet-bridge.bnbchain.org), select
BSC Testnet as the source, and deposit part of the balance. Keep some BSC tBNB
for the bridge transaction. After confirmation, switch to opBNB Testnet and check
the destination balance before deploying. This is the
[official funding route](https://docs.bnbchain.org/bnb-opbnb/get-started/deposit-to-opbnb/).

**Sui Testnet:** use the dedicated container client below. Its RPC is
`https://fullnode.testnet.sui.io:443`. Open [Sui's faucet](https://faucet.sui.io),
select **Testnet**, and enter each Sui address. The current
[faucet guide](https://faucet.sui.io/how-to-use/) describes browser proof of work
and provides a payout digest. One SUI is 1,000,000,000 MIST; trophy precision
remains 10^18 independently of SUI's precision.

Faucet availability and allowances change. Use the offered free allocation, then
estimate deployment gas; there is no verified fixed funding budget yet. The EVM
manual scenario below donates 0.002 native coins in total, plus deployment and
transaction gas. Sui's scenario donates 0.002 SUI, plus gas and storage costs.

## Deploy Solidity to Base Sepolia and opBNB Testnet

Use the existing deployment script with an encrypted test-wallet keystore, then
use MetaMask for manual calls. This preserves the repository's compiler settings:
Solidity 0.8.35, Cancun, optimizer enabled with 200 runs, pinned OpenZeppelin sources.

The existing `scripts/contracts.sh evm` wrapper does not forward deployment
environment variables or offer an interactive keystore mount. Define this temporary
shell function in your own terminal instead. It uses the same pinned image:

```bash
TROPHIES_ROOT="$(git rev-parse --show-toplevel)"
cd "$TROPHIES_ROOT"
TROPHIES_FOUNDRY='ghcr.io/foundry-rs/foundry@sha256:32c8ea9ef052a440cb1620175987a3f49eff8b068a0c6a3d09ebf7f5f9a0e043'
mkdir -p .tool-cache/testnet/evm
chmod 700 .tool-cache/testnet/evm

trophies_evm() {
  local binary="$1"
  shift
  docker run --rm -it --entrypoint "$binary" \
    -v "$TROPHIES_ROOT:/workspace" -w /workspace/contracts/evm \
    -e EXPECTED_CHAIN_ID -e OWNER_ADDRESS \
    "$TROPHIES_FOUNDRY" "$@"
}

trophies_evm cast wallet import trophies-testnet \
  --keystore-dir /workspace/.tool-cache/testnet/evm --interactive
```

At the hidden prompt, import the private key of the dedicated **Owner test account**
from MetaMask, and choose a keystore password. Do this locally; do not paste keys
into chat or put them directly in the shell command. The keystore is ignored by Git.
MetaMask remains the signer for subsequent wallet tests; Foundry signs deployment.

Set the following public values, replacing the address placeholder with Owner's
full `0x` plus 40 hex-character EVM address:

```bash
export OWNER_ADDRESS='REPLACE_WITH_OWNER_EVM_ADDRESS'
export EXPECTED_CHAIN_ID=84532
TROPHIES_RPC='https://sepolia.base.org'

trophies_evm cast chain-id --rpc-url "$TROPHIES_RPC"
trophies_evm cast balance "$OWNER_ADDRESS" --ether --rpc-url "$TROPHIES_RPC"

trophies_evm forge script script/DeployRegistry.s.sol:DeployRegistry \
  --rpc-url "$TROPHIES_RPC" --sender "$OWNER_ADDRESS" \
  --keystore /workspace/.tool-cache/testnet/evm/trophies-testnet
```

The last command simulates without broadcasting. Confirm the chain ID is 84532,
the simulation succeeds, and the balance covers the reported estimate with room
for subsequent tests. Then run the same command with `--broadcast`:

```bash
trophies_evm forge script script/DeployRegistry.s.sol:DeployRegistry \
  --rpc-url "$TROPHIES_RPC" --sender "$OWNER_ADDRESS" \
  --keystore /workspace/.tool-cache/testnet/evm/trophies-testnet --broadcast
```

Enter the keystore password when prompted. Record the contract address and receipt
transaction hash from the successful broadcast, not a simulation prediction.
Confirm successful receipt status in the explorer, then read the deployed owner:

```bash
TROPHIES_REGISTRY='REPLACE_WITH_DEPLOYED_EVM_ADDRESS'
trophies_evm cast code "$TROPHIES_REGISTRY" --rpc-url "$TROPHIES_RPC"
trophies_evm cast call "$TROPHIES_REGISTRY" 'owner()(address)' --rpc-url "$TROPHIES_RPC"
```

Expect nonempty bytecode and Owner's address. For opBNB repeat simulation and
broadcast after changing the network, then record a separate contract address:

```bash
export EXPECTED_CHAIN_ID=5611
TROPHIES_RPC='https://opbnb-testnet-rpc.bnbchain.org'
trophies_evm cast chain-id --rpc-url "$TROPHIES_RPC"
```

The script rejects a chain mismatch. Recheck Owner's **opBNB** balance; Base funds
do not pay opBNB gas. If an RPC explicitly rejects EIP-1559 fee fields, investigate
its fee support and repeat simulation with Foundry's `--legacy`; do not change
contract code to solve an RPC fee-format problem.

Source verification is separate from deployment and from security review. Preserve
the exact sources, compiler settings, constructor owner, and build artifacts for
the deployment. Explorer verification should reproduce those inputs; failure to
verify is not a reason to deploy again. Manual tests below work with the local ABI
without depending on explorer verification. Do not describe unverified explorer
source as confirmed identical to deployed bytecode.

## Exercise the EVM contracts with MetaMask and Remix

MetaMask signs transactions; it does not provide forms for all registry methods.
Use Remix as that form interface. Export the contract ABI (the JSON description of
its callable methods):

```bash
mkdir -p .tool-cache/testnet
scripts/contracts.sh evm inspect ProjectRegistry abi --json \
  > .tool-cache/testnet/ProjectRegistry.abi
```

Open [Remix](https://remix.ethereum.org), create `ProjectRegistry.abi`, and paste
that file's contents. Keep its editor tab active. In **Deploy & Run**, choose
**Browser Extension** and MetaMask (older versions call this **Injected Provider**).
Under **Deployed Contracts**, choose **Add Contract**, enter the actual deployed
address, and add it (older versions use **At Address**). This attaches to the
existing contract. Check Remix's account and chain against MetaMask.
[Remix documents ABI loading and browser-wallet connections here](https://remix-ide.readthedocs.io/en/latest/run.html).

Read calls are free. Writes require signing and gas. Every time you change accounts,
check the account displayed in Remix too. If necessary reconnect the selected
MetaMask account. Use separate browser profiles if account switching is confusing.

Use a fresh project and this exact sequence on **each** EVM testnet. `ZERO` below
means `0x0000000000000000000000000000000000000000`, the native-asset identifier.
`P` means the project ID returned in the `ProjectRegistered` event; do not assume 1
on a previously used registry. Addresses A and B are Alice and Bob.

| Step | Signer and call | Expected observable result |
| --- | --- | --- |
| 1 | Manager: `registerProject()` | Event gives P; `projectInfo(P)` shows Manager and zero supply |
| 2 | Manager: `mint(P,A,1000000000000000000,"first contribution","test:1")` | A owns one full trophy; generation event contains all five metadata fields |
| 3 | Manager: `mint(P,B,1000000000000000000,"second contribution","test:2")` | B owns one full trophy; supply is 2000000000000000000 |
| 4 | Manager/donor: `donateNative(P)` with Value **1000000000000000 wei** | Gross 0.001 ETH/tBNB, fee 5000000000000, net 995000000000000 |
| 5 | Read `entitlement(P,ZERO,A)` and B | Both whole amounts are 497500000000000; remainders zero |
| 6 | Alice: `safeTransferFrom(A,B,P,1000000000000000000,0x)` | A balance 0, B balance 2000000000000000000; both credits unchanged |
| 7 | Manager/donor: repeat the same donation | A credit stays 497500000000000; B credit becomes 1492500000000000 |
| 8 | Alice: `claim(P,ZERO)` | Alice receives 497500000000000 wei despite holding zero shares; entitlement becomes zero |
| 9 | Bob: `claim(P,ZERO)` | Bob receives 1492500000000000 wei; entitlement becomes zero |
| 10 | Owner: `collectFees(P,ZERO)` | Owner receives 10000000000000 wei, the combined 0.5% fees |

Expand each method's fields and enter the arguments separately. For `donateNative`,
use Remix's transaction **Value** field, with the denomination explicitly set to
**wei**; the only function argument is P. Reset Value to **0** immediately after
each donation. All other methods in this exercise are nonpayable. Do not use
MetaMask's ordinary Send action to donate to the contract address.

Use `balanceOf(A,P)` and `balanceOf(B,P)` to check trophies. Use the `Claimed`
events and entitlement reads to check payouts: a native wallet balance changes by
the payout **minus gas**, so its displayed balance is not the exact payout amount.
Record transaction hashes and raw integer results after every step.

### Additional manual checks

Use a new project for each case so prior donations do not obscure expected results.

- **Later issuance:** A owns one trophy; donate 0.001; mint one trophy to B.
  A retains 995000000000000 wei and B starts with zero credit. The next equal
  donation earns each 497500000000000 wei.
- **Contributor without a wallet:** Manager mints one trophy to Manager's own
  address and records the contribution reference, chain, project ID, quantity,
  holding wallet, and mint transaction privately. Donate 0.001, then Manager
  transfers the trophy to A with `safeTransferFrom(Manager,A,P,1000000000000000000,0x)`.
  Manager retains 995000000000000 wei of credit; A starts with zero credit.
  A earns the next donation. Record the delivery transaction in the same record.
- **Role handoff:** Manager calls `nominateManager(P,B)`, then Bob calls
  `acceptManager(P)`. Check `projectInfo(P)` and verify only Bob can mint or
  change the manager pause. Shares and credits held by the former Manager stay
  in that wallet. Separately, Owner calls `nominateOwner(B)`, then Bob calls
  `acceptOwner()`. Check `owner()` and verify only Bob can change owner pauses
  and collect previously uncollected fees. Repeat with a cancelled nomination
  and with pauses active; neither handoff clears a pause.
- **Fractional transfer:** from a funded project, transfer
  `500000000000000000` base units (half a trophy). Past credits stay in place;
  the next donation follows the new share proportions.
- **Manager pause:** after making a donation, Manager calls
  `setManagerPause(P,true)`. Mint, donate, and transfer must fail; holder claims
  must still succeed. Clear with `setManagerPause(P,false)`.
- **Owner pause:** Owner calls `setOwnerPause(P,true,true)`. Operations and claims
  must fail. Manager unpausing must not override this. Owner calls
  `setOwnerPause(P,false,false)` to restore access; credits must be unchanged.
- **Global pause:** create two projects. Owner's `setGlobalPause(true,true)` blocks
  both; `setGlobalPause(false,false)` clears only the global flags. Any remaining
  project pause still applies.
- **Permissions:** Bob tries to mint or change owner flags. Expect `Unauthorized`.
  Bob tries to move Alice's shares without approval. Expect an ERC-1155 approval
  error. Transfer to ZERO must fail. Zero donations must fail.
- **Project isolation:** donate to one project and verify the other's entitlements
  do not change. Repeat for a different asset in the same project.

For intentional failures, an estimation rejection before signing is a useful
result; you do not need to force a reverting transaction through MetaMask. If it
is mined and fails, gas is still charged, but registry state should not change.

### A second donation asset

On Base Sepolia, obtain test USDC from [Circle's faucet](https://faucet.circle.com),
selecting Base Sepolia. Get the token contract address from
[Circle's official address list](https://developers.circle.com/stablecoins/usdc-contract-addresses)
for that exact testnet. The listed Base Sepolia address checked for this guide is
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Read its decimals; do not assume trophies and donation
tokens use the same precision.

Manager calls `enableAsset(P,TOKEN_ADDRESS)`. In the token's verified explorer
interface, connect the donor and call `approve(REGISTRY_ADDRESS,AMOUNT)` for the
test amount. Wait for that transaction to succeed. Back in Remix, the donor calls
`donateToken(P,TOKEN_ADDRESS,AMOUNT)` with transaction Value zero. Read entitlements
and call `claim(P,TOKEN_ADDRESS)` for that asset. ERC-20 approval belongs to the
donation token contract; `setApprovalForAll` on the trophy registry is unrelated.

For a six-decimal token, 1 token is 1000000 units: fee 5000, net 995000.
With two equal holders, each earns 497500. For opBNB use an independently verified
testnet ERC-20/BEP-20 deployed on opBNB itself; a BSC token address is not an opBNB
token address. A faucet token's presence does not prove compatibility—check both
deposit and claim. Native-only testing does not complete multi-asset validation.

## Deploy and exercise Sui Testnet

This guide uses the container CLI as the signer for Sui. There is no application
wallet interface for this ledger yet. Adding Sui as an EVM network in MetaMask
does not provide one.

### Create a persistent deployment client

Keep deployment keys separate from the wrapper's dummy local build config. Define
this function in your terminal, with the repo as your working directory:

```bash
TROPHIES_ROOT="$PWD"
TROPHIES_SUI='mysten/sui-tools@sha256:5336a71e37812bd6609a73a07bb99c267b3861c7670b7c49e20a6c9e5d5f1de6'
mkdir -p .tool-cache/testnet/sui .tool-cache/sui/home/.move
chmod 700 .tool-cache/testnet/sui

trophies_sui() {
  docker run --rm -it --platform linux/amd64 --entrypoint sui \
    -v "$TROPHIES_ROOT:/workspace" \
    -v "$TROPHIES_ROOT/.tool-cache/testnet/sui:/root/.sui/sui_config" \
    -v "$TROPHIES_ROOT/.tool-cache/sui/home/.move:/root/.move" \
    -w /workspace/contracts/sui "$TROPHIES_SUI" client "$@"
}

trophies_sui envs
```

On first use, accept creation of a client configuration and choose Testnet. The CLI
may generate the first key and print its recovery phrase: run this yourself, save
it privately, and do not capture this output in a shared terminal log. The mounted
directory persists the key across containers. It contains sensitive key material,
not just cache. Losing it loses access to that owner address.

If Testnet is not listed, add it, then switch and create the remaining accounts:

```bash
trophies_sui new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
trophies_sui switch --env testnet
trophies_sui new-address ed25519 manager
trophies_sui new-address ed25519 alice
trophies_sui new-address ed25519 bob
trophies_sui addresses
trophies_sui envs
```

Skip `new-env` when the alias already exists. Record the initial address as Owner;
record Manager, Alice, and Bob from `addresses`. Use their full Sui addresses
(`0x` plus 64 hex characters) in the commands below.

```bash
SUI_OWNER='REPLACE_WITH_OWNER_SUI_ADDRESS'
SUI_MANAGER='REPLACE_WITH_MANAGER_SUI_ADDRESS'
SUI_ALICE='REPLACE_WITH_ALICE_SUI_ADDRESS'
SUI_BOB='REPLACE_WITH_BOB_SUI_ADDRESS'
trophies_sui switch --address "$SUI_OWNER"
trophies_sui active-env
trophies_sui active-address
trophies_sui faucet
trophies_sui gas
```

Repeat funding for each signing address, using the browser faucet if the pinned
CLI's faucet request is rejected. Check the payout digest before retrying an
uncertain request.

**Funding compatibility check:** current Sui faucet documentation says browser
payouts arrive in an *address balance*, not a `Coin<SUI>` object. The pinned CLI
commands in this guide, particularly `--split-coins gas`, use coin objects. A
successful faucet page alone therefore does not prove this workflow is funded.
Require `trophies_sui gas` to show usable coins before proceeding. If it shows
none, obtain a Coin<SUI> transfer from another funded test wallet, or convert the
address balance to a coin with supported Sui tooling. The official
[address-balance guide](https://docs.sui.io/onchain-finance/asset-custody/address-balances/using-address-balances)
documents `coin::redeem_funds` and SDK withdrawals. This conversion is not automated
in this repository; do not install host tools or assume the pinned CLI supports
newer documentation's APIs. Container tooling adaptation may be needed for a wallet
funded solely through the new faucet. This path has not been rehearsed with funds.

### Publish and make immutable

Owner is whoever publishes, as set by `init`; there is no separate owner argument.
Check the active account immediately before publication:

```bash
trophies_sui switch --address "$SUI_OWNER"
trophies_sui active-env
trophies_sui active-address
trophies_sui publish --dry-run
trophies_sui publish
```

Run the final command only after a successful dry run and sufficient gas funding.
Use normal publication, not `--test`, which includes test-only code. If framework
dependency verification fails, stop and reconcile the pinned framework with the
target network; do not bypass it using `--skip-dependency-verification`.

From successful publication effects, record the published **package ID**, the
created shared **Registry object ID**, and the **UpgradeCap object ID**. Identify
them by type, not their order in the output. Inspect Registry and confirm its
owner is Owner. Fill these public variables from the effects:

```bash
SUI_PACKAGE='REPLACE_WITH_PACKAGE_ID'
SUI_REGISTRY='REPLACE_WITH_REGISTRY_OBJECT_ID'
SUI_UPGRADE_CAP='REPLACE_WITH_UPGRADE_CAP_OBJECT_ID'
trophies_sui object "$SUI_REGISTRY"
trophies_sui call --package 0x2 --module package --function make_immutable \
  --args "$SUI_UPGRADE_CAP" --dry-run
trophies_sui call --package 0x2 --module package --function make_immutable \
  --args "$SUI_UPGRADE_CAP"
```

Require a successful transaction whose effects delete the correct UpgradeCap;
preserve its digest. Publication alone leaves upgrade authority in place. If
finalization fails, resolve that failure before describing the deployment as
immutable. This is Sui's documented
[mechanism for relinquishing upgrades](https://docs.sui.io/develop/publish-upgrade-packages/upgrade).
The platform owner still retains the contract's pause powers afterward.

Publication may write package-manager publication metadata. Preserve the generated
metadata with your deployment evidence. Use `trophies_sui verify-source` against
that publication state to check source correspondence; investigate toolchain or
dependency mismatches rather than suppressing them.

### Create a project and issue shares

```bash
trophies_sui switch --address "$SUI_MANAGER"
trophies_sui call --package "$SUI_PACKAGE" --module registry \
  --function create_project --args "$SUI_REGISTRY"
```

Record the Project object ID from the created object or `ProjectRegistered` event.
Then issue one trophy to each holder:

```bash
SUI_PROJECT='REPLACE_WITH_PROJECT_OBJECT_ID'
trophies_sui call --package "$SUI_PACKAGE" --module registry --function mint \
  --args "$SUI_REGISTRY" "$SUI_PROJECT" "$SUI_ALICE" \
  1000000000000000000 'first contribution' 'test:1'
trophies_sui call --package "$SUI_PACKAGE" --module registry --function mint \
  --args "$SUI_REGISTRY" "$SUI_PROJECT" "$SUI_BOB" \
  1000000000000000000 'second contribution' 'test:2'
```

Transaction context arguments are supplied by Sui, not entered manually. Check
Generated events and Project's supply. To inspect the share ledger through its API:

```bash
trophies_sui call --package "$SUI_PACKAGE" --module registry --function balance_of \
  --args "$SUI_PROJECT" "$SUI_ALICE" --dev-inspect
```

Dev-inspect returns typed BCS return bytes, not necessarily a friendly decimal.
For `u128` balances or `u256` entitlement results, interpret bytes as an unsigned
little-endian integer. An ordinary submitted call is not a read-only query.

### Donate, transfer, and claim

Manager donates 0.001 SUI (1000000 MIST) by splitting a payment coin from its gas
coin in a programmable transaction block. First add `--dry-run` to rehearse, then
execute without that flag:

```bash
trophies_sui ptb \
  --split-coins gas '[1000000]' --assign payment \
  --move-call "${SUI_PACKAGE}::registry::donate" '<0x2::sui::SUI>' \
  "@$SUI_REGISTRY" "@$SUI_PROJECT" payment.0
```

Expect `Donated`: gross 1000000, fee 5000, net 995000. Both holders have 497500 MIST
credit. Inspect each with:

```bash
trophies_sui call --package "$SUI_PACKAGE" --module registry --function entitlement \
  --type-args 0x2::sui::SUI --args "$SUI_PROJECT" "$SUI_ALICE" --dev-inspect
```

Transfer all Alice's shares, then donate the same amount again as Manager:

```bash
trophies_sui switch --address "$SUI_ALICE"
trophies_sui call --package "$SUI_PACKAGE" --module registry --function transfer_shares \
  --args "$SUI_REGISTRY" "$SUI_PROJECT" "$SUI_BOB" 1000000000000000000
trophies_sui switch --address "$SUI_MANAGER"
trophies_sui ptb \
  --split-coins gas '[1000000]' --assign payment \
  --move-call "${SUI_PACKAGE}::registry::donate" '<0x2::sui::SUI>' \
  "@$SUI_REGISTRY" "@$SUI_PROJECT" payment.0
```

Alice now owns zero shares but retains 497500 MIST; Bob owns two trophies and is
entitled to 1492500 MIST. Claim from both wallets:

```bash
trophies_sui switch --address "$SUI_ALICE"
trophies_sui call --package "$SUI_PACKAGE" --module registry --function claim \
  --type-args 0x2::sui::SUI --args "$SUI_REGISTRY" "$SUI_PROJECT"
trophies_sui switch --address "$SUI_BOB"
trophies_sui call --package "$SUI_PACKAGE" --module registry --function claim \
  --type-args 0x2::sui::SUI --args "$SUI_REGISTRY" "$SUI_PROJECT"
trophies_sui switch --address "$SUI_OWNER"
trophies_sui call --package "$SUI_PACKAGE" --module registry --function collect_fees \
  --type-args 0x2::sui::SUI --args "$SUI_REGISTRY" "$SUI_PROJECT"
```

Verify Claimed amounts, payout coin ownership, zero remaining whole entitlements,
and the owner's 10000 MIST fee event. Gas costs affect total wallet balances.

Repeat the EVM manager-held delivery, handoff, negative, late-issuance,
fractional, and project-isolation cases on Sui. For handoffs, use
`nominate_manager`, `accept_manager`, `nominate_owner`, and `accept_owner` from
their current and nominated signer addresses. Confirm that a former manager
retains their shares and pre-transfer donation credits. The role calls do not
require a wallet interface to be present; the CLI signer pays gas. Record each transaction
digest and the new authority before continuing.
The relevant calls and explicit arguments, after selecting the appropriate signer,
are:

| Function | Arguments after `--args` | Signer |
| --- | --- | --- |
| `set_manager_pause` | PROJECT true/false | Manager |
| `set_owner_pause` | REGISTRY PROJECT operations_bool withdrawals_bool | Owner |
| `set_global_pause` | REGISTRY operations_bool withdrawals_bool | Owner |
| `enable_asset` | REGISTRY PROJECT, plus `--type-args FULL_COIN_TYPE` | Manager |

For a second asset, obtain a testnet `Coin<T>` you own, enable its full type, and
call `donate<T>` with REGISTRY, PROJECT, and its coin object ID. The whole passed
coin is consumed, so split an exact test amount first. Use that same type for
entitlement and claim. No arbitrary second-asset faucet is assumed here. A genuine
multi-asset test requires a separately sourced or deployed test coin.

## When a test or transaction fails

First establish whether it was an expected rejection, a transaction that actually
failed on-chain, or a client/RPC error. Record the network, account, deployment
identifier, method and exact arguments, attached value, receipt/digest, error,
and before/after balances. Exclude keys and recovery phrases.

| Symptom | Check before changing the contract |
| --- | --- |
| No wallet popup, wrong account/network, or missing method | Wallet connection, selected account, ABI, deployment address |
| Insufficient gas | Native gas on this exact network; Sui usable coin objects versus address balance |
| EVM `Unauthorized`, Sui registry abort 0 | Signer versus manager/owner; Sui Registry/Project association |
| EVM `Paused`, Sui abort 1 | Global flags and independent project owner/manager flags |
| EVM `InvalidAmount`, Sui abort 2 | Positive donation/share amount, existing supply, sufficient shares |
| Unsupported asset or Sui abort 3 | Manager enablement, exact token address/type, EVM allowance and transfer behavior |
| Invalid recipient or Sui abort 4 | Zero address or project/registry recipient restrictions |
| Amount off by powers of ten | Trophy 18 decimals versus funding asset decimals; Remix Value units |
| Payout smaller than expected | 0.5% fee, share proportion at donation time, prior claims, dust, and gas |
| Gas estimate fails | Decode the revert/abort first; increasing gas does not fix authorization or accounting |
| RPC timeout after submitting | Look up the existing transaction/digest before resending |

The numeric Sui abort codes above apply to `trophies::registry`; framework aborts
have their own module and code. Capture both. A Sui aborted transaction can still
charge gas and affect gas-object bookkeeping; check business state separately.

For an actual defect, write a regression test reproducing the exact sequence and
show it fails before the fix. Fix source, run the focused test, then both full
suites. A business-rule correction shared by both implementations needs parity
tests on both. RPC or wallet configuration fixes need no new deployment.

## Replacing an immutable deployment after a code fix

1. **Contain the old deployment if necessary.** Manager can pause operations for
   one project. Owner can pause its operations or use a global pause. Keep claims
   available when they are safe; if the defect is in withdrawals, Owner can pause
   those too. Preserve evidence before replaying transactions.
2. **Reproduce, fix, and verify locally.** Add the regression, rerun both suites,
   review affected accounting/permissions, and preserve the exact source revision
   or source snapshot being deployed. A passing replacement does not repair the old one.
3. **Deploy a new instance.** EVM: repeat the deployment script and get a new
   contract address. Sui: publish a fresh independent package and Registry and
   relinquish its new UpgradeCap. Do not use `upgrade` for an immutable release.
   Preserve previous publication metadata; use a fresh source checkout without
   prior local publication records if the Sui package manager refuses a second
   fresh publication. Never bypass dependency checks to work around this.
4. **Recreate test projects and seed test balances.** New instances start empty.
   Old project IDs, balances, fee balances, and credits are not imported. With
   disposable testnet state, recreate the scenario from the beginning and leave
   the old deployment labelled superseded.
5. **Repeat the failing case and the complete smoke sequence.** Test the same
   Solidity fix on both Base Sepolia and opBNB Testnet. Repeat Sui tests when its
   code or shared requirements changed. Record new transaction evidence.
6. **Update discovery.** Point Remix, later frontends/indexers, and the active
   entries in `deployments/networks.json` at the new identifiers. Preserve an
   append-only release record of the old addresses and why they were superseded.
   An unchanged ABI does not change which address a wallet calls.

For real funds later, replacing a contract is not a migration mechanism. The current
contracts provide no administrative export/import or vault sweep. Holders must
claim through the old deployment when that path is safe. If a bug makes those
claims impossible, a new deployment cannot by itself recover the trapped funds.
Restoring balances in a new contract would require a separately designed migration
and funding plan, including historical entitlements; minting replacement shares
alone does not restore them. This is the operational cost of immutable deployments.

## Evidence to retain per deployment

Record network/chain ID, source revision or snapshot, toolchain/dependency versions,
deployer and owner addresses, deployed identifiers, publication/deployment hashes,
Sui immutability digest, verification results, test project IDs, and manual test
results with transaction references. Include known failures and their dispositions.
Store public records under `deployments/`; keep keys under the ignored private
configuration directory. Only replace the corresponding testnet's null fields in
`deployments/networks.json` after successful deployment. Mainnet fields remain null.

This guide's contract signatures, local CLI help, and linked official documentation
were checked on October 9, 2026. No faucet payout, wallet connection, source
verification, or funded deployment was performed during guide preparation.
