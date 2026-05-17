# tmuapp 未来方向战略文档

日期：2026-05-17

## 背景：tmuapp 当前能力

tmuapp 当前不是一个“重新实现 terminal emulator”的项目，而是一个运行在真实 `tmux` 之上的自托管管理控制面。它已经具备一组较完整的基础能力：

- **Web Console**：通过浏览器查看 tmux session/window/pane，渲染 ANSI 输出，支持 pane capture、输入、Enter、split、resize、session/window 管理，以及 `/api/panes/:target/stream` WebSocket 实时流。
- **HTTP API + WebSocket API**：`apps/api` 以 Node.js 封装本机 `tmux` 命令，提供 session/window/pane 的 CRUD、capture、input、keys、resize、split，并通过 `tmux -C attach-session` 提供单 pane control-mode 流。
- **Docker 部署**：镜像内置 tmux、API server、静态 Web 资产和 healthcheck，可在容器内隔离运行 tmux，也可通过 socket/UID 控制宿主机 tmux。
- **Android 客户端**：Jetpack Compose 客户端已能 health check、列出 session、创建/删除 session、capture pane、发送输入和 Enter，但目前更接近“基础可用原型”，尚不是完整移动端工作流。
- **共享 utils**：`packages/utils` 提供 tmux 类型、format/parser、target validation，是 API/Web/Android 共享协议的基础。
- **安全现状**：支持可选单一 `TMUAPP_TOKEN`，但没有 token 分级、只读模式、审计日志；CORS 当前默认宽松。由于 tmuapp 等价于远程 shell 控制面，安全是后续采用的关键前置条件。

因此，tmuapp 的基础差异化是：**以真实 tmux 为运行时，提供 Web、Android、HTTP/WebSocket API、Docker 的远程管理层**。它最适合的场景不是替代本地终端，而是远程看护、跨设备访问、长任务管理、AI coding agent 观察与快速回复。

## muxy / herdr 的启发与不可盲抄之处

### muxy 的启发

muxy 的价值不在“又一个终端”，而在把终端、项目、worktree、浏览器/editor 上下文组织为面向任务的 workspace。它提示 tmuapp：用户真正关心的不是 `$1/@1/%1` 这些 tmux 标识，而是“哪个项目、哪个分支、哪个任务、哪个 agent 正在跑、是否卡住”。

可借鉴：

- 用 **项目/任务上下文** 包装 tmux session，而不是只暴露 tmux 原生树。
- 在界面上突出 repo、cwd、branch、当前进程、端口、最近输出等工作上下文。
- 关注并行工作时的切换成本，而不仅是 terminal 渲染性能。

不可盲抄：

- muxy 是 macOS native + libghostty 路线，tmuapp 的技术栈和优势是 Web/API/Docker/Android。
- tmuapp 不应追逐 macOS 原生终端模拟器性能，也不应尝试替代 tmux。
- workspace 概念不能在没有用户验证时过早平台化；在 tmuapp 中应先从 session label、current command、cwd、git metadata 等轻量信息开始。

### herdr 的启发

herdr 的强定位是 “tmux for agents”：在终端内管理多个 agent，并显示 blocked/working/done 等状态。它证明了“AI agent 多路复用与状态感知”有真实关注度。

可借鉴：

- **Agent-first 信息架构**：用户一眼看到哪些 agent 正在工作、哪些在等人、哪些完成/失败。
- **不中断长任务**：detach/reattach、长期运行任务持续保活，这与 tmux 天然契合。
- **状态而非纯输出**：从 terminal 字符流中提取“需要我处理”的状态。

不可盲抄：

- herdr 是终端内 TUI，tmuapp 的机会在 Web/手机/远程自托管 cockpit。
- 不应进入“agent 编排平台”或 socket API 竞赛；这会与 herdr 正面竞争且工程量过大。
- tmuapp 的 agent 能力应先限于 **观察状态 + 快速回复**，而非调度/编排/多 agent 自动协作。

## 多轮讨论过程摘要

### 第一轮：候选方向发散

各轮报告提出了十五类候选方向：

