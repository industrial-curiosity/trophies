# Mint approved contributions with GitHub Actions

The **Mint merged contributions** workflow signs a mint from the current
project-manager wallet on Base Sepolia, opBNB Testnet, or Sui Testnet. The manager
pays network gas from that wallet. A reviewed contribution file merged into
protected `main` triggers the workflow. Mainnet minting is outside this workflow
until a separate release is authorized.

## Set up a testnet project

1. Deploy and verify the registry, then fill its testnet identifiers in
   `deployments/networks.json`. The workflow refuses a null deployment.
2. Register the project from a dedicated manager wallet. Keep enough native gas
   currency in it: test ETH on Base Sepolia, test BNB on opBNB Testnet, or test
   SUI on Sui Testnet. The same wallet address must be the project's current
   on-chain manager. Treat its key as authority over minting and any shares or
   credits it holds.
3. Protect `main`: require pull-request review and prevent direct pushes and
   force pushes. A push to `main` is the workflow trigger, so this protection is
   what makes a changed contribution file an approved record.
4. In the repository's **Settings → Environments**, create an environment for
   each project, named `mint-<network>-<project>`, such as
   `mint-base-sepolia-1` or `mint-sui-testnet-0x...`. Use the exact project ID
   from its contribution file; Sui IDs are normalized to 64 hex digits.
   Restrict deployment branches to `main`. Require a reviewer where your GitHub
   plan supports it; GitHub Free, Pro, and Team do not offer required reviewers
   for private repositories. Private repositories need a paid plan for environment
   secrets. [GitHub documents environment protection and plan
   availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).
5. In that environment, set `MANAGER_PRIVATE_KEY` as a secret. For EVM, use the
   32-byte `0x` private key of the manager wallet. For Sui, use an Ed25519
   `suiprivkey1...` key for the manager wallet. Set `RPC_URL` as an environment
   variable pointing to the matching HTTPS endpoint. For Sui, also set
   `SUI_CHAIN_IDENTIFIER` to the identifier returned by `sui client
   chain-identifier` while connected to Sui Testnet. Do not put keys in
   repository files, dispatch inputs, or run logs.

GitHub environment secrets are available to the mint job only after its
protection rules pass. The job checks out the exact pushed commit on `main`,
never an unmerged contribution pull request, and uses read-only repository
permissions. Review changes to the
workflow, mint script, package lock, and deployment configuration before they
reach `main`: code run with the manager key can exercise that wallet's full
authority. [GitHub explains the risk of running pull-request code with
secrets](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

## Submit an approved contribution

Add one file per contribution at
`trophies/YYYYMMDDHHmmss-<branch-slug>.json` in a pull request. Use a valid
UTC timestamp at file creation. Form `<branch-slug>` from the source branch name:
lowercase it, replace each run of characters other than letters and digits with
one hyphen, and remove leading or trailing hyphens. For example,
`feature/wallet-help` becomes `feature-wallet-help`, giving
`trophies/20261012153000-feature-wallet-help.json`. The slug must be 1–80
characters and the file must be under 4 KiB. The workflow checks the filename
shape and date; pull-request review checks that the slug matches the branch.
For example, the file contains:

```json
{
  "network": "base-sepolia",
  "project": "1",
  "reference": "github:org/repo:pr:42",
  "quantity": "1",
  "description": "Merged documentation contribution",
  "recipient": ""
}
```

Review the project, amount, description, and recipient before merging. Omit
`recipient` or leave it empty if the contributor has no wallet. Do not include
private contributor details in the file, branch name, or on-chain description. The workflow
detects every added or modified JSON contribution file in the pushed commit
range. A merge with multiple files runs a mint job for each, including files
for different networks. Each network's jobs are serialized to avoid wallet
transaction conflicts; GitHub queues up to 100 pending jobs in a concurrency
group. If that queue fills, investigate canceled runs and reconcile their
references before retriggering. [GitHub documents the queue
limit](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency).

| Field | Meaning |
| --- | --- |
| `network` | One of the three configured testnets. |
| `project` | Positive project number for EVM, or full Sui project object ID. |
| `reference` | Unique nonempty contribution ID within this project, such as `github:org/repo:pr:42`. Do not include personal details. |
| `quantity` | Plain decimal trophy amount as a JSON string. `"1"` is one full trophy and `"0.5"` is half; up to 18 fractional digits. Do not enter base units, JSON numbers, commas, or scientific notation. |
| `description` | Public on-chain text describing the contribution. |
| `recipient` | Contributor's address on this network. Leave empty if none exists yet. |

The workflow validates changed files before accessing the manager secret. It
then checks the RPC network, configured deployment, current on-chain
manager, and whether the reference has already minted. A successful run saves
`mint-result.json` as a 90-day Actions artifact with the transaction reference,
effective recipient, human-readable quantity, converted base units, and whether
delivery is pending. Copy these fields into the project's durable,
access-controlled contribution record before
the artifact expires. For a walletless contributor, keep their identity and
delivery status in that private record; the action mints to the manager wallet.
When the contributor provides an address, that holding wallet transfers the
recorded quantity and pays transfer gas. Record the transfer transaction and
mark delivery complete. Donation credits earned during custody stay with the
manager wallet.

A nonempty reference can mint only once per project on-chain. Editing a file
after a successful mint triggers a duplicate-reference failure, not another
mint. If a run fails or times out after submission, inspect the result artifact and the chain's
generation event before retrying with the same reference. A duplicate-reference
error means an earlier mint succeeded; it must not be replaced by a new
reference merely to bypass the guard. If the manager role changes, replace the
environment secret with the new manager's key before the next mint. The old
manager's wallet still holds any shares and credits it held before the handoff.

Donors pay gas when donating. Holders pay gas to claim or transfer. The manager
pays to register, mint, and transfer any manager-held shares. There is no gas
sponsorship or project gas deposit.
