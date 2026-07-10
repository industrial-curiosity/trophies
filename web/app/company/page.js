"use client";
import { useState } from "react";
import { DEPLOYED, writeContract, hashIdentifier, hashEvidence } from "../../lib/eth";

export default function CompanyPage() {
  const [form, setForm] = useState({ employee: "", company: "", type: "code", evidence: "" });
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function issue(e) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const contract = await writeContract();
      const tx = await contract.issueContribution(
        hashIdentifier(form.employee),
        hashIdentifier(form.company),
        form.type,
        hashEvidence(form.evidence)
      );
      setStatus(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      const issued = receipt.logs
        .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
        .find((l) => l?.name === "ContributionIssued");
      setStatus(`Issued contribution #${issued.args.id} in block ${receipt.blockNumber}`);
    } catch (err) {
      setError(err.reason || err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!DEPLOYED) return <p>Deploy the contract first (see home page).</p>;

  return (
    <>
      <h1>Issue contribution</h1>
      <p className="muted">
        Your connected wallet must be an authorized company. Evidence is hashed in
        your browser — only the hash goes on-chain.
      </p>
      <form onSubmit={issue}>
        <label>Employee identifier (email or wallet)</label>
        <input required value={form.employee} onChange={set("employee")} placeholder="alice@example.com" />
        <label>Company identifier</label>
        <input required value={form.company} onChange={set("company")} placeholder="acme-corp" />
        <label>Contribution type</label>
        <select value={form.type} onChange={set("type")}>
          <option>code</option>
          <option>design</option>
          <option>documentation</option>
          <option>incident-response</option>
          <option>mentorship</option>
          <option>other</option>
        </select>
        <label>Private evidence (Jira ticket, PR link, internal notes)</label>
        <textarea required rows={4} value={form.evidence} onChange={set("evidence")}
          placeholder="JIRA-123: Led migration of payments service…" />
        <button disabled={busy}>{busy ? "Issuing…" : "Issue contribution"}</button>
      </form>
      {status && <div className="card">{status}</div>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
