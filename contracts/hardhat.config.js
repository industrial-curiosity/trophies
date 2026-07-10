require("@nomicfoundation/hardhat-toolbox");

// ponytail: env-var config, add dotenv/keystore when more than one dev deploys
const { SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;

module.exports = {
  solidity: "0.8.24",
  networks: {
    ...(SEPOLIA_RPC_URL && {
      sepolia: {
        url: SEPOLIA_RPC_URL,
        accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      },
    }),
  },
};
