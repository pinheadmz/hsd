## :warning: IMPORTANT:
## This branch of `hsd` is for ADVANCED TESTING PURPOSES ONLY.

This branch is modified so users can test their faucet wallets on testnet.
It accompanies the guide at:

https://gist.github.com/pinheadmz/a07d7e64c37414e0b1ba8c360d01c963

The code has been modified in the following way:

- The BIP44 `cointype` for testnet has been modified to match mainnet.

- The wallet node default network has been set to testnet.

 - The `pkg` has been renamed to `hsd-faucet-test`, so the default location
 for the data directory, both node and wallet, will be `~/.hsd-faucet-test/testnet`.


