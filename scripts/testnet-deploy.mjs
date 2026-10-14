#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createPublicClient, createWalletClient, getAddress, http,
  parseAbi, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, opBNBTestnet } from 'viem/chains';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const unit = 10n ** 18n;
const networks = {
  'base-sepolia': { chain: baseSepolia, rpc: 'https://sepolia.base.org',
    funding: '0.01', donation: '0.001', gasUnit: 'ETH' },
  'opbnb-testnet': { chain: opBNBTestnet, rpc: 'https://opbnb-testnet-rpc.bnbchain.org',
    funding: '0.01', donation: '0.001', gasUnit: 'tBNB' },
  'sui-testnet': { rpc: 'https://fullnode.testnet.sui.io:443',
    funding: '0.1', donation: '0.001', gasUnit: 'SUI' },
};
const suiTestnetChain = '4c78adac';
const suiCoin = '0x2::sui::SUI';
const zeroAddress = '0x0000000000000000000000000000000000000000';

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    ...options });
}

export function amount(value, decimals) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    throw new Error('Amount must be a plain positive decimal number');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Amount permits at most ${decimals} decimals`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units === 0n) throw new Error('Amount must be positive');
  return units;
}

function deriveSeed(ownerSecret, network, role) {
  return createHmac('sha256', ownerSecret).update(`trophies:testnet:v1:${network}:${role}`).digest();
}

export function accountsFor(network, ownerSecret) {
  const roles = ['manager', 'alice', 'bob'];
  if (network === 'sui-testnet') {
    const owner = Ed25519Keypair.fromSecretKey(ownerSecret);
    return Object.fromEntries([['owner', owner], ...roles.map((role) =>
      [role, Ed25519Keypair.fromSecretKey(deriveSeed(ownerSecret, network, role))])]);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(ownerSecret)) {
    throw new Error('EVM owner key must be 0x followed by 64 hex characters');
  }
  const owner = privateKeyToAccount(ownerSecret);
  return Object.fromEntries([['owner', owner], ...roles.map((role) =>
    [role, privateKeyToAccount(`0x${deriveSeed(Buffer.from(ownerSecret.slice(2), 'hex'), network, role).toString('hex')}`)])]);
}

function addressOf(account) {
  return account.address ?? account.getPublicKey().toSuiAddress();
}

function secretPrompt(prompt) {
  return new Promise((resolvePrompt, rejectPrompt) => {
    if (!process.stdin.isTTY) return rejectPrompt(new Error('An interactive terminal is required'));
    process.stdout.write(prompt);
    let value = '';
    const input = process.stdin;
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) rejectPrompt(error);
      else resolvePrompt(value);
    };
    const onData = (bytes) => {
      for (const character of bytes.toString('utf8')) {
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0003') return finish(new Error('Canceled'));
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    };
    input.on('data', onData);
  });
}

async function collectInput() {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal');
  const ask = createInterface({ input: process.stdin, output: process.stdout });
  let selection;
  try {
    const network = (await ask.question('Testnet (base-sepolia, opbnb-testnet, sui-testnet): ')).trim();
    if (!networks[network]) throw new Error('Only the three testnets are supported');
    const info = networks[network];
    const useDefaultRpc = (await ask.question(`Use default RPC ${info.rpc}? [Y/n]: `)).trim().toLowerCase();
    if (!['', 'y', 'n'].includes(useDefaultRpc)) throw new Error('Enter Y or n for the RPC choice');
    const fundingInput = (await ask.question(`Fund each disposable test wallet with ${info.gasUnit} [${info.funding}]: `)).trim() || info.funding;
    const donationInput = (await ask.question(`Each of two donations in ${info.gasUnit} [${info.donation}]: `)).trim() || info.donation;
    const assetType = (await ask.question(network === 'sui-testnet'
      ? 'Optional second Sui coin type T (0x...::module::TOKEN; blank to skip): '
      : 'Optional second ERC-20 token address owned by the owner (blank to skip): ')).trim();
    const assetQuantity = assetType
      ? (await ask.question('Human-readable amount of that asset to donate [1]: ')).trim() || '1' : null;
    if (assetType && network !== 'sui-testnet') getAddress(assetType);
    if (assetType && network === 'sui-testnet' && !/^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/.test(assetType)) {
      throw new Error('Sui asset must be a full coin type T, such as 0x...::module::TOKEN');
    }
    const decimals = network === 'sui-testnet' ? 9 : 18;
    const funding = amount(fundingInput, decimals);
    const donation = amount(donationInput, decimals);
    if (network === 'sui-testnet' && (funding > (1n << 64n) - 1n || donation > (1n << 64n) - 1n)) {
      throw new Error('Sui amounts must fit in u64 MIST');
    }
    if (donation % 2000n !== 0n) throw new Error('Donation must be divisible by 2000 base units for exact fee checks');
    if (funding < 2n * donation) throw new Error('Manager funding must cover both donations plus gas');
    process.stdout.write(`\nThis run will deploy an immutable registry, fund three disposable wallets with ${fundingInput} ${info.gasUnit} each, and donate ${donationInput} ${info.gasUnit} twice${assetType ? ` plus ${assetQuantity} of ${assetType}` : ''}. It spends testnet gas in addition to those transfers. Derived wallet keys remain in memory and can be recreated from the same dedicated testnet owner key.\n`);
    if ((await ask.question('Type RUN to continue: ')).trim() !== 'RUN') throw new Error('Canceled before signing');
    selection = { network, info, useDefaultRpc, funding, donation, assetType, assetQuantity };
  } finally {
    ask.close();
  }
  const { network, info, useDefaultRpc, funding, donation, assetType, assetQuantity } = selection;
  const rpc = useDefaultRpc === 'n' ? (await secretPrompt('Custom HTTPS RPC URL (hidden): ')).trim() : info.rpc;
  if (new URL(rpc).protocol !== 'https:') throw new Error('RPC must use HTTPS');
  const ownerSecret = (await secretPrompt('Dedicated testnet owner private key (hidden): ')).trim();
  return { network, rpc, funding, donation, assetType, assetQuantity, ownerSecret };
}

async function sourceDigest(network) {
  const files = network === 'sui-testnet'
    ? ['contracts/sui/Move.toml', 'contracts/sui/Move.lock', 'contracts/sui/sources/registry.move']
    : ['contracts/evm/src/ProjectRegistry.sol', 'contracts/evm/foundry.toml', 'contracts/evm/script/DeployRegistry.s.sol'];
  files.push('scripts/testnet-deploy.mjs', 'package-lock.json');
  const digest = createHash('sha256');
  for (const file of files) digest.update(await readFile(resolve(root, file)));
  return digest.digest('hex');
}

async function checkpoint(input, owner) {
  const directory = resolve(root, '.tool-cache/testnet/runs');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, `${input.network}.json`);
  const source = await sourceDigest(input.network);
  let state;
  try { state = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state) {
    if (state.owner !== owner || state.source !== source ||
      state.rpcDigest !== createHash('sha256').update(input.rpc).digest('hex') ||
      state.funding !== input.funding.toString() || state.donation !== input.donation.toString() ||
      state.assetType !== input.assetType || state.assetQuantity !== input.assetQuantity) {
      throw new Error(`Existing run at ${path} uses different inputs; inspect it before starting another deployment`);
    }
  } else {
    state = { network: input.network, owner, source,
      rpcDigest: createHash('sha256').update(input.rpc).digest('hex'),
      funding: input.funding.toString(), donation: input.donation.toString(),
      assetType: input.assetType, assetQuantity: input.assetQuantity, steps: {} };
  }
  async function save() {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  }
  await save();
  return { state, path, save };
}

function recordPublic(result) {
  return JSON.parse(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value));
}

async function evmStep(book, name, publicClient, send) {
  let step = book.state.steps[name];
  if (step?.status === 'confirmed') return step;
  if (!step) {
    book.state.steps[name] = { status: 'attempting' };
    await book.save();
    const hash = await send();
    step = book.state.steps[name] = { status: 'submitted', transaction: hash };
    await book.save();
  }
  if (!step.transaction) throw new Error(`${name} has an uncertain submission; inspect ${book.path} and the chain before retrying`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: step.transaction });
  if (receipt.status !== 'success') throw new Error(`${name} failed on-chain: ${step.transaction}`);
  step.status = 'confirmed';
  step.contractAddress = receipt.contractAddress ?? undefined;
  step.logs = recordPublic(receipt.logs);
  await book.save();
  console.log(`${name}: ${step.transaction}`);
  return step;
}

async function suiStep(book, name, client, signer, transaction) {
  let step = book.state.steps[name];
  if (step?.status === 'confirmed') return step;
  if (!step) {
    transaction.setSender(addressOf(signer));
    const bytes = await transaction.build({ client });
    const digest = await transaction.getDigest({ client });
    const { signature } = await signer.signTransaction(bytes);
    step = book.state.steps[name] = { status: 'submitted', transaction: digest };
    await book.save();
    const result = await client.executeTransaction({ transaction: bytes, signatures: [signature],
      include: { effects: true, events: true, objectTypes: true } });
    if ((result.Transaction ?? result.FailedTransaction)?.digest !== digest) throw new Error(`${name} returned an unexpected digest`);
  }
  const result = await client.waitForTransaction({ digest: step.transaction,
    include: { effects: true, events: true, objectTypes: true } });
  const tx = result.Transaction ?? result.FailedTransaction;
  if (!tx?.status?.success) throw new Error(`${name} failed on-chain: ${step.transaction}`);
  step.status = 'confirmed';
  step.effects = recordPublic({ status: tx.effects.status, gasUsed: tx.effects.gasUsed,
    changedObjects: tx.effects.changedObjects });
  step.events = recordPublic((tx.events ?? []).map((event) => ({ eventType: event.eventType,
    json: event.json })));
  step.objectTypes = recordPublic(tx.objectTypes ?? {});
  await book.save();
  console.log(`${name}: ${step.transaction}`);
  return step;
}

function suiCreated(step, type) {
  const created = step.effects.changedObjects.filter((item) => item.idOperation === 'Created');
  const found = created.find((item) => type === 'package'
    ? item.outputState === 'PackageWrite' : step.objectTypes[item.objectId] === type);
  if (!found) throw new Error(`Expected created ${type} in ${step.transaction}`);
  return found.objectId;
}

function suiEventAmount(step, eventName) {
  const event = step.events.find((item) => item.eventType.endsWith(`::registry::${eventName}`));
  if (!event?.json?.amount) throw new Error(`Missing ${eventName} amount in ${step.transaction}`);
  return BigInt(event.json.amount);
}

function checkedAssetAmount(human, decimals) {
  const value = amount(human, decimals);
  if (value < 200n || value % 200n !== 0n) {
    throw new Error('Second-asset amount must be at least 200 base units and divisible by 200');
  }
  return value;
}

async function updateNetwork(network, values) {
  const path = resolve(root, 'deployments/networks.json');
  const config = JSON.parse(await readFile(path, 'utf8'));
  if (Object.values(values).some((value) => !value)) throw new Error('Deployment identifiers are incomplete');
  const current = config[network];
  for (const [key, value] of Object.entries(values)) {
    if (current[key] && current[key] !== value) {
      throw new Error(`${network}.${key} already names another deployment; preserve the old record before replacing it`);
    }
  }
  Object.assign(current, values);
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`);
  await rename(temporary, path);
}

