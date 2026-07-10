"use client";
import { useState } from "react";
import { connectWallet } from "../lib/eth";

export default function WalletButton() {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);

  if (account) {
    return <span className="mono">{account.slice(0, 6)}…{account.slice(-4)}</span>;
  }
  return (
    <button
      style={{ margin: 0 }}
      onClick={() => connectWallet().then(setAccount).catch((e) => setError(e.message))}
    >
      {error ? "Retry connect" : "Connect wallet"}
    </button>
  );
}
