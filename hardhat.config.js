require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.26",
  networks: {
    hardhat: {
      chainId: 31337,
      loggingEnabled: false,
      allowUnlimitedContractSize: false,
    },
  },
};
