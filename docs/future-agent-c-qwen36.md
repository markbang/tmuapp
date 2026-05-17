# tmuapp 技术架构分析与未来路线图

> 作者: Agent C | 日期: 2026-05-17 | 状态: 提案

---

## 一、代码现状：完整架构梳理

### 1.1 整体结构

```
tmuapp/
├── apps/
│   ├── api/src/              # Node.js HTTP + WebSocket API 服务器
│   │   ├── index.ts          # 入口，创建 server
│   │   ├── server.ts         # HTTP 路由 + WebSocket 升级 + 静态文件服务
│   │   ├── tmux.ts           # tmux 命令封装（snapshot/create/kill/capture/resize/input）
│   │   └── tmux-stream.ts    # tmux control-mode 实时流（-C attach-session）
│   ├── website/src/          # React + Vite Web 控制台
│   │   ├── main.tsx          # 单一 App 组件，Fleet/Cockpit 双视图
│   │   ├── api/client.ts     # fetch + WebSocket 客户端
│   │   ├── terminal/         # xterm.js 封装层
│   │   │   ├── terminal-adapter.ts      # WebGL/WebGPU 渲染、插件加载
│   │   │   ├── terminal-fit.ts          # 自适应容器尺寸测量
│   │   │   ├── terminal-protocol.ts     # WebSocket 消息解析/发送
│   │   │   └── terminal-scroll.ts       # 滚动跟随逻辑
│   │   ├── components/       # SessionGrid, WindowStrip, SessionComposer 等
│   │   ├── tmux-helpers.ts   # 选择状态协调、ANSI 剥离、预览文本
│   │   └── styles/           # CSS 设计系统 (tokens, terminal, layout, responsive)
│   └── android/              # Jetpack Compose Android 客户端
│       └── app/src/main/kotlin/
│           ├── MainActivity.kt      # Compose UI + WebView 终端
│           ├── ApiClient.kt         # OkHttp HTTP + WebSocket 客户端
│           └── TmuappTheme.kt       # 深色/浅色调色板
├── packages/utils/src/       # 共享类型 + 解析器
│   └── index.ts              # TmuxSession/TmuxWindow/TmuxPane 类型 + parse* + sanitizeTarget
├── Dockerfile                # 多阶段构建：Node 22 + tmux
├── docker-compose.yml        # 本地开发用
└── .github/workflows/        # CI: Android 签名 + Release
```

### 1.2 数据流架构

```
[tmux server] ← spawn → [api/tmux.ts] ← HTTP → [website/api/client.ts] ← React State → UI
                  ↕                          ↕
              [tmux-stream.ts] ← WebSocket → [terminal-protocol.ts] ← xterm.js
              (tmux -C control mode)          (parse/send JSON messages)
```

**关键文件证据**：

- `apps/api/src/server.ts:72-108`：WebSocket 升级处理，路由 `/api/panes/:target/stream`
- `apps/api/src/tmux-stream.ts:21-47`：`createTmuxStream` 使用 `tmux -C attach-session` 建立 control-mode 连接，解析 `%output` 行
- `apps/api/src/tmux.ts:140-158`：`buildSendKeysArgs` 智能识别控制字符（0x00-0x1f, 0x7f）并映射为 tmux key names
- `apps/website/src/terminal/terminal-adapter.ts:35-74`：xterm.js 配置，加载 WebGL/Ligatures/Image/Unicode11/WebLinks 等插件
- `packages/utils/src/index.ts:66-71`：`sanitizeTarget` 正则 `/^[%@$]?[A-Za-z0-9_.:/+-]+$/` 做注入防护

### 1.3 当前能力矩阵

