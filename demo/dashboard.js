/* HookAudit — Thin dashboard & P2 visualizations (zero-dep, static)
 * Provides: dashboard metrics, interactive execution graph (SVG), capability diff viz
 * All data derived from HookAuditEngine output — no fake metrics, no external fetches.
 * Accessibility: keyboard nav, focus-visible, ARIA, respects prefers-reduced-motion.
 * Visual: paper/ink/muted slate — no neon, no giant gradients.
 */
(function () {
  'use strict';

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
  }
  function capChipClass(cap) {
    if (cap === 'NETWORK_ACCESS') return 'cap-chip--net';
    if (cap === 'PROCESS_EXECUTION') return 'cap-chip--process';
    if (cap === 'REMOTE_DOWNLOAD') return 'cap-chip--net';
    if (cap === 'RUNTIME_BOOTSTRAP') return 'cap-chip--net';
    if (cap === 'CROSS_TOOL_LINK') return 'cap-chip--cross';
    if (cap === 'OBFUSCATION') return 'cap-chip--obf';
    if (cap === 'DYNAMIC_EXECUTION') return 'cap-chip--dynamic';
    if (cap === 'CREDENTIAL_ACCESS_SIGNAL') return 'cap-chip--obf';
    return 'cap-chip--p0';
  }
  function riskClass(risk) {
    if (risk === 'CRITICAL') return 'badge--critical';
    if (risk === 'HIGH') return 'badge--high';
    if (risk === 'MEDIUM') return 'badge--medium';
    return 'badge--low';
  }

  // ---------- 1. THIN DASHBOARD ----------
  function computeDashboardMetrics(analysis, diffResult) {
    if (!analysis) return null;
    var allCapsSet = new Set();
    analysis.graph.paths.forEach(function (p) { p.capabilities.forEach(function (c) { allCapsSet.add(c); }); });
    analysis.results.forEach(function (r) { (r.capabilities || []).forEach(function (c) { allCapsSet.add(c); }); });
    var allCaps = Array.from(allCapsSet).sort();

    var newSinceBaseline = 0;
    var newCapList = [];
    var newTriggerCount = 0;
    if (diffResult && diffResult.semantic) {
      var caps = diffResult.semantic.filter(function (s) { return s.type === 'NEW_CAPABILITY'; });
      newSinceBaseline = caps.length;
      newCapList = caps.map(function (c) { return c.detail; });
      newTriggerCount = diffResult.semantic.filter(function (s) { return s.type === 'NEW_TRIGGER'; }).length;
    }

    var unresolved = 0;
    var unresolvedDetails = [];
    if (analysis.diagnostics) {
      var codes = ['UNRESOLVED_REFERENCE', 'BOUNDARY_VIOLATION', 'DYNAMIC_EXECUTION', 'CYCLE_DETECTED'];
      var filtered = analysis.diagnostics.filter(function (d) { return codes.indexOf(d.code) !== -1; });
      unresolved = filtered.length;
      unresolvedDetails = filtered;
    }

    return {
      executionSurfaces: analysis.summary.executionSurfaces,
      withFindings: analysis.summary.withFindings,
      paths: analysis.summary.paths,
      highRiskPaths: analysis.summary.highRiskPaths,
      capabilities: allCaps,
      capabilityCount: allCaps.length,
      newSinceBaseline: newSinceBaseline,
      newCapList: newCapList,
      newTriggerCount: newTriggerCount,
      unresolved: unresolved,
      unresolvedDetails: unresolvedDetails,
      decision: analysis.summary.decision,
      graphSummary: { nodes: analysis.graph.nodes.length, edges: analysis.graph.edges.length }
    };
  }

  function renderDashboard(containerId, analysis, diffResult) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var m = computeDashboardMetrics(analysis, diffResult);
    if (!m) {
      container.innerHTML = '<div class="empty">No analysis yet.</div>';
      return;
    }
    container.innerHTML = '';
    var grid = el('div', 'dashboard-grid');

    var items = [
      {
        id: 'surfaces', label: 'Execution surfaces', value: String(m.executionSurfaces),
        foot: m.withFindings + ' with findings', hint: 'Files matching known globs — click to show file exhibit',
        target: 'files-heading', action: function () { scrollToId('files-heading'); },
        title: 'Execution surfaces are discovered files matching SURFACES globs; withFindings have extracted triggers.'
      },
      {
        id: 'paths', label: 'Execution paths', value: String(m.paths),
        foot: m.graphSummary.nodes + ' nodes · ' + m.graphSummary.edges + ' edges',
        hint: 'Derived paths: CONFIG → TRIGGER → COMMAND → SCRIPT … — click to see path list',
        target: 'paths-heading', action: function () { scrollToId('paths-heading'); },
        title: 'Paths are deterministic chains from actual graph edges, not decoration.'
      },
      {
        id: 'high', label: 'High-risk paths', value: String(m.highRiskPaths),
        foot: m.decision + ' decision',
        hint: m.highRiskPaths ? 'HIGH or CRITICAL — click to inspect' : 'No high-risk paths in this fixture',
        target: 'paths-heading', action: function () { scrollToId('paths-heading'); highlightHighRisk(); },
        title: 'HIGH/CRITICAL per unified rule table: automatic + network/process/remote/obfuscation/cross-tool'
      },
      {
        id: 'caps', label: 'Capabilities', value: String(m.capabilityCount),
        foot: m.capabilities.slice(0, 3).join(', ') || 'no caps detected',
        hint: 'Reachable capabilities from detectors — click to see chips',
        target: 'caps-heading', action: function () { scrollToId('caps-heading'); },
        title: 'Capabilities are evidence-backed (P0/P1/P2) — only shown when a detector fires on a reachable file.'
      },
      {
        id: 'new', label: 'New since baseline', value: String(m.newSinceBaseline),
        foot: m.newCapList.slice(0, 2).join(', ') || (diffResult ? 'no new caps' : 'no baseline yet'),
        hint: diffResult ? 'NEW_CAPABILITY count from real diff — click to see baseline diff' : 'Save a baseline first, then simulate change',
        target: 'baseline-heading', action: function () { scrollToId('baseline-heading'); },
        title: 'NEW_CAPABILITY is computed by comparing baseline capabilitySummary vs current reachable capabilities.'
      },
      {
        id: 'unresolved', label: 'Unresolved / needs review', value: String(m.unresolved),
        foot: m.unresolved ? 'UNRESOLVED / BOUNDARY / DYNAMIC / CYCLE' : 'all references resolved',
        hint: m.unresolved ? 'Click to inspect diagnostics' : 'No unresolved references',
        target: 'diag-heading', action: function () { scrollToId('diag-heading'); },
        title: 'Honest uncertainty: UNRESOLVED_REFERENCE, BOUNDARY_VIOLATION, DYNAMIC_EXECUTION, CYCLE_DETECTED.'
      }
    ];

    items.forEach(function (it) {
      var card = el('button', 'dash-card dash-card--' + it.id);
      card.type = 'button';
      card.setAttribute('aria-label', it.label + ': ' + it.value + '. ' + it.hint);
      card.title = it.title;
      card.dataset.metric = it.id;

      var label = el('div', 'dash-label', it.label);
      var value = el('div', 'dash-value', it.value);
      // highlight intent: high-risk critical if >0, new caps if >0, unresolved if >0
      if ((it.id === 'high' && m.highRiskPaths > 0) || (it.id === 'new' && m.newSinceBaseline > 0) || (it.id === 'unresolved' && m.unresolved > 0)) {
        value.classList.add('dash-value--alert');
      }
      if (it.id === 'high' && m.decision === 'BLOCK') value.classList.add('dash-value--critical');
      if (it.id === 'high' && m.decision === 'PASS') value.classList.add('dash-value--ok');

      var foot = el('div', 'dash-foot', it.foot);
      var hint = el('div', 'dash-hint', it.hint);
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(foot);
      card.appendChild(hint);
      // small trace link arrow
      var trace = el('span', 'dash-trace', '→ trace');
      trace.setAttribute('aria-hidden', 'true');
      card.appendChild(trace);

      card.addEventListener('click', it.action);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.action(); }
      });
      grid.appendChild(card);
    });

    container.appendChild(grid);

    // provenance line
    var prov = el('div', 'dash-prov');
    prov.innerHTML = 'All metrics derived from <code>HookAuditEngine.analyzeRepo()</code> — nodes/edges/paths/capabilities/diagnostics — no sampled or synthetic numbers. <span style="color:var(--text-dim)">Decisive for review: high-risk + newSinceBaseline + unresolved.</span>';
    container.appendChild(prov);

    // expose for tests
    container.dataset.surfaces = String(m.executionSurfaces);
    container.dataset.paths = String(m.paths);
    container.dataset.highRisk = String(m.highRiskPaths);
    container.dataset.caps = String(m.capabilityCount);
    container.dataset.newSinceBaseline = String(m.newSinceBaseline);
    container.dataset.unresolved = String(m.unresolved);
  }

  function scrollToId(id) {
    var elTarget = document.getElementById(id);
    if (elTarget) {
      elTarget.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      // focus heading for a11y
      elTarget.setAttribute('tabindex', '-1');
      try { elTarget.focus({ preventScroll: true }); } catch (e) { elTarget.focus(); }
      // highlight pulse
      var panel = elTarget.closest('.panel');
      if (panel) {
        panel.classList.add('panel--pulse');
        setTimeout(function () { panel.classList.remove('panel--pulse'); }, 1200);
      }
    }
  }
  function highlightHighRisk() {
    var list = document.getElementById('path-list');
    if (!list) return;
    var cards = list.querySelectorAll('.path-card');
    cards.forEach(function (c) {
      if (c.textContent.indexOf('CRITICAL') !== -1 || c.textContent.indexOf('HIGH') !== -1) {
        c.classList.add('path-card--highlight');
        setTimeout(function () { c.classList.remove('path-card--highlight'); }, 2000);
      }
    });
  }
  function prefersReducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  // ---------- 2. INTERACTIVE EXECUTION GRAPH (SVG) ----------
  function renderGraph(containerId, graph, analysis) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!graph || !graph.nodes || !graph.nodes.length) {
      wrap.appendChild(el('div', 'empty', 'No execution graph — repository has no analyzable triggers or no resolvable references.'));
      return;
    }

    // Build adjacency for depth
    var nodes = graph.nodes.slice();
    var edges = graph.edges.slice();
    var paths = graph.paths || [];

    // Map id -> node
    var nodeById = {};
    nodes.forEach(function (n) { nodeById[n.id] = n; });

    // Compute depth via BFS from repo
    var depth = {};
    var queue = [];
    var repoNode = nodes.find(function (n) { return n.kind === 'REPOSITORY'; });
    if (repoNode) { depth[repoNode.id] = 0; queue.push(repoNode.id); }
    else { // fallback: first node depth 0
      depth[nodes[0].id] = 0; queue.push(nodes[0].id);
    }
    var adj = {};
    edges.forEach(function (e) {
      if (!adj[e.from]) adj[e.from] = [];
      adj[e.from].push(e.to);
    });
    while (queue.length) {
      var cur = queue.shift();
      var children = adj[cur] || [];
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (depth[child] === undefined) {
          depth[child] = depth[cur] + 1;
          queue.push(child);
        }
      }
    }
    // For orphan nodes, assign by kind order
    var kindOrder = { 'REPOSITORY': 0, 'CONFIG': 1, 'TRIGGER': 2, 'COMMAND': 3, 'SCRIPT': 4, 'FILE': 4, 'CAPABILITY': 5, 'PROCESS': 4, 'NETWORK': 5 };
    nodes.forEach(function (n) {
      if (depth[n.id] === undefined) {
        depth[n.id] = kindOrder[n.kind] !== undefined ? kindOrder[n.kind] : 4;
      }
    });

    // Assign y within each depth layer
    var layers = {};
    nodes.forEach(function (n) {
      var d = depth[n.id];
      if (!layers[d]) layers[d] = [];
      layers[d].push(n);
    });
    // sort each layer deterministically by label/path/id
    Object.keys(layers).forEach(function (dk) {
      layers[dk].sort(function (a, b) { return (a.label + a.id).localeCompare(b.label + b.id); });
    });

    var depthKeys = Object.keys(layers).map(Number).sort(function (a, b) { return a - b; });
    var maxLayerSize = Math.max.apply(null, depthKeys.map(function (k) { return layers[k].length; }));

    // Layout constants
    var colW = 150;
    var rowH = 56;
    var padX = 40;
    var padY = 40;
    var nodeW = 110;
    var nodeH = 34;
    var width = Math.max(720, depthKeys.length * colW + padX * 2 + 60);
    var height = Math.max(220, maxLayerSize * rowH + padY * 2 + 40);
    // cap width for readability, allow scroll
    if (width < 900 && depthKeys.length <= 6) width = 900;

    // Create controls
    var controls = el('div', 'graph-controls');
    var legend = el('div', 'graph-legend');
    [
      { kind: 'CONFIG', label: 'CONFIG', cls: 'legend--config' },
      { kind: 'TRIGGER', label: 'TRIGGER', cls: 'legend--trigger' },
      { kind: 'COMMAND', label: 'COMMAND', cls: 'legend--command' },
      { kind: 'SCRIPT', label: 'SCRIPT', cls: 'legend--script' },
      { kind: 'CAPABILITY', label: 'CAPABILITY', cls: 'legend--cap' },
      { kind: 'NETWORK', label: 'NETWORK', cls: 'legend--network' }
    ].forEach(function (it) {
      var s = el('span', 'legend-item ' + it.cls, it.label);
      legend.appendChild(s);
    });
    var edgeLegend = el('div', 'graph-legend');
    [
      { k: 'CONTAINS', l: 'CONTAINS' },
      { k: 'TRIGGERS', l: 'TRIGGERS' },
      { k: 'EXECUTES', l: 'EXECUTES' },
      { k: 'REFERENCES', l: 'REFERENCES' },
      { k: 'CONNECTS_TO', l: 'CONNECTS_TO' }
    ].forEach(function (it) {
      var s = el('span', 'legend-edge', it.l);
      edgeLegend.appendChild(s);
    });

    var filterBar = el('div', 'graph-filters');
    var btnAll = el('button', 'btn btn--sm is-active', 'All');
    btnAll.type = 'button'; btnAll.dataset.filter = 'all';
    var btnHigh = el('button', 'btn btn--sm', 'High-risk only');
    btnHigh.type = 'button'; btnHigh.dataset.filter = 'high';
    var btnNetwork = el('button', 'btn btn--sm', 'Network paths');
    btnNetwork.type = 'button'; btnNetwork.dataset.filter = 'network';
    filterBar.appendChild(el('span', 'graph-filter-label', 'Filter:'));
    filterBar.appendChild(btnAll); filterBar.appendChild(btnHigh); filterBar.appendChild(btnNetwork);
    var hint = el('div', 'graph-hint', 'Click or press Enter on a node to inspect. Arrow keys move focus. High-risk edges are emphasized.');
    hint.setAttribute('role', 'note');

    controls.appendChild(legend);
    controls.appendChild(edgeLegend);
    controls.appendChild(filterBar);
    wrap.appendChild(controls);
    wrap.appendChild(hint);

    // SVG container with scroll
    var svgWrap = el('div', 'graph-svg-wrap');
    svgWrap.setAttribute('role', 'region');
    svgWrap.setAttribute('aria-label', 'Execution graph — use Tab to reach nodes, Enter to inspect');
    svgWrap.tabIndex = 0;
    wrap.appendChild(svgWrap);

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Execution graph: ' + nodes.length + ' nodes, ' + edges.length + ' edges, ' + paths.length + ' paths');
    svg.classList.add('graph-svg');
    svgWrap.appendChild(svg);

    // defs for arrows
    var defs = document.createElementNS(NS, 'defs');
    function marker(id, color) {
      var m = document.createElementNS(NS, 'marker');
      m.setAttribute('id', id); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '8'); m.setAttribute('markerHeight', '8'); m.setAttribute('orient', 'auto');
      var p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); p.setAttribute('fill', color);
      m.appendChild(p); return m;
    }
    defs.appendChild(marker('arrow-default', '#94a3b8'));
    defs.appendChild(marker('arrow-high', '#991b1b'));
    defs.appendChild(marker('arrow-network', '#9a3412'));
    defs.appendChild(marker('arrow-cap', '#475569'));
    svg.appendChild(defs);

    // Compute positions
    var pos = {}; // id -> {x,y}
    depthKeys.forEach(function (d, di) {
      var layer = layers[d];
      var colX = padX + di * colW + 20;
      // center layer vertically
      var totalH = layer.length * rowH;
      var startY = padY + (height - padY * 2 - totalH) / 2 + rowH / 2;
      layer.forEach(function (node, idx) {
        var y = startY + idx * rowH;
        pos[node.id] = { x: colX, y: y, depth: d };
      });
    });

    // Determine high-risk node ids for filtering
    var highRiskNodeIds = new Set();
    var networkNodeIds = new Set();
    var pathByNode = {}; // nodeId -> [pathIds]
    paths.forEach(function (p) {
      p.nodes.forEach(function (nid) {
        if (!pathByNode[nid]) pathByNode[nid] = [];
        pathByNode[nid].push(p.id);
      });
      if (p.risk === 'HIGH' || p.risk === 'CRITICAL') p.nodes.forEach(function (nid) { highRiskNodeIds.add(nid); });
      if (p.capabilities.indexOf('NETWORK_ACCESS') !== -1 || p.capabilities.indexOf('REMOTE_DOWNLOAD') !== -1) p.nodes.forEach(function (nid) { networkNodeIds.add(nid); });
    });
    // Also mark capability nodes that are network-related
    nodes.forEach(function (n) {
      if (n.kind === 'CAPABILITY' && (n.path === 'NETWORK_ACCESS' || n.path === 'REMOTE_DOWNLOAD' || n.path === 'RUNTIME_BOOTSTRAP')) {
        networkNodeIds.add(n.id);
      }
    });

    // Draw edges first (behind nodes)
    var edgeEls = [];
    edges.forEach(function (e) {
      var from = pos[e.from], to = pos[e.to];
      if (!from || !to) return;
      var line = document.createElementNS(NS, 'g');
      line.classList.add('graph-edge-group');
      line.dataset.from = e.from; line.dataset.to = e.to; line.dataset.kind = e.kind;
      var isHigh = highRiskNodeIds.has(e.from) && highRiskNodeIds.has(e.to);
      var isNetwork = e.kind === 'CONNECTS_TO' && networkNodeIds.has(e.to);
      var pathEl = document.createElementNS(NS, 'path');
      var x1 = from.x + nodeW / 2;
      var y1 = from.y;
      var x2 = to.x - nodeW / 2;
      var y2 = to.y;
      // curved path
      var mx = (x1 + x2) / 2;
      var d = 'M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2;
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke-width', isHigh ? '2.2' : '1.4');
      if (isHigh) { pathEl.setAttribute('stroke', '#991b1b'); pathEl.setAttribute('marker-end', 'url(#arrow-high)'); }
      else if (e.kind === 'CONNECTS_TO') { pathEl.setAttribute('stroke', '#64748b'); pathEl.setAttribute('stroke-dasharray', '4 3'); pathEl.setAttribute('marker-end', 'url(#arrow-cap)'); }
      else if (isNetwork) { pathEl.setAttribute('stroke', '#9a3412'); pathEl.setAttribute('marker-end', 'url(#arrow-network)'); }
      else { pathEl.setAttribute('stroke', '#94a3b8'); pathEl.setAttribute('marker-end', 'url(#arrow-default)'); }
      pathEl.classList.add('graph-edge');
      if (isHigh) pathEl.classList.add('graph-edge--high');
      if (e.diagnostic) pathEl.classList.add('graph-edge--diagnostic');
      line.appendChild(pathEl);
      // edge label on hover
      var title = document.createElementNS(NS, 'title');
      title.textContent = e.kind + ': ' + e.from + ' → ' + e.to + (e.evidence && e.evidence.path ? ' (' + e.evidence.path + ')' : '') + (e.diagnostic ? ' [' + e.diagnostic + ']' : '');
      line.appendChild(title);
      // small kind label at midpoint
      var text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(mx));
      text.setAttribute('y', String((y1 + y2) / 2 - 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '8');
      text.setAttribute('font-family', 'ui-monospace, monospace');
      text.setAttribute('fill', '#64748b');
      text.textContent = e.kind;
      text.classList.add('graph-edge-label');
      line.appendChild(text);

      svg.appendChild(line);
      edgeEls.push(line);
    });

    // Draw nodes
    var nodeEls = [];
    var selectedNodeId = null;
    var details = el('div', 'graph-details');
    details.setAttribute('aria-live', 'polite');
    details.setAttribute('role', 'region');
    details.setAttribute('aria-label', 'Node details');
    details.innerHTML = '<div class="empty" style="margin:0">Select a node to see evidence, capabilities, and reachable paths. Use Tab / arrow keys to navigate.</div>';
    wrap.appendChild(details);

    function nodeFill(kind, label) {
      if (kind === 'REPOSITORY') return '#0f172a';
      if (kind === 'CONFIG') return '#ffffff';
      if (kind === 'TRIGGER') return '#0f172a';
      if (kind === 'COMMAND') return '#f1f5f9';
      if (kind === 'SCRIPT') return '#e0f2fe';
      if (kind === 'FILE') return '#f8fafc';
      if (kind === 'CAPABILITY') {
        if (label === 'NETWORK_ACCESS' || label === 'REMOTE_DOWNLOAD') return '#ffedd5';
        if (label === 'OBFUSCATION' || label === 'CREDENTIAL_ACCESS_SIGNAL') return '#fee2e2';
        if (label === 'CROSS_TOOL_LINK') return '#fef3c7';
        return '#f1f5f9';
      }
      return '#ffffff';
    }
    function nodeStroke(kind) {
      if (kind === 'REPOSITORY' || kind === 'TRIGGER') return '#0f172a';
      if (kind === 'SCRIPT') return '#0ea5e9';
      if (kind === 'CAPABILITY') return '#64748b';
      return '#cbd5e1';
    }
    function nodeLabel(kind, n) {
      var l = n.label || n.path || n.id;
      if (kind === 'COMMAND') {
        return l.length > 22 ? l.slice(0, 22) + '…' : l;
      }
      if (l.length > 18) return l.slice(0, 18) + '…';
      return l;
    }

    // Create focusable groups for each node
    var nodeOrder = nodes.slice().sort(function (a, b) {
      if (depth[a.id] !== depth[b.id]) return depth[a.id] - depth[b.id];
      return pos[a.id].y - pos[b.id].y;
    });

    nodeOrder.forEach(function (n) {
      var p = pos[n.id];
      var g = document.createElementNS(NS, 'g');
      g.classList.add('graph-node');
      g.classList.add('graph-node--' + n.kind.toLowerCase());
      if (highRiskNodeIds.has(n.id)) g.classList.add('graph-node--high');
      if (networkNodeIds.has(n.id)) g.classList.add('graph-node--network');
      g.setAttribute('transform', 'translate(' + (p.x - nodeW / 2) + ',' + (p.y - nodeH / 2) + ')');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      var capStr = (n.capabilities && n.capabilities.length) ? ' · ' + n.capabilities.join(', ') : '';
      g.setAttribute('aria-label', n.kind + ' ' + (n.label || n.path) + capStr + ' — press Enter to inspect');
      g.dataset.nodeId = n.id;
      g.dataset.kind = n.kind;

      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('width', String(nodeW));
      rect.setAttribute('height', String(nodeH));
      rect.setAttribute('rx', n.kind === 'CAPABILITY' ? '16' : n.kind === 'TRIGGER' ? '16' : '8');
      rect.setAttribute('ry', n.kind === 'CAPABILITY' ? '16' : n.kind === 'TRIGGER' ? '16' : '8');
      rect.setAttribute('fill', nodeFill(n.kind, n.label || n.path));
      rect.setAttribute('stroke', nodeStroke(n.kind));
      rect.setAttribute('stroke-width', highRiskNodeIds.has(n.id) ? '1.8' : '1.2');
      if (n.kind === 'TRIGGER') rect.setAttribute('fill', '#0f172a');
      g.appendChild(rect);

      // small kind badge at top
      var kindText = document.createElementNS(NS, 'text');
      kindText.setAttribute('x', '8');
      kindText.setAttribute('y', '10');
      kindText.setAttribute('font-size', '6.5');
      kindText.setAttribute('font-family', 'ui-monospace, monospace');
      kindText.setAttribute('letter-spacing', '0.04em');
      kindText.setAttribute('fill', n.kind === 'TRIGGER' || n.kind === 'REPOSITORY' ? '#e2e8f0' : '#64748b');
      kindText.textContent = n.kind;
      g.appendChild(kindText);

      var labelText = document.createElementNS(NS, 'text');
      labelText.setAttribute('x', String(nodeW / 2));
      labelText.setAttribute('y', '21');
      labelText.setAttribute('text-anchor', 'middle');
      labelText.setAttribute('font-size', '7.5');
      labelText.setAttribute('font-family', 'ui-monospace, monospace');
      labelText.setAttribute('font-weight', '600');
      labelText.setAttribute('fill', n.kind === 'TRIGGER' || n.kind === 'REPOSITORY' ? '#f8fafc' : '#0f172a');
      labelText.textContent = nodeLabel(n.kind, n);
      g.appendChild(labelText);

      // capability dots for nodes that have caps
      if (n.capabilities && n.capabilities.length) {
        var capText = document.createElementNS(NS, 'text');
        capText.setAttribute('x', String(nodeW / 2));
        capText.setAttribute('y', '29');
        capText.setAttribute('text-anchor', 'middle');
        capText.setAttribute('font-size', '6');
        capText.setAttribute('font-family', 'ui-monospace, monospace');
        capText.setAttribute('fill', '#475569');
        var short = n.capabilities.slice(0, 2).join(', ');
        if (n.capabilities.length > 2) short += ' +' + (n.capabilities.length - 2);
        capText.textContent = short;
        g.appendChild(capText);
      }

      var title = document.createElementNS(NS, 'title');
      title.textContent = n.kind + ': ' + (n.label || n.path) + (n.capabilities && n.capabilities.length ? ' — ' + n.capabilities.join(', ') : '') + (pathByNode[n.id] ? ' — in ' + pathByNode[n.id].length + ' path(s)' : '');
      g.appendChild(title);

      // Interactions
      function selectNode() {
        // clear previous
        if (selectedNodeId) {
          var prev = svg.querySelector('[data-node-id="' + selectedNodeId + '"]');
          if (prev) prev.classList.remove('is-selected');
        }
        selectedNodeId = n.id;
        g.classList.add('is-selected');
        // highlight edges incident to this node
        edgeEls.forEach(function (eg) {
          eg.classList.remove('is-highlight');
          if (eg.dataset.from === n.id || eg.dataset.to === n.id) eg.classList.add('is-highlight');
        });
        // highlight related nodes in same paths
        var relatedIds = new Set([n.id]);
        var relatedPaths = pathByNode[n.id] || [];
        relatedPaths.forEach(function (pid) {
          var p = paths.find(function (x) { return x.id === pid; });
          if (p) p.nodes.forEach(function (nid) { relatedIds.add(nid); });
        });
        nodeEls.forEach(function (ng) {
          ng.classList.remove('is-related');
          if (relatedIds.has(ng.dataset.nodeId) && ng.dataset.nodeId !== n.id) ng.classList.add('is-related');
        });
        renderDetails(n, relatedPaths, paths);
        // trace link: if node path corresponds to a file, offer to open
        details.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      }
      g.addEventListener('click', selectNode);
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          var idx = nodeOrder.indexOf(n);
          var next = nodeOrder[(idx + 1) % nodeOrder.length];
          var elNext = svg.querySelector('[data-node-id="' + next.id + '"]');
          if (elNext) elNext.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          var idx2 = nodeOrder.indexOf(n);
          var prev = nodeOrder[(idx2 - 1 + nodeOrder.length) % nodeOrder.length];
          var elPrev = svg.querySelector('[data-node-id="' + prev.id + '"]');
          if (elPrev) elPrev.focus();
        }
      });
      g.addEventListener('focus', function () {
        g.classList.add('is-focused');
      });
      g.addEventListener('blur', function () {
        g.classList.remove('is-focused');
      });

      svg.appendChild(g);
      nodeEls.push(g);
    });

    // Filter interactions
    function applyFilter(kind) {
      [btnAll, btnHigh, btnNetwork].forEach(function (b) { b.classList.remove('is-active'); });
      if (kind === 'all') btnAll.classList.add('is-active');
      if (kind === 'high') btnHigh.classList.add('is-active');
      if (kind === 'network') btnNetwork.classList.add('is-active');

      nodeEls.forEach(function (ng) {
        var nid = ng.dataset.nodeId;
        var show = true;
        if (kind === 'high') show = highRiskNodeIds.has(nid);
        if (kind === 'network') show = networkNodeIds.has(nid);
        ng.style.opacity = show ? '1' : '0.18';
        ng.style.pointerEvents = show ? 'auto' : 'none';
        ng.setAttribute('aria-hidden', show ? 'false' : 'true');
      });
      edgeEls.forEach(function (eg) {
        var show = true;
        if (kind === 'high') show = highRiskNodeIds.has(eg.dataset.from) && highRiskNodeIds.has(eg.dataset.to);
        if (kind === 'network') show = networkNodeIds.has(eg.dataset.from) || networkNodeIds.has(eg.dataset.to);
        eg.style.opacity = show ? '1' : '0.12';
      });
    }
    btnAll.addEventListener('click', function () { applyFilter('all'); });
    btnHigh.addEventListener('click', function () { applyFilter('high'); });
    btnNetwork.addEventListener('click', function () { applyFilter('network'); });

    // Also add subtle depth labels at top
    var axis = el('div', 'graph-axis');
    depthKeys.forEach(function (d, di) {
      var colLabel = el('span', 'axis-col');
      // infer col name by most common kind at that depth
      var kinds = layers[d].map(function (n) { return n.kind; });
      var uniqKind = kinds[0] || String(d);
      // count
      var cnt = layers[d].length;
      colLabel.textContent = uniqKind + ' (' + cnt + ')';
      colLabel.setAttribute('aria-hidden', 'true');
      axis.appendChild(colLabel);
      // keep in DOM for a11y but visually position via CSS grid? Instead append to wrap as flex
    });
    // insert axis before svgWrap
    svgWrap.parentNode.insertBefore(axis, svgWrap);

    // keyboard help for svgWrap
    svgWrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var first = nodeOrder[0];
        if (first) {
          var elFirst = svg.querySelector('[data-node-id="' + first.id + '"]');
          if (elFirst) elFirst.focus();
        }
      }
    });

    function renderDetails(node, relatedPathIds, allPaths) {
      details.innerHTML = '';
      var head = el('div', 'graph-details-head');
      var kindBadge = el('span', 'graph-kind-badge graph-kind-badge--' + node.kind.toLowerCase(), node.kind);
      head.appendChild(kindBadge);
      var titleEl = el('strong', null, node.label || node.path || node.id);
      titleEl.style.fontFamily = 'var(--mono)';
      titleEl.style.fontSize = '.82rem';
      head.appendChild(titleEl);
      if (node.capabilities && node.capabilities.length) {
        var capsWrap = el('div', 'graph-details-caps');
        node.capabilities.forEach(function (cap) {
          capsWrap.appendChild(el('span', 'cap-chip ' + capChipClass(cap), cap));
        });
        head.appendChild(capsWrap);
      }
      details.appendChild(head);

      // Evidence for node
      if (node.path) {
        var pathLine = el('div', 'graph-details-line');
        pathLine.innerHTML = '<span style="color:var(--text-muted); font-family:var(--mono); font-size:.74rem">path</span> <code style="font-family:var(--mono); font-size:.78rem">' + escapeHtml(node.path) + '</code>';
        details.appendChild(pathLine);
      }
      if (node.confidence) {
        var confLine = el('div', 'graph-details-line');
        confLine.innerHTML = '<span style="color:var(--text-muted); font-size:.76rem">confidence</span> <span class="conf-chip conf-chip--' + node.confidence.toLowerCase() + '">' + node.confidence + '</span>';
        details.appendChild(confLine);
      }

      // Paths containing this node
      if (relatedPathIds.length) {
        var pathsTitle = el('div', 'graph-details-title', relatedPathIds.length + ' execution path(s) through this node:');
        details.appendChild(pathsTitle);
        var list = el('div', 'graph-details-paths');
        relatedPathIds.slice(0, 6).forEach(function (pid) {
          var p = allPaths.find(function (x) { return x.id === pid; });
          if (!p) return;
          var card = el('div', 'mini-path-card');
          var row = el('div', 'mini-path-head');
          row.appendChild(el('span', 'badge ' + riskClass(p.risk), p.risk));
          row.appendChild(el('span', 'mini-path-trigger', p.trigger));
          row.appendChild(el('span', 'badge badge--conf', p.confidence));
          card.appendChild(row);
          var chain = el('div', 'mini-path-chain');
          p.chain.forEach(function (c, i) {
            var s = el('span', 'mini-step', c.length > 30 ? c.slice(0, 30) + '…' : c);
            chain.appendChild(s);
            if (i < p.chain.length - 1) chain.appendChild(el('span', 'mini-arrow', '→'));
          });
          card.appendChild(chain);
          if (p.capabilities && p.capabilities.length) {
            var capWrap = el('div', 'mini-path-caps');
            p.capabilities.forEach(function (cap) { capWrap.appendChild(el('span', 'cap-chip ' + capChipClass(cap), cap)); });
            card.appendChild(capWrap);
          }
          list.appendChild(card);
        });
        if (relatedPathIds.length > 6) {
          list.appendChild(el('div', 'graph-details-more', '…and ' + (relatedPathIds.length - 6) + ' more path(s) not shown'));
        }
        details.appendChild(list);
      } else {
        details.appendChild(el('div', 'graph-details-note', 'No execution path traverses this node alone — it may be an orphan CONFIG or capability summary node.'));
      }

      // Trace actions
      var actions = el('div', 'graph-details-actions');
      if (node.path && node.path.indexOf('/') !== -1) {
        var btnFile = el('button', 'btn btn--sm');
        btnFile.type = 'button';
        btnFile.textContent = 'Open in file exhibit →';
        btnFile.addEventListener('click', function () {
          // try to find file in file exhibit
          var fileList = document.getElementById('file-list');
          if (fileList) {
            var btns = fileList.querySelectorAll('.file-btn');
            for (var i = 0; i < btns.length; i++) {
              if (btns[i].textContent.indexOf(node.path) !== -1) { btns[i].click(); scrollToId('files-heading'); break; }
            }
          }
        });
        actions.appendChild(btnFile);
      }
      var btnClose = el('button', 'btn btn--sm btn--ghost');
      btnClose.type = 'button';
      btnClose.textContent = 'Clear highlight';
      btnClose.addEventListener('click', function () {
        nodeEls.forEach(function (ng) { ng.classList.remove('is-selected', 'is-related'); });
        edgeEls.forEach(function (eg) { eg.classList.remove('is-highlight'); });
        selectedNodeId = null;
        details.innerHTML = '<div class="empty" style="margin:0">Select a node to see evidence, capabilities, and reachable paths.</div>';
      });
      actions.appendChild(btnClose);
      details.appendChild(actions);
    }

    // summary provenance
    var prov = el('div', 'graph-prov');
    prov.textContent = 'Graph rendered from analysis.graph (nodes/edges/paths) — deterministic layout by depth, not a mock. Edges match real resolver trace; grouping by kind preserves topology.';
    wrap.appendChild(prov);

    // expose node count for tests
    wrap.dataset.nodes = String(nodes.length);
    wrap.dataset.edges = String(edges.length);
    wrap.dataset.paths = String(paths.length);
  }

  // ---------- 3. CAPABILITY DIFF VIZ ----------
  function renderCapabilityDiff(containerId, baselineRecord, analysis) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!baselineRecord) {
      container.innerHTML = '<div class="empty" style="margin:0">No baseline yet — capability diff will appear after you save a baseline and simulate a change.</div>';
      return;
    }
    if (!analysis) return;

    var baselineCaps = baselineRecord.capabilitySummary || [];
    var currentSet = new Set();
    analysis.graph.paths.forEach(function (p) { p.capabilities.forEach(function (c) { currentSet.add(c); }); });
    analysis.results.forEach(function (r) { (r.capabilities || []).forEach(function (c) { currentSet.add(c); }); });
    var currentCaps = Array.from(currentSet).sort();

    var allCapsUnion = Array.from(new Set([].concat(baselineCaps).concat(currentCaps))).sort();
    if (!allCapsUnion.length) {
      container.innerHTML = '<div class="empty" style="margin:0">No capabilities in baseline or current — diff shows no change.</div>';
      return;
    }

    var tableWrap = el('div', 'table-wrap');
    tableWrap.style.marginTop = '8px';
    var table = document.createElement('table');
    table.setAttribute('aria-label', 'Capability diff matrix — baseline vs current');
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['Capability', 'Baseline', 'Current', 'Status', 'Evidence'].forEach(function (h) {
      var th = document.createElement('th'); th.textContent = h; hr.appendChild(th);
    });
    thead.appendChild(hr); table.appendChild(thead);
    var tbody = document.createElement('tbody');

    var newCount = 0;
    allCapsUnion.forEach(function (cap) {
      var inBase = baselineCaps.indexOf(cap) !== -1;
      var inCurr = currentCaps.indexOf(cap) !== -1;
      var tr = document.createElement('tr');
      if (inCurr && !inBase) tr.classList.add('row--added');
      if (!inCurr && inBase) tr.classList.add('row--removed');

      var tdCap = document.createElement('td');
      tdCap.className = 'mono';
      var chip = el('span', 'cap-chip ' + capChipClass(cap), cap);
      tdCap.appendChild(chip);
      tr.appendChild(tdCap);

      var tdBase = document.createElement('td'); tdBase.textContent = inBase ? 'present' : '—'; tdBase.style.fontSize = '.78rem'; tdBase.style.color = inBase ? 'var(--text)' : 'var(--text-dim)'; tr.appendChild(tdBase);
      var tdCurr = document.createElement('td'); tdCurr.textContent = inCurr ? 'present' : '—'; tdCurr.style.fontSize = '.78rem'; tdCurr.style.color = inCurr ? 'var(--text)' : 'var(--text-dim)'; tr.appendChild(tdCurr);

      var tdStatus = document.createElement('td');
      if (inCurr && !inBase) { var s = el('span', 'diff-tag diff-tag--new', 'NEW_CAPABILITY'); tdStatus.appendChild(s); newCount++; }
      else if (!inCurr && inBase) { var s2 = el('span', 'diff-tag diff-tag--removed', 'REMOVED'); tdStatus.appendChild(s2); }
      else if (inCurr && inBase) { tdStatus.textContent = 'unchanged'; tdStatus.style.color = 'var(--text-muted)'; tdStatus.style.fontSize = '.78rem'; }
      else { tdStatus.textContent = '—'; }
      tr.appendChild(tdStatus);

      var tdEv = document.createElement('td'); tdEv.style.fontSize = '.76rem';
      // find evidence for cap in current analysis
      var evs = [];
      analysis.results.forEach(function (r) {
        r.findings.forEach(function (f) {
          if (f.capabilities && f.capabilities.indexOf(cap) !== -1) {
            evs.push(r.file + ' ' + (f.field || ''));
          }
        });
      });
      tdEv.textContent = evs.slice(0, 2).join(', ') || '—';
      tdEv.title = evs.join(', ');
      tr.appendChild(tdEv);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    var summary = el('div', 'cap-diff-summary');
    summary.style.marginTop = '8px';
    summary.style.fontSize = '.78rem';
    if (newCount) {
      summary.innerHTML = '<strong style="color:var(--critical)">' + newCount + ' NEW_CAPABILITY</strong> since baseline — from <code style="font-family:var(--mono)">' + escapeHtml(baselineCaps.join(', ') || '(none)') + '</code> → <code style="font-family:var(--mono)">' + escapeHtml(currentCaps.join(', ') || '(none)') + '</code>. This is the signal that matters even if heuristic score is low.';
    } else {
      summary.textContent = 'No new capabilities since baseline. Baseline caps: ' + (baselineCaps.join(', ') || '(none)') + ' → current: ' + (currentCaps.join(', ') || '(none)') ;
      summary.style.color = 'var(--text-muted)';
    }
    container.appendChild(summary);

    // matrix bar viz: tiny heatmap row
    var bar = el('div', 'cap-matrix-bar');
    bar.setAttribute('aria-hidden', 'true');
    allCapsUnion.forEach(function (cap) {
      var inBase = baselineCaps.indexOf(cap) !== -1;
      var inCurr = currentCaps.indexOf(cap) !== -1;
      var cell = el('span', 'cap-matrix-cell');
      if (inCurr && !inBase) { cell.classList.add('cap-matrix-cell--new'); cell.title = cap + ' NEW'; }
      else if (inCurr && inBase) { cell.classList.add('cap-matrix-cell--same'); cell.title = cap + ' same'; }
      else if (!inCurr && inBase) { cell.classList.add('cap-matrix-cell--removed'); cell.title = cap + ' removed'; }
      else cell.classList.add('cap-matrix-cell--none');
      bar.appendChild(cell);
    });
    container.appendChild(bar);
    container.dataset.newCaps = String(newCount);
  }

  // ---------- 4. EVIDENCE EXPLORER HELPERS ----------
  // The richer explorer is mostly implemented via enhanced demo.js table with toolbar.
  // This module provides filter logic that demo.js can reuse.
  function filterEvidenceRows(rows, query, detectorFilter, confidenceFilter, fileFilter) {
    var q = (query || '').toLowerCase().trim();
    return rows.filter(function (r) {
      if (detectorFilter && detectorFilter !== 'all' && r.detector !== detectorFilter) return false;
      if (confidenceFilter && confidenceFilter !== 'all' && r.confidence !== confidenceFilter) return false;
      if (fileFilter && fileFilter !== 'all' && r.file !== fileFilter) return false;
      if (q) {
        var hay = (r.file + ' ' + r.field + ' ' + r.detector + ' ' + r.reason + ' ' + r.excerpt).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // expose
  window.HookAuditDashboard = {
    computeDashboardMetrics: computeDashboardMetrics,
    renderDashboard: renderDashboard,
    renderGraph: renderGraph,
    renderCapabilityDiff: renderCapabilityDiff,
    filterEvidenceRows: filterEvidenceRows,
    prefersReducedMotion: prefersReducedMotion
  };
})();
