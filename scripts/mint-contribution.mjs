#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  toBytes,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, opBNBTestnet } from 'viem/chains';
import { bcs } from '@mysten/sui/bcs';
import { ObjectError } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const maxQuantity = (1n << 128n) - 1n;
const unitsPerTrophy = 10n ** 18n;
const networks = {
  'base-sepolia': baseSepolia,
  'opbnb-testnet': opBNBTestnet,
  'sui-testnet': null,
};
const registryAbi = parseAbi([
  'function projectInfo(uint256 id) view returns (address manager, uint256 supply, bool operationalPause, bool withdrawalPause, address[] enabledAssets)',
  'function usedReference(uint256 id, bytes32 referenceHash) view returns (bool)',
  'function mint(uint256 id, address recipient, uint256 quantity, string description, string externalReference)',
]);

function requiredString(value, name, maxBytes) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > maxBytes) {
    throw new Error(`${name} must be a nonempty string of at most ${maxBytes} UTF-8 bytes`);
  }
  return value;
}

function suiAddress(value, name) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) {
    throw new Error(`${name} must be a Sui hex address`);
  }
  const normalized = normalizeSuiAddress(value);
  if (!isValidSuiAddress(normalized) || normalized === normalizeSuiAddress('0x0')) {
    throw new Error(`${name} must be a nonzero Sui address`);
  }
  return normalized;
}

export function validateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Mint request must be an object');
  const network = requiredString(input.network, 'network', 32);
  if (!(network in networks)) throw new Error(`Unsupported mint network: ${network}`);
  const reference = requiredString(input.reference, 'reference', 128);
  const description = requiredString(input.description, 'description', 512);
  if (typeof input.quantity !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(input.quantity)) {
    throw new Error('quantity must be a plain decimal string with at most 18 fractional digits');
  }
  const [whole, fraction = ''] = input.quantity.split('.');
  const quantity = BigInt(whole) * unitsPerTrophy + BigInt(fraction.padEnd(18, '0') || '0');
  if (quantity === 0n || quantity > maxQuantity) {
    throw new Error('quantity must be positive and within the supported 128-bit base-unit bound');
  }
  const recipientInput = input.recipient ?? '';
  if (typeof recipientInput !== 'string') throw new Error('recipient must be an address or empty');
  let project;
  let recipient = null;
  if (network === 'sui-testnet') {
    project = suiAddress(input.project, 'project');
    if (recipientInput) recipient = suiAddress(recipientInput, 'recipient');
  } else {
    if (typeof input.project !== 'string' || !/^[1-9][0-9]*$/.test(input.project)) {
      throw new Error('project must be a positive decimal ID');
    }
    project = BigInt(input.project);
    if (recipientInput) {
      if (!isAddress(recipientInput) || /^0x0{40}$/i.test(recipientInput)) {
        throw new Error('recipient must be a nonzero EVM address');
      }
      recipient = getAddress(recipientInput);
    }
  }
  return { network, project, quantity, humanQuantity: input.quantity,
    reference, description, recipient };
}

function deploymentFor(request, deployments) {
  const deployment = deployments[request.network];
  if (!deployment || deployment.environment !== 'testnet') {
    throw new Error(`No testnet deployment configuration for ${request.network}`);
  }
  if (request.network === 'sui-testnet') {
    return {
      packageId: suiAddress(deployment.packageId, 'packageId'),
      registryObjectId: suiAddress(deployment.registryObjectId, 'registryObjectId'),
    };
  }
  const chain = networks[request.network];
  if (deployment.chainId !== chain.id || !isAddress(deployment.registryAddress)) {
    throw new Error(`Deployment address or chain ID is missing for ${request.network}`);
  }
  return { registryAddress: getAddress(deployment.registryAddress), chain };
}

function objectId(value, name) {
  const id = typeof value === 'string' ? value : value?.id?.id ?? value?.id;
  return suiAddress(id, name);
}