| 能力                                   | 状态    | 代码位置                                                               |
| -------------------------------------- | ------- | ---------------------------------------------------------------------- |
| HTTP REST API (sessions/windows/panes) | ✅ 完整 | `server.ts`, `tmux.ts`                                                 |
| WebSocket 实时流                       | ✅ 基础 | `tmux-stream.ts`, `terminal-protocol.ts`                               |
| ANSI 终端渲染 (Web)                    | ✅ 完善 | `terminal-adapter.ts` (xterm.js + WebGL)                               |
| 终端自适应尺寸                         | ✅ 完善 | `terminal-fit.ts`                                                      |
| 键盘输入转发                           | ✅ 精确 | `terminal-adapter.ts:64-69` (onData 单一路径)                          |
| 滚动跟随/回看                          | ✅ 完善 | `terminal-scroll.ts`                                                   |
| Bearer Token 认证                      | ✅ 基础 | `server.ts:33-36`, `isAuthorized()`                                    |
| Android 客户端                         | ✅ 基础 | `MainActivity.kt`, `ApiClient.kt` (WebView 渲染终端)                   |
| Docker 镜像                            | ✅ 完整 | `Dockerfile`                                                           |
| CI/CD                                  | ✅ 完整 | `.github/workflows/`                                                   |
| E2E 测试                               | ✅ 完善 | `tests/e2e/terminal.spec.ts` (16 tests), `keyboard.spec.ts` (20 tests) |
| 会话创建/销毁                          | ✅      | HTTP API                                                               |
| Pane 分割                              | ✅      | `POST /api/panes/:target/split`                                        |
| Pane 尺寸调整                          | ✅      | `POST /api/panes/:target/resize`                                       |
| 窗口标签/活动指示                      | ✅ 基础 | `WindowStrip.tsx` (3s 活动点)                                          |
| 设计系统                               | ✅ 规范 | `tokens.css`, `design/README.md`                                       |

### 1.4 架构约束与风险

| 约束                        | 说明                           | 影响                          |
| --------------------------- | ------------------------------ | ----------------------------- |
| 单一 tmux server            | 每实例只连一个 tmux server     | 不支持多机/集群               |
| 无多 Pane 同时流            | 一次只流一个 Pane              | 无法同时监控多个 Pane         |
| Android 用 WebView 渲染终端 | 不是原生终端                   | 性能受限、无离线能力          |
| 认证仅 Bearer Token         | 无用户模型、RBAC               | 无法细粒度权限                |
| 无插件系统                  | 无 API 扩展点                  | 无法支持自动化脚本/第三方集成 |
| 无 tmux agent 概念          | 纯 tmux 代理                   | 无法追踪 agent 状态           |
| 实时流无重连机制            | WebSocket 断开即失效           | 网络不稳定时体验差            |
| CPU/MEM 指标为假数据        | `SessionGrid.tsx:14-16` 随机数 | 非真实系统监控                |

---

## 二、参考产品分析

### 2.1 Muxy (muxy.dev / muxy-app/muxy)

**定位**: macOS 原生终端多路管理器 (Swift + libghostty)

**可借鉴能力**：

1. **Workspace 概念** — 按项目/git worktree 组织终端、浏览器标签、编辑器，实现跨分支/任务无冲突切换
2. **Agent-aware 终端** — 实时识别 Claude Code、OpenCode、Codex 等 AI 编程 agent 状态（working/blocked/done）
3. **原生键盘驱动** — 全局快捷键唤起 workspace，纯键盘操作流
4. **Port 冲突检测** — 自动跟踪各 workspace 监听的端口
5. **进程/Git 状态侧边栏** — live git branch/dirty/ahead-behind 状态

**差异**：Muxy 是 macOS 原生应用（libghostty），tmuapp 是跨平台 Web/Android + tmux 方案，目标用户不同但 Workspace + Agent-aware 概念高度可借鉴。

### 2.2 Herdr (herdr.dev / ogulcancelik/herdr)

**定位**: 终端内 AI agent 多路复用器（Rust 单二进制）

**可借鉴能力**：

1. **Unix Socket API** — 本地 socket 暴露 workspace/tab/pane 控制和事件订阅 (`SOCKET_API.md`)
2. **Agent 状态启发式检测** — 通过 foreground process + 屏幕启发式自动识别 agent 状态，无需 hook
3. **Agent Skill (SKILL.md)** — 为 coding agent 提供操作指南，agent 可在 herdr 内部控制自身环境
4. **Detach/Reattach** — agent 持续运行，客户端可随时重连
5. **混合集成模型** — 内置启发式检测 + 可选 hook/plugin 转发语义状态

**差异**：herdr 是终端内 TUI 工具，tmuapp 是 Web/Android 远程管理。但 herdr 的 **agent 状态感知 + socket API + SKILL.md 模式** 对 tmuapp 的 AI 编程场景支持有直接借鉴价值。

### 2.3 其他竞品参考