1. AI Agent 状态感知 / Agent Cockpit
2. Project Workspace / worktree 工作区
3. Android 移动端远程看护
4. Web session dashboard / live grid
5. Automation API / SDK / CLI
6. 安全远程访问套件
7. Dockerized devbox / ephemeral workspace
8. Pane layout 可视化编辑
9. Command palette / runbook buttons
10. Team observe / pairing mode
11. Terminal recording / replay / audit
12. Plugin / detector framework
13. 国内网络穿透方案
14. 多服务器聚合管理
15. macOS native / 终端模拟器

### 第二轮：否决、认可、合并

被明确否决或长期搁置的方向：

- **macOS 原生终端 / 自研 terminal emulator**：与 muxy 赛道重合，技术栈不匹配，偏离 tmux control plane。
- **完整团队协作 / 多用户共享 terminal**：需要用户体系、RBAC、输入仲裁、分享链接、安全审计，远超当前阶段。
- **多服务器 hub 聚合**：复杂度高，需求未验证；单机自托管场景尚未验证 PMF。
- **Terminal recording/replay 默认开启**：存储膨胀、敏感信息泄漏、retention 策略复杂。
- **重型云 IDE / devbox 平台**：会进入资源调度、账号计费、镜像生态、浏览器 IDE 竞争，偏离轻量 tmux cockpit。
- **Agent 编排平台 / socket API**：herdr 已强势占位；tmuapp 不应在早期追逐编排。

被合并的方向：

- **Agent Cockpit + Session Dashboard + Detector** 合并为 “Agent/Task 状态层”。
- **Command Palette / Runbook Buttons + Android 快捷操作** 合并为 “快速回复与低风险控制”。
- **Security + Deployment Hardening** 作为所有远程使用的前置底座。
- **Control Mode/WebSocket 加固** 从“迁移”修正为“已有基础上的生产化加固”。
- **Workspace** 从战略核心降级为后续轻量组织能力，先不做大抽象。

### 第三轮：深化与修正

第二轮复审形成了关键修正：

- tmuapp 已经有 `tmux -C attach-session` 的 control-mode 单 pane 流，问题不是从零迁移，而是补齐心跳、重连、状态同步、测试。
- Agent 状态感知有传播力，但检测准确率和竞品风险较高，必须以 MVP 实验推进，避免一开始做“框架”。
- Android 是差异化资产，但真实成熟度有限；应聚焦“看状态 + 快捷回复 + 低成本配对/通知”，不做完整移动 terminal 替代品。
- SDK/CLI、Workspace、插件框架、layout editor 都不应在 0→1 阶段作为主线投入。
- 安全加固是全体共识：没有只读 token、CORS 收紧和部署指南，远程/移动/分享场景都不可信。

## 最终定位

### 一句话定位

**tmuapp 是一个自托管的 tmux cockpit，让你通过浏览器和 Android 远程看护长任务与 AI coding agents，并在它们卡住时快速回复。**

对外传播可以更口语化：

> **Agent 卡了？手机秒回。**

### 目标用户

优先目标用户：

- 在远程 Linux 机器、开发机、服务器、NAS、容器中长期使用 tmux 的开发者。
- 使用 Claude Code、Codex CLI、Aider、Gemini CLI 等 AI coding agents，并希望离开桌面后仍能知道 agent 是否卡住的人。
- 需要看护长任务的开发/运维用户：构建、测试、训练、部署、爬虫、日志 tail、批处理脚本。
- 偏好自托管、Docker、HTTP API、可审计远程访问，而不是使用第三方 SaaS terminal 的用户。

暂不作为主目标：

- 追求极致本地 terminal 性能的 macOS 用户。
- 需要多人实时协作终端的团队。
- 需要完整云 IDE / devbox / workspace 编排平台的企业。
- 需要跨几十台服务器统一运维控制台的 SRE 团队。

### 差异化

