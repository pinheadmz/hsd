/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const FullNode = require('../lib/node/fullnode');
const WalletNode = require('../lib/wallet/node');
const SPVNode = require('../lib/node/spvnode');
const {forValue} = require('./util/common');

describe('Node Sync', function() {
  this.timeout(60000);

  let wdbPlugin, wdbNode, wdbSPV;
  let walletPlugin, walletWalletNode, walletSPV;

  // Will be pulled from wallet account default setting
  let lookahead;
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

  const ports = {
    p2p: 47000,
    node: 48000,
    wallet: 49000
  };

  // Miner
  const nodeWithPlugin = new FullNode({
    memory: true,
    network: 'regtest',
    bip37: true,
    plugins: [require('../lib/wallet/plugin')],
    listen: true,
    port: ports.p2p,
    httpPort: ports.node,
    env: {
      'HSD_WALLET_HTTP_PORT': ports.wallet.toString()
    }
  });

  // Connects to miner
  const nodeWithoutWallet = new FullNode({
    memory: true,
    network: 'regtest',
    port: ports.p2p + 1,
    httpPort: ports.node + 1,
    only: [`127.0.0.1:${ports.p2p}`]
  });

  // Connects to nodeWithoutWallet (via HTTP)
  const walletNode = new WalletNode({
    memory: true,
    network: 'regtest',
    httpPort: ports.wallet + 1,
    nodePort: ports.node + 1
  });

  // Connects to miner
  const spvNode = new SPVNode({
    memory: true,
    network: 'regtest',
    plugins: [require('../lib/wallet/plugin')],
    port: ports.p2p + 2,
    httpPort: ports.node + 2,
    only: [`127.0.0.1:${ports.p2p}`],
    env: {
      'HSD_WALLET_HTTP_PORT': (ports.wallet + 2).toString()
    }
  });

  // Disable DNS servers in all nodes to avoid port collisions
  // TODO: See https://github.com/handshake-org/hsd/issues/528
  const noop = () => {};
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
    await nodeWithPlugin.open();
    await nodeWithPlugin.connect();
    await nodeWithoutWallet.open();
    await walletNode.open();
    await spvNode.open();

    // Fund miner
    for (let i = 0; i < 200; i++) {
      const block = await nodeWithPlugin.miner.mineBlock();
      assert(await nodeWithPlugin.chain.add(block));
    }

    // Create the same wallet in all three nodes
    const mnemonic =
      'abandon abandon abandon abandon ' +
      'abandon abandon abandon abandon ' +
      'abandon abandon abandon about';

    wdbPlugin = nodeWithPlugin.require('walletdb').wdb;
    wdbNode = walletNode.wdb;
    wdbSPV = spvNode.require('walletdb').wdb;

    walletPlugin = await wdbPlugin.create({mnemonic});
    walletWalletNode = await wdbNode.create({mnemonic});
    walletSPV = await wdbSPV.create({mnemonic});

    // Everyone has the same account, lookahead, and address chain
    const account = await walletPlugin.getAccount(0);
    lookahead = account.lookahead;
    // How many transactions we will generate per block
    txs = lookahead + extra;
    // This will be the final balance of the synced wallet
    // after generating blocks full of transactions minus fees.
    expected = blocks * txs * (value - hardFee);

    // Send transactions to the shared wallet account addresses.
    // We derive more addresses than the lookahead to test
    // that during an initial chain scan (like importing from a seed phrase)
    // blocks with too many transactions will be re-scanned
    // after adding additional keys to the bloom filter.
    let index = 0;
    const walletMiner = await wdbPlugin.get('primary');
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
      const block = await nodeWithPlugin.miner.mineBlock();
      assert(await nodeWithPlugin.chain.add(block));
    }
  });

  after(async () => {
    await spvNode.close();
    await walletNode.close();
    await nodeWithoutWallet.close();
    await nodeWithPlugin.close();
  });

  it('should sync wallet as plugin in full node', async () => {
    // Because this wallet is running as a plugin, it gets all blocks
    // unfiltered as they are added to the chain. It should be synced.
    await forValue(wdbPlugin, 'height', nodeWithPlugin.chain.height);
    const balance = await walletPlugin.getBalance();
    assert.strictEqual(balance.tx, blocks * txs);
    assert.strictEqual(expected, balance.confirmed);
  });

  it('should sync wallet as remote node', async () => {
    // Connect the full node with its remote wallet node to the miner node.
    await nodeWithoutWallet.connect();
    await nodeWithoutWallet.startSync();
    await forValue(wdbNode, 'height', nodeWithPlugin.chain.height);

    const balance = await walletWalletNode.getBalance();
    assert.strictEqual(balance.tx, blocks * txs);
    assert.strictEqual(expected, balance.confirmed);
  });

  it('should sync wallet as plugin in SPV node', async () => {
    // Connect the SPV node with its wallet plugin to the miner node.
    await spvNode.connect();
    await spvNode.startSync();
    await forValue(wdbSPV, 'height', nodeWithPlugin.chain.height);

    const balance = await walletSPV.getBalance();
    assert.strictEqual(balance.tx, blocks * txs);
    assert.strictEqual(expected, balance.confirmed);
  });
});
