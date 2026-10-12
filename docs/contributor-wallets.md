# Contributor wallet setup

If you already have a wallet, give the project manager its public address on the
chain where the project will mint: Base, opBNB, or Sui. Tell the manager which
chain and network (testnet or mainnet) the address is for. The manager can then
mint directly to you. If you have no wallet yet, the manager mints the shares to
their own wallet and the project records what it owes you. Once you provide an
address, the wallet holding the shares transfers them to you. No second mint is
needed. Ask the project for the quantity and chain recorded for your contribution.

While the manager holds those shares, that wallet earns any donations allocated
to them. Transferring the shares later does not transfer those past earnings to
you; you earn from donations made after you receive the shares. The contract
does not set aside particular fungible units for you or enforce the project's
delivery promise.

Creating a wallet is free. Receiving shares requires no transaction from you.
The manager pays to mint. You pay the network fee when you later transfer shares
or claim donation earnings. If the manager holds your shares before delivery,
their wallet pays for the transfer to you. Keep native gas currency on the
network where you plan to transact.

Share only your **public address**. Never send the manager your recovery phrase,
private key, password, or login code. Check the full copied address after pasting
it; transactions to the wrong address cannot be corrected by the registry.

## Base

1. [Install MetaMask](https://support.metamask.io/hc/en-us/articles/360015489531)
   from its official site or app store. Select **Create a new wallet** and follow
   [MetaMask's setup steps](https://support.metamask.io/start/creating-a-new-wallet).
   Save your recovery method privately.
2. Select the network the project names: **Base Sepolia** for testnet (chain ID
   `84532`) or **Base Mainnet** (chain ID `8453`). If it is absent, use MetaMask's
   network selector to add a custom network using the current
   [Base connection instructions](https://docs.base.org/get-started/connect-to-base).
3. Copy your account's **Ethereum/EVM public address** from MetaMask's account
   display. It begins with `0x` and has 40 hexadecimal characters after that.
   [MetaMask shows how to copy it](https://support.metamask.io/configure/wallet/how-to-copy-your-metamask-account-public-address-/).
4. Send the full public address and the selected Base network to the manager.
   If they already hold your shares, ask them to transfer the recorded quantity.
   Check that the destination address matches the one displayed in your wallet.

## opBNB

1. Create a MetaMask wallet using the [same setup steps](https://support.metamask.io/start/creating-a-new-wallet)
   if you do not already control an EVM account. Save your recovery method privately.
2. In MetaMask, select **opBNB Testnet** (chain ID `5611`) or **opBNB Mainnet**
   (chain ID `204`), as the project specifies. If it is absent, use **Settings →
   Networks → Add network → Add a network manually** and enter the values in the
   [official opBNB wallet configuration](https://docs.bnbchain.org/bnb-opbnb/get-started/wallet-configuration/).
   Do not select BSC in place of opBNB; they are different networks.
3. Copy your **Ethereum/EVM public address** from the account display and send
   the full address plus the selected opBNB network to the manager. If they
   already hold your shares, ask them to transfer the recorded quantity. The same
   MetaMask EVM account can have the same address on Base and opBNB, but the
   trophies and donations on those networks are separate.

## Sui

1. Open [Slush](https://slush.app/) and create a Sui wallet using its social-login
   or recovery-passphrase option. [Sui's Slush guide](https://www.docs.sui.io/onchain-finance/asset-custody/wallets/slush)
   explains both choices. Keep access to your login or recovery passphrase private.
2. Copy the **Sui public address** shown for your account. A full Sui address
   begins with `0x` and has 64 hexadecimal characters after it. Tell the manager
   whether the project will mint on Sui Testnet or Sui Mainnet, and send the full
   public address. Do not use your MetaMask EVM address for Sui.
3. Check the full address with the manager before minting or transfer. If they
   already hold your shares, ask them to transfer the recorded quantity. Sui trophies in this
   project are entries in a project ledger, not coins or NFTs shown automatically
   in Slush. The current project has no contributor wallet interface for viewing
   or claiming them. Receiving them at the address works, but a claim currently
   requires a compatible signer and a direct registry call. The
   [testnet guide](testnet-guide.md) demonstrates claims with separately created
   Sui CLI accounts; those accounts are distinct from a new Slush account.

If you already control a suitable wallet, you can use its address instead of
creating another. Make sure you can still access that wallet later: donation
earnings remain attached to the recipient address, even after all shares are
transferred away.
