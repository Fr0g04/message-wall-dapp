/*
 * Loads the running Flask app in real Chrome at phone size and checks the front end.
 * Covers both states:
 *   - no CONTRACT_ADDRESS configured (the one-time setup card)
 *   - CONTRACT_ADDRESS configured (the wall renders from chain)
 *
 *   cd tools && node test-browser.js http://127.0.0.1:5099
 */
const path = require("path");
const puppeteer = require("puppeteer-core");
const { seed } = require("./seed-local");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.argv[2] || "http://127.0.0.1:5099";

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
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: path.join(__dirname, ".chrome-profile"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const badResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(response.status() + " " + response.url());
  });

  // A typical phone viewport, which is the target for this app.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  const config = await page.$eval("#app-config", (node) => JSON.parse(node.textContent));
  const configured = Boolean(config.contractAddress);

  console.log("=== browser test (" + url + ") ===");
  console.log(configured ? "mode: contract configured at " + config.contractAddress + "\n" : "mode: first run, no contract address\n");

  if (configured) {
    // Against a local chain, reset the wall to a known state first.
    const rpc = (config.rpcUrls || [])[0] || "";
    const localChain = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(rpc);
    const shouldSeed = process.env.SEED ? process.env.SEED === "1" : localChain;
    if (shouldSeed) {
      const seeded = await seed(config.contractAddress, rpc);
      console.log("seeded " + seeded.length + " messages via " + rpc);
      await page.reload({ waitUntil: "networkidle2" });
    }

    await page.waitForFunction(() => document.getElementById("stat-total").textContent !== "–", { timeout: 30000 });

    const view = await page.evaluate(() => ({
      rendered: document.querySelectorAll("#wall .msg").length,
      texts: Array.from(document.querySelectorAll("#wall .msg-text")).map((n) => n.textContent),
      total: document.getElementById("stat-total").textContent,
      statusClass: document.getElementById("status").className,
      owner: document.getElementById("owner-address").textContent,
      setupHidden: document.getElementById("setup").classList.contains("hidden"),
      postDisabled: document.getElementById("post-button").disabled,
      counter: document.getElementById("counter").textContent,
      walletLabel: document.getElementById("wallet-button").textContent,
      netPill: document.getElementById("net-pill").textContent,
      scrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }));

    if (shouldSeed) {
      check("renders both seeded messages", view.rendered, 2);
      check("newest message first", view.texts[0], "Hello from the second account");
      check("oldest message last", view.texts[1], "Deployed from the local test node");
      check("stats show the total", view.total, "2");
    } else {
      record("wall loaded from chain", /^\d+$/.test(view.total), view.total);
      record("rendered messages match the total", view.rendered === Number(view.total), view.rendered + " vs " + view.total);
    }

    record("status reports success", view.statusClass.includes("banner ok"), view.statusClass);
    record("owner address is shown", /^0x[0-9a-fA-F]{40}$/.test(view.owner), view.owner);
    record("setup card stays hidden", view.setupHidden, "setup card was visible");
    record("post disabled without a wallet", view.postDisabled, "post was enabled");
    check("wallet button invites connecting", view.walletLabel, "Connect wallet");
    record("network pill shows the chain", view.netPill.includes("chain"), view.netPill);
    check("counter shows the limit", view.counter, "0 / " + config.maxTextLength);
    record("no horizontal overflow on a phone", view.scrollWidth <= view.viewportWidth, view.scrollWidth + " > " + view.viewportWidth);
  } else {
    await page.waitForFunction(() => !document.getElementById("setup").classList.contains("hidden"), { timeout: 30000 });

    const view = await page.evaluate(() => ({
      setupVisible: !document.getElementById("setup").classList.contains("hidden"),
      status: document.getElementById("status").textContent,
      statusClass: document.getElementById("status").className,
      total: document.getElementById("stat-total").textContent,
      owner: document.getElementById("owner-address").textContent,
      postDisabled: document.getElementById("post-button").disabled,
      source: document.getElementById("contract-source").textContent,
      scrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }));

    record("setup card is shown on first run", view.setupVisible, "setup card hidden");
    record("status explains what to do", /Deploy MessageWall\.sol/.test(view.status), view.status);
    record("status is a warning", view.statusClass.includes("banner warn"), view.statusClass);
    check("total shows a placeholder", view.total, "–");
    check("owner shows a placeholder", view.owner, "—");
    record("post stays disabled", view.postDisabled, "post was enabled");
    record("settings explain the missing address", /No contract address yet/.test(view.source), view.source);
    record("no horizontal overflow on a phone", view.scrollWidth <= view.viewportWidth, view.scrollWidth + " > " + view.viewportWidth);
  }

  const realErrors = consoleErrors.filter((line) => !/favicon/i.test(line));
  check("no console errors", realErrors.join(" | ") || "none", "none");
  check("no failed requests", badResponses.join(" | ") || "none", "none");

  await browser.close();
  console.log("\n" + (failures === 0 ? "ALL BROWSER CHECKS PASSED" : failures + " BROWSER CHECK(S) FAILED") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
