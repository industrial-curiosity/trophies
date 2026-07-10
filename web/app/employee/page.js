"use client";
import { useState } from "react";
import { DEPLOYED, readContract, hashIdentifier } from "../../lib/eth";

export default function EmployeePage() {
  const [identifier, setIdentifier] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function lookup(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const contract = readContract();
      const ids = await contract.getEmployeeContributionIds(hashIdentifier(identifier));
      const contributions = await Promise.all(ids.map((id) => contract.getContribution(id)));
      setRows(ids.map((id, i) => ({ id: Number(id), c: contributions[i] })));
    } catch (err) {
      setError(err.reason || err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!DEPLOYED) return <p>Deploy the contract first (see home page).</p>;

  return (
    <>
      <h1>Employee history</h1>
      <form onSubmit={lookup}>
        <label>Employee identifier (email or wallet)</label>
        <input required value={identifier} onChange={(e) => setIdentifier(e.target.value)}
          placeholder="alice@example.com" />
        <button disabled={busy}>{busy ? "Loading…" : "Look up"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {rows && rows.length === 0 && <p className="muted">No contributions recorded.</p>}
      {rows && rows.length > 0 && (
        <table>
          <thead>
            <tr><th>#</th><th>Type</th><th>Issued</th><th>Issuer</th><th>Proof hash</th></tr>
          </thead>
          <tbody>
            {rows.map(({ id, c }) => (
              <tr key={id}>
                <td>{id}</td>
                <td>{c.contributionType}</td>
                <td>{new Date(Number(c.timestamp) * 1000).toLocaleString()}</td>
                <td className="mono">{c.issuer}</td>
                <td className="mono">{c.proofHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
