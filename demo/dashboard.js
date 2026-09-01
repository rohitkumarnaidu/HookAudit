/* HookAudit — Thin dashboard & P2 visualizations (zero-dep, static)
 * Provides: dashboard metrics, interactive execution graph (SVG with Pan & Zoom), capability diff viz
 * All data derived from HookAuditEngine output — no fake metrics, no external fetches.
 * Accessibility: keyboard nav, focus-visible, ARIA, respects prefers-reduced-motion.
 * Visual: Modern Dark Developer Workspace (Deep Slate / OLED) — WCAG AAA.
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
        id: 'surfaces', label: 'Surfaces', value: String(m.executionSurfaces),
        foot: m.withFindings + ' with findings', hint: 'Discovered config & script surfaces',
        action: function () { scrollToId('files-heading'); }
      },
      {
        id: 'paths', label: 'Paths', value: String(m.paths),
        foot: m.graphSummary.nodes + ' nodes · ' + m.graphSummary.edges + ' edges',
        hint: 'Resolved deterministic paths',
        action: function () { scrollToId('paths-heading'); }
      },
      {
        id: 'high', label: 'High Risk', value: String(m.highRiskPaths),
        foot: m.decision + ' decision',
        hint: m.highRiskPaths ? 'CRITICAL / HIGH' : 'No high-risk paths',
        action: function () { scrollToId('paths-heading'); highlightHighRisk(); }
      },
      {
        id: 'caps', label: 'Capabilities', value: String(m.capabilityCount),
        foot: m.capabilities.slice(0, 2).join(', ') || 'none',
        hint: 'Reachable capabilities',
        action: function () { scrollToId('caps-heading'); }
      },
      {
        id: 'new', label: 'Drift Caps', value: String(m.newSinceBaseline),
        foot: m.newCapList.slice(0, 2).join(', ') || (diffResult ? 'no new caps' : 'no baseline'),
        hint: 'NEW_CAPABILITY signals',
        action: function () { scrollToId('baseline-heading'); }
      },
      {
        id: 'unresolved', label: 'Diagnostics', value: String(m.unresolved),
        foot: m.unresolved ? 'Unresolved / Boundary' : 'all clean',
        hint: 'Diagnostics & boundary alerts',
        action: function () { scrollToId('diag-heading'); }
      }
    ];

    items.forEach(function (it) {
      var card = el('button', 'dash-card dash-card--' + it.id);
      card.type = 'button';
      card.setAttribute('aria-label', it.label + ': ' + it.value + '. ' + it.hint);
      card.dataset.metric = it.id;

      var label = el('div', 'dash-label', it.label);
      var value = el('div', 'dash-value', it.value);
      if ((it.id === 'high' && m.highRiskPaths > 0) || (it.id === 'new' && m.newSinceBaseline > 0) || (it.id === 'unresolved' && m.unresolved > 0)) {
        value.classList.add('dash-value--alert');
      }
      if (it.id === 'high' && m.decision === 'BLOCK') value.classList.add('dash-value--critical');
      if (it.id === 'high' && m.decision === 'PASS') value.classList.add('dash-value--ok');

      var foot = el('div', 'dash-foot', it.foot);
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(foot);

      card.addEventListener('click', it.action);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.action(); }
      });
      grid.appendChild(card);
    });

    container.appendChild(grid);

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
      elTarget.setAttribute('tabindex', '-1');
      try { elTarget.focus({ preventScroll: true }); } catch (e) { elTarget.focus(); }
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

  // ---------- 2. INTERACTIVE EXECUTION GRAPH (SVG + PAN/ZOOM) ----------
  function renderGraph(containerId, graph, analysis) {
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!graph || !graph.nodes || !graph.nodes.length) {
      wrap.appendChild(el('div', 'empty', 'No execution graph — repository has no analyzable triggers or no resolvable references.'));
      return;
    }

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
    else { depth[nodes[0].id] = 0; queue.push(nodes[0].id); }

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
    var kindOrder = { 'REPOSITORY': 0, 'CONFIG': 1, 'TRIGGER': 2, 'COMMAND': 3, 'SCRIPT': 4, 'FILE': 4, 'CAPABILITY': 5 };
    nodes.forEach(function (n) {
      if (depth[n.id] === undefined) {
        depth[n.id] = kindOrder[n.kind] !== undefined ? kindOrder[n.kind] : 4;
      }
    });

    var layers = {};
    nodes.forEach(function (n) {
      var d = depth[n.id];
      if (!layers[d]) layers[d] = [];
      layers[d].push(n);
    });
    Object.keys(layers).forEach(function (dk) {
      layers[dk].sort(function (a, b) { return (a.label + a.id).localeCompare(b.label + b.id); });
    });

    var depthKeys = Object.keys(layers).map(Number).sort(function (a, b) { return a - b; });
    var maxLayerSize = Math.max.apply(null, depthKeys.map(function (k) { return layers[k].length; }));

    // Dimensions
    var colW = 165;
    var rowH = 62;
    var padX = 50;
    var padY = 50;
    var nodeW = 125;
    var nodeH = 38;
    var width = Math.max(900, depthKeys.length * colW + padX * 2 + 80);
    var height = Math.max(380, maxLayerSize * rowH + padY * 2 + 60);

    // Floating overlay filter bar
    var filterBar = el('div', 'graph-filter-overlay');
    var btnAll = el('button', 'btn btn-sm btn-subtle is-active', 'All');
    btnAll.dataset.filter = 'all';
    var btnHigh = el('button', 'btn btn-sm btn-subtle', 'High Risk');
    btnHigh.dataset.filter = 'high';
    var btnNetwork = el('button', 'btn btn-sm btn-subtle', 'Network');
    btnNetwork.dataset.filter = 'network';
    var btnProcess = el('button', 'btn btn-sm btn-subtle', 'Process');
    btnProcess.dataset.filter = 'process';
    var btnUnres = el('button', 'btn btn-sm btn-subtle', 'Unresolved');
    btnUnres.dataset.filter = 'unresolved';

    filterBar.appendChild(btnAll);
    filterBar.appendChild(btnHigh);
    filterBar.appendChild(btnNetwork);
    filterBar.appendChild(btnProcess);
    filterBar.appendChild(btnUnres);
    wrap.appendChild(filterBar);

    // Viewport with Pan & Zoom
    var svgWrap = el('div', 'topology-viewport');
    svgWrap.tabIndex = 0;
    wrap.appendChild(svgWrap);

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.classList.add('graph-svg');
    svgWrap.appendChild(svg);

    // Defs for arrows and gradients
    var defs = document.createElementNS(NS, 'defs');
    function marker(id, color) {
      var m = document.createElementNS(NS, 'marker');
      m.setAttribute('id', id); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7'); m.setAttribute('orient', 'auto');
      var p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); p.setAttribute('fill', color);
      m.appendChild(p); return m;
    }
    defs.appendChild(marker('arrow-default', '#64748b'));
    defs.appendChild(marker('arrow-high', '#dc2626'));
    defs.appendChild(marker('arrow-network', '#d97706'));
    defs.appendChild(marker('arrow-cap', '#64748b'));
    svg.appendChild(defs);

    // Zoom & Pan Container Group
    var canvasGroup = document.createElementNS(NS, 'g');
    canvasGroup.classList.add('topology-canvas-content');
    svg.appendChild(canvasGroup);

    // Compute positions
    var pos = {};
    depthKeys.forEach(function (d, di) {
      var layer = layers[d];
      var colX = padX + di * colW + 20;
      var totalH = layer.length * rowH;
      var startY = padY + (height - padY * 2 - totalH) / 2 + rowH / 2;
      layer.forEach(function (node, idx) {
        var y = startY + idx * rowH;
        pos[node.id] = { x: colX, y: y, depth: d };
      });
    });

    // Determine high-risk & capability node sets
    var highRiskNodeIds = new Set();
    var networkNodeIds = new Set();
    var processNodeIds = new Set();
    var unresolvedNodeIds = new Set();
    var pathByNode = {};
    paths.forEach(function (p) {
      p.nodes.forEach(function (nid) {
        if (!pathByNode[nid]) pathByNode[nid] = [];
        pathByNode[nid].push(p.id);
      });
      if (p.risk === 'HIGH' || p.risk === 'CRITICAL') p.nodes.forEach(function (nid) { highRiskNodeIds.add(nid); });
      if (p.capabilities.indexOf('NETWORK_ACCESS') !== -1 || p.capabilities.indexOf('REMOTE_DOWNLOAD') !== -1) p.nodes.forEach(function (nid) { networkNodeIds.add(nid); });
      if (p.capabilities.indexOf('PROCESS_EXECUTION') !== -1) p.nodes.forEach(function (nid) { processNodeIds.add(nid); });
      if (p.confidence === 'LOW' || (p.capabilities.indexOf('DYNAMIC_EXECUTION') !== -1)) p.nodes.forEach(function (nid) { unresolvedNodeIds.add(nid); });
    });
    nodes.forEach(function (n) {
      if (n.kind === 'CAPABILITY' && (n.path === 'NETWORK_ACCESS' || n.path === 'REMOTE_DOWNLOAD' || n.path === 'RUNTIME_BOOTSTRAP')) networkNodeIds.add(n.id);
      if (n.kind === 'CAPABILITY' && n.path === 'PROCESS_EXECUTION') processNodeIds.add(n.id);
      if (n.capabilities && (n.capabilities.indexOf('DYNAMIC_EXECUTION') !== -1)) unresolvedNodeIds.add(n.id);
      if (n.label && (n.label.indexOf('(UNRESOLVED)') !== -1 || n.label.indexOf('(BOUNDARY)') !== -1 || n.label.indexOf('(CYCLE)') !== -1)) unresolvedNodeIds.add(n.id);
    });

    // Draw edges
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
      var mx = (x1 + x2) / 2;
      var d = 'M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2;
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke-width', isHigh ? '2.4' : '1.4');
      if (isHigh) { pathEl.setAttribute('stroke', '#dc2626'); pathEl.setAttribute('marker-end', 'url(#arrow-high)'); }
      else if (e.kind === 'CONNECTS_TO') { pathEl.setAttribute('stroke', '#64748b'); pathEl.setAttribute('stroke-dasharray', '4 3'); pathEl.setAttribute('marker-end', 'url(#arrow-cap)'); }
      else if (isNetwork) { pathEl.setAttribute('stroke', '#d97706'); pathEl.setAttribute('marker-end', 'url(#arrow-network)'); }
      else { pathEl.setAttribute('stroke', '#94a3b8'); pathEl.setAttribute('marker-end', 'url(#arrow-default)'); }
      pathEl.classList.add('graph-edge');

      line.appendChild(pathEl);
      canvasGroup.appendChild(line);
      edgeEls.push(line);
    });

    // Draw nodes
    var nodeEls = [];
    var selectedNodeId = null;

    nodes.forEach(function (n) {
      var p = pos[n.id];
      if (!p) return;
      var g = document.createElementNS(NS, 'g');
      g.classList.add('graph-node');
      g.dataset.nodeId = n.id;
      g.dataset.kind = n.kind;
      g.tabIndex = 0;

      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(p.x - nodeW / 2));
      rect.setAttribute('y', String(p.y - nodeH / 2));
      rect.setAttribute('width', String(nodeW));
      rect.setAttribute('height', String(nodeH));
      rect.setAttribute('rx', '8');
      rect.setAttribute('ry', '8');
      rect.setAttribute('stroke-width', '1.4');

      // Light theme colors per node type
      var textColor = '#0f172a';
      if (n.kind === 'REPOSITORY') {
        rect.setAttribute('fill', '#ffffff'); rect.setAttribute('stroke', '#2563eb'); textColor = '#1e3a8a';
      } else if (n.kind === 'TRIGGER') {
        rect.setAttribute('fill', '#0f172a'); rect.setAttribute('stroke', '#0f172a'); textColor = '#ffffff';
      } else if (n.kind === 'COMMAND') {
        rect.setAttribute('fill', '#f8fafc'); rect.setAttribute('stroke', '#cbd5e1'); textColor = '#0f172a';
      } else if (n.kind === 'SCRIPT') {
        rect.setAttribute('fill', '#e0f2fe'); rect.setAttribute('stroke', '#0284c7'); textColor = '#0369a1';
      } else if (n.kind === 'CAPABILITY') {
        var isNet = (n.path === 'NETWORK_ACCESS' || n.path === 'REMOTE_DOWNLOAD');
        rect.setAttribute('fill', isNet ? '#fef3c7' : '#f3e8ff');
        rect.setAttribute('stroke', isNet ? '#d97706' : '#9333ea');
        textColor = isNet ? '#92400e' : '#6b21a8';
      } else {
        rect.setAttribute('fill', '#ffffff'); rect.setAttribute('stroke', '#e2e8f0'); textColor = '#0f172a';
      }

      if (highRiskNodeIds.has(n.id)) {
        rect.setAttribute('stroke', '#dc2626');
        rect.setAttribute('stroke-width', '2.2');
        if (n.kind !== 'TRIGGER') {
          rect.setAttribute('fill', '#fee2e2');
          textColor = '#991b1b';
        }
      }

      g.appendChild(rect);

      // Node label
      var text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(p.x));
      text.setAttribute('y', String(p.y + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', textColor);
      text.setAttribute('font-size', '11');
      text.setAttribute('font-family', 'ui-monospace, monospace');
      text.setAttribute('font-weight', '600');
      var fullLabel = n.label || n.path || n.id;
      text.textContent = fullLabel.length > 18 ? fullLabel.slice(0, 18) + '…' : fullLabel;
      g.appendChild(text);

      // SVG title for native tooltip
      var titleEl = document.createElementNS(NS, 'title');
      titleEl.textContent = n.kind + ': ' + fullLabel;
      g.appendChild(titleEl);

      // Selection handling
      function selectNode() {
        selectedNodeId = n.id;
        nodeEls.forEach(function (ng) { ng.classList.remove('is-selected', 'is-related'); });
        g.classList.add('is-selected');

        edgeEls.forEach(function (eg) {
          var hl = (eg.dataset.from === n.id || eg.dataset.to === n.id);
          eg.classList.toggle('is-highlight', hl);
        });

        // Dispatch selection event for inspector drawer
        var relatedPaths = pathByNode[n.id] || [];
        window.dispatchEvent(new CustomEvent('hookaudit:node-selected', {
          detail: { node: n, relatedPaths: relatedPaths, allPaths: paths }
        }));
      }

      g.addEventListener('click', selectNode);
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(); }
      });

      canvasGroup.appendChild(g);
      nodeEls.push(g);
    });

    // Pan & Zoom Engine
    var zoomLevel = 1.0;
    var panX = 0, panY = 0;
    var isDragging = false;
    var startX = 0, startY = 0;

    function applyTransform() {
      canvasGroup.setAttribute('transform', 'translate(' + panX + ',' + panY + ') scale(' + zoomLevel + ')');
      var zoomText = wrap.querySelector('.zoom-level-text');
      if (zoomText) zoomText.textContent = Math.round(zoomLevel * 100) + '%';
    }

    svgWrap.addEventListener('mousedown', function (e) {
      if (e.target.closest('.graph-node')) return; // let node click through
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    });

    window.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    });

    window.addEventListener('mouseup', function () {
      isDragging = false;
    });

    svgWrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.1 : 0.1;
      zoomLevel = Math.max(0.4, Math.min(2.5, zoomLevel + delta));
      applyTransform();
    }, { passive: false });

    // Floating Zoom Controls
    var zoomControls = el('div', 'zoom-controls');
    var btnIn = el('button', 'zoom-btn', '+');
    btnIn.title = 'Zoom in';
    btnIn.addEventListener('click', function () { zoomLevel = Math.min(2.5, zoomLevel + 0.2); applyTransform(); });

    var zoomText = el('span', 'zoom-level-text', '100%');

    var btnOut = el('button', 'zoom-btn', '−');
    btnOut.title = 'Zoom out';
    btnOut.addEventListener('click', function () { zoomLevel = Math.max(0.4, zoomLevel - 0.2); applyTransform(); });

    var btnReset = el('button', 'zoom-btn', '⟲');
    btnReset.title = 'Reset view';
    btnReset.addEventListener('click', function () { zoomLevel = 1.0; panX = 0; panY = 0; applyTransform(); });

    zoomControls.appendChild(btnIn);
    zoomControls.appendChild(zoomText);
    zoomControls.appendChild(btnOut);
    zoomControls.appendChild(btnReset);
    wrap.appendChild(zoomControls);

    // Filter interactions
    function applyFilter(kind) {
      [btnAll, btnHigh, btnNetwork, btnProcess, btnUnres].forEach(function (b) { b.classList.remove('is-active'); });
      if (kind === 'all') btnAll.classList.add('is-active');
      if (kind === 'high') btnHigh.classList.add('is-active');
      if (kind === 'network') btnNetwork.classList.add('is-active');
      if (kind === 'process') btnProcess.classList.add('is-active');
      if (kind === 'unresolved') btnUnres.classList.add('is-active');

      nodeEls.forEach(function (ng) {
        var nid = ng.dataset.nodeId;
        var show = true;
        if (kind === 'high') show = highRiskNodeIds.has(nid);
        if (kind === 'network') show = networkNodeIds.has(nid);
        if (kind === 'process') show = processNodeIds.has(nid);
        if (kind === 'unresolved') show = unresolvedNodeIds.has(nid);
        ng.style.opacity = show ? '1' : '0.15';
        ng.style.pointerEvents = show ? 'auto' : 'none';
      });
      edgeEls.forEach(function (eg) {
        var show = true;
        if (kind === 'high') show = highRiskNodeIds.has(eg.dataset.from) && highRiskNodeIds.has(eg.dataset.to);
        if (kind === 'network') show = networkNodeIds.has(eg.dataset.from) || networkNodeIds.has(eg.dataset.to);
        if (kind === 'process') show = processNodeIds.has(eg.dataset.from) || processNodeIds.has(eg.dataset.to);
        if (kind === 'unresolved') show = unresolvedNodeIds.has(eg.dataset.from) || unresolvedNodeIds.has(eg.dataset.to);
        eg.style.opacity = show ? '1' : '0.1';
      });
    }

    btnAll.addEventListener('click', function () { applyFilter('all'); });
    btnHigh.addEventListener('click', function () { applyFilter('high'); });
    btnNetwork.addEventListener('click', function () { applyFilter('network'); });
    btnProcess.addEventListener('click', function () { applyFilter('process'); });
    btnUnres.addEventListener('click', function () { applyFilter('unresolved'); });

    // Expose metadata for test parity
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
      container.innerHTML = '<div class="empty">No baseline yet — save a baseline then simulate a change to see drift.</div>';
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
      container.innerHTML = '<div class="empty">No capabilities in baseline or current analysis.</div>';
      return;
    }

    var tableWrap = el('div', 'table-wrap');
    var table = document.createElement('table');
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

      var tdCap = document.createElement('td');
      tdCap.className = 'mono-cell';
      tdCap.appendChild(el('span', 'cap-chip ' + capChipClass(cap), cap));
      tr.appendChild(tdCap);

      var tdBase = document.createElement('td'); tdBase.textContent = inBase ? 'present' : '—'; tr.appendChild(tdBase);
      var tdCurr = document.createElement('td'); tdCurr.textContent = inCurr ? 'present' : '—'; tr.appendChild(tdCurr);

      var tdStatus = document.createElement('td');
      if (inCurr && !inBase) {
        tdStatus.appendChild(el('span', 'badge badge--critical', 'NEW_CAPABILITY'));
        newCount++;
      } else if (!inCurr && inBase) {
        tdStatus.appendChild(el('span', 'badge', 'REMOVED'));
      } else {
        tdStatus.textContent = 'unchanged';
      }
      tr.appendChild(tdStatus);

      var tdEv = document.createElement('td');
      var evs = [];
      analysis.results.forEach(function (r) {
        r.findings.forEach(function (f) {
          if (f.capabilities && f.capabilities.indexOf(cap) !== -1) evs.push(r.file);
        });
      });
      tdEv.textContent = evs.slice(0, 2).join(', ') || '—';
      tr.appendChild(tdEv);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
    container.dataset.newCaps = String(newCount);
  }

  // ---------- 4. EVIDENCE FILTER HELPER ----------
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

  // Export to window
  window.HookAuditDashboard = {
    computeDashboardMetrics: computeDashboardMetrics,
    renderDashboard: renderDashboard,
    renderGraph: renderGraph,
    renderCapabilityDiff: renderCapabilityDiff,
    filterEvidenceRows: filterEvidenceRows,
    prefersReducedMotion: prefersReducedMotion,
    filterGraph: function (kind) {
      var wrap = document.getElementById('graph-interactive');
      if (wrap) {
        var btn = wrap.querySelector('[data-filter="' + kind + '"]');
        if (btn) btn.click();
      }
    }
  };
})();
