/*
 * Compiles contracts/MessageWall.sol with solc and writes contracts/MessageWall.json
 * (ABI + creation bytecode). Development helper only — not needed by the Render service.
 *
 *   cd tools && npm install && node compile.js
 */
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "contracts", "MessageWall.sol");
const artifactPath = path.join(root, "contracts", "MessageWall.json");

const input = {
  language: "Solidity",
  sources: {
    "MessageWall.sol": { content: fs.readFileSync(sourcePath, "utf8") },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const diagnostics = output.errors || [];
diagnostics.forEach((entry) => {
  const stream = entry.severity === "error" ? process.stderr : process.stdout;
  stream.write(entry.formattedMessage + "\n");
});

if (diagnostics.some((entry) => entry.severity === "error")) {
  process.exit(1);
}

const contract = output.contracts["MessageWall.sol"].MessageWall;
const bytecode = contract.evm.bytecode.object;

fs.writeFileSync(
  artifactPath,
  JSON.stringify({ contractName: "MessageWall", abi: contract.abi, bytecode: "0x" + bytecode }, null, 2) + "\n"
);

console.log("solc " + solc.version());
console.log("MessageWall compiled — runtime bytecode " + bytecode.length / 2 + " bytes");
console.log("Wrote " + path.relative(root, artifactPath));
