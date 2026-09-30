/*
 * Checks that the RPC endpoints the app actually falls back to are usable *from a browser*.
 * A public endpoint that answers curl but omits CORS headers will break the dApp, because
 * every read is an in-page cross-origin fetch.
 *
 * The list is read from the running app's own config, so this always tests what ships.
 *
 *   cd tools && node check-rpcs.js https://your-app.onrender.com
 *
 * Without an argument a local Flask app on 127.0.0.1:5099 is used.
 */
const path = require("path");
const puppeteer = require("puppeteer-core");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const origin = process.argv[2] || "http://127.0.0.1:5099";

// A well-known Sepolia contract used to prove eth_call works: WETH name() -> "Wrapped Ether".
const PROBE = { to: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", data: "0x06fdde03" };

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: path.join(__dirname, ".chrome-profile-rpc"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });

  const config = await page.$eval("#app-config", (node) => JSON.parse(node.textContent)).catch(() => null);
  if (!config) {
    console.error("Could not read #app-config from " + origin + " — is the app running?");
    await browser.close();
    process.exit(1);
  }

  console.log("browser origin: " + origin);
  console.log("chain " + config.chainId + ", " + config.rpcUrls.length + " endpoint(s) configured\n");

  let failures = 0;
  for (const rpc of config.rpcUrls) {
    const result = await page.evaluate(
      async (endpoint, probe) => {
        const call = async (method, params) => {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          });
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        };
        try {
          const chain = await call("eth_chainId", []);
          if (chain.error) throw new Error("eth_chainId: " + chain.error.message);
          const block = await call("eth_blockNumber", []);
          if (block.error) throw new Error("eth_blockNumber: " + block.error.message);
          const read = await call("eth_call", [probe, "latest"]);
          if (read.error) throw new Error("eth_call: " + read.error.message);
          return { chainId: chain.result, block: parseInt(block.result, 16), bytes: (read.result || "").length };
        } catch (error) {
          return { error: error.message };
        }
      },
      rpc,
      PROBE
    );

    const ok = !result.error && result.chainId === "0x" + Number(config.chainId).toString(16) && result.bytes > 2;
    if (!ok) failures += 1;
    console.log(
      (ok ? "  OK    " : "  FAIL  ") +
        rpc.padEnd(45) +
        (result.error
          ? "error: " + result.error
          : "chain " + result.chainId + ", block " + result.block + ", eth_call " + result.bytes + " hex chars")
    );
  }

  await browser.close();
  console.log(
    "\n" + (failures === 0 ? "all endpoints usable from the browser" : failures + " endpoint(s) unusable — replace them in app.py") + "\n"
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