| 产品                            | 借鉴点                                         |
| ------------------------------- | ---------------------------------------------- |
| **webtmux** (chrismccord)       | 可视化 Pane 布局 minimap、移动端触控操作       |
| **tmuxy** (tmuxy.sh)            | "GUI for tmux, not another terminal" 定位一致  |
| **agentboard** (gbasin)         | 针对 agent TUI 优化、iOS Safari 适配、日志匹配 |
| **gmux** (gmuxapp)              | 多机管理、按项目分组、实时状态推送             |
| **workmux** (workmux.raine.dev) | 并行 AI agent + git worktree 绑定              |
| **Terminal7** (tuzig)           | WebRTC 传输、触控优先                          |

---

## 三、技术路线提案（第一轮）

### 3.1 总体方向：从"tmux 遥控器"到"Agent-Aware 终端工作台"

当前 tmuapp 是一个优秀的 tmux 远程遥控器（Web + Android），但缺少以下核心能力：

1. **Agent 状态感知** — 不知道 Pane 里跑的是 shell、vim、还是 Claude Code
2. **Workspace 组织** — 没有项目/任务级别的概念，只有 tmux session
3. **多 Pane 监控** — 一次只能看一个 Pane，无法并行监控
4. **插件/自动化 API** — 无第三方集成能力
5. **权限细化** — 单一 token，无法区分只读/写入/管理

### 3.2 核心能力组合

```
┌─────────────────────────────────────────────────────────┐
│                   tmuapp v1.0 能力矩阵                    │
├────────────┬────────────────────────────────────────────┤
│ 实时流     │ 多 Pane WebSocket、断线重连、流聚合           │
│ 终端渲染   │ WebGL + 多终端标签、Sixel 图像、移动端原生    │
│ 权限安全   │ 多用户、RBAC、Token 过期、只读模式            │
│ Tmux Agent │ control-mode 增强、agent 状态检测、SKILL.md  │
│ 移动端     │ 原生终端渲染、离线缓存、推送通知              │
│ 插件 API   │ REST webhook、事件流、CLI SDK                │
│ AI 场景    │ agent 状态面板、并行 workspace、日志匹配      │
└────────────┴────────────────────────────────────────────┘
```

---

## 四、里程碑路线（第二轮：深化）

### Phase 1: 基础设施加固（v0.2）— 4-6 周

**目标**: 解决当前架构风险，为后续功能打底

#### M1.1 实时流增强

- **问题**: 当前 WebSocket 断线即丢失，无重连
- **方案**:
  - 客户端 `terminal-protocol.ts` 增加指数退避重连
  - 服务端 `tmux-stream.ts` 增加心跳机制（每 30s 发送 `{type: "ping"}`）
  - 支持多 Pane 并行流：`/api/panes/:target/stream` 改为支持 query `?targets=%1,%2,%3`
- **风险**: tmux control-mode 每个 attach-session 独占一个客户端，多流需要多次 attach
- **缓解**: 使用 `tmux -C attach-session -t target` 的只读模式（`-r` 标志不存在，需另辟蹊径——可考虑 `capture-pane -e -p` 轮询 + WebSocket 合并）

#### M1.2 认证与权限

- **问题**: 单一 token，无权限分级
- **方案**:
  - 在 API 层增加 `mode` 参数: `read` / `write` / `admin`
  - 只读模式禁用 `POST/DELETE` 端点（`server.ts` 路由守卫）
  - Token 格式扩展: `TMUAPP_TOKENS='token1:admin,token2:read'`
- **代码改动**: `server.ts:33-36` 的 `isAuthorized` 改为 `authorize(request, authToken, requiredMode)`

#### M1.3 Android 终端渲染改进