- 相对 muxy：tmuapp 不做 macOS native terminal，而是做 Web/Android/Docker/API 的远程 tmux control plane。
- 相对 herdr：tmuapp 不做终端内 TUI agent multiplexer，而是做浏览器/手机上的远程 agent/task cockpit。
- 相对普通 web terminal：tmuapp 管理的是真实 tmux session，支持 detach/reattach、已有 tmux 工作流、HTTP API、Docker 自托管。
- 相对移动 SSH/tmux 客户端：tmuapp 不强迫用户在手机上完整编辑 shell，而是提供状态卡片、快捷回复、只读模式和安全远程看护。

## 方向池

### P0：必须做

#### P0.1 安全加固与可信部署

做：

- 多 token 分级：`admin` / `write` / `read`。
- 只读 token 禁止 input、keys、split、resize、create、kill 等写操作。
- CORS 从默认 `*` 改为可配置允许来源，默认偏安全。
- 最小审计日志：记录高风险操作（input/keys/kill/resize/split/create）的时间、token hash、target、动作。
- 部署指南：Tailscale、Cloudflare Tunnel、nginx HTTPS、Docker Compose、systemd。

不做：

- 完整用户体系、RBAC、组织、邀请、分享链接。
- 自建 tunnel/relay 服务。

先验证：

- 用户是否愿意使用只读 token 暴露到手机/浏览器。
- 部署指南能否让新用户 5 分钟内完成安全访问。

#### P0.2 WebSocket/control-mode 生产化加固

做：

- 保留现有 `tmux -C attach-session` 单 pane 流。
- 增加 WebSocket ping/pong 心跳。
- 客户端指数退避重连。
- 重连后先发送完整 capture，再续接实时流。
- 增加 `tmux-stream.ts` 测试和基础 benchmark。

不做：

- 早期不做多 pane 大规模并行实时流聚合。
- 不重写为全新自研 terminal protocol。

先验证：

- p95 输出延迟是否 <100ms。
- 断线后 1-3 次重试成功率是否 >90%。

#### P0.3 Agent/Task Cockpit MVP

做：

- Web overview 中显示 pane 的 `currentCommand`、cwd/current path、最近输出 preview。
- 最小状态：`running` / `waiting_input` / `idle` / `unknown`。
- 初期仅支持少量硬编码检测：Claude Code、Codex、Aider，且优先识别“是否等待输入”。
- Web 上显示状态 badge 和“需要我处理”的过滤入口。
- 快捷回复按钮：`y`、`n`、Enter、Ctrl-C、Ctrl-D、自定义一条短文本。

不做：

- 不做 agent 自动编排。
- 不做复杂 detector/plugin 框架。
- 不承诺 100% 精确判断 agent 状态；UI 必须显示 confidence/不确定性。

先验证：

- 50 条以上真实输出样本下，waiting_input 识别准确率能否达到可用水平。
- 用户是否真的因为“agent 卡住提醒/状态”回访。

#### P0.4 README / Onboarding 重写

做：

- README 第一屏从功能列表改为场景价值：远程看护长任务和 coding agents。
- 提供 5 分钟旅程：Docker run → 打开 Web → 看到 session/pane → 发送快捷回复。
- 明确安全部署路径：本地、Tailscale、反向代理 HTTPS。

不做：

- 不在 PMF 前投入大规模 landing page 系统和商业化页面。

### P1：应该做，但依赖 P0 验证

#### P1.1 Android 看护体验

做：

- 只读优先的 session/pane card。
- 显示状态 badge、最近输出 preview。
- 快捷命令面板：y/n/Enter/Ctrl-C/Ctrl-D。
- QR 配对：降低 URL + token 输入成本。
- 初步本地通知：在 app 前台/后台可行范围内，通过长连接或轮询提示 waiting_input。

不做：

- 不做完整手机 terminal 替代。
- 不做复杂手势系统。
- 不在用户验证前投入 FCM/HMS/JPush 等重型推送体系。

先验证：

- 2-3 个月内下载量、周活跃、外部 issue/反馈。
- QR 配对是否显著提升首次连接成功率。

#### P1.2 轻量任务组织

做：

- session label/tag。
- 显示 cwd、git branch、dirty 状态、repo name。
- 可选从 tmux session/window/pane metadata 派生项目视图。

不做：

