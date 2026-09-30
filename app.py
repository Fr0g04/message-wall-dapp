"""Flask host for the Message Wall dApp.

The server only serves the page. Every blockchain read and write happens inside
the visitor's browser, and the visitor's own wallet signs the transactions. The
server never holds a private key and needs no Infura key of its own.
"""

import os

from flask import Flask, jsonify, render_template, send_from_directory

# Public Sepolia endpoints, tried in order by the browser. None of them need an API key.
# Verified with eth_chainId and eth_call; update them if one is retired.
DEFAULT_RPC_URLS = (
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.gateway.tenderly.co",
    "https://sepolia.rpc.thirdweb.com",
    "https://rpc.sepolia.ethpandaops.io",
)

SEPOLIA_CHAIN_ID = 11155111
DEFAULT_TITLE = "Message Wall"
DEFAULT_EXPLORER = "https://sepolia.etherscan.io"


def _text(name, default=""):
    value = os.environ.get(name)
    return value.strip() if value and value.strip() else default


def _integer(name, default):
    try:
        return int(_text(name) or default)
    except (TypeError, ValueError):
        return default


def _rpc_urls():
    """SEPOLIA_RPC_URL may hold a comma-separated list; the public ones stay as fallbacks."""
    configured = [url.strip() for url in _text("SEPOLIA_RPC_URL").split(",") if url.strip()]
    return configured + [url for url in DEFAULT_RPC_URLS if url not in configured]


def _build_config():
    return {
        "title": _text("WALL_TITLE", DEFAULT_TITLE),
        "contractAddress": _text("CONTRACT_ADDRESS"),
        "chainId": _integer("CHAIN_ID", SEPOLIA_CHAIN_ID),
        "chainName": _text("CHAIN_NAME", "Sepolia"),
        "explorer": _text("BLOCK_EXPLORER", DEFAULT_EXPLORER).rstrip("/"),
        "rpcUrls": _rpc_urls(),
        "maxTextLength": _integer("MAX_TEXT_LENGTH", 200),
        "wallSize": max(1, min(_integer("WALL_SIZE", 50), 200)),
    }


def create_app():
    app = Flask(__name__)
    config = _build_config()

    @app.get("/")
    def home():
        return render_template("index.html", config=config)

    @app.get("/health")
    def health():
        return jsonify(status="ok", contractConfigured=bool(config["contractAddress"]))

    @app.get("/favicon.ico")
    def favicon():
        # Some browsers ask for /favicon.ico even when an SVG icon is declared.
        return send_from_directory(app.static_folder, "favicon.svg", mimetype="image/svg+xml")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
