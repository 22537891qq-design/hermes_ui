// Hermes Telemetry & Token Monitor Client Logic
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // --- State Variables ---
  let isPaused = false;
  let sseSource = null;
  let peakTps = 0;
  let currentMetrics = null;
  let historyTimeline = [];
  let recentTraces = [];
  let currentMode = 'simulated'; // 'simulated' | 'real'

  // DOM Elements
  const elMetricTps = document.getElementById('metric-tps');
  const elMetricPeakTps = document.getElementById('metric-peak-tps');
  const elMetricTotalTokens = document.getElementById('metric-total-tokens');
  const elMetricPromptTokens = document.getElementById('metric-prompt-tokens');
  const elMetricCompletionTokens = document.getElementById('metric-completion-tokens');
  const elMetricTtft = document.getElementById('metric-ttft');
  const elMetricLatency = document.getElementById('metric-latency');
  const elMetricConcurrency = document.getElementById('metric-concurrency');
  const elMetricSuccessRate = document.getElementById('metric-success-rate');
  const elMetricCost = document.getElementById('metric-cost');
  const elMetricTotalRequests = document.getElementById('metric-total-requests');
  const elHeartbeatClock = document.getElementById('heartbeat-clock');
  const elConnectionStatus = document.getElementById('connection-status');
  const elConnectionDot = document.getElementById('connection-dot');

  // --- Session & Historical DOM Elements ---
  const elSessionUptime = document.getElementById('session-uptime');
  const elSessionTotalTokens = document.getElementById('session-total-tokens');
  const elSessionPromptTokens = document.getElementById('session-prompt-tokens');
  const elSessionCompletionTokens = document.getElementById('session-completion-tokens');
  const elSessionRequests = document.getElementById('session-requests');
  const elSessionCost = document.getElementById('session-cost');

  const elHistoricalBoots = document.getElementById('historical-boots');
  const elHistoricalTotalTokens = document.getElementById('historical-total-tokens');
  const elHistoricalPromptTokens = document.getElementById('historical-prompt-tokens');
  const elHistoricalCompletionTokens = document.getElementById('historical-completion-tokens');
  const elHistoricalRequests = document.getElementById('historical-requests');
  const elHistoricalCost = document.getElementById('historical-cost');

  let sessionStartTime = Date.now();

  const elTraceTableBody = document.getElementById('trace-table-body');
  const elTraceSearch = document.getElementById('trace-search');
  const elTraceFilterStatus = document.getElementById('trace-filter-status');
  const elTraceCountBadge = document.getElementById('trace-count-badge');

  const elModelListContainer = document.getElementById('model-list-container');
  const elContextDistContainer = document.getElementById('context-dist-container');

  const btnPause = document.getElementById('btn-pause');
  const btnPauseText = document.getElementById('btn-pause-text');
  const btnConfig = document.getElementById('btn-config');
  const btnExport = document.getElementById('btn-export');
  const btnReset = document.getElementById('btn-reset');

  const modalConfig = document.getElementById('modal-config');
  const modalClose = document.getElementById('modal-close');
  const modalSave = document.getElementById('modal-save');
  const modeSimulated = document.getElementById('mode-simulated');
  const modeReal = document.getElementById('mode-real');
  const realApiFields = document.getElementById('real-api-fields');
  const btnTestPing = document.getElementById('btn-test-ping');

  // Canvas elements
  const waveformCanvas = document.getElementById('waveformCanvas');
  const waveformCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;
  const latencyCanvas = document.getElementById('latencyCanvas');
  const latencyCtx = latencyCanvas ? latencyCanvas.getContext('2d') : null;
  const chartTooltip = document.getElementById('chart-tooltip');
  const tooltipTime = document.getElementById('tooltip-time');
  const tooltipVal = document.getElementById('tooltip-val');

  // Format duration into HH:mm:ss
  function formatUptime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(s / 3600).toString().padStart(2, '0');
    const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(s % 60).toString().padStart(2, '0');
    return `${hours}:${mins}:${secs}`;
  }

  // Update Clock & Uptime
  setInterval(() => {
    if (elHeartbeatClock) {
      elHeartbeatClock.textContent = new Date().toLocaleTimeString();
    }
    if (elSessionUptime) {
      const elapsedSec = (Date.now() - sessionStartTime) / 1000;
      elSessionUptime.textContent = formatUptime(elapsedSec);
    }
  }, 1000);

  // --- Canvas High-DPI Scaling ---
  function setupCanvas(canvas) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { width: rect.width, height: rect.height, ctx };
  }

  // Window resize handler
  window.addEventListener('resize', () => {
    drawWaveform();
    drawLatencyChart();
  });

  // --- Draw Real-time Token Waveform Chart ---
  function drawWaveform() {
    if (!waveformCanvas || !waveformCtx) return;
    const { width, height, ctx } = setupCanvas(waveformCanvas);
    ctx.clearRect(0, 0, width, height);

    if (historyTimeline.length < 2) return;

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0.2; y <= 0.8; y += 0.2) {
      ctx.beginPath();
      ctx.moveTo(35, height * y);
      ctx.lineTo(width - 10, height * y);
      ctx.stroke();
    }

    // Find max TPS for scaling
    const maxTps = Math.max(120, ...historyTimeline.map(p => Math.max(p.tps || 0, p.completionTps || 0, p.promptTps || 0))) * 1.15;

    // Y Axis Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxTps) + ' tps', 30, 15);
    ctx.fillText(Math.round(maxTps * 0.5) + ' tps', 30, height * 0.5);
    ctx.fillText('0', 30, height - 8);

    const paddingLeft = 38;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 20;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const stepX = plotWidth / (historyTimeline.length - 1);

    // Draw Completion TPS Area Gradient
    ctx.beginPath();
    historyTimeline.forEach((pt, i) => {
      const x = paddingLeft + i * stepX;
      const val = pt.completionTps || (pt.tps * 0.7);
      const y = paddingTop + plotHeight - (val / maxTps) * plotHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    const lastX = paddingLeft + (historyTimeline.length - 1) * stepX;
    ctx.lineTo(lastX, paddingTop + plotHeight);
    ctx.lineTo(paddingLeft, paddingTop + plotHeight);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, paddingTop, 0, height);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Completion TPS Stroke Line
    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    historyTimeline.forEach((pt, i) => {
      const x = paddingLeft + i * stepX;
      const val = pt.completionTps || (pt.tps * 0.7);
      const y = paddingTop + plotHeight - (val / maxTps) * plotHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // Draw Prompt TPS Line
    ctx.beginPath();
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.8;
    historyTimeline.forEach((pt, i) => {
      const x = paddingLeft + i * stepX;
      const val = pt.promptTps || (pt.tps * 0.3);
      const y = paddingTop + plotHeight - (val / maxTps) * plotHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Last point pulsing dot
    const latestPt = historyTimeline[historyTimeline.length - 1];
    const latestX = lastX;
    const latestY = paddingTop + plotHeight - ((latestPt.completionTps || latestPt.tps * 0.7) / maxTps) * plotHeight;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // --- Draw Latency & TTFT Chart ---
  function drawLatencyChart() {
    if (!latencyCanvas || !latencyCtx) return;
    const { width, height, ctx } = setupCanvas(latencyCanvas);
    ctx.clearRect(0, 0, width, height);

    const tracesSlice = recentTraces.slice(0, 24).reverse();
    if (tracesSlice.length === 0) return;

    const paddingLeft = 32;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 20;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const maxLatency = Math.max(1200, ...tracesSlice.map(t => t.durationMs || 800)) * 1.1;

    // Y Axis Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText((maxLatency / 1000).toFixed(1) + 's', 28, 15);
    ctx.fillText((maxLatency * 0.5 / 1000).toFixed(1) + 's', 28, height * 0.5);
    ctx.fillText('0s', 28, height - 8);

    const barWidth = Math.max(4, (plotWidth / tracesSlice.length) - 4);

    tracesSlice.forEach((t, i) => {
      const x = paddingLeft + i * (plotWidth / tracesSlice.length) + 2;
      const totalH = ((t.durationMs || 500) / maxLatency) * plotHeight;
      const ttftH = ((t.ttftMs || 200) / maxLatency) * plotHeight;
      const yTotal = paddingTop + plotHeight - totalH;
      const yTtft = paddingTop + plotHeight - ttftH;

      // Full latency bar (violet)
      ctx.fillStyle = t.status === 200 ? '#7c3aed' : '#ef4444';
      ctx.beginPath();
      ctx.roundRect(x, yTotal, barWidth, totalH, [3, 3, 0, 0]);
      ctx.fill();

      // TTFT part (cyan highlight)
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.roundRect(x, yTtft, barWidth, ttftH, [0, 0, 2, 2]);
      ctx.fill();
    });
  }

  // --- Format Numbers with commas ---
  function formatNumber(n) {
    if (n === undefined || n === null) return '0';
    return n.toLocaleString('en-US');
  }

  // --- Render Models Breakdown ---
  function renderModels(models) {
    if (!elModelListContainer || !models) return;
    let html = '';
    const totalPrompt = Object.values(models).reduce((acc, m) => acc + (m.promptTokens || 0), 0) || 1;
    const totalCompletion = Object.values(models).reduce((acc, m) => acc + (m.completionTokens || 0), 0) || 1;
    const totalAll = totalPrompt + totalCompletion;

    for (const [key, m] of Object.entries(models)) {
      const modelTokens = (m.promptTokens || 0) + (m.completionTokens || 0);
      const pct = Math.min(100, Math.round((modelTokens / totalAll) * 100)) || 0;
      const isLarge = key.includes('70b') || key.includes('405b');

      html += `
        <div class="p-2.5 rounded-lg bg-dark-bg/80 border border-dark-border/80">
          <div class="flex items-center justify-between text-xs mb-1.5">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full ${isLarge ? 'bg-indigo-400' : 'bg-cyan-400'}"></span>
              <span class="font-medium text-slate-200">${m.name}</span>
            </div>
            <div class="text-right font-mono">
              <span class="text-slate-300 font-semibold">${formatNumber(modelTokens)}</span>
              <span class="text-slate-500 text-[10px]">(${pct}%)</span>
            </div>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="${isLarge ? 'bg-indigo-500' : 'bg-cyan-500'} h-1.5 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
          </div>
          <div class="flex justify-between items-center text-[10px] text-slate-400 mt-1">
            <span>请求: ${formatNumber(m.requests || 0)} 次</span>
            <span>输入: ${formatNumber(m.promptTokens || 0)} | 输出: ${formatNumber(m.completionTokens || 0)}</span>
          </div>
        </div>
      `;
    }
    elModelListContainer.innerHTML = html;
  }

  // --- Render Context Distribution ---
  function renderContextDistribution(dist) {
    if (!elContextDistContainer || !dist) return;
    const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
    const colors = {
      '< 4k': 'bg-cyan-500',
      '4k - 16k': 'bg-blue-500',
      '16k - 64k': 'bg-indigo-500',
      '> 64k': 'bg-violet-500'
    };

    let html = '';
    for (const [range, count] of Object.entries(dist)) {
      const pct = Math.round((count / total) * 100) || 0;
      html += `
        <div>
          <div class="flex justify-between text-xs mb-1">
            <span class="text-slate-300 font-mono text-[11px]">${range}</span>
            <span class="text-slate-400 font-mono text-[11px]">${count} 请求 (${pct}%)</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="${colors[range] || 'bg-cyan-500'} h-1.5 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }
    elContextDistContainer.innerHTML = html;
  }

  // --- Render Recent Traces Table ---
  function renderTraces() {
    if (!elTraceTableBody) return;
    const filterStatus = elTraceFilterStatus ? elTraceFilterStatus.value : 'all';
    const searchQuery = (elTraceSearch ? elTraceSearch.value.trim() : '').toLowerCase();

    let filtered = recentTraces.filter(t => {
      if (filterStatus === '200' && t.status !== 200) return false;
      if (filterStatus === 'error' && t.status === 200) return false;
      if (searchQuery) {
        return (t.id && t.id.toLowerCase().includes(searchQuery)) ||
               (t.model && t.model.toLowerCase().includes(searchQuery)) ||
               (t.modelName && t.modelName.toLowerCase().includes(searchQuery));
      }
      return true;
    });

    if (elTraceCountBadge) {
      elTraceCountBadge.textContent = `${filtered.length} 条记录`;
    }

    if (filtered.length === 0) {
      elTraceTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-6 text-slate-500">
            暂无匹配的调用记录
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    filtered.slice(0, 30).forEach(t => {
      const isOk = t.status === 200;
      const statusBadge = isOk
        ? `<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">200 OK</span>`
        : `<span class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">${t.status || 'ERR'}</span>`;

      html += `
        <tr class="hover:bg-dark-surface/80 transition-colors">
          <td class="px-4 py-2.5 text-slate-400 text-[11px]">${t.timestamp}</td>
          <td class="px-4 py-2.5 font-bold text-cyan-400">${t.id}</td>
          <td class="px-4 py-2.5 text-slate-300">${t.modelName || t.model}</td>
          <td class="px-4 py-2.5 text-right text-slate-400">${formatNumber(t.promptTokens)}</td>
          <td class="px-4 py-2.5 text-right text-blue-300 font-semibold">${formatNumber(t.completionTokens)}</td>
          <td class="px-4 py-2.5 text-right text-white font-bold">${formatNumber(t.totalTokens)}</td>
          <td class="px-4 py-2.5 text-right text-violet-300">${t.ttftMs} ms</td>
          <td class="px-4 py-2.5 text-right text-slate-300">${t.durationMs} ms</td>
          <td class="px-4 py-2.5 text-right text-cyan-300 font-semibold">${t.tps || 0}</td>
          <td class="px-4 py-2.5 text-center">${statusBadge}</td>
        </tr>
      `;
    });

    elTraceTableBody.innerHTML = html;
  }

  // --- Update Dashboard with Incoming Tick ---
  function updateDashboard(data) {
    if (isPaused) return;

    const stats = data.stats;
    if (!stats) return;
    currentMetrics = data;

    // Update Peak TPS
    if (stats.currentTps > peakTps) {
      peakTps = stats.currentTps;
    }

    // Update Session Usage Metrics (本次开机使用量)
    if (data.session) {
      if (data.session.startedAt) sessionStartTime = data.session.startedAt;
      if (elSessionTotalTokens) elSessionTotalTokens.textContent = formatNumber(data.session.totalTokens);
      if (elSessionPromptTokens) elSessionPromptTokens.textContent = formatNumber(data.session.promptTokens);
      if (elSessionCompletionTokens) elSessionCompletionTokens.textContent = formatNumber(data.session.completionTokens);
      if (elSessionRequests) elSessionRequests.textContent = formatNumber(data.session.totalRequests ?? data.session.requests ?? 0);
      if (elSessionCost) elSessionCost.textContent = (data.session.estimatedCostUsd || 0).toFixed(4);
    } else {
      // Fallback to overall stats if session object not explicitly provided
      if (elSessionTotalTokens) elSessionTotalTokens.textContent = formatNumber(stats.totalTokens);
      if (elSessionPromptTokens) elSessionPromptTokens.textContent = formatNumber(stats.totalPromptTokens);
      if (elSessionCompletionTokens) elSessionCompletionTokens.textContent = formatNumber(stats.totalCompletionTokens);
      if (elSessionRequests) elSessionRequests.textContent = formatNumber(stats.totalRequests);
      if (elSessionCost) elSessionCost.textContent = (stats.estimatedCostUsd || 0).toFixed(4);
    }

    // Update Historical Usage Metrics (历史累计使用量)
    if (data.historical) {
      if (elHistoricalBoots) elHistoricalBoots.textContent = `${data.historical.bootCount || 1} 次`;
      if (elHistoricalTotalTokens) elHistoricalTotalTokens.textContent = formatNumber(data.historical.totalTokens);
      if (elHistoricalPromptTokens) elHistoricalPromptTokens.textContent = formatNumber(data.historical.promptTokens);
      if (elHistoricalCompletionTokens) elHistoricalCompletionTokens.textContent = formatNumber(data.historical.completionTokens);
      if (elHistoricalRequests) elHistoricalRequests.textContent = formatNumber(data.historical.totalRequests ?? data.historical.requests ?? 0);
      if (elHistoricalCost) elHistoricalCost.textContent = (data.historical.estimatedCostUsd || 0).toFixed(4);
    }

    // Top Real-time Rate Cards
    if (elMetricTps) elMetricTps.textContent = stats.currentTps;
    if (elMetricPeakTps) elMetricPeakTps.textContent = `${peakTps} TPS`;
    if (elMetricTotalTokens) elMetricTotalTokens.textContent = formatNumber(stats.totalTokens);
    if (elMetricPromptTokens) elMetricPromptTokens.textContent = formatNumber(stats.totalPromptTokens);
    if (elMetricCompletionTokens) elMetricCompletionTokens.textContent = formatNumber(stats.totalCompletionTokens);
    if (elMetricTtft) elMetricTtft.textContent = stats.avgTtftMs;
    if (elMetricLatency) elMetricLatency.textContent = `${stats.avgLatencyMs} ms`;
    if (elMetricConcurrency) elMetricConcurrency.textContent = stats.activeConcurrency;

    const totalReqs = stats.totalRequests || 1;
    const succReqs = stats.successfulRequests || 0;
    const rate = ((succReqs / totalReqs) * 100).toFixed(1);
    if (elMetricSuccessRate) elMetricSuccessRate.textContent = `${rate}%`;

    if (elMetricCost) elMetricCost.textContent = (stats.estimatedCostUsd || 0).toFixed(4);
    if (elMetricTotalRequests) elMetricTotalRequests.textContent = `${formatNumber(stats.totalRequests)} 次`;

    // Append to timeline
    if (data.timelinePoint) {
      historyTimeline.push(data.timelinePoint);
      if (historyTimeline.length > 60) historyTimeline.shift();
    }

    // Append to traces
    if (data.latestTrace) {
      recentTraces.unshift(data.latestTrace);
      if (recentTraces.length > 60) recentTraces.pop();
    }

    // Render Sub-components
    renderModels(data.models);
    renderContextDistribution(stats.contextDistribution);
    renderTraces();

    // Redraw Canvases
    drawWaveform();
    drawLatencyChart();
  }

  // --- Connect to Server SSE Stream ---
  function initSSE() {
    if (sseSource) sseSource.close();

    try {
      sseSource = new EventSource('/api/metrics/stream');

      sseSource.onopen = () => {
        if (elConnectionStatus) elConnectionStatus.textContent = '实时流正常连接';
        if (elConnectionDot) elConnectionDot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500';
      };

      sseSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'initial_snapshot') {
            historyTimeline = msg.data.historyTimeline || [];
            recentTraces = msg.data.recentTraces || [];
            if (msg.data.simulationEnabled !== undefined) updateSimulationUI(msg.data.simulationEnabled);
            updateDashboard(msg.data);
          } else if (msg.type === 'metric_tick') {
            if (msg.data.simulationEnabled !== undefined) updateSimulationUI(msg.data.simulationEnabled);
            updateDashboard(msg.data);
          }
        } catch (e) {
          console.error('Error parsing SSE payload:', e);
        }
      };

      sseSource.onerror = () => {
        if (elConnectionStatus) elConnectionStatus.textContent = '流断开，尝试重连...';
        if (elConnectionDot) elConnectionDot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500';
      };
    } catch (err) {
      console.warn('SSE not supported or failed, fallback to polling', err);
    }
  }

  initSSE();

  // --- Event Listeners ---

  // Pause / Resume
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      isPaused = !isPaused;
      if (isPaused) {
        btnPauseText.textContent = '恢复刷新';
        btnPause.classList.replace('bg-slate-800', 'bg-amber-800');
        showToast('实时图表更新已暂停');
      } else {
        btnPauseText.textContent = '暂停刷新';
        btnPause.classList.replace('bg-amber-800', 'bg-slate-800');
        showToast('实时图表更新已恢复');
      }
    });
  }

  // Filter Search Traces
  if (elTraceSearch) elTraceSearch.addEventListener('input', renderTraces);
  if (elTraceFilterStatus) elTraceFilterStatus.addEventListener('change', renderTraces);

  // Reset Button
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (confirm('确定重置所有累计 Token 及调用计数器吗？')) {
        try {
          await fetch('/api/metrics/reset', { method: 'POST' });
          peakTps = 0;
          showToast('监控指标已重置');
        } catch (e) {
          showToast('重置请求失败: ' + e.message);
        }
      }
    });
  }

  // Export CSV
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      if (!recentTraces || recentTraces.length === 0) {
        showToast('暂无记录可导出');
        return;
      }
      let csv = 'Timestamp,TraceID,Model,PromptTokens,CompletionTokens,TotalTokens,TTFT_ms,Duration_ms,TPS,Status\n';
      recentTraces.forEach(t => {
        csv += `${t.timestamp},${t.id},${t.modelName || t.model},${t.promptTokens},${t.completionTokens},${t.totalTokens},${t.ttftMs},${t.durationMs},${t.tps},${t.status}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hermes_token_traces_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('历史调用数据导出成功！');
    });
  }

  // Modal handlers
  if (btnConfig) {
    btnConfig.addEventListener('click', () => {
      modalConfig.classList.remove('hidden');
    });
  }

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      modalConfig.classList.add('hidden');
    });
  }

  if (modeSimulated && modeReal) {
    modeSimulated.addEventListener('click', () => {
      currentMode = 'simulated';
      modeSimulated.className = 'px-3 py-2 rounded-lg border border-cyan-500 bg-cyan-950/40 text-cyan-300 font-semibold text-center transition';
      modeReal.className = 'px-3 py-2 rounded-lg border border-dark-border bg-dark-surface text-slate-300 hover:border-slate-600 text-center transition';
      realApiFields.classList.add('hidden');
    });

    modeReal.addEventListener('click', () => {
      currentMode = 'real';
      modeReal.className = 'px-3 py-2 rounded-lg border border-cyan-500 bg-cyan-950/40 text-cyan-300 font-semibold text-center transition';
      modeSimulated.className = 'px-3 py-2 rounded-lg border border-dark-border bg-dark-surface text-slate-300 hover:border-slate-600 text-center transition';
      realApiFields.classList.remove('hidden');
    });
  }

  // Test Ping
  if (btnTestPing) {
    btnTestPing.addEventListener('click', async () => {
      btnTestPing.disabled = true;
      btnTestPing.textContent = '测试中...';
      try {
        const endpoint = document.getElementById('cfg-endpoint').value;
        const model = document.getElementById('cfg-model').value;
        const resp = await fetch('/api/hermes/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint, model })
        });
        const res = await resp.json();
        if (res.success) {
          alert(`✅ 连接成功!\n延迟: ${res.pingMs}ms\n模型上下文: ${res.detectedContextWindow}\n显存用量: ${res.systemLoad.vramUsed}`);
        } else {
          alert(`❌ 连接失败: ${res.error}`);
        }
      } catch (err) {
        alert(`❌ 网络请求失败: ${err.message}`);
      } finally {
        btnTestPing.disabled = false;
        btnTestPing.textContent = '测试连通性';
      }
    });
  }

  // --- Simulation Toggle Logic ---
  let isSimulating = false;
  const btnToggleSim = document.getElementById('btn-toggle-sim');
  const simModeText = document.getElementById('sim-mode-text');
  const simIcon = document.getElementById('sim-icon');
  const btnSwitchToSim = document.getElementById('btn-switch-to-sim');
  const modeGuidanceBanner = document.getElementById('mode-guidance-banner');
  const bannerText = document.getElementById('banner-text');

  function updateSimulationUI(simEnabled) {
    isSimulating = Boolean(simEnabled);
    if (isSimulating) {
      if (btnToggleSim) {
        btnToggleSim.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition bg-cyan-950/60 text-cyan-300 border-cyan-500/50 hover:bg-cyan-900';
      }
      if (simModeText) simModeText.textContent = '演示模拟中 (每秒生成)';
      if (bannerText) {
        bannerText.innerHTML = '<b>当前处于【演示模拟模式】：</b>系统正自动模拟生成高频 Token 流与延迟波动。';
      }
      if (btnSwitchToSim) btnSwitchToSim.textContent = '切换为真实监听';
      if (modeGuidanceBanner) {
        modeGuidanceBanner.className = 'rounded-xl px-4 py-2.5 border transition-all text-xs flex items-center justify-between flex-wrap gap-2 bg-cyan-950/20 border-cyan-500/30 text-cyan-200';
      }
    } else {
      if (btnToggleSim) {
        btnToggleSim.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition bg-emerald-950/40 text-emerald-300 border-emerald-600/50 hover:bg-emerald-900/60';
      }
      if (simModeText) simModeText.textContent = '真实监听模式 (对话触发)';
      if (bannerText) {
        bannerText.innerHTML = '<b>当前处于【真实监听模式】：</b>未发起对话时 Token 保持为 0，只有当客户端向 Hermes 发送请求时才会实时记录增加。';
      }
      if (btnSwitchToSim) btnSwitchToSim.textContent = '切换为演示模拟';
      if (modeGuidanceBanner) {
        modeGuidanceBanner.className = 'rounded-xl px-4 py-2.5 border transition-all text-xs flex items-center justify-between flex-wrap gap-2 bg-emerald-950/20 border-emerald-500/30 text-emerald-200';
      }
    }
  }

  async function toggleSimulationMode() {
    try {
      const resp = await fetch('/api/simulator/toggle', { method: 'POST' });
      const data = await resp.json();
      if (data.success) {
        updateSimulationUI(data.simulationEnabled);
        showToast(data.message);
      }
    } catch (e) {
      showToast('切换模式失败: ' + e.message);
    }
  }

  if (btnToggleSim) btnToggleSim.addEventListener('click', toggleSimulationMode);
  if (btnSwitchToSim) btnSwitchToSim.addEventListener('click', toggleSimulationMode);

  // --- Test Chat Dialogue Modal Logic ---
  const btnOpenChatTest = document.getElementById('btn-open-chat-test');
  const modalChatTest = document.getElementById('modal-chat-test');
  const modalChatClose = document.getElementById('modal-chat-close');
  const btnSendChatTest = document.getElementById('btn-send-chat-test');
  const chatTestPrompt = document.getElementById('chat-test-prompt');
  const chatTestModel = document.getElementById('chat-test-model');
  const chatTestResult = document.getElementById('chat-test-result');
  const resPTokens = document.getElementById('res-p-tokens');
  const resCTokens = document.getElementById('res-c-tokens');
  const resTtft = document.getElementById('res-ttft');
  const resDur = document.getElementById('res-dur');
  const resReplyText = document.getElementById('res-reply-text');

  if (btnOpenChatTest && modalChatTest) {
    btnOpenChatTest.addEventListener('click', () => {
      modalChatTest.classList.remove('hidden');
    });
  }

  if (modalChatClose && modalChatTest) {
    modalChatClose.addEventListener('click', () => {
      modalChatTest.classList.add('hidden');
    });
  }

  if (btnSendChatTest) {
    btnSendChatTest.addEventListener('click', async () => {
      const prompt = chatTestPrompt ? chatTestPrompt.value.trim() : '';
      if (!prompt) {
        alert('请输入对话内容');
        return;
      }

      btnSendChatTest.disabled = true;
      btnSendChatTest.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>对话生成中...</span>`;
      if (window.lucide) window.lucide.createIcons();

      try {
        const resp = await fetch('/api/test-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model: chatTestModel ? chatTestModel.value : 'hermes-3-llama-3.1-8b'
          })
        });

        const res = await resp.json();
        if (res.success) {
          if (chatTestResult) chatTestResult.classList.remove('hidden');
          if (resPTokens) resPTokens.textContent = res.trace.promptTokens;
          if (resCTokens) resCTokens.textContent = res.trace.completionTokens;
          if (resTtft) resTtft.textContent = res.trace.ttftMs;
          if (resDur) resDur.textContent = res.trace.durationMs;
          if (resReplyText) resReplyText.textContent = res.response;

          showToast(`已触发对话: +${res.trace.promptTokens + res.trace.completionTokens} Tokens!`);
        } else {
          alert('发送失败: ' + res.error);
        }
      } catch (err) {
        alert('请求发生错误: ' + err.message);
      } finally {
        btnSendChatTest.disabled = false;
        btnSendChatTest.innerHTML = `<i data-lucide="send" class="w-3.5 h-3.5"></i><span>发送对话并统计</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  // Toast Helper
  function showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.remove('opacity-0', 'translate-y-20');
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-20');
    }, 2800);
  }
});
