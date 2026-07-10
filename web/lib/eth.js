import { BrowserProvider, JsonRpcProvider, Contract, id as keccak } from "ethers";
import deployment from "./deployment.json";

export const DEPLOYED = Boolean(deployment.address);
export const NETWORK = deployment.network;
export const ADDRESS = deployment.address;

// Identifier convention: trim + lowercase, then keccak256. Anyone applying the
// same convention to the same identifier gets the same on-chain employeeId.
export const hashIdentifier = (s) => keccak(s.trim().toLowerCase());

// Evidence is hashed verbatim (case matters) and never leaves the browser.
export const hashEvidence = (s) => keccak(s.trim());

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No wallet found — install MetaMask.");
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  return accounts[0];
}

export function readContract() {
  // ponytail: falls back to local hardhat node so the public verify page
  // works without a wallet; point at a public RPC when deploying for real.
  const provider = window.ethereum
    ? new BrowserProvider(window.ethereum)
    : new JsonRpcProvider("http://127.0.0.1:8545");
  return new Contract(deployment.address, deployment.abi, provider);
}

export async function writeContract() {
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return new Contract(deployment.address, deployment.abi, signer);
}
