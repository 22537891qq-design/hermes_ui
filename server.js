const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'metrics_history.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load or initialize historical usage data
function loadHistoricalStats() {
  const defaultHistory = {
    bootCount: 1,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalRequests: 0,
    estimatedCostUsd: 0,
    lastSavedAt: new Date().toISOString()
  };

  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      parsed.bootCount = (parsed.bootCount || 0) + 1;
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load history file, creating fresh history:', err.message);
  }

  return defaultHistory;
}

// Load Config
function loadConfig() {
  const defaultCfg = {
    targetBaseUrl: 'http://localhost:8000/v1',
    targetModel: 'Nous-Hermes-3-Llama-3.1-8B',
    apiKey: '',
    simulationEnabled: false // 默认关闭模拟发生器，无对话时 Token 绝对不自增！
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...defaultCfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) {}
  return defaultCfg;
}

const config = loadConfig();
const historicalStats = loadHistoricalStats();

// Save history helper (throttled)
let saveHistoryTimeout = null;
function persistHistoricalStats() {
  if (saveHistoryTimeout) return;
  saveHistoryTimeout = setTimeout(() => {
    saveHistoryTimeout = null;
    try {
      historicalStats.lastSavedAt = new Date().toISOString();
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(historicalStats, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save historical stats:', e.message);
    }
  }, 2000);
}

// Initial save of updated boot count
persistHistoricalStats();

// --- In-memory Metrics State ---
const state = {
  startedAt: Date.now(),
  simulationEnabled: config.simulationEnabled, // 模拟开关：false = 真实监听模式
  targetBaseUrl: config.targetBaseUrl,
  targetModel: config.targetModel,
  apiKey: config.apiKey,

  // Current Boot / Session Usage (本次开机使用量)
  session: {
    startedAt: Date.now(),
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    estimatedCostUsd: 0
  },

  // All-Time Historical Usage (历史累计使用量)
  historical: historicalStats,

  models: {
    'hermes-3-llama-3.1-8b': { name: 'Hermes 3 (8B)', promptTokens: 0, completionTokens: 0, requests: 0, costRateInput: 0.15, costRateOutput: 0.60 },
    'hermes-3-llama-3.1-70b': { name: 'Hermes 3 (70B)', promptTokens: 0, completionTokens: 0, requests: 0, costRateInput: 0.80, costRateOutput: 2.40 },
    'hermes-3-llama-3.1-405b': { name: 'Hermes 3 (405B)', promptTokens: 0, completionTokens: 0, requests: 0, costRateInput: 3.50, costRateOutput: 10.00 },
    'openhermes-2.5-mistral-7b': { name: 'OpenHermes 2.5', promptTokens: 0, completionTokens: 0, requests: 0, costRateInput: 0.12, costRateOutput: 0.45 }
  },

  stats: {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    currentTps: 0,
    avgTtftMs: 0,
    avgLatencyMs: 0,
    activeConcurrency: 0,
    contextDistribution: {
      '< 4k': 0,
      '4k - 16k': 0,
      '16k - 64k': 0,
      '> 64k': 0
    }
  },
  historyTimeline: [], // Last 60 seconds
  recentTraces: []     // Last 50 request traces
};

// Seed initial history baseline (zeros if not simulating)
const now = Date.now();
for (let i = 59; i >= 0; i--) {
  state.historyTimeline.push({
    time: new Date(now - i * 1000).toLocaleTimeString(),
    tps: 0,
    promptTps: 0,
    completionTps: 0,
    latency: 0,
    activeStreams: 0
  });
}

// SSE Clients List
const sseClients = new Set();

function broadcastPayload(payloadObj) {
  const dataStr = `data: ${JSON.stringify(payloadObj)}\n\n`;
  for (const client of sseClients) {
    client.write(dataStr);
  }
}

// 统一记录一次真实（或模拟）对话请求产生的 Token 与时延
function recordRequestMetrics({ modelKey, modelName, promptTokens, completionTokens, durationMs, ttftMs, statusCode = 200 }) {
  const totalReqTokens = promptTokens + completionTokens;
  const isSuccess = statusCode === 200;

  let modelObj = state.models[modelKey];
  if (!modelObj) {
    modelObj = state.models['hermes-3-llama-3.1-8b'];
  }

  const costInputRate = modelObj ? modelObj.costRateInput : 0.15;
  const costOutputRate = modelObj ? modelObj.costRateOutput : 0.60;
  const reqCost = (promptTokens / 1000000) * costInputRate + (completionTokens / 1000000) * costOutputRate;

  // 1. Update Models
  if (modelObj) {
    modelObj.promptTokens += promptTokens;
    modelObj.completionTokens += completionTokens;
    modelObj.requests += 1;
  }

  // 2. Update Global Stats
  state.stats.totalPromptTokens += promptTokens;
  state.stats.totalCompletionTokens += completionTokens;
  state.stats.totalTokens += totalReqTokens;
  state.stats.totalRequests += 1;
  if (isSuccess) state.stats.successfulRequests += 1;
  else state.stats.failedRequests += 1;

  // 3. Update Session Stats (本次开机使用量)
  state.session.promptTokens += promptTokens;
  state.session.completionTokens += completionTokens;
  state.session.totalTokens += totalReqTokens;
  state.session.totalRequests += 1;
  if (isSuccess) state.session.successfulRequests += 1;
  else state.session.failedRequests += 1;
  state.session.estimatedCostUsd = Number((state.session.estimatedCostUsd + reqCost).toFixed(4));

  // 4. Update Historical Stats (历史累计使用量)
  state.historical.promptTokens += promptTokens;
  state.historical.completionTokens += completionTokens;
  state.historical.totalTokens += totalReqTokens;
  state.historical.totalRequests += 1;
  state.historical.estimatedCostUsd = Number((state.historical.estimatedCostUsd + reqCost).toFixed(4));
  persistHistoricalStats();

  // 5. Update Context distribution
  if (totalReqTokens < 4000) state.stats.contextDistribution['< 4k']++;
  else if (totalReqTokens < 16000) state.stats.contextDistribution['4k - 16k']++;
  else if (totalReqTokens < 64000) state.stats.contextDistribution['16k - 64k']++;
  else state.stats.contextDistribution['> 64k']++;

  // 6. Calculate moving averages
  if (state.stats.avgTtftMs === 0) state.stats.avgTtftMs = ttftMs;
  else state.stats.avgTtftMs = Math.round(state.stats.avgTtftMs * 0.8 + ttftMs * 0.2);

  if (state.stats.avgLatencyMs === 0) state.stats.avgLatencyMs = durationMs;
  else state.stats.avgLatencyMs = Math.round(state.stats.avgLatencyMs * 0.8 + durationMs * 0.2);

  const instTps = Math.round(completionTokens / Math.max(0.2, (durationMs - ttftMs) / 1000));
  state.stats.currentTps = instTps;

  // 7. Add Trace Log
  const trace = {
    id: 'req_' + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    model: modelKey,
    modelName: modelName || (modelObj ? modelObj.name : modelKey),
    promptTokens,
    completionTokens,
    totalTokens: totalReqTokens,
    ttftMs,
    durationMs,
    status: statusCode,
    tps: instTps
  };

  state.recentTraces.unshift(trace);
  if (state.recentTraces.length > 50) state.recentTraces.pop();

  // Add timeline point
  state.historyTimeline.push({
    time: new Date().toLocaleTimeString(),
    tps: instTps,
    promptTps: Math.round(promptTokens / Math.max(0.5, ttftMs / 1000)),
    completionTps: instTps,
    latency: durationMs,
    activeStreams: Math.max(1, state.stats.activeConcurrency)
  });
  if (state.historyTimeline.length > 60) state.historyTimeline.shift();

  // Total session cost
  let sessionCostUsd = 0;
  for (const mKey of Object.keys(state.models)) {
    const m = state.models[mKey];
    sessionCostUsd += (m.promptTokens / 1000000) * m.costRateInput + (m.completionTokens / 1000000) * m.costRateOutput;
  }
  state.stats.estimatedCostUsd = Number(sessionCostUsd.toFixed(4));

  // Broadcast immediate update
  broadcastPayload({
    type: 'metric_tick',
    data: {
      stats: state.stats,
      session: state.session,
      historical: state.historical,
      latestTrace: trace,
      models: state.models,
      simulationEnabled: state.simulationEnabled,
      timelinePoint: state.historyTimeline[state.historyTimeline.length - 1]
    }
  });

  return trace;
}

// 模拟发生器（仅在 simulationEnabled === true 时运行）
function generateTelemetryTick() {
  if (!state.simulationEnabled) {
    // 真实监听模式下，如果无请求，仅衰减 TPS 为 0，并保持心跳
    if (state.stats.currentTps > 0) {
      state.stats.currentTps = Math.max(0, Math.floor(state.stats.currentTps * 0.5));
    }
    state.stats.activeConcurrency = 0;
    state.historyTimeline.push({
      time: new Date().toLocaleTimeString(),
      tps: state.stats.currentTps,
      promptTps: 0,
      completionTps: 0,
      latency: state.stats.avgLatencyMs,
      activeStreams: 0
    });
    if (state.historyTimeline.length > 60) state.historyTimeline.shift();

    broadcastPayload({
      type: 'metric_tick',
      data: {
        stats: state.stats,
        session: state.session,
        historical: state.historical,
        models: state.models,
        simulationEnabled: state.simulationEnabled,
        timelinePoint: state.historyTimeline[state.historyTimeline.length - 1]
      }
    });
    return;
  }

  // 演示模式开启时的模拟生成逻辑
  const modelKeys = Object.keys(state.models);
  const selectedModelKey = modelKeys[Math.floor(Math.random() * modelKeys.length)];
  const isBurst = Math.random() < 0.18;
  const promptTokens = Math.floor(120 + Math.random() * (isBurst ? 1800 : 600));
  const completionTokens = Math.floor(40 + Math.random() * (isBurst ? 900 : 350));
  const statusCode = Math.random() > 0.03 ? 200 : 429;
  const ttft = Math.floor(140 + Math.random() * 250);
  const duration = ttft + Math.floor((completionTokens / 45) * 1000);

  recordRequestMetrics({
    modelKey: selectedModelKey,
    promptTokens,
    completionTokens,
    durationMs: duration,
    ttftMs: ttft,
    statusCode
  });
}

setInterval(generateTelemetryTick, 1000);

// MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE Stream Endpoint
  if (pathname === '/api/metrics/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');
    sseClients.add(res);

    res.write(`data: ${JSON.stringify({
      type: 'initial_snapshot',
      data: {
        stats: state.stats,
        session: state.session,
        historical: state.historical,
        models: state.models,
        simulationEnabled: state.simulationEnabled,
        targetBaseUrl: state.targetBaseUrl,
        targetModel: state.targetModel,
        historyTimeline: state.historyTimeline,
        recentTraces: state.recentTraces
      }
    })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Summary API
  if (pathname === '/api/metrics/summary') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
      simulationEnabled: state.simulationEnabled,
      stats: state.stats,
      session: state.session,
      historical: state.historical,
      models: state.models,
      historyTimeline: state.historyTimeline,
      recentTraces: state.recentTraces.slice(0, 20)
    }));
    return;
  }

  // Toggle Simulation Endpoint
  if (pathname === '/api/simulator/toggle' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        if (payload.enabled !== undefined) {
          state.simulationEnabled = Boolean(payload.enabled);
        } else {
          state.simulationEnabled = !state.simulationEnabled;
        }

        // Save config
        config.simulationEnabled = state.simulationEnabled;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          simulationEnabled: state.simulationEnabled,
          message: state.simulationEnabled
            ? '已开启演示模拟流（用于图表展示）'
            : '已切换为真实监听模式（无对话时 Token 保持为 0，仅在实际对话时递增）'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Manual Record Metric Endpoint
  if (pathname === '/api/metrics/record' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const trace = recordRequestMetrics({
          modelKey: data.model || 'hermes-3-llama-3.1-8b',
          promptTokens: Number(data.promptTokens || data.prompt_tokens || 0),
          completionTokens: Number(data.completionTokens || data.completion_tokens || 0),
          durationMs: Number(data.durationMs || 500),
          ttftMs: Number(data.ttftMs || 150),
          statusCode: Number(data.statusCode || 200)
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, trace }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Test Chat Prompt Endpoint (快速触发一次真实的对话模拟)
  if (pathname === '/api/test-chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const promptText = payload.prompt || '你好，请简单介绍一下 Hermes 3 大模型的能力。';
        const modelKey = payload.model || 'hermes-3-llama-3.1-8b';

        // Approximate token calculation: 1.5 token per word/char
        const promptTokens = Math.max(12, Math.round(promptText.length * 1.4));
        const sampleResponse = `Hermes 3 是由 Nous Research 研发的最新旗舰开源通用大语言模型，支持最高 128k 超长上下文、强大的结构化输出（JSON Mode）、函数调用（Function Calling）以及自主智能体推理能力。`;
        const completionTokens = Math.max(25, Math.round(sampleResponse.length * 1.5));
        const ttftMs = Math.floor(120 + Math.random() * 80);
        const durationMs = ttftMs + Math.floor(completionTokens * 18);

        const trace = recordRequestMetrics({
          modelKey,
          promptTokens,
          completionTokens,
          durationMs,
          ttftMs,
          statusCode: 200
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          prompt: promptText,
          response: sampleResponse,
          trace
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Real OpenAI/vLLM Compatible Chat Proxy: POST /v1/chat/completions
  if ((pathname === '/v1/chat/completions' || pathname === '/v1/completions') && req.method === 'POST') {
    const startTime = Date.now();
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let reqJson = {};
      try { reqJson = JSON.parse(body); } catch (e) {}

      const promptStr = JSON.stringify(reqJson.messages || reqJson.prompt || '');
      const estPromptTokens = Math.max(15, Math.round(promptStr.length / 4));

      // Proxy to targetBaseUrl if configured
      const targetUrl = new URL(state.targetBaseUrl + (pathname.startsWith('/v1') ? pathname.replace('/v1', '') : pathname));
      const isHttps = targetUrl.protocol === 'https:';
      const clientReq = (isHttps ? https : http).request(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers['authorization'] || (state.apiKey ? `Bearer ${state.apiKey}` : '')
        }
      }, (proxyRes) => {
        let firstChunkTime = null;
        let resBody = '';

        res.writeHead(proxyRes.statusCode, proxyRes.headers);

        proxyRes.on('data', chunk => {
          if (!firstChunkTime) firstChunkTime = Date.now();
          res.write(chunk);
          resBody += chunk.toString();
        });

        proxyRes.on('end', () => {
          res.end();
          const durationMs = Date.now() - startTime;
          const ttftMs = firstChunkTime ? (firstChunkTime - startTime) : 180;

          let completionTokens = 45;
          let promptTokens = estPromptTokens;

          try {
            const parsed = JSON.parse(resBody);
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens || promptTokens;
              completionTokens = parsed.usage.completion_tokens || completionTokens;
            }
          } catch (e) {
            completionTokens = Math.max(10, Math.round(resBody.length / 4));
          }

          recordRequestMetrics({
            modelKey: reqJson.model || 'hermes-3-llama-3.1-8b',
            promptTokens,
            completionTokens,
            durationMs,
            ttftMs,
            statusCode: proxyRes.statusCode
          });
        });
      });

      clientReq.on('error', (err) => {
        // Target service unreachable, return fallback response
        const durationMs = Date.now() - startTime;
        const fallbackText = `[Hermes Monitor Proxy] 后端 Hermes 接口 (${state.targetBaseUrl}) 暂未连接，已记录本次测试请求。\n错误详情: ${err.message}`;
        const completionTokens = Math.max(20, Math.round(fallbackText.length / 3));

        recordRequestMetrics({
          modelKey: reqJson.model || 'hermes-3-llama-3.1-8b',
          promptTokens: estPromptTokens,
          completionTokens,
          durationMs,
          ttftMs: 150,
          statusCode: 200
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-' + Math.random().toString(36).substring(2, 9),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: reqJson.model || state.targetModel,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: fallbackText },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: estPromptTokens,
            completion_tokens: completionTokens,
            total_tokens: estPromptTokens + completionTokens
          }
        }));
      });

      clientReq.write(body);
      clientReq.end();
    });
    return;
  }

  // Update Config Endpoint
  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newCfg = JSON.parse(body);
        if (newCfg.targetBaseUrl) state.targetBaseUrl = newCfg.targetBaseUrl;
        if (newCfg.targetModel) state.targetModel = newCfg.targetModel;
        if (newCfg.apiKey !== undefined) state.apiKey = newCfg.apiKey;
        if (newCfg.simulationEnabled !== undefined) state.simulationEnabled = Boolean(newCfg.simulationEnabled);

        fs.writeFileSync(CONFIG_FILE, JSON.stringify({
          targetBaseUrl: state.targetBaseUrl,
          targetModel: state.targetModel,
          apiKey: state.apiKey,
          simulationEnabled: state.simulationEnabled
        }, null, 2), 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '配置已更新并持久化保存' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Reset Metrics endpoint
  if (pathname === '/api/metrics/reset' && req.method === 'POST') {
    state.stats.totalPromptTokens = 0;
    state.stats.totalCompletionTokens = 0;
    state.stats.totalTokens = 0;
    state.stats.totalRequests = 0;
    state.stats.successfulRequests = 0;
    state.stats.failedRequests = 0;
    state.session.promptTokens = 0;
    state.session.completionTokens = 0;
    state.session.totalTokens = 0;
    state.session.totalRequests = 0;
    state.session.estimatedCostUsd = 0;
    state.recentTraces = [];
    Object.keys(state.models).forEach(k => {
      state.models[k].promptTokens = 0;
      state.models[k].completionTokens = 0;
      state.models[k].requests = 0;
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Session metrics reset successfully' }));
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Hermes Token Monitoring Gateway is running at:`);
  console.log(`   👉 Web UI: http://localhost:${PORT}`);
  console.log(`   🔌 Real API Proxy: http://localhost:${PORT}/v1/chat/completions`);
  console.log(`   ⚡ Real-time SSE Stream: http://localhost:${PORT}/api/metrics/stream`);
  console.log(`   🎮 Simulation Mode: ${state.simulationEnabled ? 'ON (演示模式)' : 'OFF (真实监听模式)'}`);
  console.log(`====================================================`);
});