- 不急于设计完整 Workspace 对象、生命周期、模板市场。
- 不在早期实现复杂 worktree 自动创建/销毁。

先验证：

- 用户是否抱怨 session 太多难以组织。
- “按项目/任务分组”是否比 tmux session name 更有价值。

#### P1.3 最小 API 文档完善

做：

- 保持现有 HTTP API 简洁稳定。
- 更新 `docs/API.md`，补充鉴权分级和 WebSocket 协议说明。
- 给自动化用户提供 curl 示例。

不做：

- 不发布 TypeScript SDK / CLI 作为独立产品线。
- 不承诺 semver SDK 兼容性。

先验证：

- 是否有外部用户明确要求 API 集成。

### P2：机会方向，后续视验证进入

#### P2.1 Workspace Templates

做的前提：已有用户频繁创建类似 session/window/pane 布局。

可做：

- `tmuapp.yaml` 定义 session、windows、panes、commands、cwd。
- 一键创建项目工作区。
- 保存/恢复 layout 到模板。

暂不做：

- 云 devbox 平台。
- 镜像市场、账号资源调度。

#### P2.2 Layout minimap / 可视化调整

做的前提：用户反馈 Web 中导航/调整 pane 困难。

可做：

- pane minimap。
- 点击切换 pane。
- 简单 layout preset。

暂不做：

- 复杂拖拽编辑器。
- 完整 tmux layout DSL 编辑器。

#### P2.3 Webhook / Event Stream / SDK / CLI

做的前提：有真实自动化需求，至少数个外部用户请求。

可做：

- `agent.state_changed` / `pane.output_matched` webhook。
- OpenAPI spec。
- `tmuappctl` 的最小命令。

暂不做：

- 插件市场。
- agent 编排 socket API。

#### P2.4 录制 / 回放 / 审计导出

做的前提：安全模型成熟且有合规/复盘需求。

可做：

- 手动导出当前 capture。
- 最近 N 行快照。
- 可配置 retention 的输出记录。

暂不做：

- 默认全量录屏。
- 默认长期保存 terminal 输出。

## 路线图

### 6 周路线图：从“可用 tmux 控制台”到“可信远程任务看护 MVP”

第 1-2 周：安全与流稳定

- 多 token 分级与只读模式。
- CORS 可配置与默认收紧。
- 最小审计日志。
- WebSocket 心跳、客户端重连、重连后 capture 同步。
- `tmux-stream.ts` 核心测试与简单延迟 benchmark。

第 3-4 周：Agent/Task Cockpit MVP

- Web overview 增加 currentCommand、cwd、最近输出 preview。
- 状态 badge：running / waiting_input / idle / unknown。
- Claude Code / Codex / Aider 的最小检测规则或样本库。
- 快捷回复按钮：y/n/Enter/Ctrl-C/Ctrl-D。
- README 改为“5 分钟部署 + 看护 agent”旅程。

第 5-6 周：验证与 Android 最小增强

- Android session/pane card 显示状态与 preview。
- Android 快捷命令面板。
- QR 配对 PoC。
- 发布演示视频：手机/浏览器看到 agent 等待输入 → 一键回复。
- 收集外部用户反馈、Docker pull、GitHub stars、session 创建、Android 下载/活跃。

### 3 个月路线图：验证粘性，补齐移动与部署闭环

- Agent waiting_input 检测准确率提升，规则可配置但不框架化。
- “需要我处理”视图与排序。
- Android 本地通知/轻量通知机制；评估是否需要 FCM/HMS/JPush。
- 部署 recipes：Docker Compose、systemd、Tailscale、Cloudflare Tunnel、nginx HTTPS。
- API 文档补充权限、WebSocket、状态端点。
- Git/cwd/branch metadata 展示。
- 根据用户反馈决定是否引入 session tag/label。
- 启动定位验证：
  - A：“Agent 卡了？手机秒回。”
  - B：“浏览器里看护你的 AI coding agent。”
  - C：“自托管 tmux Web 控制台。”

### 6 个月路线图：从 MVP 到稳定自托管工具

若 3 个月验证通过：

