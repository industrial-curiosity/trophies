# Verified Contribution Ledger (MVP)

Companies issue immutable, cryptographically verifiable contribution records to
employees. The chain does not decide truth — it only stores signed attestations
from authorized company wallets. Private evidence (Jira, Git, internal docs)
stays off-chain; only its keccak256 hash is recorded.

## Layout

- `contracts/` — Hardhat project: `ContributionLedger.sol`, tests, deploy script.
- `web/` — Next.js app: connect wallet, issue (company), history (employee), public verify.

## Contract

`ContributionLedger.sol`:

- `admin` (deployer) authorizes/revokes company wallets via `setCompanyAuthorization`.
- `issueContribution(employeeId, companyId, contributionType, proofHash)` — only
  authorized companies. Append-only: no update or delete functions exist.
- `getContribution(id)`, `getEmployeeContributionIds(employeeId)`, `totalContributions()`.
- `verifyContribution(id)` — anyone: returns existence, whether the issuer is
  still authorized today, and the full record. Issuance itself already proves
  the issuer was authorized at signing time. Revocation never touches
  already-issued records.

Identifier convention (enforced in the frontend, not the contract):
`employeeId`/`companyId` = keccak256 of the trimmed, lowercased identifier
(email, wallet, slug). `proofHash` = keccak256 of the verbatim evidence text.

## How to run — complete instructions

You need three things running: a local blockchain, the deployed contract, and
the web app.

### Prerequisites

- Node.js 18+ and npm.
- [MetaMask](https://metamask.io) browser extension — needed for the Issue
  page; the Verify page works without it.

### One-time setup

```bash
git clone https://github.com/industrial-curiosity/trophies.git
cd trophies/contracts && npm install
cd ../web && npm install
```

### Every time you run it (three terminals)

**Terminal 1 — local blockchain** (your Ethereum-compatible test chain, on your machine):

```bash
cd contracts
npm run node
```

Leave it running. It prints 20 funded test accounts. The chain is in-memory —
every restart wipes all data, so redeploy after each restart.

**Terminal 2 — deploy the contract** (once per chain restart):

```bash
cd contracts
npm run deploy:local
```

This deploys `ContributionLedger`, authorizes the deployer account as an
issuing company, and writes the contract address + ABI into
`web/lib/deployment.json` so the frontend knows where to find it.

**Terminal 3 — web app:**

```bash
cd web
npm run dev
```

Open http://localhost:3000.

### MetaMask setup (once)

1. MetaMask → network dropdown → **Add network manually**:
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
2. Import the company account (Hardhat's test account #0, which the deploy
   script authorized as an issuer): MetaMask → account menu →
   **Import account** → paste this private key:

   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

> **Warning:** that key is a publicly known Hardhat test key. Never use that
> account on a real network — anything sent to it will be stolen instantly.

### Try the flow

1. **http://localhost:3000/company** — connect wallet (the imported account),
   fill in employee `alice@example.com`, company `acme-corp`, pick a type,
   paste some evidence text (e.g. `JIRA-123: shipped payments`). Submit and
   approve in MetaMask. You get back contribution #0. The evidence is hashed
   in your browser and never sent anywhere.
2. **http://localhost:3000/employee** — enter `alice@example.com` → see her
   full contribution history.
3. **http://localhost:3000/verify** — enter contribution ID `0`, optionally
   paste the exact same evidence text → shows the record exists, the issuer is
   authorized, and the evidence hash matches. No wallet needed on this page.

### Troubleshooting

- **Pages say "Deploy the contract first"** — the deploy script hasn't run, or
  the web app started before it did. Run `npm run deploy:local` in
  `contracts/`, then refresh.
- **Restarted the chain and transactions fail** — redeploy the contract, and
  reset MetaMask's nonce cache: Settings → Advanced → **Clear activity tab
  data**.
- **MetaMask on the wrong network** — switch to the `127.0.0.1:8545` /
  chain id `31337` network you added above.

## Deploy to Sepolia

```bash
cd contracts
SEPOLIA_RPC_URL=https://... PRIVATE_KEY=0x... npm run deploy:sepolia
```

This rewrites `web/lib/deployment.json`; restart the frontend. Authorize more
company wallets from the admin account with `setCompanyAuthorization`.

## Extension points (deliberately out of scope)

- Admin UI for authorizing companies (use Hardhat console / Etherscan for now).
- Employee-controlled identity (wallet signatures instead of hashed emails).
- Salted employee IDs — plain keccak256(email) is enumerable by anyone with an
  email list; add a salt or use wallets before real-world use.
- Jira/GitHub integrations, scoring, tokens, vesting.
