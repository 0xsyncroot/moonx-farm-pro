require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.23",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.26",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    'sepolia': {
      url: process.env.SEPOLIA_RPC || "https://eth-sepolia.g.alchemy.com/v2/Ecb6PRdlznM-EzAkL9-H_gyvomlNYd6X",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    "base-testnet": {
      url: process.env.BASE_TESTNET_RPC || "https://base-sepolia.g.alchemy.com/v2/Ecb6PRdlznM-EzAkL9-H_gyvomlNYd6X",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    "base": {
      url: process.env.BASE_MAINNET_RPC || "https://base-mainnet.g.alchemy.com/v2/Ecb6PRdlznM-EzAkL9-H_gyvomlNYd6X",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    "bsc-testnet": {
      url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 97,
    },
    "bsc": {
      url: process.env.BSC_MAINNET_RPC || "https://bnb-mainnet.g.alchemy.com/v2/Ecb6PRdlznM-EzAkL9-H_gyvomlNYd6X",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
    },
  },

  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY || "",
      bsc: process.env.BSCSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      }
    ]
  },

  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
