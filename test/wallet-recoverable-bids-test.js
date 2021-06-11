/* eslint-env mocha */

'use strict';

const assert = require('bsert');
const {BufferWriter} = require('bufio');
const blake2b = require('bcrypto/lib/blake2b');
const Network = require('../lib/protocol/network');
const Address = require('../lib/primitives/address');
const WalletDB = require('../lib/wallet/walletdb');
const rules = require('../lib/covenants/rules');

const network = Network.get('regtest');

describe('Recoverable bids', function() {
  const wdb = new WalletDB({network});
  let wallet;

  before(async () => {
    await wdb.open();
    wallet = await wdb.create();
  });

  after(async () => {
    await wdb.close();
  });

  async function getRecoverableBidKey(nameHash, height, address) {
    const path = await wallet.getPath(address.hash);

    if (!path)
      throw new Error('Account not found.');

    const account = await wallet.getAccount(path.account);

    if (!account)
      throw new Error('Account not found.');

    let publicKey = account.accountKey;
    for (let offset = 0; offset < nameHash.length; offset += 4) {
      let index = nameHash.slice(offset, offset + 4);
      index = index.readUInt32BE();

      // Must use non-hardened derivation because we only access public key
      index &= 0x7fffffff;

      publicKey = publicKey.derive(index);
    }

    publicKey.derive(height & 0x7fffffff);

    const hash = blake2b.multi(address.hash, publicKey.publicKey);
    return hash.slice(0, 8);
  }

  function xorBuffers(a, b) {
    assert.strictEqual(a.length, b.length);
    const array = [];
    for (let offset = 0; offset < a.length; offset++) {
      array.push(a[offset] ^ b[offset]);
    }

    return Buffer.from(array);
  }

  function valueToBuffer(value) {
    const bw = new BufferWriter();
    bw.writeU64BE(value);
    return bw.render();
  }

  function valueFromBuffer(buf) {
    // This is clean because all HNS values are less than 51 bits.
    return parseInt(buf.readBigUInt64BE());
  }

  function encodeRecoverableBidAddress(value, key) {
    const valBuf = valueToBuffer(value);
    const hash = xorBuffers(valBuf, key);
    const version = 31;
    return new Address({version, hash});
  }

  function decodeRecoverableBidAddress(address, key) {
    const {version, hash} = address;
    assert(version === 31);
    assert(hash.length === 8);
    const valBuf = xorBuffers(hash, key);
    return valueFromBuffer(valBuf);
  }

  it('should encrypt & decrpyt value', async () => {
    const name = 'handsome';
    const height = 10000;
    const nameHash = rules.hashName(name);
    const bidAddress = await wallet.receiveAddress();
    const bidValue = 10123456; // 10.123456 HNS

    const key = await getRecoverableBidKey(nameHash, height, bidAddress);
    const recoveryAddress = encodeRecoverableBidAddress(bidValue, key);
    const recoveredValue = decodeRecoverableBidAddress(recoveryAddress, key);

    assert.strictEqual(bidValue, recoveredValue);

    console.log({
      name,
      height,
      nameHash,
      bidAddress: bidAddress.toString(network),
      bidValue,
      key,
      recoveryAddress,
      recoveryAddressHash: recoveryAddress.hash,
      recoveredValue
    });
  });
});
