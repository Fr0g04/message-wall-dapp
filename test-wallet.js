/*
 * Drives the real UI in Chrome with a mock window.ethereum that forwards every
 * request to the local hardhat node (whose accounts are unlocked, so transactions
 * are genuinely signed and mined). Covers seed -> read -> connect -> post -> clear.
 *
 *   cd tools && node test-wallet.js http://127.0.0.1:5099
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const { seed } = require("./seed-local");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.argv[2] || "http://127.0.0.1:5099";
const rpcUrl = process.env.LOCAL_RPC || "http://127.0.0.1:8545";
const docsDir = path.join(__dirname, "..", "docs");

let failures = 0;

function check(name, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : ` (got ${actual}, expected ${expected})`));
}

function record(name, ok, detail) {
  if (!ok) failures += 1;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : " (" + detail + ")"));
}

async function main() {
  fs.mkdirSync(docsDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: path.join(__dirname, ".chrome-profile-wallet"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push("console: " + message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(response.status() + " " + response.url());
  });
  page.on("dialog", (dialog) => dialog.accept());

  // A wallet shim: everything is proxied to the local node, which signs for us.
  await page.evaluateOnNewDocument(
    (endpoint) => {
      window.ethereum = {
        isMetaMask: true,
        request: async ({ method, params }) => {
          // MetaMask-only method; the hardhat node exposes eth_accounts instead.
          const rpcMethod = method === "eth_requestAccounts" ? "eth_accounts" : method;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: rpcMethod, params: params || [] }),
          });
          const payload = await response.json();
          if (payload.error) {
            const error = new Error(payload.error.message);
            error.code = payload.error.code;
            error.data = payload.error.data;
            throw error;
          }
          return payload.result;
        },
        on: () => {},
        removeListener: () => {},
      };
    },
    rpcUrl
  );

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  const address = await page.$eval("#app-config", (node) => JSON.parse(node.textContent).contractAddress);
  console.log("=== wallet flow (" + url + ") ===\n");
  console.log("contract under test: " + address);

  // Start from a known state: the wall holds two messages from two accounts.
  const seeded = await seed(address, rpcUrl);
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(
    (expected) => document.querySelectorAll("#wall .msg").length === expected,
    { timeout: 30000 },
    seeded.length
  );

  const before = await page.evaluate(() => Number(document.getElementById("stat-total").textContent));
  console.log("seeded " + before + " messages\n");
  await page.screenshot({ path: path.join(docsDir, "screenshot-phone.png"), fullPage: true });

  console.log("Connect");
  await page.click("#wallet-button");
  await page.waitForFunction(
    () => {
      const pill = document.getElementById("account-pill").textContent;
      return /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/.test(pill) && !document.getElementById("refresh-button").disabled;
    },
    { timeout: 30000 }
  );
  const account = await page.$eval("#account-pill", (node) => node.textContent);
  check("account chip shows the wallet", account, "0xf39F…2266");
  record(
    "post stays disabled while the composer is empty",
    await page.$eval("#post-button", (node) => node.disabled),
    "post was enabled with no text"
  );
  record(
    "clear button enabled for the owner",
    !(await page.$eval("#clear-button", (node) => node.disabled)),
    "still disabled"
  );

  console.log("\nPost through the UI");
  const mineBefore = Number(await page.$eval("#stat-mine", (node) => node.textContent));
  await page.type("#message-text", "Posted straight from the phone UI");
  record("post button enables once there is text", !(await page.$eval("#post-button", (n) => n.disabled)), "still disabled");
  check("counter tracks typed bytes", await page.$eval("#counter", (node) => node.textContent), "33 / 200");
  await page.click("#post-button");
  await page.waitForFunction(
    (expected) => document.querySelectorAll("#wall .msg").length === expected,
    { timeout: 60000 },
    before + 1
  );
  const after = await page.evaluate(() => ({
    text: document.querySelector("#wall .msg .msg-text").textContent,
    who: document.querySelector("#wall .msg .who").textContent,
    total: document.getElementById("stat-total").textContent,
    mine: document.getElementById("stat-mine").textContent,
    status: document.getElementById("status").textContent,
    composer: document.getElementById("message-text").value,
  }));
  check("new message is at the top", after.text, "Posted straight from the phone UI");
  check("author is marked as You", after.who, "You");
  check("total incremented", after.total, before + 1);
  // postCount is cumulative on-chain, so compare against the previous reading.
  check("own post count incremented", Number(after.mine), mineBefore + 1);
  check("composer cleared", after.composer, "");
  console.log("        status: " + after.status);

  await page.screenshot({ path: path.join(docsDir, "screenshot-connected.png"), fullPage: true });

  console.log("\nClear the wall (owner only)");
  await page.click("#clear-button");
  await page.waitForFunction(() => document.querySelectorAll("#wall .msg").length === 0, { timeout: 60000 });
  check("wall emptied by the owner", await page.$eval("#stat-total", (node) => node.textContent), "0");
  record(
    "empty state message is shown",
    !(await page.$eval("#wall-empty", (node) => node.classList.contains("hidden"))),
    "still hidden"
  );

  const realProblems = problems.filter((line) => !/favicon/i.test(line));
  record("no console errors or failed requests", realProblems.length === 0, realProblems.join(" | "));

  await browser.close();
  console.log("\n" + (failures === 0 ? "ALL WALLET-FLOW CHECKS PASSED" : failures + " CHECK(S) FAILED") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
