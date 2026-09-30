/*
 * Deploys MessageWall to the local hardhat node and posts two messages,
 * so the browser test has something to render.
 *
 *   cd tools && node deploy-local.js
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC = process.env.LOCAL_RPC || "http://127.0.0.1:8545";
// The well-known hardhat test accounts. Test-only keys, never used for real funds.
const KEY_OWNER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_VISITOR = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

async function main() {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "contracts", "MessageWall.json"), "utf8")
  );
  const provider = new ethers.JsonRpcProvider(RPC);
  // NonceManager keeps the nonces straight when several transactions go out back to back.
  const owner = new ethers.NonceManager(new ethers.Wallet(KEY_OWNER, provider));
  const visitor = new ethers.NonceManager(new ethers.Wallet(KEY_VISITOR, provider));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("deployed " + address);

  const first = await (await contract.post("Deployed from the local test node")).wait();
  console.log("post 1 mined in block " + first.blockNumber);
  const second = await (await contract.connect(visitor).post("Hello from the second account")).wait();
  console.log("post 2 mined in block " + second.blockNumber);
  console.log("total = " + (await contract.total()).toString());

  fs.writeFileSync(path.join(__dirname, ".local-address"), address + "\n");
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exit(1);
});
