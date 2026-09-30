/*
 * Checks for MessageWall.sol, run against a real EVM.
 *
 *   cd tools && npx hardhat run test-hardhat.js
 *
 * The human-readable ABI is read straight out of static/app.js, so if the front end
 * and the contract ever drift apart, these checks fail.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const root = path.join(__dirname, "..");
const artifact = JSON.parse(fs.readFileSync(path.join(root, "contracts", "MessageWall.json"), "utf8"));

/** Pull the human-readable ABI straight out of the browser bundle. */
function abiFromAppJs() {
  const source = fs.readFileSync(path.join(root, "static", "app.js"), "utf8");
  const match = source.match(/var ABI = (\[[\s\S]*?\]);/);
  if (!match) throw new Error("Could not find `var ABI = [...]` in static/app.js");
  return JSON.parse(match[1].replace(/,(\s*[\]}])/g, "$1"));
}

/** "function post(string)" style signatures from any ABI. */
function signatures(abi, kinds) {
  const iface = new ethers.Interface(abi);
  const out = new Set();
  Object.values(iface.fragments).forEach((fragment) => {
    if (kinds.includes(fragment.type)) out.add(fragment.format("sighash"));
  });
  return out;
}

async function runChecks(provider, label) {
  let failures = 0;
  let passes = 0;

  function record(ok, line) {
    if (ok) {
      passes += 1;
    } else {
      failures += 1;
    }
    console.log((ok ? "  PASS  " : "  FAIL  ") + line);
    return ok;
  }

  function check(name, actual, expected) {
    const ok = String(actual) === String(expected);
    return record(ok, name + (ok ? "" : ` (got ${actual}, expected ${expected})`));
  }

  const appAbi = abiFromAppJs();
  const iface = new ethers.Interface(appAbi);

  function revertNameOf(error) {
    if (error && error.revert && error.revert.name) return error.revert.name;
    const raw = error && (error.data || (error.info && error.info.error && error.info.error.data));
    if (typeof raw === "string" && raw.length >= 10) {
      try {
        const parsed = iface.parseError(raw);
        if (parsed) return parsed.name;
      } catch (ignored) {
        /* fall through */
      }
    }
    return "";
  }

  async function expectRevert(name, promise, expectedError) {
    let error;
    try {
      await promise;
    } catch (caught) {
      error = caught;
    }
    if (!error) return record(false, name + " (no revert)");

    const decoded = revertNameOf(error);
    if (decoded) return record(decoded === expectedError, name + ` (reverted: ${decoded})`);

    const text = String(error.shortMessage || error.message || error);
    return record(text.includes(expectedError), name + ` (reverted, undecoded: "${text}")`);
  }

  console.log("=== " + label + " ===");

  console.log("\nFront-end ABI matches the compiled contract");
  const contractSignatures = signatures(artifact.abi, ["function", "error", "event"]);
  const appSignatures = signatures(appAbi, ["function", "error", "event"]);
  const missing = [...appSignatures].filter((sig) => !contractSignatures.has(sig));
  record(missing.length === 0, "every app.js ABI fragment exists in the contract" + (missing.length ? ` (missing: ${missing.join(", ")})` : ""));
  const unused = [...contractSignatures].filter((sig) => !appSignatures.has(sig));
  console.log("        (contract-only fragments, unused by the UI: " + (unused.join(", ") || "none") + ")");

  const owner = await provider.getSigner(0);
  const visitor = await provider.getSigner(1);
  const ownerAddress = await owner.getAddress();
  const visitorAddress = await visitor.getAddress();

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
  const deployed = await factory.deploy();
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();
  console.log("\nMessageWall deployed at " + address);

  const wall = new ethers.Contract(address, appAbi, owner);
  const wallAsVisitor = wall.connect(visitor);
  const readOnly = new ethers.Contract(address, appAbi, provider);

  console.log("\nInitial state");
  check("total() starts at 0", await readOnly.total(), 0);
  check("owner() is the deployer", await readOnly.owner(), ownerAddress);
  check("recent() is empty", (await readOnly.recent(10)).length, 0);

  console.log("\nPosting");
  const first = await (await wall.post("Hello from the phone")).wait();
  await (await wallAsVisitor.post("Second message")).wait();
  check("one MessagePosted event", first.logs.length, 1);
  const parsed = wall.interface.parseLog(first.logs[0]);
  check("event name", parsed.name, "MessagePosted");
  check("event author", parsed.args.author, ownerAddress);
  check("event text", parsed.args.text, "Hello from the phone");

  console.log("\nReading");
  check("total() is 2", await readOnly.total(), 2);
  const recent = await readOnly.recent(10);
  check("recent() length", recent.length, 2);
  check("newest message first", recent[0].text, "Second message");
  check("oldest message last", recent[1].text, "Hello from the phone");
  check("named field .author decodes", recent[0].author, visitorAddress);
  check("timestamp is set", Number(recent[0].timestamp) > 0, true);
  check("recent(1) caps the count", (await readOnly.recent(1)).length, 1);
  check("recent(99) caps at the wall size", (await readOnly.recent(99)).length, 2);
  check("postCount(owner)", await readOnly.postCount(ownerAddress), 1);
  check("postCount(visitor)", await readOnly.postCount(visitorAddress), 1);
  check("postCount(stranger) is 0", await readOnly.postCount(ethers.ZeroAddress), 0);
  check("MAX_TEXT_LENGTH", await readOnly.MAX_TEXT_LENGTH(), 200);

  console.log("\nValidation");
  await expectRevert("empty message is rejected", wall.post(""), "EmptyMessage");
  await expectRevert("201 bytes is rejected", wall.post("x".repeat(201)), "MessageTooLong");
  await wall.post("y".repeat(200));
  check("exactly 200 bytes is accepted", await readOnly.total(), 3);
  await wall.post("emoji 👍 and 中文 are fine");
  check("utf-8 text round-trips", (await readOnly.recent(1))[0].text, "emoji 👍 and 中文 are fine");

  console.log("\nAccess control");
  await expectRevert("non-owner cannot clear", wallAsVisitor.clear(), "NotOwner");
  await (await wall.clear()).wait();
  check("owner cleared the wall", await readOnly.total(), 0);
  check("recent() is empty again", (await readOnly.recent(10)).length, 0);
  check("postCount survives a clear", await readOnly.postCount(ownerAddress), 3);
  await wall.post("After the clear");
  check("the wall accepts posts again", await readOnly.total(), 1);

  console.log(
    "\n" + label + ": " + passes + " passed, " + failures + " failed" + (failures === 0 ? " — ALL CHECKS PASSED" : "") + "\n"
  );
  return failures;
}

module.exports = { runChecks, abiFromAppJs };
