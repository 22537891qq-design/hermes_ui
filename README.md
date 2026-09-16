# Hermes LLM 实时 Token 调用量与性能监控大屏 (Hermes Telemetry Hub)

专门为 **Nous Hermes** 系列开源大语言模型（Hermes 3 8B / 70B / 405B、OpenHermes 等）设计的实时可视化监控大屏。全面监测实时 Token 流速、首字时延（TTFT）、端到端延迟、模型吞吐比重、上下文窗口分布及实时请求审计流水。

---

## 🌟 核心功能特性

1. **真实监听模式 (默认) vs 演示模拟模式 (Demo)**
   - **真实监听模式（默认启动）**：**没有对话时 Token 保持为 0，绝对不会凭空增加**。只有当有客户端或脚本向 Hermes 发起真实对话时，系统才会精确捕获并实时增加 Token 和生成时延！
   - **演示模拟模式 (Demo)**：点击顶部「切换为演示模拟」，即可自动模拟流式 Token 与高频流量，用于大屏图表动画演示。

2. **内置 OpenAI / vLLM 兼容本地代理端点**
   - 本地代理端点：`http://localhost:3000/v1`
   - 将任意第三方聊天软件（如 Chatbox、NextChat、Cherry Studio、VSCode 插件或 Python 请求）的 Base URL 指向 `http://localhost:3000/v1`，所有实际对话将被 100% 准确拦截、记录并实时投射在大屏上。

3. **实时 Token 吞吐波形 (Waveform)**
   - 动态 60 FPS 平滑波形图，实时呈现 **Completion TPS（生成速率）** 与 **Prompt TPS（输入接收速率）**。
   - 实时统计并展示瞬时吞吐峰值（Peak TPS）与活跃并发流。

2. **核心性能与延迟监测 (Latency & TTFT)**
   - 首字时间（Time To First Token, TTFT）动态跟踪。
   - 端到端（E2E）耗时直方图与 P95/P99 延迟水位。

3. **模型分布与成本核算**
   - 多模型混合负载监测：Hermes-3-8B、Hermes-3-70B、Hermes-3-405B、OpenHermes-2.5。
   - 实时预估调用费用（USD）与各模型 Token 占比进度条。

4. **上下文窗口利用率 (Context Window Distribution)**
   - 监控 4k、16k、64k 及 128k 超长上下文分布情况。

5. **推理引擎底层健康监测**
   - 模拟或对接 vLLM / PagedAttention 显存使用率（VRAM）、GPU 计算利用率及请求排队深度。

6. **实时请求流水与审计 (Live Request Traces)**
   - 实时滚动的 Trace 列表，显示每个 Request 的输入/输出 Token 数、TTFT、TPS、状态码（200 OK / 429 限流 / 500 异常）。
   - 支持关键词搜索与状态码过滤。
   - 支持一键导出 CSV 报告。

7. **双模式灵活切换**
   - **动态模拟模式（Demo）**：内置智能流量发生器与长尾时延抖动，开箱即用。
   - **真实 API 接入模式**：支持配置 OpenAI / vLLM / Ollama 兼容的 Hermes `/v1` 接口，提供连通性探测。

---

## 🚀 启动与运行指南

### 方法 1：双击独立 EXE 启动器（带专属高分图标 ⭐ 强烈推荐）

直接在项目文件夹中双击运行：
- **`启动Hermes监控.exe`** 或 **`HermesMonitor.exe`**

> **特色功能**：
> - 🎨 **自带定制高颜值 Hermes 专属徽标图标**（青蓝渐变微光），在 Windows 资源管理器与任务栏醒目呈现。
> - ⚡ **无黑框后台静默拉起**：自动在后台启动 Node 核心服务，不再需要常驻黑框命令行窗口。
> - 🌐 **自动打开大屏**：启动后 1.5 秒自动调起系统默认浏览器访问 `http://localhost:3000`。
> - 💻 **右下角系统托盘菜单 (System Tray)**：
>   - 双击托盘图标即可随时打开监控大屏。
>   - 右键菜单支持「打开大屏」、「重启服务」、「一键安全退出」。
>
> 另外也保留了批处理脚本：
> - **`启动监控面板.bat`** / **`start.bat`**：带终端日志输出的双击启动脚本。
> - **`stop.bat`**：一键关闭服务脚本。

---

### 方法 2：终端命令行启动

在项目根目录下执行：

```bash
# 使用 npm 脚本
npm start

# 或直接使用 Node.js
node server.js

# 或在 PowerShell 中运行
.\start.ps1
```

### 2. 访问监控大屏

打开浏览器访问：
👉 **http://localhost:3000**


---

## 🔌 接入真实 Hermes / vLLM 实例

点击右上角 **「接入配置」** 按钮：
1. 选择 **「真实 Hermes API 端点」**。
2. 输入您的 API Base URL（例如：`http://localhost:8000/v1` 或云端端点）。
3. 填入 API Key（若有鉴权）。
4. 点击 **「测试连通性」** 验证健康状态，点击 **「保存并生效」**。

---

## 📊 API 接口列表

- `GET /api/metrics/stream` : SSE (Server-Sent Events) 实时指标流。
- `GET /api/metrics/summary` : 当前聚合指标与近 20 条 Trace JSON 摘要。
- `POST /api/metrics/reset` : 重置累计 Token 与请求计数器。
- `POST /api/hermes/test-connection` : 测试与 Hermes API 节点的连通性与显存状态。