export async function mintEvm(request, deployment, account, publicClient, walletClient) {
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== deployment.chain.id) throw new Error('RPC chain ID does not match deployment');
  const [manager] = await publicClient.readContract({
    address: deployment.registryAddress, abi: registryAbi, functionName: 'projectInfo', args: [request.project],
  });
  if (manager.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('Signing wallet is not the current project manager');
  }
  const recipient = request.recipient ?? account.address;
  if (recipient.toLowerCase() === deployment.registryAddress.toLowerCase()) {
    throw new Error('Registry cannot receive shares');
  }
  const used = await publicClient.readContract({
    address: deployment.registryAddress, abi: registryAbi, functionName: 'usedReference',
    args: [request.project, keccak256(toBytes(request.reference))],
  });
  if (used) throw new Error('Contribution reference was already minted; inspect the earlier transaction');
  const hash = await walletClient.writeContract({
    address: deployment.registryAddress, abi: registryAbi, functionName: 'mint',
    args: [request.project, recipient, request.quantity, request.description, request.reference],
    account, chain: deployment.chain,
  });
  const pending = { network: request.network, project: request.project.toString(), reference: request.reference,
    recipient, quantity: request.humanQuantity, quantityBaseUnits: request.quantity.toString(),
    managerHeld: request.recipient === null,
    transaction: hash, status: 'submitted' };
  await saveResult(pending);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Mint transaction ${hash} failed on-chain`);
  return { ...pending, status: 'confirmed' };
}

export async function mintSui(request, deployment, keypair, client) {
  const manager = normalizeSuiAddress(keypair.getPublicKey().toSuiAddress());
  const { object: registry } = await client.getObject({ objectId: deployment.registryObjectId, include: { json: true } });
  const { object: project } = await client.getObject({ objectId: request.project, include: { json: true } });
  if (registry.type !== `${deployment.packageId}::registry::Registry` ||
      project.type !== `${deployment.packageId}::registry::Project` || !project.json) {
    throw new Error('Sui deployment objects do not match the configured package');
  }
  if (objectId(project.json.registry_id, 'project registry') !== deployment.registryObjectId) {
    throw new Error('Project belongs to a different registry');
  }
  if (objectId(project.json.manager, 'project manager') !== manager) {
    throw new Error('Signing wallet is not the current project manager');
  }
  const recipient = request.recipient ?? manager;
  if (recipient === request.project) throw new Error('Project object cannot receive shares');
  const referencesId = objectId(project.json.references, 'references table');
  try {
    await client.getDynamicField({
      parentId: referencesId,
      name: { type: '0x1::string::String', bcs: bcs.String.serialize(request.reference).toBytes() },
    });
    throw new Error('Contribution reference was already minted; inspect the earlier transaction');
  } catch (error) {
    if (!(error instanceof ObjectError && error.reason === 'notFound')) throw error;
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${deployment.packageId}::registry::mint`,
    arguments: [tx.object(deployment.registryObjectId), tx.object(request.project),
      tx.pure.address(recipient), tx.pure.u128(request.quantity),
      tx.pure.string(request.description), tx.pure.string(request.reference)],
  });
  const result = await keypair.signAndExecuteTransaction({ transaction: tx, client });
  const transaction = result.Transaction ?? result.FailedTransaction;
  if (!transaction?.digest) throw new Error('Sui mint returned no transaction digest');
  const pending = { network: request.network, project: request.project, reference: request.reference,
    recipient, quantity: request.humanQuantity, quantityBaseUnits: request.quantity.toString(),
    managerHeld: request.recipient === null,
    transaction: transaction.digest, status: result.$kind === 'Transaction' ? 'confirmed' : 'failed' };
  await saveResult(pending);
  if (pending.status !== 'confirmed') throw new Error(`Sui mint transaction ${transaction.digest} failed on-chain`);
  return pending;
}

async function saveResult(result) {
  const path = process.env.MINT_RESULT_PATH ?? resolve(root, 'mint-result.json');
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
}

export async function main(env = process.env) {
  let input;
  if (env.MINT_REQUEST_PATH) {
    if (!/^trophies\/[0-9]{14}-[a-z0-9][a-z0-9-]{0,79}\.json$/.test(env.MINT_REQUEST_PATH)) {
      throw new Error('MINT_REQUEST_PATH must name a trophy file');
    }
    input = JSON.parse(await readFile(resolve(root, env.MINT_REQUEST_PATH), 'utf8'));
  } else {
    input = JSON.parse(requiredString(env.MINT_REQUEST_JSON, 'MINT_REQUEST_JSON', 2048));
  }
  const request = validateRequest(input);
  const deployments = JSON.parse(await readFile(resolve(root, 'deployments/networks.json'), 'utf8'));
  const deployment = deploymentFor(request, deployments);
  const rpcUrl = new URL(requiredString(env.RPC_URL, 'RPC_URL', 512));
  if (rpcUrl.protocol !== 'https:') throw new Error('RPC_URL must use HTTPS');
  const secret = requiredString(env.MANAGER_PRIVATE_KEY, 'MANAGER_PRIVATE_KEY', 256);
  let result;
  if (request.network === 'sui-testnet') {
    const expectedChain = requiredString(env.SUI_CHAIN_IDENTIFIER, 'SUI_CHAIN_IDENTIFIER', 128);
    const client = new SuiGrpcClient({ network: 'testnet', baseUrl: rpcUrl.toString() });
    const { chainIdentifier } = await client.getChainIdentifier();
    if (chainIdentifier !== expectedChain) throw new Error('Sui RPC chain identifier does not match configuration');
    const keypair = Ed25519Keypair.fromSecretKey(secret);
    result = await mintSui(request, deployment, keypair, client);
  } else {
    if (!/^0x[0-9a-fA-F]{64}$/.test(secret)) throw new Error('MANAGER_PRIVATE_KEY must be an EVM private key');
    const account = privateKeyToAccount(secret);
    const transport = http(rpcUrl.toString());
    const publicClient = createPublicClient({ chain: deployment.chain, transport });
    const walletClient = createWalletClient({ chain: deployment.chain, account, transport });
    result = await mintEvm(request, deployment, account, publicClient, walletClient);
  }
  await saveResult(result);
  console.log(`Mint ${result.status}: ${result.network} ${result.transaction}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Mint stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
