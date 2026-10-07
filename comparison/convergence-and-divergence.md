# Convergence and divergence

This assessment compares the [README's stated intent](../README.md) with the source inventoried in [Current repository](current-repository.md). Evidence references use file links plus stable function/component names. Suggested follow-ups describe how to close a gap; they are not newly approved product requirements or changes made by this review.

## Where intent and implementation converge

| Intended property | Implementation evidence | Result |
| --- | --- | --- |
| Authorized company attestation | [ContributionLedger.sol](../contracts/contracts/ContributionLedger.sol), `setCompanyAuthorization` and `issueContribution` | Admin controls the allowlist and issuance checks the transaction sender |
| Append-only contribution history | Same contract, `contributions` and `issueContribution`; complete external interface | Records are appended; no function updates or deletes them |
| Private evidence remains off-chain | [eth.js](../web/lib/eth.js), `hashEvidence`; [company/page.js](../web/app/company/page.js), `CompanyPage.issue`; contract `Contribution` | The app submits an evidence hash rather than the textarea contents |
| Employee lookup | Contract `employeeContributionIds` and `getEmployeeContributionIds`; [employee/page.js](../web/app/employee/page.js), `EmployeePage.lookup` | History can be retrieved for a normalized identifier |
| Public verification | Contract `verifyContribution`; [verify/page.js](../web/app/verify/page.js), `VerifyPage.verify` | A reader can check existence, issuer status, stored fields, and an optional hash match |
| Revocation preserves old attestations | Contract `verifyContribution`; [contract tests](../contracts/test/ContributionLedger.test.js), revocation test | Current permission is separate from an old record's continued existence |
| Three primary web workflows | [layout.js](../web/app/layout.js), `RootLayout`; company, employee, and verify page components | Navigation and pages match the README's Issue/Employee/Verify structure |
| Local development workflow | [package manifests](../contracts/package.json), [deploy.js](../contracts/scripts/deploy.js), `main`; [web manifest](../web/package.json) | Node, deploy, and web development commands exist with the described metadata handoff |

These are source-level alignments. Fresh execution is needed to establish that the flows succeed in a particular environment.

## Concrete mismatches

### Evidence is normalized rather than hashed verbatim

**Intent:** README “Identifier convention” specifies keccak256 of verbatim evidence text, and the sample flow describes an exact evidence match.

**Current source:** [eth.js](../web/lib/eth.js), `hashEvidence`, calls `keccak(s.trim())`. Both issuance and verification use that helper. Consequently, `"proof"` and `" proof "` yield the same submitted fingerprint; internal whitespace and case remain significant.

**Implication:** The two UI flows agree with each other, but their meaning differs from the documented byte-for-byte evidence promise. A third-party verifier following the README can compute a different hash for text with boundary whitespace.

**Follow-up:** Choose and document one evidence convention, then align the helper and meaningful hash-comparison checks with it. The current comparison records the mismatch without deciding that product choice.

### Public reads are wired for the local demo

**Intent:** The README says public verification works without a wallet and also provides Sepolia deployment instructions.

**Current source:** [eth.js](../web/lib/eth.js), `readContract`, uses an injected provider whenever present and otherwise a fixed localhost RPC. [deploy.js](../contracts/scripts/deploy.js), `main`, exports a network name but no RPC URL or chain ID. That network name is displayed but does not select the read provider. `writeContract` also does not validate the wallet's chain.

**Implication:** A Sepolia deployment does not automatically give wallet-free visitors a Sepolia read path. A wallet on the wrong network also targets the wrong chain. The checked-in address does not establish that the expected contract exists at that address on the selected provider.

**Follow-up:** Configure a read RPC and chain ID together with deployment metadata, validate write networks, and check the wallet-free path on the chosen chain.

### Verification claims are broader than committed verification assets

**Intent:** README “How we know it works” reports automated contract tests, a full local end-to-end test, and a clean website build.

**Current source:** [ContributionLedger.test.js](../contracts/test/ContributionLedger.test.js) contains four contract tests. [web/package.json](../web/package.json) contains a build script. `git ls-files` lists no dedicated end-to-end test, frontend tests, CI workflow, or saved test/build results.

**Implication:** The checkout supports rerunning contract tests and a build after setup, but it does not independently reproduce or substantiate the historical end-to-end success claim. Absence of an artifact does not prove the reported manual run never happened.

**Follow-up:** Preserve a repeatable end-to-end check and distinguish historical runs from current verified results. No passing runtime result is asserted by this assessment.

## Limits between the MVP and the wider goal

| Limit | Evidence and practical effect | Relationship to intended scope | Possible follow-up |
| --- | --- | --- | --- |
| Company identity is external | Contract allowlist stores wallet addresses; `issueContribution` accepts any `companyId` from an authorized caller | Wallet authorization is implemented, but a genuine organization and its claimed company ID are not cryptographically bound by this contract | Establish company onboarding and, if required, bind authorized wallets to company identifiers |
| Employee identity is a lookup key | `hashIdentifier` normalizes text; issuance requires no employee signature or consent | Employee-controlled identity is explicitly out of scope | Define ownership, consent, and identifier continuity before adding employee-managed credentials |
| Unsalted identifiers are guessable | `hashIdentifier` deterministically hashes the identifier; README explicitly warns about email enumeration | Acknowledged limitation; hashing does not provide secrecy for predictable inputs | Adopt an appropriate identity/privacy design before real-world use |
| Evidence availability is external | Only `proofHash` is stored; no retrieval/upload mechanism exists | Keeping evidence private is implemented; preserving and disclosing it later is not managed here | Define who preserves evidence and how it can be shared with a verifier |
| Local records are temporary | README says the Hardhat chain is in-memory and resets; metadata declares localhost | Suitable for the documented demo, insufficient for years-long preservation | Use and verify a durable deployment for persistent records |
| Admin control has no recovery path | `admin` is immutable; no transfer or replacement operation exists | A single-admin model is stated; operational recovery is unspecified | Decide key custody and recovery requirements for a durable deployment |
| History retrieval is unbounded | `getEmployeeContributionIds` returns all IDs; `EmployeePage.lookup` fetches every record with `Promise.all` | Full-history MVP lookup exists; performance at scale is unverified | Add bounded retrieval or indexing if record volume requires it |
| Record inputs are minimally constrained | Contract accepts arbitrary hashes and type strings; the UI's required fields and dropdown do not constrain other callers | Identifier convention is explicitly frontend-only; richer validity rules are unspecified | Define any required field/type/duplicate rules before claiming semantic validation |
| Portability is limited to shared identifiers and chain reads | Employee lookup, public verification, and raw hashes exist; no profile, export, or cross-identifier linking flow exists | Basic portable lookup aligns with the MVP; a complete employee credential product is not delivered | Specify any desired export, presentation, or identity-linking format |

## Deliberate absences

Admin UI, employee signature identity, salted IDs, Jira/GitHub integrations, scoring, tokens, and vesting are explicitly excluded in the README. Reputation and contribution-linked compensation are future uses, not present subsystems. Their absence should not be counted as a failure to implement the stated MVP.

The present repository therefore establishes a compact attestation-ledger implementation. It leaves the organizational trust process, identity lifecycle, durable deployment operations, and future financial or reputation features to further decisions and development.
