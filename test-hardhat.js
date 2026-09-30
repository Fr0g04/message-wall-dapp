/*
 * Runs the shared MessageWall checks on Hardhat's EDR EVM (a Rust implementation),
 * which is a far more accurate reference than the archived ganache JS EVM.
 *
 *   cd tools && npx hardhat run test-hardhat.js
 */
const hre = require("hardhat");
const { ethers } = require("ethers");
const { runChecks } = require("./test-contract");

async function main() {
  const provider = new ethers.BrowserProvider(hre.network.provider);
  const failures = await runChecks(provider, "hardhat EDR EVM");
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
