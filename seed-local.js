/*
 * Puts the local MessageWall into a known state so the browser tests are repeatable:
 * clears the wall (the owner key below deployed it) and posts two messages from two
 * different accounts.
 *
 * The keys are the well-known hardhat test accounts — test only, never real funds.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const KEY_OWNER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_VISITOR = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const SEED_MESSAGES = ["Deployed from the local test node", "Hello from the second account"];

async function seed(address, rpcUrl) {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "contracts", "MessageWall.json"), "utf8")
  );
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const owner = new ethers.NonceManager(new ethers.Wallet(KEY_OWNER, provider));
  const visitor = new ethers.NonceManager(new ethers.Wallet(KEY_VISITOR, provider));

  const wall = new ethers.Contract(address, artifact.abi, owner);
  await (await wall.clear()).wait();
  await (await wall.post(SEED_MESSAGES[0])).wait();
  await (await wall.connect(visitor).post(SEED_MESSAGES[1])).wait();

  return SEED_MESSAGES;
}

module.exports = { seed, SEED_MESSAGES, KEY_OWNER, KEY_VISITOR };
