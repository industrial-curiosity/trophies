# Current repository

Snapshot: local commit `aa11608`, assessed on 2026-10-07. The checkout contains two private npm projects, a root README, an MIT license, and Git ignore rules. There is no root package manifest or separate backend service.

## Complete tracked-file inventory

The following inventory comes from `git ls-files` before adding this comparison folder. Generated dependencies, compiler artifacts, caches, and Git internals are not product source files.

| File | Current purpose |
| --- | --- |
| [README.md](../README.md) | Product explanation, contract interface, local setup, Sepolia deployment, claimed verification, and explicit exclusions |
| [LICENSE](../LICENSE) | MIT license, copyright 2026 Industrial Curiosity |
| [.gitignore](../.gitignore) | Ignores `node_modules`, `.next`, contract artifacts/cache, and `.env` |
| [contracts/package.json](../contracts/package.json) | Hardhat test/node/deploy scripts; Hardhat `^2.22.0` and toolbox `^5.0.0` |
| [contracts/package-lock.json](../contracts/package-lock.json) | Contract project's npm dependency lockfile |
| [contracts/hardhat.config.js](../contracts/hardhat.config.js) | Solidity 0.8.24; conditional Sepolia configuration using `SEPOLIA_RPC_URL` and `PRIVATE_KEY` |
| [contracts/contracts/ContributionLedger.sol](../contracts/contracts/ContributionLedger.sol) | Ledger, admin allowlist, issuance, employee index, and public reads |
| [contracts/scripts/deploy.js](../contracts/scripts/deploy.js) | Deploys ledger, authorizes deployer, writes frontend deployment metadata |
| [contracts/test/ContributionLedger.test.js](../contracts/test/ContributionLedger.test.js) | Four automated contract tests |
| [web/package.json](../web/package.json) | Next.js dev/build/start scripts; ethers `^6.13.0`, Next `^14.2.0`, React/React DOM `^18.3.0` |
| [web/package-lock.json](../web/package-lock.json) | Web project's npm dependency lockfile |
| [web/lib/deployment.json](../web/lib/deployment.json) | Checked-in localhost contract address, network label, and ABI |
| [web/lib/eth.js](../web/lib/eth.js) | Identifier/evidence hashing, wallet connection, read/write contract providers |
| [web/components/WalletButton.js](../web/components/WalletButton.js) | Connect-wallet action, shortened account display, retry label on error |
| [web/app/layout.js](../web/app/layout.js) | Root HTML layout, page title, navigation, wallet button |
| [web/app/globals.css](../web/app/globals.css) | Dark theme, form, table, navigation, and status styles |
| [web/app/page.js](../web/app/page.js) | Product overview and configured contract/network display |
| [web/app/company/page.js](../web/app/company/page.js) | Contribution issuance form and transaction status |
| [web/app/employee/page.js](../web/app/employee/page.js) | Employee identifier lookup and contribution history table |
| [web/app/verify/page.js](../web/app/verify/page.js) | Public record verification and optional evidence hash comparison |

The new `comparison/` folder contains this inventory, the intended-product description, the side-by-side overview, and the detailed alignment analysis.

## Contract behavior

In `ContributionLedger`, the deployer becomes an immutable `admin`. `setCompanyAuthorization` permits only that admin to update the wallet allowlist and emits an authorization event.

`issueContribution` checks `authorizedCompanies[msg.sender]`, appends a record, indexes its ID under the employee hash, and emits `ContributionIssued`. IDs start at zero and follow array order. Each record holds employee/company hashes, a free-form contribution type, proof hash, block timestamp, and issuer address.

`getContribution` returns a record or reverts for an unknown ID. `getEmployeeContributionIds` returns the entire employee ID array. `totalContributions` returns its length. `verifyContribution` returns existence, the issuer's authorization status at query time, and the record; an unknown ID returns `false` rather than reverting.

There is no edit/delete function, proxy/upgrade mechanism, admin transfer, employee ownership check, company-ID-to-wallet binding, duplicate detection, or contract-level nonempty-field validation. These conclusions come from the complete contract source; they are limits of this implementation rather than evidence that all were promised for the MVP.

## User flows

| Flow | Source path and behavior |
| --- | --- |
| Issue | `CompanyPage.issue` → `writeContract` → `issueContribution`; hashes employee/company inputs and evidence, obtains the wallet signer, waits for the transaction, extracts the issued ID from the event |
| History | `EmployeePage.lookup` → `readContract` → `getEmployeeContributionIds` → one `getContribution` call per ID; displays ID, type, time, issuer, and proof hash |
| Verify | `VerifyPage.verify` → `readContract` → `verifyContribution`; displays missing records or record details, current issuer authorization, and optional evidence match |
| Connect | `WalletButton` → `connectWallet`; requests accounts through the browser's injected Ethereum provider |

The issuer form offers code, design, documentation, incident-response, mentorship, and other contribution types. That dropdown is a UI convention; the contract accepts any type string.

History and verification require no application login. Read calls use the injected wallet provider when present, otherwise `http://127.0.0.1:8545`. Writes use the injected wallet signer. No provider chain-ID validation is implemented.

## Deployment and storage

`deploy.js.main` deploys a fresh contract, authorizes the deploying account for demo issuance, then writes `{ address, network, abi }` to `web/lib/deployment.json`. It does not export a chain ID or RPC URL.

The checked-in metadata declares `localhost` with address `0x5FbDB2315678afecb367f032d93F642f64180aa3`. `DEPLOYED` in `eth.js` means only that the address field is truthy; it does not probe the node or deployed bytecode. The homepage therefore shows configured deployment metadata, not verified liveness.

Records and employee indexes live in contract storage. Raw evidence is supplied in a browser textarea and hashed locally; no evidence database, upload service, API route, external-system connector, or separate credential export implementation appears in the tracked inventory.

## Verification assets and their limits

The four tests in `ContributionLedger.test.js` cover:

- A non-admin cannot authorize company wallets.
- Authorized issuance emits the expected event and an unauthorized wallet is rejected.
- Multiple records can be retrieved/indexed; count, selected fields, timestamp, existence, and missing-record verification are checked.
- Revocation rejects future issuance while preserving existence of an old record and reporting its issuer as currently unauthorized.

The web manifest provides a build command but no test or lint script. The tracked inventory contains no frontend test suite, committed end-to-end runner, or CI workflow. The root README reports a completed local end-to-end test and clean build; this checkout does not include their results or a dedicated repeatable end-to-end test artifact.

Neither `contracts/node_modules` nor `web/node_modules` existed during assessment. This documentation review did not install dependencies or execute tests/builds. Test coverage described above is inspection of assertions, not a fresh passing result.
