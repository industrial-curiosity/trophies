import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { ObjectError } from '@mysten/sui/client';
import { mintEvm, mintSui, validateRequest } from '../scripts/mint-contribution.mjs';
import { findMergedContributions } from '../scripts/find-merged-contributions.mjs';

const evmManager = '0x1111111111111111111111111111111111111111';
const evmContributor = '0x2222222222222222222222222222222222222222';
const suiManager = `0x${'1'.padStart(64, '0')}`;
const suiContributor = `0x${'2'.padStart(64, '0')}`;
const suiRegistry = `0x${'3'.padStart(64, '0')}`;
const suiProject = `0x${'4'.padStart(64, '0')}`;
const suiPackage = `0x${'5'.padStart(64, '0')}`;
const suiReferences = `0x${'6'.padStart(64, '0')}`;

test('detects and validates every changed contribution in a merged push', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trophies-merged-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  const record = (network, project, reference) => ({ network, project,
    reference, quantity: '1', description: 'Merged work' });
  try {
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    await writeFile(join(directory, 'README.md'), 'before\n');
    git('add', '.');
    git('commit', '-qm', 'before');
    const before = git('rev-parse', 'HEAD');
    await mkdir(join(directory, 'trophies'));
    await writeFile(join(directory, 'trophies', '20261012120000-feature-base.json'), JSON.stringify(record('base-sepolia', '1', 'github:42')));
    await writeFile(join(directory, 'trophies', '20261012120100-feature-sui.json'), JSON.stringify(record('sui-testnet', suiProject, 'github:43')));
    git('add', '.');
    git('commit', '-qm', 'merge trophies');
    const after = git('rev-parse', 'HEAD');
    assert.deepEqual(await findMergedContributions(before, after, directory), [
      { id: '20261012120000-feature-base', file: 'trophies/20261012120000-feature-base.json', network: 'base-sepolia', project: '1' },
      { id: '20261012120100-feature-sui', file: 'trophies/20261012120100-feature-sui.json', network: 'sui-testnet', project: suiProject },
    ]);
    await writeFile(join(directory, 'trophies', '20261012120000-feature-base.json'), JSON.stringify(record('base-sepolia', '1', 'github:42-edited')));
    git('add', '.');
    git('commit', '-qm', 'edit contribution');
    const edited = git('rev-parse', 'HEAD');
    assert.deepEqual(await findMergedContributions(after, edited, directory), [
      { id: '20261012120000-feature-base', file: 'trophies/20261012120000-feature-base.json', network: 'base-sepolia', project: '1' },
    ]);
    await writeFile(join(directory, 'trophies', '20261012120000-feature-base.json'), '{bad json');
    await assert.rejects(findMergedContributions(before, after, directory), /Invalid JSON/);
    await writeFile(join(directory, 'trophies', '20261012120000-feature-base.json'), JSON.stringify(record('base-sepolia', '1', 'github:42')));
    await writeFile(join(directory, 'trophies', '20261012120100-feature-sui.json'), JSON.stringify({ ...record('sui-testnet', suiProject, 'github:43'), quantity: '0' }));
    await assert.rejects(findMergedContributions(before, after, directory), /Invalid contribution.*quantity/);
    await writeFile(join(directory, 'trophies', '20260230090000-feature-invalid.json'), JSON.stringify(record('base-sepolia', '1', 'github:44')));
    git('add', '.');
    git('commit', '-qm', 'invalid trophy name');
    await assert.rejects(findMergedContributions(edited, git('rev-parse', 'HEAD'), directory), /Expected trophies/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function resultFile(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'trophies-mint-'));
  const oldPath = process.env.MINT_RESULT_PATH;
  process.env.MINT_RESULT_PATH = join(directory, 'result.json');
  try {
    await fn(process.env.MINT_RESULT_PATH);
  } finally {
    if (oldPath === undefined) delete process.env.MINT_RESULT_PATH;
    else process.env.MINT_RESULT_PATH = oldPath;
    await rm(directory, { recursive: true, force: true });
  }
}

test('validates chain, project, amount and address before signing', () => {
  const base = { network: 'base-sepolia', project: '1', quantity: '1',
    description: 'merged contribution', reference: 'github:owner/repo:42' };
  assert.equal(validateRequest(base).recipient, null);
  assert.equal(validateRequest(base).quantity, 1000000000000000000n);
  assert.equal(validateRequest({ ...base, quantity: '1.5' }).quantity, 1500000000000000000n);
  assert.equal(validateRequest({ ...base, quantity: '0.5' }).quantity, 500000000000000000n);
  assert.equal(validateRequest({ ...base, quantity: '0.000000000000000001' }).quantity, 1n);
  assert.throws(() => validateRequest({ ...base, quantity: '0' }), /quantity/);
  assert.throws(() => validateRequest({ ...base, quantity: '0.0000000000000000001' }), /quantity/);
  assert.throws(() => validateRequest({ ...base, quantity: 1 }), /quantity/);
  assert.throws(() => validateRequest({ ...base, quantity: '1e3' }), /quantity/);
  assert.throws(() => validateRequest({ ...base, network: 'base' }), /Unsupported/);
  assert.throws(() => validateRequest({ ...base, recipient: '0x0' }), /recipient/);
  assert.throws(() => validateRequest({ ...base, reference: '' }), /reference/);
  assert.equal(validateRequest({ ...base, network: 'sui-testnet', project: suiProject,
    recipient: suiContributor }).recipient, suiContributor);
});

test('EVM mints to manager when contributor has no wallet and records confirmation', async () => {
  await resultFile(async (path) => {
    const request = validateRequest({ network: 'base-sepolia', project: '1', quantity: '1',
      description: 'work', reference: 'github:42' });
    const deployment = { chain: { id: 84532 }, registryAddress: evmContributor };
    const account = { address: evmManager };
    let writes = 0;
    const publicClient = {
      getChainId: async () => 84532,
      readContract: async ({ functionName }) => functionName === 'projectInfo' ? [evmManager] : false,
      waitForTransactionReceipt: async () => ({ status: 'success' }),
    };
    const walletClient = { writeContract: async ({ args }) => {
      writes += 1;
      assert.equal(args[1], evmManager);
      assert.equal(args[4], 'github:42');
      return '0x1234';
    } };
    const result = await mintEvm(request, deployment, account, publicClient, walletClient);
    assert.equal(writes, 1);
    assert.equal(result.managerHeld, true);
    assert.equal(result.status, 'confirmed');
    assert.equal(result.quantity, '1');
    assert.equal(result.quantityBaseUnits, '1000000000000000000');
    assert.equal(JSON.parse(await readFile(path, 'utf8')).transaction, '0x1234');
  });
});

test('EVM rejects reused reference and stale manager without submitting', async () => {
  const request = validateRequest({ network: 'opbnb-testnet', project: '2', quantity: '1',
    description: 'work', reference: 'github:43', recipient: evmContributor });
  const deployment = { chain: { id: 5611 }, registryAddress: evmManager };
  const account = { address: evmManager };
  let writes = 0;
  const walletClient = { writeContract: async () => { writes += 1; } };
  const publicClient = { getChainId: async () => 5611,
    readContract: async ({ functionName }) => functionName === 'projectInfo' ? [evmManager] : true };
  await assert.rejects(mintEvm(request, deployment, account, publicClient, walletClient), /already minted/);
  publicClient.readContract = async () => [evmContributor];
  await assert.rejects(mintEvm(request, deployment, account, publicClient, walletClient), /not the current/);
  assert.equal(writes, 0);
});

test('EVM direct mint retains its submitted hash if receipt lookup fails', async () => {
  await resultFile(async (path) => {
    const request = validateRequest({ network: 'base-sepolia', project: '1', quantity: '10',
      description: 'work', reference: 'github:45', recipient: evmContributor });
    const deployment = { chain: { id: 84532 }, registryAddress: evmManager };
    const account = { address: evmManager };
    const publicClient = { getChainId: async () => 84532,
      readContract: async ({ functionName }) => functionName === 'projectInfo' ? [evmManager] : false,
      waitForTransactionReceipt: async () => { throw new Error('RPC timeout'); } };
    const walletClient = { writeContract: async ({ args }) => {
      assert.equal(args[1], evmContributor);
      return '0x123456';
    } };
    await assert.rejects(mintEvm(request, deployment, account, publicClient, walletClient), /RPC timeout/);
    const pending = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(pending.transaction, '0x123456');
    assert.equal(pending.status, 'submitted');
    assert.equal(pending.managerHeld, false);
  });
});

test('Sui checks project association and reference before signing', async () => {
  await resultFile(async (path) => {
    const request = validateRequest({ network: 'sui-testnet', project: suiProject, quantity: '1',
      description: 'work', reference: 'github:44' });
    const deployment = { packageId: suiPackage, registryObjectId: suiRegistry };
    let signs = 0;
    const keypair = { getPublicKey: () => ({ toSuiAddress: () => suiManager }),
      signAndExecuteTransaction: async () => { signs += 1; return { $kind: 'Transaction',
        Transaction: { digest: 'digest-44' } }; } };
    const client = {
      getObject: async ({ objectId }) => objectId === suiRegistry
        ? { object: { type: `${suiPackage}::registry::Registry`, json: {} } }
        : { object: { type: `${suiPackage}::registry::Project`, json: {
          manager: suiManager, registry_id: { id: suiRegistry }, references: { id: suiReferences },
        } } },
      getDynamicField: async () => { throw new ObjectError('NOT_FOUND', 'missing', { reason: 'notFound' }); },
    };
    const result = await mintSui(request, deployment, keypair, client);
    assert.equal(signs, 1);
    assert.equal(result.recipient, suiManager);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).status, 'confirmed');
    const direct = validateRequest({ network: 'sui-testnet', project: suiProject, quantity: '1',
      description: 'work', reference: 'github:44-direct', recipient: suiContributor });
    const directResult = await mintSui(direct, deployment, keypair, client);
    assert.equal(directResult.recipient, suiContributor);
    assert.equal(directResult.managerHeld, false);
    client.getDynamicField = async () => ({ dynamicField: {} });
    await assert.rejects(mintSui(request, deployment, keypair, client), /already minted/);
    assert.equal(signs, 2);
    client.getDynamicField = async () => { throw new ObjectError('NOT_FOUND', 'missing', { reason: 'notFound' }); };
    client.getObject = async ({ objectId }) => objectId === suiRegistry
      ? { object: { type: `${suiPackage}::registry::Registry`, json: {} } }
      : { object: { type: `${suiPackage}::registry::Project`, json: {
        manager: suiContributor, registry_id: { id: suiRegistry }, references: { id: suiReferences },
      } } };
    await assert.rejects(mintSui(request, deployment, keypair, client), /not the current/);
    assert.equal(signs, 2);
  });
});
