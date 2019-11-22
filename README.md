## :warning: IMPORTANT:
## This branch of `hsd` is for ADVANCED TESTING PURPOSES ONLY.

This branch is modified so users can test their mainnet faucet wallets on a 
local regtest network.

If your faucet address is a multisig, follow the guide here:

https://gist.github.com/pinheadmz/a07d7e64c37414e0b1ba8c360d01c963

The code has been modified in the following ways:

- The BIP44 `cointype` for regtest has been modified to match mainnet.

- The default network for FullNode, SPVNode and Wallet Node is `regtest`.

- The `pkg` has been renamed to `hsd-faucet-test`, so the default location
 for the data directory, both node and wallet, will be `~/.hsd-faucet-test/regtest`.

To test your faucet address using this branch:

Install:

```
$ git clone --branch faucet-test https://github.com/pinheadmz/hsd
$ cd hsd
$ npm install
```

Run dameon in regtest mode:

```
$ hsd --daemon
```

Check that your faucet address exists in the tree:

https://github.com/handshake-org/hs-tree-data/blob/master/proof.json

Use [hs-airdrop](https://github.com/handshake-org/hs-airdrop) to generate claim
for your faucet address:

```
$ cd <path/to/hs-airdrop/repo>
$ npm install
$ bin/hs-airdrop <your faucet address>
```

You'll get a lot of output but all you need is the last chunk of Base64:

```
...

Base64 (pass this to $ hsd-rpc sendrawairdrop):
FgEAAAt+/BLRn5+AlGc/nyvWbLVSV/YjCyTP9Rzpfhb7p85lY4ydsACITMSDY7Ch/u9gWk5luKJIgjCG
uovd5feXid6X8PDLlODO6Wwk3f+NJaZpkIMJtmOv6HG87Qmf3WT2PFRVZS2mmFkHE6jSJjkXj6oV4GK+
OTycJQlqhd5kUIvafIEA0ZanpLc3MIZpDjHEFI4ho5LJluNW3wV+emJOkEkranmbZFmPmHuBgrdguouW
cOwto6lyrv8c8tJCuolsDCLxmOyfY//RN69rPhv5axWnmTsyY99Ggiop+h0Ix119mhnsDLrCecAdEeiP
zh3YUh+kngHcwr/uzHH93l6EuQQKrlOc/LqHRieWtu8BXvOG8t2JMLBpb4Q3X4E7K801M46DQM6nsKTS
rOWR/8Ge20qBOmRmmhoZSLyfqb+GBbtQAX7/hEoaAmI63r34P7LHuCqjbJeXlfCuPouUjAc23cq4AAAg
BAAUPoBYW7WStRDHG0EwBIzInK42QUoAVXmTpA0AAAEAFD6AWFu1krUQxxtBMASMyJyuNkFK/gBlzR0A
```

Send the blob to the network:

```
$ hsd-rpc --network=regtest  sendrawairdrop FgEAAAt+/BLRn5+AlGc/nyvWbLVSV/YjCyT\
P9Rzpfhb7p85lY4ydsACITMSDY7Ch/u9gWk5luKJIgjCGuovd5feXid6X8PDLlODO6Wwk3f+NJaZpkI\
MJtmOv6HG87Qmf3WT2PFRVZS2mmFkHE6jSJjkXj6oV4GK+OTycJQlqhd5kUIvafIEA0ZanpLc3MIZpD\
jHEFI4ho5LJluNW3wV+emJOkEkranmbZFmPmHuBgrdguouWcOwto6lyrv8c8tJCuolsDCLxmOyfY//R\
N69rPhv5axWnmTsyY99Ggiop+h0Ix119mhnsDLrCecAdEeiPzh3YUh+kngHcwr/uzHH93l6EuQQKrlO\
c/LqHRieWtu8BXvOG8t2JMLBpb4Q3X4E7K801M46DQM6nsKTSrOWR/8Ge20qBOmRmmhoZSLyfqb+GBb\
tQAX7/hEoaAmI63r34P7LHuCqjbJeXlfCuPouUjAc23cq4AAAgBAAUPoBYW7WStRDHG0EwBIzInK42Q\
UoAVXmTpA0AAAEAFD6AWFu1krUQxxtBMASMyJyuNkFK/gBlzR0A
```

Confirm the airdrop in a block by mining a few regtest blocks:

```
$ hsd-rpc --network=regtest setgenerate true;  hsd-rpc --network=regtest setgenerate false
```

Now import your mnemonic phrase into a new wallet, rescan the chain, and check your
balance:

```
$ hsw-cli --network=regtest mkwallet --id=faucet --mnemonic='abandon abandon abandon ...'
$ hsw-cli --network=regtest rescan
$ hsw-cli --network=regtest --id=faucet balance
{
  "account": -1,
  "tx": 1,
  "coin": 1,
  "unconfirmed": 99900000000,
  "confirmed": 99900000000,
  "lockedUnconfirmed": 0,
  "lockedConfirmed": 0
}
```

This wallet is now loaded up and ready to send `hns`!
