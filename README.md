# Verified Contribution Ledger (MVP)

## What we built, in plain words

<img width="2816" height="1536" alt="Illustration: a programmer's work is sealed by a company, stored in an unbreakable chain of blocks, and publicly verified" src="https://github.com/user-attachments/assets/25db3164-bc36-4526-be46-b689b04b0ab9" />

The story in the picture is the whole system:

1. **Someone does real work.** A programmer ships a feature, fixes an outage,
   mentors a teammate. The evidence lives in private systems — Jira tickets,
   pull requests, internal docs.
2. **The company vouches for it.** Like pressing a signet ring into wax, an
   authorized company wallet signs a record: "this person did this work, and
   we stand behind that claim." The private evidence stays locked away — only
   its *fingerprint* (a hash) goes onto the record.
3. **The record goes into an unbreakable wall.** The signed record is added to
   a public chain of blocks that nobody — not even the company — can edit or
   erase afterwards. There is no delete button, on purpose.
4. **Anyone can check it.** Years later, a recruiter, an investor, or the
   employee themselves can look at the record and confirm: it exists, it was
   signed by a genuinely authorized company, and — if shown the original
   evidence — that the evidence matches the fingerprint exactly.

One important design choice: the blockchain doesn't judge whether the work
claim is *true*. It only proves *who said it and when*. Trust comes from the
company's signature, not from the chain.

**Why bother?** Today your track record is trapped inside each employer —
when you leave, your verified history leaves with them. A portable,
tamper-proof ledger of vouched-for contributions is the foundation for
whatever you build on top: reputation, references, or eventually
compensation tied to verified contribution (the golden slice in the picture —
deliberately *not* built in this MVP, see out-of-scope below).

### The three pieces

1. **The smart contract** (`contracts/ContributionLedger.sol`) — a small
   program written in Solidity that lives on the blockchain. It's the wall of
   blocks itself. Its rules:
   - One admin account decides which company wallets are allowed to issue records.
   - An authorized company records a contribution: who (a hashed employee ID),
     which company, what type of work, and the fingerprint (hash) of the
     private evidence.
   - There is deliberately no "edit" or "delete" function — that's what makes
     records immutable.
   - Anyone can read and verify any record, no permission needed.

2. **The privacy trick (hashing)** — we never put real emails or Jira tickets
   on the public chain. A hash is a one-way fingerprint: you can't reverse it
   back into the text, but if someone later shows you the original text, you
   can re-compute the fingerprint and confirm it matches. Evidence stays
   private, yet remains provable.

3. **The website** (`web/`) — a small Next.js app with three pages:
   - **Issue** — a company connects its wallet (MetaMask) and records a contribution.
   - **Employee** — type an employee identifier, see their full history.
   - **Verify** — type a record's ID, and optionally paste the evidence text,
     to publicly confirm the record exists, who signed it, and that the
     evidence matches. Works without any wallet.

### How we know it works

Automated contract tests (authorization rules, issuing, lookups, and that
revoking a company blocks new records but keeps old ones), a full end-to-end
test against a local blockchain, and a clean website build.

### Words you'll keep seeing

- **Wallet** — your identity on the blockchain; an account that can sign
  things (MetaMask is the browser app that holds it).
- **Smart contract** — a program deployed onto the blockchain; its code and
  data are public and its rules can't be quietly changed.
- **Hardhat** — the developer toolkit we used: it compiles Solidity, runs
  tests, and gives you a throwaway blockchain on your own machine for free
  experimentation.
- **Hash** — the one-way fingerprint of some data, used here for privacy.

## TL;DR

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
