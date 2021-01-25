/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const FullNode = require('../lib/node/fullnode');
const WalletNode = require('../lib/wallet/node');
const SPVNode = require('../lib/node/spvnode');
const Account = require('../lib/wallet/account');
const {forValue} = require('./util/common');

describe('Wallet Sync', function() {
  this.timeout(60000);

  const currentLookahead = Account.MAX_LOOKAHEAD;

  let wdbPlugin, wdbNode, wdbSPV;
  let walletPlugin, walletWalletNode, walletSPV;

  // How many more txs per block we will generate beyond the lookahead value
  const extra = 10;
  // Total number of txs per block (based on lookahead)
  let txs;
  // Number of blocks to fill with transactions
  const blocks = 4;
  // Value and fee used in each transaction (simplify accounting)
  const hardFee = 10000;
  const value = 100000;
  // Will be the balance of a synced wallet after generating transactions
  let expected;
  // Create the same wallet in all test nodes
  const mnemonic =
    'abandon abandon abandon abandon ' +
    'abandon abandon abandon abandon ' +
    'abandon abandon abandon about';

  const ports = {
    brontide: 46000,
    p2p: 47000,
    node: 48000,
    wallet: 49000
  };

  // Miner
  const miner = new FullNode({
    memory: true,
    network: 'regtest',
    bip37: true,
    plugins: [require('../lib/wallet/plugin')],
    listen: true,
    port: ports.p2p,
    brontidePort: ports.brontide,
    httpPort: ports.node,
    env: {
      'HSD_WALLET_HTTP_PORT': ports.wallet.toString()
    }
  });

  // Connects to miner
  const nodeWithPlugin = new FullNode({
    memory: true,
    network: 'regtest',
    plugins: [require('../lib/wallet/plugin')],
    port: ports.p2p + 1,
    brontidePort: ports.brontide + 1,
    httpPort: ports.node + 1,
    only: [`127.0.0.1:${ports.p2p}`],
    env: {
      'HSD_WALLET_HTTP_PORT': (ports.wallet + 1).toString()
    },
    logLevel: 'spam',
    logConsole: true
  });

  // Connects to miner
  const nodeWithoutWallet = new FullNode({
    memory: true,
    network: 'regtest',
    port: ports.p2p + 2,
    brontidePort: ports.brontide + 2,
    httpPort: ports.node + 2,
    only: [`127.0.0.1:${ports.p2p}`]
  });

  // Connects to nodeWithoutWallet (via HTTP)
  const walletNode = new WalletNode({
    memory: true,
    network: 'regtest',
    httpPort: ports.wallet + 2,
    nodePort: ports.node + 2
  });

  // Connects to miner
  const spvNode = new SPVNode({
    memory: true,
    network: 'regtest',
    plugins: [require('../lib/wallet/plugin')],
    port: ports.p2p + 3,
    brontidePort: ports.brontide + 3,
    httpPort: ports.node + 3,
    only: [`127.0.0.1:${ports.p2p}`],
    env: {
      'HSD_WALLET_HTTP_PORT': (ports.wallet + 3).toString()
    }
  });

  // Disable DNS servers in all nodes to avoid port collisions
  // TODO: See https://github.com/handshake-org/hsd/issues/528
  const noop = () => {};
  miner.ns.open = noop;
  miner.ns.close = noop;
  miner.rs.open = noop;
  miner.rs.close = noop;
  nodeWithPlugin.ns.open = noop;
  nodeWithPlugin.ns.close = noop;
  nodeWithPlugin.rs.open = noop;
  nodeWithPlugin.rs.close = noop;
  nodeWithoutWallet.ns.open = noop;
  nodeWithoutWallet.ns.close = noop;
  nodeWithoutWallet.rs.open = noop;
  nodeWithoutWallet.rs.close = noop;
  spvNode.ns.open = noop;
  spvNode.ns.close = noop;
  spvNode.rs.open = noop;
  spvNode.rs.close = noop;

  before(async () => {
    // Amazing hack to replace whatever lookahead value is
    // actually being used in practice. This is set low to keep
    // the test runtime shorter and make sync failures more probable
    // until the bug is fixed and the test passes.
    Account.MAX_LOOKAHEAD = 10;

    await miner.open();
    await miner.connect();
    await nodeWithPlugin.open();
    await nodeWithoutWallet.open();
    await walletNode.open();
    await spvNode.open();

    // Fund miner
    for (let i = 0; i < 200; i++) {
      const block = await miner.miner.mineBlock();
      assert(await miner.chain.add(block));
    }

    wdbPlugin = nodeWithPlugin.require('walletdb').wdb;
    wdbNode = walletNode.wdb;
    wdbSPV = spvNode.require('walletdb').wdb;

    walletPlugin = await wdbPlugin.create({id: 'test', mnemonic});
    walletWalletNode = await wdbNode.create({id: 'test', mnemonic});
    walletSPV = await wdbSPV.create({id: 'test', mnemonic});

    // Everyone has the same account, lookahead, and address chain
    const account = await walletPlugin.getAccount(0);
    // How many transactions we will generate per block
    txs = account.lookahead + extra;
    // This will be the final balance of the synced wallet
    // after generating blocks full of transactions minus fees.
    expected = blocks * txs * (value - hardFee);

    // Send transactions to the shared wallet account addresses.
    // We derive more addresses than the lookahead to test
    // that during an initial chain scan (like importing from a seed phrase)
    // blocks with too many transactions will be re-scanned
    // after adding additional keys to the database and client bloom filter.
    let index = 0;
    const wdbMiner = miner.require('walletdb').wdb;
    const walletMiner = await wdbMiner.get('primary');
    for (let b = 0; b < blocks; b++) {
      for (let t = 0; t < txs; t++) {
        const key = account.deriveReceive(index++);
        const address = key.getAddress();

        await walletMiner.send({
          subtractFee: true,
          hardFee,
          outputs: [{
            address,
            value
          }]
        });
      }
      const block = await miner.miner.mineBlock();
      assert(await miner.chain.add(block));
    }
  });

  after(async () => {
    await spvNode.close();
    await walletNode.close();
    await nodeWithoutWallet.close();
    await nodeWithPlugin.close();
    await miner.close();

    // Restore
    Account.MAX_LOOKAHEAD = currentLookahead;
  });

  it('should sync wallet as plugin in full node', async () => {
    // Connect the full node with its wallet plugin to the miner node.
    await nodeWithPlugin.connect();
    await nodeWithPlugin.startSync();

    await forValue(wdbPlugin, 'height', miner.chain.height);
    const balance = await walletPlugin.getBalance();
    assert.strictEqual(balance.tx, blocks * txs);
    assert.strictEqual(expected, balance.confirmed);
  });

  it('should rescan wallet as plugin in full node', async () => {
    // Because we've already scanned this wallet once, we need
    // to remove that wallet and clear the walletDB bloom filter,
    // otherwise it will "already know" all the keys in advance.
    await wdbPlugin.remove('test');
    wdbPlugin.resetFilter();

    const rescanPlugin = await wdbPlugin.create({
      id: 'rescanPlugin',
      mnemonic
    });

    let balance = await rescanPlugin.getBalance();
    assert.strictEqual(balance.tx, 0);
    assert.strictEqual(balance.confirmed, 0);
    await wdbPlugin.rescan(0);
    await forValue(wdbPlugin, 'height', miner.chain.height);

    balance = await rescanPlugin.getBalance();
    assert.strictEqual(balance.tx, blocks * txs);
    assert.strictEqual(balance.confirmed, expected);
  });

  it('should sync wallet as remote node', async () => {
    // Connect the full node with its remote wallet node to the miner node.
    await nodeWithoutWallet.connect();
    await nodeWithoutWallet.startSync();
    await forValue(wdbNode, 'height', miner.chain.height);

    const balance = await walletWalletNode.getBalance();
    assert.strictEqual(balance.tx, blocks * txs);
    assert.strictEqual(balance.confirmed, expected);
  });

  it('should sync wallet as plugin in SPV node', async () => {
    // Connect the SPV node with its wallet plugin to the miner node.
    await spvNode.connect();
    await spvNode.startSync();
    await forValue(wdbSPV, 'height', miner.chain.height);

    const balance = await walletSPV.getBalance();
    assert.strictEqual(balance.tx, blocks * txs);
    assert.strictEqual(balance.confirmed, expected);
  });
});