- **问题**: WebView 渲染终端性能差
- **方案**:
  - 方案 A: 继续 WebView 但改用本地打包的 xterm.js（不依赖 CDN）
  - 方案 B: 引入 [TerminalView](https://github.com/termux/terminal-view) 原生组件
  - 推荐方案 A（风险低），在 `TerminalWebView` 中将 CDN 改为本地 assets

### Phase 2: Agent-Aware 终端工作台（v0.3）— 6-8 周

**目标**: 借鉴 herdr 的 agent 状态感知能力

#### M2.1 Agent 状态检测引擎

- **问题**: 无法知道 Pane 里跑的是什么
- **方案**:
  - 新增 `apps/api/src/agent-detect.ts` 模块
  - 复用 `capture-pane` 输出，通过启发式规则匹配 agent 状态：
    - **Claude Code**: 检测 `> claude` 提示符、`Working...` / `Done` 状态
    - **Codex**: 检测 `codex` 进程名、特定输出模式
    - **OpenCode**: 检测 `opencode` 进程名
    - **Vim/Neovim**: 检测全屏 ANSI 序列
    - **Running**: 进程在运行中
    - **Prompt**: 等待用户输入
    - **Blocked**: 进程等待但无输出
  - 输出: `GET /api/panes/:target/status` 返回 `{ agent: "claude" | "vim" | "shell" | "unknown", state: "working" | "prompt" | "blocked" | "done" }`

#### M2.2 Workspace 概念

- **问题**: 只有 tmux session，没有项目/任务级别组织
- **方案**:
  - 新增 Workspace 抽象层（不修改 tmux 底层）
  - `packages/utils/src` 增加 `Workspace` 类型
  - Workspace 定义: `{ id, name, sessions: string[], projectPath?: string, gitBranch?: string }`
  - API: `GET/POST/DELETE /api/workspaces`
  - Web UI: Fleet 视图按 Workspace 分组显示 sessions

#### M2.3 Web UI Agent 状态面板

- 在 Cockpit 视图增加侧边栏，显示当前 session 各 Pane 的 agent 状态
- 借鉴 herdr 的 "working/prompt/done" 三色指示
- 活动指示从 3s 改为基于 agent 状态

### Phase 3: 插件与自动化 API（v0.4）— 4-6 周

**目标**: 开放 API，支持第三方集成

#### M3.1 REST Webhook 系统

- `POST /api/webhooks` 注册事件回调
- 事件类型: `session.created`, `session.deleted`, `agent.state_changed`, `pane.output_matched`
- 日志匹配: `POST /api/panes/:target/match` 注册正则，匹配时触发 webhook

#### M3.2 CLI SDK

- `packages/cli/` 新增 Node.js CLI 工具
- 命令: `tmuapp sessions`, `tmuapp capture`, `tmuapp send`, `tmuapp watch`
- 用于 CI/CD 集成和自动化脚本

#### M3.3 SKILL.md 支持

- 借鉴 herdr，为 coding agent 提供操作指南
- `GET /api/skill.md` 返回 tmuapp 的操作指南
- 支持 agent 通过 API 控制 tmux 环境

### Phase 4: 移动端增强（v0.5）— 6-8 周

**目标**: 移动端体验接近桌面

#### M4.1 Android 原生终端

- 方案: 引入 `termux/terminal-view` 或自研基于 Canvas 的终端渲染
- 支持软键盘映射（Ctrl/Alt/Esc 专用键栏）
- 支持横屏全屏终端

#### M4.2 推送通知

- agent 状态变化时推送通知到手机
- Android: Firebase Cloud Messaging
- Web: Push API + Service Worker

#### M4.3 iOS Web App

- PWA 支持: `manifest.json` + Service Worker
- iOS Safari 优化（借鉴 agentboard 经验）

---

## 五、需要新增/重构的模块

### 5.1 新增模块

| 模块               | 路径                           | 用途                   |
| ------------------ | ------------------------------ | ---------------------- |
| Agent 检测引擎     | `apps/api/src/agent-detect.ts` | 启发式 agent 状态检测  |
| Workspace 管理     | `apps/api/src/workspaces.ts`   | Workspace CRUD         |
| WebSocket 管理器   | `apps/api/src/ws-manager.ts`   | 多连接管理、心跳、广播 |
| Webhook 引擎       | `apps/api/src/webhooks.ts`     | 事件注册与分发         |
| CLI SDK            | `packages/cli/src/`            | Node.js CLI 工具       |
| SKILL.md           | `apps/api/src/skill.ts`        | Agent 操作指南生成     |
| PWA Service Worker | `apps/website/src/sw.ts`       | 离线缓存 + Push        |

### 5.2 重构模块

| 模块                      | 当前问题             | 重构方向                            |
| ------------------------- | -------------------- | ----------------------------------- |
| `server.ts`               | 路由硬编码、无中间件 | 引入路由中间件模式，支持权限检查链  |
| `tmux-stream.ts`          | 单流、无重连、无心跳 | 重构为 `TmuxStreamManager` 支持多流 |
| `ApiClient.kt`            | 手动 JSON 解析       | 引入 Kotlinx Serialization          |
| `SessionGrid.tsx`         | CPU/MEM 假数据       | 替换为真实 agent 状态或移除         |
| `WindowStrip.tsx`         | 3s 活动点            | 替换为基于 agent 状态的智能指示     |
| Android `TerminalWebView` | CDN 依赖、无离线     | 本地打包 xterm.js assets            |

---

## 六、测试/验证策略

### 6.1 单元测试

```
apps/api/src/
├── agent-detect.test.ts    # agent 状态检测规则测试
├── workspaces.test.ts      # workspace CRUD 测试
├── ws-manager.test.ts      # WebSocket 管理器测试
├── webhooks.test.ts        # webhook 注册/触发测试
└── tmux-stream.test.ts     # 多流/重连/心跳测试（重构后）
```

### 6.2 E2E 测试扩展

在 `apps/website/tests/e2e/` 新增：

| 测试文件                    | 覆盖内容                       |
| --------------------------- | ------------------------------ |
| `agent-detection.spec.ts`   | Agent 状态显示、状态切换       |
| `workspace.spec.ts`         | Workspace CRUD、分组显示       |
| `multi-pane-stream.spec.ts` | 多 Pane 同时流、流切换         |
| `reconnect.spec.ts`         | WebSocket 断线重连、状态恢复   |
| `auth.spec.ts`              | 只读模式、多 token、未授权拦截 |

### 6.3 Android 测试

| 测试类型     | 覆盖内容                        |
| ------------ | ------------------------------- |
| Unit (JUnit) | `ApiClient` JSON 解析、状态检测 |
| Compose UI   | Dashboard/TerminalScreen 渲染   |
| Espresso     | WebView 终端输入/滚动           |
| APK 签名     | CI 签名验证（已有）             |

### 6.4 集成测试

- Docker 镜像启动 → health check → API call → session create → capture
- WebSocket stream → send input → verify output
- 多客户端同时连接同一 Pane 流

---

## 七、风险评估

### 7.1 技术风险

| 风险                       | 等级  | 说明                                | 缓解                                                  |
| -------------------------- | ----- | ----------------------------------- | ----------------------------------------------------- |
| tmux control-mode 多流限制 | 🔴 高 | 每个 `attach-session -C` 独占客户端 | 使用 `capture-pane` 轮询 + WebSocket 合并作为降级方案 |
| Agent 检测准确率           | 🟡 中 | 启发式规则可能误判                  | 提供规则配置、支持 hook 覆盖、持续优化                |
| Android 原生终端兼容性     | 🟡 中 | termux/terminal-view 版本碎片化     | 先 WebView 本地打包，后渐进替换                       |
| WebSocket 重连状态同步     | 🟡 中 | 重连后终端状态不一致                | 重连时先发送完整 capture，再续流                      |
| 多用户权限模型复杂度       | 🟡 中 | RBAC 引入权限模型                   | 初期仅 read/write/admin 三级，逐步演进                |

### 7.2 产品风险

| 风险                       | 等级  | 说明                                 | 缓解                                                            |
| -------------------------- | ----- | ------------------------------------ | --------------------------------------------------------------- |
| 功能蔓延                   | 🔴 高 | Agent/Workspace/Webhook 可能偏离核心 | 严格遵循 Fleet → Cockpit 信息架构，新功能必须能映射到这两个视图 |
| 与 tmuxy/agentboard 同质化 | 🟡 中 | 竞品也在做类似功能                   | 聚焦"跨平台 + Android 原生 + Agent-Aware"差异化                 |
| 用户体验下降               | 🟡 中 | 新增面板可能破坏终端沉浸感           | 遵循 `design/README.md` 反 slop 规则，终端始终占主导            |

### 7.3 运维风险

| 风险           | 等级  | 说明                         | 缓解                                       |
| -------------- | ----- | ---------------------------- | ------------------------------------------ |
| 镜像体积增长   | 🟡 中 | 新增模块可能增大 Docker 镜像 | 保持多阶段构建，仅包含运行时依赖           |
| 安全暴露面扩大 | 🔴 高 | Webhook + 多用户增加攻击面   | Webhook URL 白名单、Token 过期、HTTPS 强制 |

---

## 八、决策建议

### 8.1 优先做

1. **M1.1 实时流重连** — 当前最影响用户体验的痛点
2. **M2.1 Agent 状态检测** — 最大差异化功能，借鉴 herdr 但更适合 Web 场景
3. **M1.2 只读模式** — 安全需求，成本低

### 8.2 暂缓做

1. **iOS 原生客户端** — Web PWA 足够覆盖大部分场景
2. **完整 RBAC** — 三级模式足够，不需要用户/角色模型
3. **WebRTC 替代 WebSocket** — WebSocket 在 99% 场景够用，WebRTC 增加复杂度

### 8.3 不做

1. **替代 tmux 成为终端模拟器** — 保持"GUI for tmux"定位
2. **Electron 桌面端** — Web 已是跨平台，不需要桌面封装
3. **自建终端协议** — 复用 xterm.js 生态

---

## 九、架构演进图示

```
当前 (v0.1):
┌──────────┐    HTTP/WS    ┌──────────┐    spawn    ┌─────────┐
│  Web/APP │ ◄────────────► │  API     │ ◄─────────► │  tmux   │
│  (单流)  │               │ (单 token)│            │ server  │
└──────────┘               └──────────┘            └─────────┘

目标 (v1.0):
┌──────────┐    HTTP/WS    ┌──────────────────────────────────┐
│  Web PWA │ ◄────────────► │  API Server                      │
│  Android │               │  ├── Auth Middleware (RBAC)      │
│  CLI SDK │               │  ├── WS Manager (多流/心跳/重连)  │
└──────────┘               │  ├── Agent Detector (启发式)     │
                           │  ├── Workspace Manager           │
                           │  ├── Webhook Engine              │
                           │  └── SKILL.md Generator          │
                           └────────────────┬─────────────────┘
                                            │ spawn + control
                                 ┌──────────┴──────────┐
                                 │  tmux server         │
                                 │  (多个 + 远程 SSH)    │
                                 └─────────────────────┘
```

---

## 十、附录

### A. 关键文件索引

| 文件                                            | 行数 | 核心功能                              |
| ----------------------------------------------- | ---- | ------------------------------------- |
| `apps/api/src/server.ts`                        | ~260 | HTTP 路由 + WS 升级 + 静态服务 + 认证 |
| `apps/api/src/tmux-stream.ts`                   | ~130 | tmux control-mode 流管理              |
| `apps/api/src/tmux.ts`                          | ~230 | tmux 命令封装 + send-keys 智能映射    |
| `apps/website/src/main.tsx`                     | ~430 | Fleet/Cockpit 双视图 React 应用       |
| `apps/website/src/terminal/terminal-adapter.ts` | ~170 | xterm.js 封装 + 插件加载              |
| `apps/website/src/api/client.ts`                | ~50  | fetch + WS URL 构建                   |
| `apps/android/.../MainActivity.kt`              | ~400 | Compose UI + WebView 终端             |
| `apps/android/.../ApiClient.kt`                 | ~180 | OkHttp HTTP + WS 客户端               |
| `packages/utils/src/index.ts`                   | ~120 | 共享类型 + 解析器 + target 校验       |

### B. 竞品能力对比

| 能力            | tmuapp (当前) | Muxy |    Herdr    | tmuxy | agentboard |
| --------------- | :-----------: | :--: | :---------: | :---: | :--------: |
| Web 终端        |      ✅       |  ❌  |     ❌      |  ✅   |     ✅     |
| Android 客户端  |      ✅       |  ❌  |     ❌      |  ❌   |     ❌     |
| Agent 状态感知  |      ❌       |  ✅  |     ✅      |  ❌   |     ✅     |
| Workspace 组织  |      ❌       |  ✅  |     ✅      |  ❌   |     ❌     |
| 多机管理        |      ❌       |  ❌  |     ❌      |  ❌   |     ✅     |
| 插件/自动化 API |      ❌       |  ❌  | ✅ (socket) |  ❌   |     ❌     |
| 触控优化        |      ⚠️       |  ❌  |     ❌      |  ⚠️   |     ✅     |
| 离线支持        |      ❌       |  ✅  |     ✅      |  ❌   |     ❌     |

### C. 术语说明

- **Fleet**: 会话概览视图，用户选择 tmux 工作站点
- **Cockpit**: 会话管理视图，活动 Pane 为主表面
- **Agent**: 在终端中运行的 AI 编程工具（Claude Code、Codex、OpenCode 等）
- **Control-mode**: tmux `-C` 标志，用于程序化控制 tmux 会话