- 稳定 Agent/Task 状态层，支持更多 agent/test/dev server 检测。
- Android 看护体验成熟：只读默认、危险操作确认、通知链路稳定。
- 轻量组织能力：session label/tag、项目分组、git metadata。
- Workspace template PoC：只支持本地 YAML 与一键创建，不做平台化。
- Event/webhook PoC：仅针对状态变化和输出匹配。
- Layout minimap 或简单 layout preset。
- 最小审计导出与安全文档完善。

若验证不通过：

- 收缩为“安全、稳定、可自托管的 tmux Web 控制台”。
- Android 降级维护。
- Agent 检测停留在 currentCommand 展示和手动标记。
- 继续打磨 Web terminal、部署、文档和 API 稳定性。

## 技术架构演进

### API

当前 API 是 HTTP facade over tmux。演进重点：

- 将鉴权从单 token 改为 token + mode：`read` / `write` / `admin`。
- 为每个路由定义最低权限：
  - `GET /api/sessions`、capture、status：read。
  - input/keys/resize/split/create：write。
  - kill、token/配置类操作：admin。
- 增加 `GET /api/panes/:target/status`，返回 `{ kind, state, confidence, currentCommand, cwd?, preview }`。
- 保持 API 简单，不急于引入数据库；早期状态可由 tmux snapshot + capture 派生。
- 中期可将 `server.ts` 从 if/else 链重构为路由表/中间件形式，降低权限守卫出错概率。

### WebSocket / Stream

当前已有 `tmux -C attach-session` 单 pane 流。演进重点：

- 协议消息版本化：`{ type, version, ... }`。
- 心跳：server ping / client pong，异常关闭可观测。
- 客户端重连：指数退避，最大重试，UI 明确显示连接状态。
- 重连同步：先 capture 最近 N 行，再恢复实时输出。
- 保留单 pane 为主；多 pane dashboard 初期使用 capture/summary 轮询，不用 N 个实时 control-mode 连接硬扛。

### Terminal UI

Web terminal 继续服务“查看与必要输入”，不承诺替代本地 terminal 的所有高级能力。

演进重点：

- 状态卡片优先于复杂 terminal chrome。
- 快捷回复按钮与危险操作确认。
- Preview 与 full terminal 分层：overview 看摘要，cockpit 看完整 pane。
- 对复杂 TUI 程序标注限制，避免过度承诺。
- 后续再考虑 minimap、layout preset、拖拽 resize。

### Android

Android 的战略定位是“长任务看护器”，不是完整 shell 编辑器。

演进重点：

- 只读默认。
- 状态 badge、最近输出、快捷回复。
- QR 配对降低首次连接摩擦。
- 危险操作二次确认。
- 通知先走低成本方案；真实推送在用户量验证后再上。
- WebView terminal 可继续保留，不急于引入原生 terminal 组件。

### Security

安全必须作为产品能力，而不是 README 里的提醒。

演进重点：

- 多 token、只读 token。
- CORS allowed origins。
- 审计日志。
- HTTPS/reverse proxy 指南。
- Docker 默认隔离 tmux server，控制宿主 tmux 作为高级用法。
- 对公网部署明确警告：tmuapp 控制权等价于远程 shell。

### Plugins / Automation

早期不做插件平台。自动化能力按需求渐进：

- 阶段 1：稳定 HTTP API + curl examples。
- 阶段 2：状态变化 webhook PoC。
- 阶段 3：OpenAPI / SDK / CLI，仅在有外部集成需求时启动。
- 不做 TPM 替代品，不做插件市场。

### AI Workflow

AI 工作流只做薄层：观察、识别、提醒、回复。

演进重点：

- 从 currentCommand + output pattern 识别 agent。
- 明确 confidence，允许 unknown。
- 支持用户手动标记 pane 类型。
- 收集真实样本，规则版本化。
- 若启发式失败，评估 agent hook，而不是扩大误判范围。
- 不做 agent 编排、任务分派、自动多 agent 协作。

## MVP 实验与指标

### 实验 1：Agent/Task Cockpit 是否有吸引力

假设：用户愿意打开 tmuapp 查看远程 agent/长任务状态，并在 waiting_input 时快速回复。

