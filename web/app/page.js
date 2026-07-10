import { DEPLOYED, ADDRESS, NETWORK } from "../lib/eth";

export default function Home() {
  return (
    <>
      <h1>Verified Contribution Ledger</h1>
      <p>
        Companies issue immutable, cryptographically signed contribution records.
        The chain stores attestations from authorized company wallets — it does not
        decide what is true. Evidence stays private; only its hash goes on-chain.
      </p>
      {DEPLOYED ? (
        <p className="muted">
          Contract <span className="mono">{ADDRESS}</span> on <b>{NETWORK}</b>.
        </p>
      ) : (
        <div className="card">
          No deployment found. Run <span className="mono">npm run node</span> then{" "}
          <span className="mono">npm run deploy:local</span> in <span className="mono">contracts/</span>,
          then restart this app.
        </div>
      )}
      <ul>
        <li><b>Issue</b> — authorized company wallets record a contribution.</li>
        <li><b>Employee</b> — look up any employee&apos;s contribution history.</li>
        <li><b>Verify</b> — anyone checks a record exists, who signed it, and whether pasted evidence matches its hash.</li>
      </ul>
    </>
  );
}
