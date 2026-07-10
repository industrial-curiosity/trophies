"use client";
import { useState } from "react";
import { DEPLOYED, readContract, hashEvidence } from "../../lib/eth";

export default function VerifyPage() {
  const [id, setId] = useState("");
  const [evidence, setEvidence] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function verify(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const [exists, issuerAuthorized, c] = await readContract().verifyContribution(BigInt(id));
      setResult({
        exists,
        issuerAuthorized,
        c,
        evidenceMatch: evidence.trim() ? hashEvidence(evidence) === c.proofHash : null,
      });
    } catch (err) {
      setError(err.reason || err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!DEPLOYED) return <p>Deploy the contract first (see home page).</p>;

  return (
    <>
      <h1>Public verification</h1>
      <p className="muted">No wallet needed. Optionally paste the evidence text to check it matches the on-chain hash.</p>
      <form onSubmit={verify}>
        <label>Contribution ID</label>
        <input required type="number" min="0" value={id} onChange={(e) => setId(e.target.value)} />
        <label>Evidence text (optional)</label>
        <textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)}
          placeholder="Paste the exact evidence to verify its hash" />
        <button disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && !result.exists && <div className="card bad">No contribution with that ID.</div>}
      {result && result.exists && (
        <div className="card">
          <p className="ok">✓ Record exists — issued by an authorized company at signing time.</p>
          <p>
            Issuer currently authorized:{" "}
            <span className={result.issuerAuthorized ? "ok" : "bad"}>
              {result.issuerAuthorized ? "yes" : "no (revoked since issuance)"}
            </span>
          </p>
          {result.evidenceMatch !== null && (
            <p>
              Evidence hash:{" "}
              <span className={result.evidenceMatch ? "ok" : "bad"}>
                {result.evidenceMatch ? "matches proofHash" : "does NOT match proofHash"}
              </span>
            </p>
          )}
          <table>
            <tbody>
              <tr><th>Type</th><td>{result.c.contributionType}</td></tr>
              <tr><th>Issued</th><td>{new Date(Number(result.c.timestamp) * 1000).toLocaleString()}</td></tr>
              <tr><th>Issuer</th><td className="mono">{result.c.issuer}</td></tr>
              <tr><th>Employee ID</th><td className="mono">{result.c.employeeId}</td></tr>
              <tr><th>Company ID</th><td className="mono">{result.c.companyId}</td></tr>
              <tr><th>Proof hash</th><td className="mono">{result.c.proofHash}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
