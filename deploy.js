/*
 * Optional: deploy MessageWall.sol from the command line instead of Remix.
 * Development helper only — not needed by the Render service.
 *
 *   cd tools && npm install
 *   node compile.js
 *   export PRIVATE_KEY=0x...            # a throwaway Sepolia wallet with test ETH
 *   node deploy.js
 *
 * Never commit PRIVATE_KEY and never use a wallet that holds real funds.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const artifactPath = path.join(__dirname, "..", "contracts", "MessageWall.json");
const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const privateKey = (process.env.PRIVATE_KEY || "").trim();

async function main() {
  if (!fs.existsSync(artifactPath)) {
    console.error("contracts/MessageWall.json is missing — run `node compile.js` first.");
    process.exit(1);
  }
  if (!privateKey) {
    console.error("Set PRIVATE_KEY to a throwaway Sepolia wallet key, e.g. `export PRIVATE_KEY=0x...`.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 11155111) {
    console.error("This endpoint is on chain " + network.chainId + ", expected Sepolia (11155111).");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log("Deploying from " + wallet.address + " (" + ethers.formatEther(balance) + " ETH)");

  if (balance === 0n) {
    console.error("That wallet has no Sepolia ETH. Get some from https://www.alchemy.com/faucets/ethereum-sepolia");
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  console.log("Transaction " + contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nMessageWall deployed to: " + address);
  console.log("Explorer: https://sepolia.etherscan.io/address/" + address);
  console.log("\nPut that address in Render as the CONTRACT_ADDRESS environment variable.");
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exit(1);
});
