/*
 * Message Wall — front-end for the MessageWall.sol contract.
 *
 * Everything blockchain-related happens in the visitor's browser:
 *   - reads go directly to a public Sepolia RPC endpoint
 *   - writes are signed by the visitor's own wallet
 * The Flask server never sees a private key.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ config */

  if (typeof ethers === "undefined") {
    var banner = document.getElementById("status");
    banner.className = "banner bad";
    banner.textContent =
      "Could not load the ethers.js library from the CDN. Check your internet connection and reload the page.";
    return;
  }

  var CFG = JSON.parse(document.getElementById("app-config").textContent);

  var ABI = [
    "function total() view returns (uint256)",
    "function recent(uint256 count) view returns (tuple(address author, string text, uint256 timestamp)[])",
    "function owner() view returns (address)",
    "function postCount(address account) view returns (uint256)",
    "function MAX_TEXT_LENGTH() view returns (uint256)",
    "function post(string text)",
    "function clear()",
    "event MessagePosted(uint256 indexed id, address indexed author, string text, uint256 timestamp)",
    "event WallCleared(address indexed by, uint256 messagesRemoved)",
    "error EmptyMessage()",
    "error MessageTooLong(uint256 length, uint256 maxLength)",
    "error NotOwner()",
  ];

  var iface = new ethers.Interface(ABI);

  var LS_CONTRACT = "messageWall.contractAddress";
  var LS_RPC = "messageWall.rpcUrl";
  var PAGE_SIZE = 10;

  /* ---------------------------------------------------------------- elements */

  function $id(id) {
    return document.getElementById(id);
  }

  var el = {
    status: $id("status"),
    walletButton: $id("wallet-button"),
    netPill: $id("net-pill"),
    accountPill: $id("account-pill"),
    setup: $id("setup"),
    setupAddress: $id("setup-address"),
    setupSave: $id("setup-save"),
    text: $id("message-text"),
    counter: $id("counter"),
    postButton: $id("post-button"),
    refreshButton: $id("refresh-button"),
    wall: $id("wall"),
    wallEmpty: $id("wall-empty"),
    moreButton: $id("more-button"),
    statTotal: $id("stat-total"),
    statMine: $id("stat-mine"),
    ownerAddress: $id("owner-address"),
    ownerHint: $id("owner-hint"),
    clearButton: $id("clear-button"),
    contractInput: $id("contract-input"),
    contractSave: $id("contract-save"),
    contractReset: $id("contract-reset"),
    contractSource: $id("contract-source"),
    rpcInput: $id("rpc-input"),
    rpcSave: $id("rpc-save"),
    rpcReset: $id("rpc-reset"),
    explorerLink: $id("explorer-link"),
  };

  /* ------------------------------------------------------------------- state */

  var state = {
    readProvider: null,
    signer: null,
    account: "",
    owner: "",
    messages: [],
    total: 0,
    shown: PAGE_SIZE,
    busy: false,
  };

  /* ------------------------------------------------------------ localStorage */

  function lsGet(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function lsSet(key, value) {
    try {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      /* Private browsing can refuse writes; the app still works for this visit. */
    }
  }

  /* ----------------------------------------------------------- small helpers */

  function shortAddress(value) {
    return value ? value.slice(0, 6) + "…" + value.slice(-4) : "—";
  }

  function byteLength(text) {
    return new TextEncoder().encode(text).length;
  }

  function timeAgo(seconds) {
    var then = Number(seconds) * 1000;
    var diff = Date.now() - then;
    if (!isFinite(diff)) return "";
    if (diff < 0) return "just now";
    if (diff < 60000) return "just now";
    var minutes = Math.floor(diff / 60000);
    if (minutes < 60) return minutes + "m ago";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";
    var days = Math.floor(hours / 24);
    if (days < 30) return days + "d ago";
    return new Date(then).toLocaleDateString();
  }

  function avatarColor(address) {
    var hue = parseInt((address || "0x00").slice(2, 8), 16) % 360;
    return "hsl(" + hue + " 78% 66%)";
  }

  function setStatus(message, kind) {
    el.status.textContent = message;
    el.status.className = "banner" + (kind ? " " + kind : "");
  }

  /*
   * Wallets and RPC providers report custom errors inconsistently: some hand back
   * the raw revert bytes, some only a generic message. Decode the bytes ourselves
   * so the user always sees the real reason.
   */
  function revertNameOf(error) {
    if (error && error.revert && error.revert.name) return error.revert.name;

    var candidates = [
      error && error.data,
      error && error.info && error.info.error && error.info.error.data,
      error && error.error && error.error.data,
    ];
    for (var i = 0; i < candidates.length; i++) {
      var raw = candidates[i];
      if (typeof raw !== "string" || raw.length < 10) continue;
      try {
        var parsed = iface.parseError(raw);
        if (parsed) return parsed.name;
      } catch (ignored) {
        /* not one of our errors */
      }
    }
    return "";
  }

  function friendlyError(error) {
    if (!error) return "Something went wrong.";
    if (error.code === 4001 || error.code === "ACTION_REJECTED") {
      return "You cancelled the request in your wallet.";
    }
    if (error.code === "INSUFFICIENT_FUNDS") {
      return "Not enough Sepolia ETH to pay for gas. Top up from a Sepolia faucet and try again.";
    }
    if (error.code === "BAD_DATA" || /could not decode result data/i.test(String(error.shortMessage || ""))) {
      return "No MessageWall contract was found at that address on " + CFG.chainName + ". Check the address and the network.";
    }

    switch (revertNameOf(error)) {
      case "EmptyMessage":
        return "Write something before posting.";
      case "MessageTooLong":
        return "That message is longer than " + CFG.maxTextLength + " bytes.";
      case "NotOwner":
        return "Only the wallet that deployed this contract can do that.";
      case "IndexOutOfRange":
        return "That message is no longer on the wall.";
      default:
        break;
    }

    // Fall back to whatever the provider put in the message.
    var reason = String(error.reason || error.shortMessage || error.message || error);
    if (/NotOwner/.test(reason)) return "Only the wallet that deployed this contract can do that.";
    if (/MessageTooLong/.test(reason)) return "That message is longer than " + CFG.maxTextLength + " bytes.";
    if (/EmptyMessage/.test(reason)) return "Write something before posting.";
    return reason;
  }

  function isOwner() {
    return Boolean(
      state.account && state.owner && state.account.toLowerCase() === state.owner.toLowerCase()
    );
  }

  /* ------------------------------------------------- contract address / RPC */

  function activeContractAddress() {
    return (lsGet(LS_CONTRACT) || CFG.contractAddress || "").trim();
  }

  function describeContractSource() {
    if (lsGet(LS_CONTRACT)) return "Using the address saved on this device.";
    if (CFG.contractAddress) return "Using the address configured on the server.";
    return "No contract address yet. Deploy MessageWall.sol, then paste its address above.";
  }

  function activeRpcUrls() {
    var override = lsGet(LS_RPC).trim();
    var urls = (CFG.rpcUrls || []).slice();
    if (override && urls.indexOf(override) === -1) urls.unshift(override);
    return urls;
  }

  async function readContract() {
    var address = activeContractAddress();
    if (!ethers.isAddress(address)) {
      throw new Error("Enter a valid 0x contract address (42 characters).");
    }
    return new ethers.Contract(address, ABI, await readProvider());
  }

  function writeContract() {
    var address = activeContractAddress();
    if (!ethers.isAddress(address)) throw new Error("Enter a valid 0x contract address first.");
    if (!state.signer) throw new Error("Connect your wallet before posting.");
    return new ethers.Contract(address, ABI, state.signer);
  }

  /* Each public endpoint is tried in turn, so one outage does not break the app. */
  async function readProvider(force) {
    if (state.readProvider && !force) return state.readProvider;
    state.readProvider = null;

    var problems = [];
    var urls = activeRpcUrls();
    for (var i = 0; i < urls.length; i++) {
      try {
        var provider = new ethers.JsonRpcProvider(urls[i]);
        var network = await provider.getNetwork();
        if (Number(network.chainId) !== Number(CFG.chainId)) {
          problems.push(urls[i] + " is on chain " + network.chainId);
          continue;
        }
        state.readProvider = provider;
        return provider;
      } catch (error) {
        problems.push(urls[i] + ": " + (error.shortMessage || error.message));
      }
    }
    throw new Error("Could not reach a " + CFG.chainName + " RPC endpoint. " + problems.join(" · "));
  }

  /* -------------------------------------------------------------- validation */

  function syncButtons() {
    var hasContract = ethers.isAddress(activeContractAddress());
    var bytes = byteLength(el.text.value);
    var canPost =
      !state.busy &&
      Boolean(state.signer) &&
      hasContract &&
      bytes > 0 &&
      bytes <= CFG.maxTextLength;

    el.postButton.disabled = !canPost;
    el.clearButton.disabled = state.busy || !isOwner();
    el.refreshButton.disabled = state.busy;
    el.walletButton.disabled = state.busy;
    el.setupSave.disabled = state.busy;
    el.contractSave.disabled = state.busy;
    el.rpcSave.disabled = state.busy;
  }

  function setBusy(value) {
    state.busy = value;
    syncButtons();
  }

  function updateCounter() {
    var bytes = byteLength(el.text.value);
    el.counter.textContent = bytes + " / " + CFG.maxTextLength;
    el.counter.classList.toggle("over", bytes > CFG.maxTextLength);
    syncButtons();
  }

  function updateAccountUI() {
    el.accountPill.textContent = state.account ? shortAddress(state.account) : "No wallet connected";
    el.accountPill.className = "pill " + (state.account ? "good" : "muted");
    el.walletButton.textContent = state.account ? shortAddress(state.account) : "Connect wallet";
  }

  /* --------------------------------------------------------------- rendering */

  function messageElement(entry) {
    var author = String(entry.author);
    var mine = Boolean(state.account) && author.toLowerCase() === state.account.toLowerCase();

    var item = document.createElement("li");
    item.className = "msg" + (mine ? " mine" : "");

    var top = document.createElement("div");
    top.className = "msg-top";

    var avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.style.background = avatarColor(author);
    avatar.textContent = author.slice(2, 4).toUpperCase();

    var who = document.createElement("span");
    who.className = "who";
    who.textContent = mine ? "You" : shortAddress(author);

    var when = document.createElement("span");
    when.className = "when";
    when.textContent = timeAgo(entry.timestamp);
    when.title = new Date(Number(entry.timestamp) * 1000).toLocaleString();

    top.appendChild(avatar);
    top.appendChild(who);
    top.appendChild(when);

    var body = document.createElement("p");
    body.className = "msg-text";
    body.textContent = String(entry.text); // textContent keeps wallet input inert

    item.appendChild(top);
    item.appendChild(body);
    return item;
  }

  function renderWall() {
    el.wall.replaceChildren();
    state.messages.slice(0, state.shown).forEach(function (entry) {
      el.wall.appendChild(messageElement(entry));
    });

    el.wallEmpty.classList.toggle("hidden", state.messages.length > 0);
    var remaining = state.messages.length - state.shown;
    el.moreButton.classList.toggle("hidden", remaining <= 0);
    if (remaining > 0) {
      el.moreButton.textContent = "Show older messages (" + remaining + " more)";
    }
  }

  /* ----------------------------------------------------------------- actions */

  function refreshSafely() {
    return refresh().catch(function (error) {
      setStatus(friendlyError(error), "bad");
      setBusy(false);
    });
  }

  async function refresh() {
    var address = activeContractAddress();
    el.setup.classList.toggle("hidden", ethers.isAddress(address));

    if (!ethers.isAddress(address)) {
      state.messages = [];
      state.total = 0;
      state.owner = "";
      el.statTotal.textContent = "–";
      el.statMine.textContent = "–";
      el.ownerAddress.textContent = "—";
      renderWall();
      setStatus("Deploy MessageWall.sol in Remix, then paste its address to start.", "warn");
      setBusy(false);
      return;
    }

    setBusy(true);
    setStatus("Reading the wall from " + CFG.chainName + "…");
    try {
      var contract = await readContract();
      var results = await Promise.all([
        contract.total(),
        contract.owner(),
        contract.recent(CFG.wallSize),
      ]);

      state.total = Number(results[0]);
      state.owner = String(results[1]);
      // recent() hands back the newest message first, which is what we want to show at the top.
      state.messages = Array.from(results[2]).map(function (row) {
        return { author: String(row.author), text: String(row.text), timestamp: row.timestamp };
      });

      var mine = "0";
      if (state.account) {
        mine = String(await contract.postCount(state.account));
      }

      el.statTotal.textContent = String(state.total);
      el.statMine.textContent = mine;
      el.ownerAddress.textContent = state.owner;
      el.ownerHint.textContent = isOwner()
        ? "Your wallet deployed this contract, so you can clear the wall."
        : "Only the wallet that deployed the contract can clear the wall.";

      if (state.shown < PAGE_SIZE) state.shown = PAGE_SIZE;
      renderWall();
      setStatus(
        state.total +
          (state.total === 1 ? " message" : " messages") +
          " on the wall" +
          (state.account ? "." : ". Connect a wallet to post your own."),
        "ok"
      );
    } finally {
      setBusy(false);
    }
  }

  async function ensureChain() {
    var wanted = "0x" + Number(CFG.chainId).toString(16);
    var current = await window.ethereum.request({ method: "eth_chainId" });
    if (String(current).toLowerCase() === wanted) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: wanted }],
      });
    } catch (error) {
      if (error && (error.code === 4902 || error.code === -32603)) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: wanted,
              chainName: CFG.chainName,
              nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: (CFG.rpcUrls || []).slice(0, 1),
              blockExplorerUrls: [CFG.explorer],
            },
          ],
        });
      } else {
        throw error;
      }
    }
  }

  async function adoptWallet() {
    var provider = new ethers.BrowserProvider(window.ethereum);
    var accounts = await provider.send("eth_accounts", []);
    if (!accounts.length) return false;
    state.signer = await provider.getSigner();
    state.account = accounts[0];
    updateAccountUI();
    return true;
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus(
        "No Ethereum wallet detected. On a phone, open this page inside the MetaMask app browser " +
          "(MetaMask → Browser). On a computer, install the MetaMask extension.",
        "bad"
      );
      return;
    }

    setBusy(true);
    try {
      await ensureChain();
      var provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      state.signer = await provider.getSigner();
      state.account = await state.signer.getAddress();
      updateAccountUI();
      setStatus("Wallet connected: " + shortAddress(state.account), "ok");
      state.readProvider = null;
      await refresh();
    } catch (error) {
      setStatus(friendlyError(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function postMessage() {
    var text = el.text.value.trim();
    var bytes = byteLength(text);

    if (!text) {
      setStatus("Write something before posting.", "warn");
      return;
    }
    if (bytes > CFG.maxTextLength) {
      setStatus("That message is " + bytes + " bytes; the limit is " + CFG.maxTextLength + ".", "bad");
      return;
    }
    if (!state.signer) {
      setStatus("Connect your wallet before posting.", "warn");
      return;
    }

    setBusy(true);
    try {
      var contract = writeContract();
      setStatus("Confirm the transaction in your wallet…");
      var tx = await contract.post(text);
      setStatus("Transaction sent (" + shortAddress(tx.hash) + "). Waiting for confirmation…");
      await tx.wait();
      el.text.value = "";
      updateCounter();
      await refresh();
      setStatus("Confirmed. Your message is on the blockchain.", "ok");
    } catch (error) {
      setStatus(friendlyError(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function clearWall() {
    if (!state.signer || !isOwner()) return;
    var ok = window.confirm(
      "Remove all " + state.total + " messages from the wall?\n\nThis is a blockchain transaction and cannot be undone."
    );
    if (!ok) return;

    setBusy(true);
    try {
      var contract = writeContract();
      setStatus("Confirm the transaction in your wallet…");
      var tx = await contract.clear();
      setStatus("Transaction sent (" + shortAddress(tx.hash) + "). Waiting for confirmation…");
      await tx.wait();
      await refresh();
      setStatus("The wall is now empty.", "ok");
    } catch (error) {
      setStatus(friendlyError(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------- settings */

  function saveContractAddress(candidate) {
    var value = (candidate || "").trim();
    if (!ethers.isAddress(value)) {
      setStatus("That is not a valid 0x contract address.", "bad");
      return false;
    }
    lsSet(LS_CONTRACT, value);
    el.contractInput.value = value;
    el.setupAddress.value = value;
    el.contractSource.textContent = describeContractSource();
    state.shown = PAGE_SIZE;
    state.readProvider = null;
    return true;
  }

  /* ------------------------------------------------------------------ events */

  el.walletButton.addEventListener("click", function () {
    if (state.account) {
      // Already connected: re-running the request lets MetaMask switch accounts.
      state.signer = null;
      state.account = "";
      updateAccountUI();
    }
    connectWallet();
  });

  el.setupSave.addEventListener("click", function () {
    if (saveContractAddress(el.setupAddress.value)) refreshSafely();
  });

  el.contractSave.addEventListener("click", function () {
    if (saveContractAddress(el.contractInput.value)) refreshSafely();
  });

  el.contractReset.addEventListener("click", function () {
    lsSet(LS_CONTRACT, "");
    el.contractInput.value = CFG.contractAddress || "";
    el.setupAddress.value = CFG.contractAddress || "";
    el.contractSource.textContent = describeContractSource();
    state.readProvider = null;
    refreshSafely();
  });

  el.rpcSave.addEventListener("click", function () {
    var value = el.rpcInput.value.trim();
    if (value && !/^https?:\/\//i.test(value)) {
      setStatus("The RPC endpoint must start with http:// or https://", "bad");
      return;
    }
    lsSet(LS_RPC, value);
    state.readProvider = null;
    refreshSafely();
  });

  el.rpcReset.addEventListener("click", function () {
    lsSet(LS_RPC, "");
    el.rpcInput.value = (CFG.rpcUrls || [])[0] || "";
    state.readProvider = null;
    refreshSafely();
  });

  el.text.addEventListener("input", updateCounter);
  el.postButton.addEventListener("click", postMessage);
  el.clearButton.addEventListener("click", clearWall);
  el.refreshButton.addEventListener("click", refreshSafely);
  el.moreButton.addEventListener("click", function () {
    state.shown += PAGE_SIZE;
    renderWall();
  });

  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", async function () {
      state.signer = null;
      state.account = "";
      updateAccountUI();
      try {
        await adoptWallet();
      } catch (error) {
        /* ignore */
      }
      refreshSafely();
    });
    window.ethereum.on("chainChanged", function () {
      window.location.reload();
    });
  }

  /* -------------------------------------------------------------------- boot */

  async function init() {
    el.netPill.textContent = CFG.chainName + " · chain " + CFG.chainId;
    el.explorerLink.href = CFG.explorer;
    el.explorerLink.textContent = CFG.explorer;

    var address = activeContractAddress();
    el.contractInput.value = address;
    el.setupAddress.value = address;
    el.contractSource.textContent = describeContractSource();
    el.rpcInput.value = lsGet(LS_RPC) || (CFG.rpcUrls || [])[0] || "";

    updateCounter();
    updateAccountUI();
    setBusy(false);

    if (window.ethereum) {
      try {
        await adoptWallet(); // silent: only reuses an existing connection
      } catch (error) {
        /* the visitor can connect manually */
      }
    }

    await refreshSafely();
  }

  init();
})();
