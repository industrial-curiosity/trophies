import assert from 'node:assert/strict';
import test from 'node:test';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { accountsFor, amount } from '../scripts/testnet-deploy.mjs';

test('native amount parsing is exact and rejects ambiguous notation', () => {
  assert.equal(amount('0.001', 18), 1000000000000000n);
  assert.equal(amount('0.001', 9), 1000000n);
  assert.equal(amount('0.000000001', 9), 1n);
  for (const value of ['0', '-1', '1e3', '1,000', '0.0000000001']) {
    assert.throws(() => amount(value, 9));
  }
});

test('disposable test wallets are distinct and reproducible from the same owner key', () => {
  const evmKey = `0x${'1'.repeat(64)}`;
  const first = accountsFor('base-sepolia', evmKey);
  const repeated = accountsFor('base-sepolia', evmKey);
  const otherNetwork = accountsFor('opbnb-testnet', evmKey);
  assert.equal(new Set(Object.values(first).map((account) => account.address)).size, 4);
  assert.equal(first.manager.address, repeated.manager.address);
  assert.notEqual(first.manager.address, otherNetwork.manager.address);

  const suiKey = Ed25519Keypair.generate().getSecretKey();
  const sui = accountsFor('sui-testnet', suiKey);
  const repeatedSui = accountsFor('sui-testnet', suiKey);
  const address = (account) => account.getPublicKey().toSuiAddress();
  assert.equal(new Set(Object.values(sui).map(address)).size, 4);
  assert.equal(address(sui.manager), address(repeatedSui.manager));
});