MVP：Web overview 状态 badge + 最近输出 preview + 快捷回复按钮。

指标：

- 2 周内 ≥30 个外部用户创建 session 或连接现有 session。
- 6 周内 ≥100 个外部用户访问/试用。
- 快捷回复按钮使用率：有 waiting_input 的 session 中 ≥30% 使用快捷回复。
- 回访：7 日内回访率 ≥20%。

### 实验 2：状态检测准确率

假设：基于 currentCommand + 输出片段可以可靠识别 waiting_input。

指标：

- 样本集：≥50 条真实 Claude Code/Codex/Aider 输出。
- waiting_input 二分类准确率 ≥85% 才进入 UI 默认展示。
- <70%：停止启发式检测，转向 hook/手动标记。
- 70%-85%：仅显示“可能等待输入”，不触发通知。

### 实验 3：Android 是否值得继续投入

假设：移动端看护是 tmuapp 的真实差异化。

指标：

- 2-3 个月内 Android 下载 ≥100，且有 ≥10 周活跃用户。
- QR 配对首次连接成功率 ≥90%。
- 快捷命令面板使用率持续增长。
- 若下载 <100 且无外部 issue/反馈，Android 降级为维护模式。

### 实验 4：安全部署是否解除采用障碍

假设：只读 token + 部署指南能让用户敢于远程使用。

指标：

- 部署指南从零到可访问耗时 <5 分钟。
- 只读 token 使用占比 ≥30%。
- 用户反馈中“安全/部署不清楚”的问题逐月下降。

### 实验 5：定位测试

候选文案：

- A：Agent 卡了？手机秒回。
- B：在浏览器里看护你的 AI coding agent。
- C：自托管 tmux Web 控制台。

指标：

- CTR >3% 且 bounce rate <60% 作为有效定位。
- 若全部低于阈值，重新定义价值主张。

## 风险矩阵

| 风险                                 | 等级 | 说明                                                          | 缓解                                               |
| ------------------------------------ | ---: | ------------------------------------------------------------- | -------------------------------------------------- |
| 安全暴露导致远程 shell 被滥用        |   高 | tmuapp 控制 tmux 即控制 shell                                 | 多 token、只读、CORS、审计、HTTPS 指南前置         |
| Agent 状态误判                       |   高 | 误报/漏报会破坏信任                                           | confidence、unknown、样本测试、手动标记、hook 备选 |
| herdr/muxy 或新竞品覆盖 Web/移动场景 | 中高 | Agent multiplexer 赛道变化快                                  | 聚焦 Web/Android/Docker 自托管差异，快速 MVP       |
| 单人维护范围蔓延                     |   高 | 同时做 workspace/SDK/Android/push/plugin 会失控               | 活跃方向限制在 P0/P1，P2 必须有触发条件            |
| Android TAM 小                       |   中 | 手机上完整终端需求有限                                        | 定位为看护器，设置下载/活跃 kill criteria          |
| Control-mode 边界复杂                |   中 | tmux 控制协议事件、断线、多流有坑                             | 先单 pane 稳定，补测试，避免早期多流聚合           |
| 国内推送/穿透合规与可用性            |   中 | FCM 不可用，FRP/relay 合规复杂                                | 初期只提供部署指南，不自建 relay；推送后置         |
| Terminal rendering 体验不完整        |   中 | 复杂 TUI、ANSI、resize、scroll 可能有边界                     | 明确定位为 cockpit，不承诺替代本地 terminal        |
| Docker 控制宿主 tmux 权限复杂        |   中 | socket、UID、权限解释困难                                     | 默认容器内隔离，高级用法单独 recipe                |
| 产品叙事分散                         |   中 | Web terminal / Android / API / agent / workspace 同时讲会模糊 | 主叙事统一为远程看护长任务与 coding agents         |

## Kill Criteria

### 项目级

- 发布后 3 个月外部 MAU <10：重新评估产品方向。
- 发布后 6 个月 GitHub stars <50 且无外部 issue/PR：重新评估是否继续投入。
- 6 周内无法让 100 个外部用户完成试用：缩小范围，仅保留安全稳定的 tmux Web console。

