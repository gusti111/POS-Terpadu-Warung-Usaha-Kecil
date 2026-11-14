import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, verifyPin, resetWorkspace } from '../src/store.js';

function installStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  globalThis.sessionStorage = {
    getItem: (key) => values.has(`session:${key}`) ? values.get(`session:${key}`) : null,
    setItem: (key, value) => values.set(`session:${key}`, String(value)),
    removeItem: (key) => values.delete(`session:${key}`),
  };
}

test('workspace setup creates salted Owner credentials and coherent sample records', async () => {
  installStorage();
  resetWorkspace();
  const state = await createWorkspace({
    storeName: 'Warung Contoh', ownerName: 'Owner Demo', ownerUsername: 'owner', ownerPin: '4826', sampleData: true,
  });
  const owner = state.users[0];
  assert.equal(state.store.name, 'Warung Contoh');
  assert.equal(owner.role, 'owner');
  assert.notEqual(owner.pin_hash, '4826');
  assert.ok(owner.pin_salt);
  assert.equal(await verifyPin('4826', owner), true);
  assert.equal(await verifyPin('1111', owner), false);
  assert.ok(state.sales.every((sale) => sale.store_id === state.store.id));
  assert.equal(state.products.length, 9);
  assert.equal(state.sales.length, 4);
  assert.ok(state.sales.some((sale) => sale.status === 'pending_payment'));
  resetWorkspace();
});

test('workspace setup validates the Owner account and supports a clean no-sample start', async () => {
  installStorage();
  resetWorkspace();
  await assert.rejects(createWorkspace({ storeName: 'Toko', ownerName: 'Owner', ownerUsername: 'a', ownerPin: '12' }), /Username Owner/);
  const state = await createWorkspace({ storeName: 'Toko Bersih', ownerName: 'Owner Bersih', ownerUsername: 'owner.bersih', ownerPin: '6732', sampleData: false });
  assert.equal(state.products.length, 0);
  assert.equal(state.sales.length, 0);
  assert.equal(state.categories.length, 0);
  assert.equal(state.expense_categories.length, 4);
  resetWorkspace();
});