async function assertNetworkSlot(book) {
  const config = JSON.parse(await readFile(resolve(root, 'deployments/networks.json'), 'utf8'));
  const current = config[book.state.network];
  if (!current) throw new Error('Selected network is missing from deployments/networks.json');
  const identifierKeys = book.state.network === 'sui-testnet'
    ? ['packageId', 'registryObjectId'] : ['registryAddress'];
  for (const key of identifierKeys) {
    const value = current[key];
    if (value && value !== book.state.result?.[key]) {
      throw new Error(`${book.state.network}.${key} already names another deployment; inspect it before spending funds`);
    }
  }
}

async function exerciseEvm(input, book, accounts) {
  const chain = networks[input.network].chain;
  const transport = http(input.rpc);
  const publicClient = createPublicClient({ chain, transport });
  if (await publicClient.getChainId() !== chain.id) throw new Error('RPC is not the selected testnet');
  const wallets = Object.fromEntries(Object.entries(accounts).map(([role, account]) =>
    [role, createWalletClient({ chain, account, transport })]));
  const ownerBalance = await publicClient.getBalance({ address: accounts.owner.address });
  if (!book.state.steps['fund-manager'] && ownerBalance <= input.funding * 3n) {
    throw new Error('Owner needs three wallet transfers plus deployment gas');
  }
  console.log(`Owner ${accounts.owner.address}; balance ${ownerBalance} wei`);
  if (input.assetType) {
    const token = getAddress(input.assetType);
    const tokenAbi = parseAbi(['function decimals() view returns (uint8)',
      'function balanceOf(address) view returns (uint256)']);
    const decimals = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'decimals' });
    const value = checkedAssetAmount(input.assetQuantity, decimals);
    if (!book.state.steps['asset-transfer'] &&
      await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf',
        args: [accounts.owner.address] }) < value) {
      throw new Error('Owner does not hold enough of the second token');
    }
  }

  run('scripts/contracts.sh', ['evm', 'build'], { stdio: 'inherit' });
  const artifact = JSON.parse(await readFile(resolve(root, 'contracts/evm/out/ProjectRegistry.sol/ProjectRegistry.json'), 'utf8'));
  if (!artifact.abi || !/^0x[0-9a-f]+$/i.test(artifact.bytecode?.object)) {
    throw new Error('Foundry artifact is missing ABI or deployable bytecode');
  }
  const abi = artifact.abi;
  const deploy = await evmStep(book, 'deploy', publicClient, () => wallets.owner.deployContract({
    abi, bytecode: artifact.bytecode.object, args: [accounts.owner.address],
  }));
  const registry = getAddress(deploy.contractAddress);
  if (!book.state.steps['owner-nominate-alice']) {
    assert.equal(await publicClient.readContract({ address: registry, abi, functionName: 'owner' }), accounts.owner.address);
  }

  for (const role of ['manager', 'alice', 'bob']) {
    await evmStep(book, `fund-${role}`, publicClient, () => wallets.owner.sendTransaction({
      to: accounts[role].address, value: input.funding,
    }));
  }
  const register = await evmStep(book, 'register', publicClient, () => wallets.manager.writeContract({
    address: registry, abi, functionName: 'registerProject',
  }));
  const registration = parseEventLogs({ abi, logs: register.logs, eventName: 'ProjectRegistered' });
  if (registration.length !== 1) throw new Error('Registration did not emit one project ID');
  const project = registration[0].args.projectId;
  const call = (role, functionName, args, value) => wallets[role].writeContract({
    address: registry, abi, functionName, args, ...(value === undefined ? {} : { value }),
  });
  for (const role of ['alice', 'bob']) {
    await evmStep(book, `mint-${role}`, publicClient, () => call('manager', 'mint',
      [project, accounts[role].address, unit, `test ${role}`, `testnet:${book.state.source}:${role}`]));
  }
  await evmStep(book, 'donate-1', publicClient, () => call('manager', 'donateNative', [project], input.donation));
  const entitlement = (role) => publicClient.readContract({ address: registry, abi,
    functionName: 'entitlement', args: [project, zeroAddress, accounts[role].address] });
  const fee = input.donation / 200n;
  const half = (input.donation - fee) / 2n;
  if (!book.state.steps.transfer) {
    assert.equal((await entitlement('alice'))[0], half);
    assert.equal((await entitlement('bob'))[0], half);
  }
  await evmStep(book, 'transfer', publicClient, () => call('alice', 'safeTransferFrom',
    [accounts.alice.address, accounts.bob.address, project, unit, '0x']));
  await evmStep(book, 'donate-2', publicClient, () => call('manager', 'donateNative', [project], input.donation));
  if (!book.state.steps['claim-alice']) {
    assert.equal((await entitlement('alice'))[0], half);
    assert.equal((await entitlement('bob'))[0], half + input.donation - fee);
  }
  await evmStep(book, 'claim-alice', publicClient, () => call('alice', 'claim', [project, zeroAddress]));
  await evmStep(book, 'claim-bob', publicClient, () => call('bob', 'claim', [project, zeroAddress]));
  await evmStep(book, 'collect-fees', publicClient, () => call('owner', 'collectFees', [project, zeroAddress]));
  assert.equal((await entitlement('alice'))[0], 0n);
  assert.equal((await entitlement('bob'))[0], 0n);
  assert.equal(await publicClient.readContract({ address: registry, abi, functionName: 'balanceOf',
    args: [accounts.alice.address, project] }), 0n);
  assert.equal(await publicClient.readContract({ address: registry, abi, functionName: 'balanceOf',
    args: [accounts.bob.address, project] }), 2n * unit);
  const projectInfo = await publicClient.readContract({ address: registry, abi,
    functionName: 'projectInfo', args: [project] });
  if (!book.state.steps['manager-nominate-bob']) assert.equal(projectInfo[0], accounts.manager.address);
  assert.equal(projectInfo[1], 2n * unit);
  await assert.rejects(publicClient.simulateContract({ address: registry, abi,
    functionName: 'mint', args: [project, accounts.alice.address, unit, 'unauthorized', 'testnet:reject'],
    account: accounts.alice.address }), /Unauthorized/);
  await evmStep(book, 'manager-pause-on', publicClient, () => call('manager', 'setManagerPause', [project, true]));
  if (!book.state.steps['manager-pause-off']) {
    await assert.rejects(publicClient.simulateContract({ address: registry, abi,
      functionName: 'mint', args: [project, accounts.alice.address, unit, 'paused', 'testnet:paused'],
      account: accounts.manager.address }), /Paused/);
  }
  await evmStep(book, 'manager-pause-off', publicClient, () => call('manager', 'setManagerPause', [project, false]));
  await evmStep(book, 'owner-pause-on', publicClient, () => call('owner', 'setOwnerPause', [project, true, true]));
  if (!book.state.steps['owner-pause-off']) {
    await assert.rejects(publicClient.simulateContract({ address: registry, abi,
      functionName: 'claim', args: [project, zeroAddress], account: accounts.bob.address }), /Paused/);
  }
  await evmStep(book, 'owner-pause-off', publicClient, () => call('owner', 'setOwnerPause', [project, false, false]));
  await evmStep(book, 'manager-nominate-bob', publicClient, () => call('manager', 'nominateManager', [project, accounts.bob.address]));
  await evmStep(book, 'manager-accept-bob', publicClient, () => call('bob', 'acceptManager', [project]));
  await evmStep(book, 'manager-nominate-return', publicClient, () => call('bob', 'nominateManager', [project, accounts.manager.address]));
  await evmStep(book, 'manager-accept-return', publicClient, () => call('manager', 'acceptManager', [project]));
  await evmStep(book, 'owner-nominate-alice', publicClient, () => call('owner', 'nominateOwner', [accounts.alice.address]));
  await evmStep(book, 'owner-accept-alice', publicClient, () => call('alice', 'acceptOwner', []));
  await evmStep(book, 'owner-nominate-return', publicClient, () => call('alice', 'nominateOwner', [accounts.owner.address]));
  await evmStep(book, 'owner-accept-return', publicClient, () => call('owner', 'acceptOwner', []));
  assert.equal(await publicClient.readContract({ address: registry, abi, functionName: 'owner' }), accounts.owner.address);
  assert.equal((await publicClient.readContract({ address: registry, abi,
    functionName: 'projectInfo', args: [project] }))[0], accounts.manager.address);
  if (input.assetType) {
    const token = getAddress(input.assetType);
    const tokenAbi = parseAbi([
      'function decimals() view returns (uint8)',
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address,uint256) returns (bool)',
      'function approve(address,uint256) returns (bool)',
    ]);
    const decimals = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'decimals' });
    const value = checkedAssetAmount(input.assetQuantity, decimals);
    const tokenBalance = (role) => publicClient.readContract({ address: token, abi: tokenAbi,
      functionName: 'balanceOf', args: [accounts[role].address] });
    if (!book.state.steps['asset-transfer'] && await tokenBalance('owner') < value) {
      throw new Error('Owner does not hold enough of the second token');
    }
    await evmStep(book, 'asset-enable', publicClient, () => call('manager', 'enableAsset', [project, token]));
    await evmStep(book, 'asset-transfer', publicClient, () => wallets.owner.writeContract({
      address: token, abi: tokenAbi, functionName: 'transfer', args: [accounts.manager.address, value],
    }));
    if (!book.state.steps['asset-donate'] && await tokenBalance('manager') < value) {
      throw new Error('Manager did not receive the full token amount');
    }
    await evmStep(book, 'asset-approve', publicClient, () => wallets.manager.writeContract({
      address: token, abi: tokenAbi, functionName: 'approve', args: [registry, value],
    }));
    await evmStep(book, 'asset-donate', publicClient, () => call('manager', 'donateToken', [project, token, value]));
    const assetEntitlement = (role) => publicClient.readContract({ address: registry, abi,
      functionName: 'entitlement', args: [project, token, accounts[role].address] });
    if (!book.state.steps['asset-claim-bob']) {
      assert.equal((await assetEntitlement('alice'))[0], 0n);
      assert.equal((await assetEntitlement('bob'))[0], value - value / 200n);
    }
    await evmStep(book, 'asset-claim-bob', publicClient, () => call('bob', 'claim', [project, token]));
    await evmStep(book, 'asset-collect-fees', publicClient, () => call('owner', 'collectFees', [project, token]));
    assert.equal((await assetEntitlement('bob'))[0], 0n);
  }
  return { registryAddress: registry, project: project.toString(),
    expectedClaims: { alice: half.toString(), bob: (half + input.donation - fee).toString() },
    expectedFees: (fee * 2n).toString() };
}