### Agent/Task 状态层

- waiting_input 检测准确率 <70%：停止启发式 UI 默认展示，转向 hook 或手动标记。
- 检测准确率 70%-85%：只显示低置信提示，不做通知。
- herdr 或其他竞品发布成熟 Web/mobile agent dashboard，且 tmuapp 未形成用户基础：放弃 agent 检测作为核心差异化，回到 tmux Web cockpit。

### Android

- 2-3 个月下载 <100 且周活跃 <10：降级维护。
- 无任何外部 Android issue/反馈：不投入推送/手势/原生 terminal。
- QR 配对未显著提升连接成功率：不继续扩展移动 onboarding。

### 技术

- WebSocket 重连成功率 <90%：先修复稳定性，不推进多流/通知。
- p95 输出延迟 >100ms 且无法定位：暂停依赖实时状态的功能。
- 安全加固未完成：不推广公网/移动远程访问场景。

## 开放问题

1. tmuapp 的首批真实用户更偏 “AI coding agent 用户” 还是 “DevOps/长任务看护用户”？需要通过 README 文案和社区发布验证。
2. Claude Code、Codex、Aider 等工具是否提供稳定 hook/event，可替代脆弱的输出正则？
3. Android 通知应先走 WebSocket/轮询本地通知，还是直接接入 FCM/HMS/JPush？这取决于活跃用户和国内用户占比。
4. 只读 token 的默认体验如何设计？Web/Android 是否默认以只读模式进入，再显式切换 write/admin？
5. 是否需要保存任何状态数据？如果需要，早期用 JSON 文件是否足够，何时才需要 SQLite？
6. Workspace 是否真的比 session label/tag 更有价值？在出现明确需求前不应假设答案。
7. 多 pane dashboard 应使用 capture polling、summary polling，还是多个 control-mode 流？需要性能基准后决定。
8. 是否允许通过 Docker 控制宿主机 tmux 作为主推荐路径？当前更安全的默认应是容器内隔离 tmux。
9. 项目是否需要 telemetry？如果需要，必须 opt-in，并明确隐私边界。
10. 商业化是否存在？在 PMF 之前不讨论定价；达到外部用户与留存指标后再评估 Pro/托管/企业自托管。

## 最终结论

tmuapp 最值得押注的不是“更像 terminal”，而是“更懂 tmux 里正在跑的任务，并能在远程设备上安全地看护和处理它们”。

短期必须收敛：先完成安全、流稳定、Agent/Task Cockpit MVP 和低成本 Android 看护体验。Workspace、SDK、插件、多服务器、团队协作、录制回放都应等待真实用户信号。

最终战略是：**以真实 tmux 为底座，以 Web/Android/Docker/API 为远程控制面，以长任务和 AI coding agent 的状态看护为差异化入口，逐步演进为可信、自托管、轻量的 tmux cockpit。**

## 附录：本次多 agent 讨论产物

本战略文档由 5 个首轮 sub agent 与 2 轮交叉复审综合而来：

- Agent A：`talesofai/gpt-5.5`，产品战略发散，产物 `docs/future-agent-a-gpt55.md`
- Agent B：`talesofai/glm-5.1`，用户/市场/增长视角，产物 `docs/future-agent-b-glm51.md`
- Agent C：`talesofai/qwen3.6-plus`，技术架构路线，产物 `docs/future-agent-c-qwen36.md`
- Agent D：`talesofai/deepseek-v4-pro`，反方/风控/竞争分析，产物 `docs/future-agent-d-deepseek.md`
- Agent E：`talesofai/gpt-5.5`，独立主持/叙事视角，产物 `docs/future-agent-e-host-gpt55.md`

后续讨论与综合：

- 第一轮综合：`docs/future-round1-synthesis.md`
- 第二轮市场复审：`docs/future-round2-market-review.md`
- 第二轮风险复审：`docs/future-round2-risk-review.md`
- 第二轮技术复审：`docs/future-round2-tech-review.md`
- 最终草稿：`docs/tmuapp-future-directions.draft.md`
