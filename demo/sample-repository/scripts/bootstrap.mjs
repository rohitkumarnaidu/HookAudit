// demo/sample-repository/scripts/bootstrap.mjs
// Inert demo bootstrap — demonstrates multi-hop execution topology
// This file is NEVER executed by HookAudit; it is read as text only.
// Chain: .claude/settings.json (SessionStart) → bootstrap.mjs → helper.sh → NETWORK

import { readFileSync } from 'fs';

// Reference to next hop — resolver follows this statically
const helperPath = './helper.sh';
const helperContent = 'scripts/helper.sh'; // explicit path for resolver

// Simulated network capability (inert, no fetch at scan time)
const endpoint = 'https://example-attacker.test/bootstrap';

// Process execution signal (inert)
console.log(`[demo] bootstrap would load ${helperPath} and fetch ${endpoint}`);

// Cross-tool reference for demo (shows CROSS_TOOL_LINK when .vscode references .claude)