async function exerciseSui(input, book, accounts) {
  const client = new SuiGrpcClient({ network: 'testnet', baseUrl: input.rpc });
  const { chainIdentifier } = await client.getChainIdentifier();
  if (chainIdentifier !== suiTestnetChain) throw new Error('RPC is not the expected Sui Testnet');
  const owner = addressOf(accounts.owner);
  const { balance } = await client.getBalance({ owner });
  if (!book.state.steps['fund-manager'] && BigInt(balance.balance) <= input.funding * 3n) {
    throw new Error('Owner needs three wallet transfers plus publication gas');
  }
  console.log(`Owner ${owner}; balance ${balance.balance} MIST`);
  if (input.assetType) {
    const { coinMetadata } = await client.getCoinMetadata({ coinType: input.assetType });
    if (!coinMetadata) throw new Error('Second Sui coin has no readable metadata');
    const value = checkedAssetAmount(input.assetQuantity, coinMetadata.decimals);
    if (value > (1n << 64n) - 1n) throw new Error('Sui second-asset amount must fit in u64');
    const { balance: assetBalance } = await client.getBalance({ owner, coinType: input.assetType });
    if (!book.state.steps['asset-transfer'] && BigInt(assetBalance.balance) < value) {
      throw new Error('Owner does not hold enough of the second coin');
    }
  }

  const buildOutput = run('scripts/contracts.sh', ['sui', 'move', 'build', '--dump-bytecode-as-base64'],
    { stdio: ['inherit', 'pipe', 'inherit'] });
  const buildLine = buildOutput.split('\n').findLast((line) => line.startsWith('{"modules":'));
  if (!buildLine) throw new Error('Sui build did not output module and dependency JSON');
  const compiled = JSON.parse(buildLine);
  if (!Array.isArray(compiled.modules) || !compiled.modules.length || !Array.isArray(compiled.dependencies)) {
    throw new Error('Sui build output is incomplete');
  }
  const publishTx = new Transaction();
  const [cap] = publishTx.publish({ modules: compiled.modules, dependencies: compiled.dependencies });
  publishTx.moveCall({ target: '0x2::package::make_immutable', arguments: [cap] });
  const published = await suiStep(book, 'publish-immutable', client, accounts.owner, publishTx);
  const packageId = suiCreated(published, 'package');
  const registry = suiCreated(published, `${packageId}::registry::Registry`);
  const { object: registryObject } = await client.getObject({ objectId: registry, include: { json: true } });
  if (registryObject.type !== `${packageId}::registry::Registry` ||
    (!book.state.steps['owner-nominate-alice'] && registryObject.json?.owner !== owner)) {
    throw new Error('Published registry owner or type did not match the owner wallet');
  }

  for (const role of ['manager', 'alice', 'bob']) {
    const tx = new Transaction();
    tx.transferObjects([tx.coin({ balance: input.funding })], addressOf(accounts[role]));
    await suiStep(book, `fund-${role}`, client, accounts.owner, tx);
  }
  const registerTx = new Transaction();
  registerTx.moveCall({ target: `${packageId}::registry::create_project`, arguments: [registerTx.object(registry)] });
  const registered = await suiStep(book, 'register', client, accounts.manager, registerTx);
  const project = suiCreated(registered, `${packageId}::registry::Project`);
  const fee = input.donation / 200n;
  const half = (input.donation - fee) / 2n;
  for (const role of ['alice', 'bob']) {
    const tx = new Transaction();
    tx.moveCall({ target: `${packageId}::registry::mint`, arguments: [tx.object(registry),
      tx.object(project), tx.pure.address(addressOf(accounts[role])), tx.pure.u128(unit),
      tx.pure.string(`test ${role}`), tx.pure.string(`testnet:${book.state.source}:${role}`)] });
    await suiStep(book, `mint-${role}`, client, accounts.manager, tx);
  }
  const donationTx = () => {
    const tx = new Transaction();
    tx.moveCall({ target: `${packageId}::registry::donate`, typeArguments: [suiCoin],
      arguments: [tx.object(registry), tx.object(project), tx.coin({ balance: input.donation })] });
    return tx;
  };
  await suiStep(book, 'donate-1', client, accounts.manager, donationTx());
  const transfer = new Transaction();
  transfer.moveCall({ target: `${packageId}::registry::transfer_shares`, arguments: [
    transfer.object(registry), transfer.object(project), transfer.pure.address(addressOf(accounts.bob)),
    transfer.pure.u128(unit)] });
  await suiStep(book, 'transfer', client, accounts.alice, transfer);
  await suiStep(book, 'donate-2', client, accounts.manager, donationTx());
  const claims = {};
  for (const role of ['alice', 'bob']) {
    const claimTx = new Transaction();
    claimTx.moveCall({ target: `${packageId}::registry::claim`, typeArguments: [suiCoin],
      arguments: [claimTx.object(registry), claimTx.object(project)] });
    const result = await suiStep(book, `claim-${role}`, client, accounts[role], claimTx);
    claims[role] = suiEventAmount(result, 'Claimed');
  }
  assert.equal(claims.alice, half);
  assert.equal(claims.bob, half + input.donation - fee);
  const feesTx = new Transaction();
  feesTx.moveCall({ target: `${packageId}::registry::collect_fees`, typeArguments: [suiCoin],
    arguments: [feesTx.object(registry), feesTx.object(project)] });
  const collected = await suiStep(book, 'collect-fees', client, accounts.owner, feesTx);
  assert.equal(suiEventAmount(collected, 'FeesCollected'), fee * 2n);
  const { object: projectObject } = await client.getObject({ objectId: project, include: { json: true } });
  if (projectObject.type !== `${packageId}::registry::Project` ||
    BigInt(projectObject.json?.supply) !== 2n * unit) throw new Error('Sui project supply is incorrect');
  const governance = (functionName, objects, address, flags = []) => {
    const tx = new Transaction();
    tx.moveCall({ target: `${packageId}::registry::${functionName}`,
      arguments: [...objects.map((id) => tx.object(id)),
        ...(address ? [tx.pure.address(address)] : []), ...flags.map((flag) => tx.pure.bool(flag))] });
    return tx;
  };
  await suiStep(book, 'manager-pause-on', client, accounts.manager,
    governance('set_manager_pause', [project], null, [true]));
  await suiStep(book, 'manager-pause-off', client, accounts.manager,
    governance('set_manager_pause', [project], null, [false]));
  await suiStep(book, 'owner-pause-on', client, accounts.owner,
    governance('set_owner_pause', [registry, project], null, [true, true]));
  await suiStep(book, 'owner-pause-off', client, accounts.owner,
    governance('set_owner_pause', [registry, project], null, [false, false]));
  await suiStep(book, 'manager-nominate-bob', client, accounts.manager,
    governance('nominate_manager', [project], addressOf(accounts.bob)));
  await suiStep(book, 'manager-accept-bob', client, accounts.bob,
    governance('accept_manager', [project]));
  await suiStep(book, 'manager-nominate-return', client, accounts.bob,
    governance('nominate_manager', [project], addressOf(accounts.manager)));
  await suiStep(book, 'manager-accept-return', client, accounts.manager,
    governance('accept_manager', [project]));
  await suiStep(book, 'owner-nominate-alice', client, accounts.owner,
    governance('nominate_owner', [registry], addressOf(accounts.alice)));
  await suiStep(book, 'owner-accept-alice', client, accounts.alice,
    governance('accept_owner', [registry]));
  await suiStep(book, 'owner-nominate-return', client, accounts.alice,
    governance('nominate_owner', [registry], owner));
  await suiStep(book, 'owner-accept-return', client, accounts.owner,
    governance('accept_owner', [registry]));
  const { object: finalRegistry } = await client.getObject({ objectId: registry, include: { json: true } });
  const { object: finalProject } = await client.getObject({ objectId: project, include: { json: true } });
  if (finalRegistry.json?.owner !== owner || finalProject.json?.manager !== addressOf(accounts.manager)) {
    throw new Error('Sui governance handoff did not return to the original roles');
  }
  if (input.assetType) {
    const coinType = input.assetType;
    const { coinMetadata } = await client.getCoinMetadata({ coinType });
    if (!coinMetadata) throw new Error('Second Sui coin has no readable metadata');
    const value = checkedAssetAmount(input.assetQuantity, coinMetadata.decimals);
    const { balance: assetBalance } = await client.getBalance({ owner, coinType });
    if (!book.state.steps['asset-transfer'] && BigInt(assetBalance.balance) < value) {
      throw new Error('Owner does not hold enough of the second coin');
    }
    const enableTx = new Transaction();
    enableTx.moveCall({ target: `${packageId}::registry::enable_asset`, typeArguments: [coinType],
      arguments: [enableTx.object(registry), enableTx.object(project)] });
    await suiStep(book, 'asset-enable', client, accounts.manager, enableTx);
    const transferTx = new Transaction();
    transferTx.transferObjects([transferTx.coin({ balance: value, type: coinType })], addressOf(accounts.manager));
    await suiStep(book, 'asset-transfer', client, accounts.owner, transferTx);
    const donateTx = new Transaction();
    donateTx.moveCall({ target: `${packageId}::registry::donate`, typeArguments: [coinType],
      arguments: [donateTx.object(registry), donateTx.object(project),
        donateTx.coin({ balance: value, type: coinType })] });
    await suiStep(book, 'asset-donate', client, accounts.manager, donateTx);
    const aliceClaimTx = new Transaction();
    aliceClaimTx.moveCall({ target: `${packageId}::registry::claim`, typeArguments: [coinType],
      arguments: [aliceClaimTx.object(registry), aliceClaimTx.object(project)] });
    const aliceClaim = await suiStep(book, 'asset-claim-alice', client, accounts.alice, aliceClaimTx);
    assert.equal(aliceClaim.events.some((event) => event.eventType.endsWith('::registry::Claimed')), false);
    const bobClaimTx = new Transaction();
    bobClaimTx.moveCall({ target: `${packageId}::registry::claim`, typeArguments: [coinType],
      arguments: [bobClaimTx.object(registry), bobClaimTx.object(project)] });
    const bobClaim = await suiStep(book, 'asset-claim-bob', client, accounts.bob, bobClaimTx);
    assert.equal(suiEventAmount(bobClaim, 'Claimed'), value - value / 200n);
    const collectTx = new Transaction();
    collectTx.moveCall({ target: `${packageId}::registry::collect_fees`, typeArguments: [coinType],
      arguments: [collectTx.object(registry), collectTx.object(project)] });
    const collectedAsset = await suiStep(book, 'asset-collect-fees', client, accounts.owner, collectTx);
    assert.equal(suiEventAmount(collectedAsset, 'FeesCollected'), value / 200n);
  }
  return { packageId, registryObjectId: registry, project,
    expectedClaims: { alice: claims.alice.toString(), bob: claims.bob.toString() },
    expectedFees: (fee * 2n).toString(), immutabilityTransaction: published.transaction };
}

export async function main() {
  const input = await collectInput();
  const accounts = accountsFor(input.network, input.ownerSecret);
  const owner = addressOf(accounts.owner);
  console.log('Running the selected chain contract suite before spending testnet funds.');
  run('scripts/contracts.sh', input.network === 'sui-testnet'
    ? ['sui', 'move', 'test'] : ['evm', 'test'], { stdio: 'inherit' });
  const book = await checkpoint(input, owner);
  console.log(`Checkpoint: ${book.path}`);
  await assertNetworkSlot(book);
  const result = input.network === 'sui-testnet'
    ? await exerciseSui(input, book, accounts) : await exerciseEvm(input, book, accounts);
  book.state.result = result;
  await book.save();
  await updateNetwork(input.network, input.network === 'sui-testnet'
    ? { packageId: result.packageId, registryObjectId: result.registryObjectId }
    : { registryAddress: result.registryAddress });
  console.log(JSON.stringify({ network: input.network, owner, ...result }, null, 2));
  console.log('Deployment checks completed; explorer source verification and independent security review remain.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Testnet deployment stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
