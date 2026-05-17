# 第二轮辩论：反方/工程风险复审

> **角色**: Round 2 反方复审 Agent  
> **审查对象**: Round 1 综合评审纪要 + Agent A/B/C/D/E 报告  
> **方法论**: 从工程可行性、资源约束、竞争现实、差异化可持续性四个维度复审所有方向。严格否决高风险/同质化/工程投入过大方向；认可小步快跑方向。  
> **日期**: 2026-05-17  
> **状态**: 复审意见 / 供监督者决策

---

## 零、前置声明：Round 1 的核心盲区

Round 1 综合纪要在五个方面过于乐观，本复审必须纠正：

### 盲区 1：将"5 个 agent 一致同意"等同于"方向正确"

Agent A/B/C 同时认可 Agent 状态感知，不是因为各自独立验证了可行性，而是因为 A/B/C 都从 herdr 的叙事中获得了灵感——这本质上是 **模仿趋同**，不是独立判断。Agent D（反方）是唯一做了竞品深度分析的 agent，其"herdr 已主导该赛道"的结论被综合纪要打了折扣。

### 盲区 2：低估 Control Mode 的工程完成度

综合纪要声称 Control Mode 迁移是 Phase 1 的核心任务，但**代码审查显示 `tmux-stream.ts` 已经实现了 control mode 流式传输**（`tmux -C attach-session`）。当前缺失的不是"control mode 从零建设"，而是**生产级加固**（心跳、重连、多流）。综合纪要把一个"加固"问题描述成了"从零建设"问题，导致 Phase 1 的工作量估算失准。

代码证据：

- `apps/api/src/tmux-stream.ts:21` — `spawn("tmux", ["-C", "attach-session", "-t", target])`，control mode 已是当前实现的传输层
- `apps/api/src/tmux-stream.ts:38-48` — 已实现 initial capture + 积压缓冲 + pending 队列，防止重复输出
- `apps/api/src/server.ts:72-108` — WebSocket 升级和流生命周期管理已就位

**因此，control mode 加固的 Phase 1 范围应缩小为：心跳 + 指数退避重连 + 单 Pane 稳定性提升。多 Pane 并行流、多流聚合等需求应延后。**

### 盲区 3：忽略了项目的"单人维护"约束

综合纪要列出的 Phase 1（0-4 周）任务：control mode 加固 + 安全加固 + agent 样本收集 + A/B 测试 landing page。**四项并行工作流，对单人是 unrealistic。** 真实可交付范围应砍掉至少一半。

### 盲区 4：未检验 Android 资产的真实质量

综合纪要称 Android 是"差异化资产"，但未审查 Android 代码实际质量。Agent C 报告指出：Android 使用 WebView 渲染终端（不是原生终端），CPU/MEM 指标为假数据。一个 WebView 包装 + 假数据的 Android 客户端，被包装为"已有生产级 Android 客户端"，存在严重夸大。

### 盲区 5：竞品分析中缺失了时间窗口的紧迫性

herdr 从 0 到 820★ 仅用了 2 个月（2026-03-27 首发）。herdr 进入 Web 领域（或有人基于 herdr socket API 构建 Web 前端）的时间窗口可能只有 3-6 个月。tmuapp 若在 6 个月内未建立差异化壁垒，herdr 的生态将覆盖 tmuapp 的所有目标场景。

---

## 一、逐方向工程风险复审

### 方向 1：AI Agent 状态感知（综合纪要 R1 = D1 + D13）

**综合纪要裁决**: 有条件认可，需快速验证

**复审裁决**: ❌ 降级为实验性探索，不得进入 Phase 1-2 核心路线

**复审理由**:

#### 1.1 竞争现实：herdr 已占据该赛道且速度碾压

| 指标       | herdr                                                              | tmuapp（假设进入）       |
| ---------- | ------------------------------------------------------------------ | ------------------------ |
| Stars      | 820（2 个月积累）                                                  | 未知                     |
| 开发速度   | 2 个月 5 个版本（0.1→0.5）                                         | 单人、多方向并行         |
| Agent 支持 | Claude Code, Codex, Gemini CLI, Cline, Kimi, Copilot CLI（已实现） | 从零开始                 |
| 检测方式   | Rust 原生 PTY + 启发式（内建）                                     | Node.js 启发式（需自建） |
| 安装门槛   | `curl \| sh` 单二进制                                              | Docker 或 Node.js 部署   |

**综合纪要的"错位竞争"论证不成立。** 综合纪要称 herdr 是"终端内 TUI"，tmuapp 是"Web/Android 远程 cockpit"——但这忽略了关键事实：**用户查看 agent 状态的第一触点永远是终端本身**。当开发者在终端里跑 Claude Code 时，herdr 直接在终端里显示 blocked/working/done。用户不需要打开浏览器去看"agent 是否卡住了"。Web cockpit 的"远程"价值仅在用户离开桌面时才成立，而这是低频场景。

#### 1.2 检测准确率 85% 要求是伪命题

综合纪要对 agent 检测设置了 85% 准确率门槛。但：

- 85% 准确率意味着每 6-7 次状态判断就有 1 次错误。对于"agent 卡住了需要我处理"这种高敏感度信息，15% 的误报率会导致用户信任崩塌。
- herdr 的启发式检测也并非 100% 准确，但 herdr 有 Rust PTY 直连的优势——它可以实时读取终端转义序列和光标位置，检测精度天然优于 tmuapp 的 `capture-pane -p` 文本抓取。
- **建议**: 如果真要做 agent 检测，准确率门槛应设为 ≥90%，且必须区分"确定"和"推测"两种置信度，UI 上明确标注。

#### 1.3 工程投入被低估

综合纪要的"MVP 边界"是"仅支持 Claude Code / Codex / Aider 三个 agent 的 4 种状态"。但实际需要的工程投入：

1. 收集 ≥50 条真实输出样本 → 需要用户配合，或自己跑 3 种 agent 的数十种场景
2. 编写启发式规则 → 每种 agent 至少 5-10 条规则，需持续维护（agent CLI 更新会破坏规则）
3. `agent-detect.ts` 模块 → 新增 API 模块 + 测试
4. Web overview 状态 badge → UI 组件 + 测试
5. Android badge → Android UI 组件
6. "需要我处理"筛选 → 额外 UI 逻辑

**保守估算：2-3 周全职工作**（含样本收集和测试）。对于单人项目，这占据了 Phase 1 全部时间的 50-75%，挤占了 control mode 加固和安全加固的资源。

#### 复审建议

```
┌─────────────────────────────────────────────────────────┐
│ Agent 状态感知：降级方案                                  │
├─────────────────────────────────────────────────────────┤
│ Phase 1: 不做。仅收集 Claude Code 输出样本（≤1天）       │
│ Phase 2: 仅做 pane_current_command 展示（非检测，零成本） │
│ Phase 3: 若外部用户 ≥3 明确提出 agent 状态需求，再启动    │
│ Kill: 若 Phase 3 时 herdr 已有 Web Dashboard，永久放弃   │
└─────────────────────────────────────────────────────────┘
```

---

### 方向 2：安全加固 & 远程访问（综合纪要 R2 = D4）

**综合纪要裁决**: 无条件认可，优先级极高

**复审裁决**: ✅ 无条件认可。**这是唯一一个零争议、低成本、高收益的方向。**

**复审理由**:

安全加固是唯一被 5 个 agent 全体无条件认可的方向，且其理由独立（不依赖 herdr 叙事或市场假设）。当前代码的 `CORS: *`（`server.ts:send()` 函数）和单 token 模型是真实的止步障碍。

**代码验证**:

- `apps/api/src/server.ts` `send()` 函数：`"Access-Control-Allow-Origin": "*"` — 任何来源都可调用 API
- `apps/api/src/server.ts` `isAuthorized()` 函数：仅判断 token 是否匹配，无分级
- 无审计日志代码

**细化建议**:

| 任务                                                      | 工作量 | 风险 |
| --------------------------------------------------------- | ------ | ---- |
| Token 格式扩展 `TMUAPP_TOKENS='token1:admin,token2:read'` | 0.5 天 | 低   |
| 路由守卫（read token 禁 POST/DELETE）                     | 0.5 天 | 低   |
| CORS 收紧（默认仅 localhost，允许配置）                   | 0.5 天 | 低   |
| 最小审计日志（记录 write 操作）                           | 1 天   | 低   |
| 部署指南（Tailscale/Cloudflare Tunnel/nginx）             | 1 天   | 低   |

**总计：3.5 天，可在 Phase 1 首周完成。** 这是唯一可以在不阻塞其他任务的前提下完成的 Phase 1 任务。

---

### 方向 3：Control Mode 流式架构加固（综合纪要 R3 = D5）

**综合纪要裁决**: 无条件认可，技术前提

**复审裁决**: ✅ 认可，但范围必须缩小

**复审理由**:

#### 3.1 当前实现状态（代码验证）

`tmux-stream.ts` 已实现 control mode 的核心路径：

- ✅ `tmux -C attach-session` 建立 control mode 连接
- ✅ `%output` 行解析（`handleControlLine`）
- ✅ 转义序列解码（`decodeTmuxControlOutput`，支持 `\e` `\r` `\n` `\t` 和八进制）
- ✅ Initial capture + pending buffer 防重复
- ✅ `resizeClient` 通过 `refresh-client -C` 指令
- ✅ 优雅关闭（`detach-client` + 500ms kill timer）

**当前缺失**（需加固）：

- ❌ WebSocket 心跳（ping/pong）
- ❌ 客户端重连 + 指数退避
- ❌ 重连后状态同步（部分实现：有 initial capture，但断线后无自动重连）
- ❌ 多 Pane 并行流

#### 3.2 综合纪要的"多 Pane 并行流"是过度设计

综合纪要 Phase 1 要求"多 Pane 并行流：`/api/panes/:target/stream` 改为支持 query `?targets=%1,%2,%3`"。

**工程现实**：每个 `tmux -C attach-session` 独占一个 tmux 客户端连接。多 Pane 并行流需要多个 control mode 连接。对 1-2 个 Pane 这是可行的，但综合纪要暗示的"Dashboard 中同时看 N 个 Pane"（N>5）会导致 tmux 服务端连接数膨胀，且每个流的带宽消耗线性叠加。

**建议**: Phase 1 仅做单 Pane 流的稳定性加固。多 Pane 需求在 Phase 3（用户验证后）再评估。

#### 3.3 缩小后的 Phase 1 范围

| 任务                                         | 工作量   | 优先级 |
| -------------------------------------------- | -------- | ------ |
| WebSocket 心跳（30s ping/pong）              | 0.5 天   | P0     |
| 客户端指数退避重连（`terminal-protocol.ts`） | 1 天     | P0     |
| 重连后状态同步（重发 initial capture）       | 0.5 天   | P0     |
| 基准测试：control mode 延迟 vs 预期          | 0.5 天   | P1     |
| 多 Pane 并行流                               | **延后** | P3     |

**总计：2.5 天**。

---

### 方向 4：移动端 Android 深化（综合纪要 R4 = D3）

**综合纪要裁决**: 有条件认可，需验证。kill criteria: 3 个月 <200 下载 → 降级维护模式

**复审裁决**: ⚠️ 认可最低成本子集（QR 配对 + 快捷命令面板），其他全部延后

**复审理由**:

#### 4.1 Android 资产真实状态

代码审查和 Agent C 报告确认：

- Android 使用 **WebView 渲染终端**（`MainActivity.kt`），不是原生终端。这意味着 Android 的终端体验受限于 WebView 的渲染能力和内存上限。
- `SessionGrid.tsx` 的 CPU/MEM 指标为**随机假数据**（Agent C 报告: `SessionGrid.tsx:14-16` 随机数）。
- Android 仅实现 session 列表、pane capture、literal input、send Enter——四个基础操作。

**该客户端的实际成熟度是"技术验证原型"，不是"生产级 Android 客户端"。** Agent B 声称"唯一已有生产级 Android 客户端的 tmux 管理工具"存在严重夸大。

#### 4.2 最小可行子集 vs 综合纪要的完整范围

| 功能             | 综合纪要 Phase 1-2 范围 | 复审建议 | 理由                                                                          |
| ---------------- | ----------------------- | -------- | ----------------------------------------------------------------------------- |
| QR 配对          | ✅ 纳入                 | ✅ 认可  | 服务端生成 QR 成本极低（≤0.5 天），Android 扫码解析 URL 成本极低（≤0.5 天）   |
| 快捷命令面板     | ✅ 纳入                 | ✅ 认可  | y/n/Enter/Ctrl-C 四个按钮，0.5 天                                             |
| 推送通知（FCM）  | ✅ 纳入                 | ❌ 否决  | 需要 Firebase 项目配置 + Android FCM SDK 集成 + 服务端 FCM 发送 → 至少 2-3 天 |
| 手势系统         | ✅ 纳入（Agent B）      | ❌ 否决  | 双指/三指手势系统需要完整的触摸事件处理框架 → 至少 1 周                       |
| Agent 状态 badge | ✅ 纳入                 | ❌ 延后  | 依赖 Agent 检测引擎，该引擎本身已降级                                         |
| 只读模式         | ✅ 纳入                 | ✅ 认可  | 与服务端安全加固同步，Android 端成本极低                                      |

**复审的 Android MVP 范围：1.5 天**

- QR 配对（1 天，含服务端 QR 生成 + Android 扫码解析）
- 快捷命令面板（0.5 天，y/n/Enter/Ctrl-C 四个按钮）
- 只读模式 UI 提示（与安全加固同步）

#### 4.3 Kill Criteria 应更严格

综合纪要的 kill criteria 是"3 个月 <200 下载"。但 GitHub Releases 下载量包括机器人爬虫和 CI 测试，不是有效使用指标。**建议改为**:

| 条件                                           | 时限       | 行动               |
| ---------------------------------------------- | ---------- | ------------------ |
| 无外部用户提交 Android 相关 issue/feedback     | 3 个月     | 降级为维护模式     |
| GitHub Releases 下载 <100（排除 CI）           | 3 个月     | 降级为维护模式     |
| Push 通知开发启动前，未完成 FCM 接入可行性验证 | Phase 2 前 | 永久放弃 Push 通知 |

---

### 方向 5：Workspace 项目工作区（综合纪要 R5 = D2）

**综合纪要裁决**: 延后，API 层预留

**复审裁决**: ✅ 认可综合纪要的延后判断，追加条件

**复审理由**:

Workspace 抽象在 agent 检测跑通之前确实缺少"智能"。但综合纪要未指出的风险是：**Workspace 与 tmux session 的关系建模复杂度被低估。**

muxy 的 workspace 之所以好用，是因为它有 libghostty 的终端引擎，可以自由创建/销毁/切换 workspaces 中的终端实例。tmuapp 的 workspace 必须映射到真实 tmux sessions——这意味着：

1. Workspace 创建 → 需要创建新的 tmux session（或复用已有）
2. Workspace 切换 → 需要 attach/detach tmux sessions
3. Workspace 销毁 → 需要 kill tmux sessions（可能丢失用户工作）

**这不是"加一个抽象层"的问题，而是"tmux lifecycle management"的问题**——复杂度远高于综合纪要的估算。

**追加条件**: 在 API 层预留 Workspace 数据模型时，必须同时设计 session lifecycle 策略（创建时是否复用已有 session？销毁 workspace 是否 kill session？），否则预留的 API 将无法实际使用。

---

### 方向 6：API/SDK/CLI 控制面（综合纪要 H1 = D6）

**综合纪要裁决**: 延后，依赖 control mode 迁移完成

**复审裁决**: ❌ 否决为独立方向，并入安全加固和文档完善

**复审理由**:

综合纪要称 D6 依赖 D5 先完成。但现实是：

- 当前 HTTP API 已经可用（`/api/sessions`, `/api/panes/:target/capture` 等），不需要 control mode 也能写 SDK 和 CLI
- OpenAPI 文档和 TypeScript SDK 不依赖任何架构变更——它们是对现有 API 的描述和封装
- 真正需要 control mode 的是事件流和 webhook（实时推送），但这属于 P3 需求

**但为什么否决为独立方向？** 因为当前项目 MAU <10 的阶段，SDK/CLI 的受众是零。没有用户群的 API 工具是"为未来建教堂"。建议：

- OpenAPI 文档 → 纳入安全加固 Phase 1，作为部署指南的附录（0.5 天）
- TypeScript SDK / CLI → 等外部用户 ≥3 个明确提出 API 集成需求后再启动

---

### 方向 7-15：其他方向的复审意见

| #   | 方向                          | 综合纪要裁决 | 复审裁决                 | 理由                                                                                                                                |
| --- | ----------------------------- | ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| D7  | Pane Layout 可视化编辑器      | 延后         | ✅ 认可延后              | 延后理由成立。追加条件：需先完成 control mode 重连稳定性，否则拖拽 resize 断线体验极差                                              |
| D8  | 国内网络穿透                  | 延后         | ✅ 认可延后              | 延后理由成立。追加风险：国内 FRP 服务的合规性需在启动前确认（Agent B 提到的"FRP 合规风险"被综合纪要弱化了）                         |
| D9  | 多服务器聚合                  | 否决         | ✅ 认可否决              | solanian/tmux-web-manager 仅 1★ 是强信号——该需求未验证                                                                              |
| D10 | 团队协作                      | 否决         | ✅ 认可否决              | 否决理由成立。安全模型不完善的前提下做协作等于主动制造安全漏洞                                                                      |
| D11 | Terminal Recording            | 否决         | ✅ 认可否决              | 否决理由成立。追加：即使安全模型完善，录制存储的生命周期管理也是持续工程成本                                                        |
| D12 | 国内社区增长 & 商业化         | 需要验证     | ❌ 否决商业化讨论        | 综合纪要已正确判断"PMF 验证后再讨论"，但 Agent B 仍然在报告中列出了 ¥48/年定价和产品矩阵。**在 MAU <10 时讨论定价是浪费决策带宽。** |
| D14 | macOS 原生                    | 否决         | ✅ 认可否决              | 全体一致                                                                                                                            |
| D15 | 命令行 Runbook / 预设操作面板 | 未独立裁决   | ✅ 认可为 Android 子功能 | 与 Android 快捷命令面板合并，不独立立项                                                                                             |

---

## 二、跨方向工程风险

### 风险 1: 范围蔓延（Scope Creep）—— 最高风险

Round 1 综合纪要在 10 个方向中认可了 5 个（R1-R5），延后了 3 个（H1-H3），否决了 4 个（X1-X4），另设 3 个验证方向（V1-V3）。**总计 15 个方向，其中 8 个在"活跃状态"（认可 + 延后 + 验证）。**

对于单人项目，同时跟踪 8 个方向 = 每个方向每周不足 0.5 天。这是经典的"做太多，一件都做不好"。

**建议**: 将活跃方向压缩为 **3 个**：

| 优先级 | 方向                           | 理由                                                       |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| P0     | 安全加固（R2）                 | 零争议，最低成本，最高收益，不依赖其他方向                 |
| P1     | Control Mode 加固（R3 缩小版） | 技术债务，影响用户体验基线                                 |
| P2     | 文档完善 + bug 修复            | 当前无任何 agent 提到文档 debt，但用户 onboarding 依赖文档 |

**所有其他方向（Agent 检测、Android 深化、Workspace、SDK、Layout Editor、网络穿透）全部移入 Parking Lot**，仅在满足重新进入条件时激活。

### 风险 2: 测试覆盖不足

代码审查发现仅 4 个测试文件：

- `apps/website/tests/e2e/terminal.spec.ts`
- `apps/website/tests/e2e/keyboard.spec.ts`
- `apps/api/tests/server.test.ts`
- `packages/utils/tests/index.test.ts`

**缺失的关键测试**：

- `tmux-stream.ts` — **零测试**。control mode 流是核心路径，当前完全无覆盖。
- `tmux.ts` — **零单元测试**（仅通过 server.test.ts 间接覆盖部分路径）
- Android — **零自动化测试**（Agent C 建议的 JUnit/Compose UI/Espresso 全部未实现）

**在测试覆盖达到 80% 之前，不建议启动任何新功能开发。** 否则每新增一个功能，回归风险呈指数增长。

### 风险 3: 架构文档缺失

没有任何 agent 提到这个问题，但代码审查发现：

- 无架构决策记录（ADR）
- 无数据流文档（Agent C 报告中的 ascii 数据流图是自行整理的）
- API 文档（`docs/API.md`）的完整性和准确性未验证

**对单人项目而言，架构文档 = 自己的记忆外挂。** 缺失文档的代价在 3-6 个月后会显现——当你自己都忘了为什么 `tmux-stream.ts` 的 `pendingLines` 队列要这样设计。

### 风险 4: 产品叙事分散（延续综合纪要 R5）

综合纪要已识别此风险但未给出解决方案。核心问题：

- Agent A 定位: "self-hosted tmux cockpit for remote tasks and coding agents"
- Agent B 定位: "开发者 AI Agent 的随身遥控器"
- Agent D 定位: "自托管的 tmux Web 控制台"
- 综合纪要折中: "自托管 tmux cockpit，远程管理长任务和 coding agents"
- README 当前定位: "production-oriented tmux management console"

**五种表述，五种叙事。** 当项目自己都说不清"我是谁"的时候，用户更不可能理解。

**复审建议**: 在产品定位 A/B 测试（V3）之前，先**内部统一叙事**。建议以 README 当前表述为锚点，不做大的定位变更，直到有用户反馈数据支撑。

---

## 三、工程可行性分析：单人 6 个月最大可交付范围

### 3.1 可用资源估算

- 开发人员: 1 人（推定，基于 commit 历史和 GitHub 仓库结构）
- 每周可用时间: 乐观估计 20 小时（假设非全职）
- 6 个月总可用时间: ~480 小时

### 3.2 综合纪要的路线图 vs 实际可交付

```
综合纪要 Phase 1-4 (0-16+ 周) 计划:
Phase 1 (4周): Control Mode 迁移 + 安全加固 + Agent 样本收集 + A/B 测试
Phase 2 (4周): Agent Cockpit MVP + Web overview + 筛选/排序 + Android QR + 文案更新
Phase 3 (8周): Workspace API + Git metadata + OpenAPI/SDK + Push 通知
Phase 4 (不限): 验证后决策

实际单人在 16 周 320 小时内可交付:
✅ Phase 1 缩小版 (3周): 安全加固 (3.5天) + Control Mode 加固 (2.5天) + 文档完善 (2天) + Buffer (5天)
✅ Phase 2 最小版 (4周): 单 Pane 流稳定性 + bug 修复 + Android QR + 快捷按钮
❌ Phase 3: 不可行。Workspace + API/SDK + Push 通知 = 至少 200 小时
```

**结论: 综合纪要的 Phase 1-3 需要至少 2 个全职开发者 16 周，单人无法完成。**

### 3.3 复审的修正路线图

```
Phase 1 (0-3 周): 修地基，零新功能
  P0: 安全加固 (多token + CORS + 部署指南)
  P1: Control Mode 加固 (心跳 + 重连 + 基准测试)
  P2: 测试补充 (tmux-stream.ts + tmux.ts 核心路径)
  P2: 文档更新 (API.md 验证 + README 定位统一)

Phase 2 (3-6 周): 最小差异化
  P1: Android QR 配对 + 快捷命令面板 (y/n/Enter/Ctrl-C)
  P1: pane_current_command 在 Web overview 中展示 (不检测 agent，仅展示进程名)
  P2: 收集 Claude Code/Codex/Aider 输出样本 (不开发检测引擎，仅建样本库)

Phase 3 (6-12 周): 验证驱动
  根据 Phase 1-2 的数据决定:
  - 若安全加固后外部用户增长 >20% → 深化远程访问体验
  - 若 Android 下载 >100 且有外部反馈 → 推进 Push 通知
  - 若 agent 样本库 ≥50 条 → 启动检测引擎 PoC
  - 否则: 继续修 bug、补测试、写文档
```

---

## 四、综合纪要 Kill Criteria 的修正

### 4.1 综合纪要 Kill Criteria 的问题

综合纪要为 Agent 检测设置了 85% 准确率门槛，但：

- 85% 这个数字是凭空设定的，未基于用户体验研究
- 未定义"准确率"的计算方式（per-pane? per-event? per-session?）
- 未定义测试集如何构建和更新

### 4.2 修正后的 Kill Criteria

| 层级             | 条件                                                   | 测量方式   | 时限             | 行动                                                           |
| ---------------- | ------------------------------------------------------ | ---------- | ---------------- | -------------------------------------------------------------- |
| **项目级**       | GitHub Stars <50                                       | GitHub API | 6 个月           | 重新评估产品方向（认同综合纪要）                               |
| **项目级**       | 外部 MAU <10（连续 3 个月）                            | 自建埋点   | 每次发布后 90 天 | 重新评估产品方向（认同综合纪要）                               |
| **项目级**       | 无外部 issue/PR contribution                           | GitHub     | 6 个月           | 产品价值主张可能无效                                           |
| **Control Mode** | 延迟 >100ms（95th percentile）                         | 基准测试   | Phase 1 末       | 调查性能瓶颈，考虑 buffer 优化                                 |
| **Control Mode** | 重连成功率 <90%（含 1-3 次重试）                       | 集成测试   | Phase 1 末       | 修复重连逻辑后再推进 Phase 2                                   |
| **Android**      | GitHub Releases 下载 <100 **且** 无外部 issue/feedback | GitHub     | 3 个月           | 降级为维护模式                                                 |
| **Agent 检测**   | 不允许在 Phase 1-2 启动                                | —          | —                | 仅建样本库，不开发检测引擎                                     |
| **产品定位**     | CTR <2% 在所有 landing page 版本                       | A/B 测试   | Phase 1 末       | 重新定义价值主张，但**先确认有 ≥50 个外部用户后再做 A/B 测试** |
| **整体**         | Phase 1 结束后仍无外部用户                             | 埋点       | 3 个月           | 考虑项目是否应继续（最难但最必要的 kill criteria）             |

### 4.3 新增 Kill Criteria

| 条件                                                      | 行动                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| herdr 发布 Web Dashboard（浏览器可访问的 agent 管理面板） | **Agent 检测方向永久放弃**，因为 tmuapp 的"Web 差异化"将不复存在 |
| tmux 上游宣布移除或废弃 control mode (`-C` flag)          | 立即评估 SSH + tmux attach 替代方案，Web 控制台核心竞争力受损    |
| wterm 上游停滞（≥6 个月无更新且存在已知渲染 bug）         | 评估迁移到纯 xterm.js 的成本                                     |

---

## 五、实验优先级重排

### 综合纪要的实验优先级问题

综合纪要列出了 3 个验证方向 (V1-V3)，但它们的启动顺序有逻辑问题：

- V3（产品定位 A/B 测试）放在 Phase 1 启动，但此时可能还没有足够的外部用户来形成有效样本
- V1（Agent 检测准确率）放在 Phase 2 末验证，但 Phase 2 本身包含了 Agent Cockpit MVP 的完整开发——如果 Phase 2 末验证失败，整个 Phase 2 的投入就白费了
- V2（Android TAM）的验证方法依赖 GitHub Releases 下载量，但下载量 ≠ 使用量

### 修正后的实验优先级

| 优先级 | 实验                                        | 时机                         | 方法修正                                                                                         | 成功标准                          |
| ------ | ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| **E1** | Control Mode 延迟基准测试                   | Phase 1 第 1 周              | 用 `time` 和 Node.js `performance.now()` 测量 control mode 输出刷新延迟 vs 理论值                | p95 <50ms，差距 >5x vs CLI 轮询   |
| **E2** | 文档 + README 是否能吸引正确用户            | Phase 1 第 2 周              | 统一 README 定位文案，发布到 r/tmux，追踪 2 周内的 GitHub Stars 和 Docker pull 增长              | 2 周内 ≥10 个非自己的 Stars       |
| **E3** | Android QR 配对转化率                       | Phase 2 第 1 周（QR 上线后） | A/B：扫码连接 vs 手动输入 URL+Token，统计首次连接成功率                                          | 扫码 ≥90%，手动 <70%（差距 ≥20%） |
| **E4** | pane_current_command 展示是否能引起用户兴趣 | Phase 2 第 2 周              | 在 Web overview 中展示 pane_current_command 字段（非 agent 检测），追踪是否有用户反馈/issue 提及 | ≥2 个外部反馈提及此功能           |
| **E5** | Agent 检测 PoC（如 E4 通过）                | Phase 3                      | 仅对 Claude Code 做 4 种状态检测（idle/running/prompt/done），内部测试 ≥20 条样本                | 准确率 ≥90%（自测），≥85%（盲测） |
| **E6** | 产品定位 A/B 测试                           | Phase 3（MAU ≥50 后）        | 3 个 landing page 版本，Reddit Ads 小额投放（$30 each），而不是综合纪要的 $50 each               | CTR >3% 且 bounce <60%            |

**关键修正**:

- 综合纪要的 V1（Agent 检测准确率）现在排到 E5——在 Phase 3 且仅在 pane_current_command 展示引起用户兴趣之后。这避免了"做出来没人用"的风险。
- 综合纪要的 V3（产品定位 A/B 测试）现在排到 E6——在 MAU ≥50 之后。在 <10 用户的阶段做 A/B 测试，样本量不足以得出统计显著结论。

---

## 六、对综合纪要"共识区域"的挑战

综合纪要在第十节列举了 5 个共识区域。本复审逐一挑战：

### "共识 1: Control Mode 迁移是技术前提"

**部分挑战**: Control Mode 迁移确实是正确方向，但"迁移"一词暗示从零建设——这是误导。当前 `tmux-stream.ts` 已实现 control mode，需要的是**加固**，不是迁移。综合纪要的 Phase 1 范围（多 Pane 并行流）属于过度设计。

### "共识 2: 安全加固必须优先"

**无挑战**: 完全认同。唯一一个无争议的正确决策。

### "共识 3: 不做 macOS 原生终端"

**无挑战**: 完全认同。

### "共识 4: 不做团队协作为近期目标"

**无挑战**: 完全认同。

### "共识 5: AI Agent 方向有价值但需验证"

**严重挑战**:

- A/B/C 的"认可"并非独立判断，而是基于 herdr 叙事的模仿趋同
- D 的反对被综合纪要打了折扣（"有条件认可"实际上弱化了 D 的全盘否决）
- "需验证"的验证方式（85% 准确率 + 测试集 benchmark）过于学术化，忽略了市场验证（是否有用户真的要在浏览器里看 agent 状态）
- **建议将"AI Agent 方向有价值"的表述修改为"AI Agent 方向在理论上有差异化潜力，但市场验证缺失，不得在 Phase 1-2 启动任何开发工作"**

---

## 七、最终建议

### 7.1 一句话核心判断

> **综合纪要在正确方向上走得太远太快。** 安全加固和 Control Mode 加固是对的，但 Agent 检测和 Android 深化的资源投入被严重低估，且市场前提未验证。将 8 个活跃方向压缩为 3 个，先修地基、再验证、再扩展。

### 7.2 三条不可妥协的底线

1. **Phase 1 不允许启动任何新功能开发。** 只做安全加固 + Control Mode 加固 + 测试补充 + 文档完善。
2. **Agent 检测引擎在 Phase 2 结束前不允许写任何代码。** 仅允许收集样本。必须等到有外部用户信号（issue 反馈、用户访谈）或 herdr 已证明此需求但未覆盖 Web 场景。
3. **Android 投入上限 5 天（QR 配对 + 4 个快捷按钮）。** 超过 5 天的功能（Push 通知、手势、Agent badge）在 kill criteria 验证通过前不做。

### 7.3 对监督者的决策请求

| #   | 事项                                                 | 当前分歧                                                             | 复审建议                                               |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| D1  | 是否将 Agent 检测从 Phase 1-2 路线图中移除           | 综合纪要认为"有条件认可，需快速验证"；本复审认为"不得进入 Phase 1-2" | **移除**。仅建样本库，不开发引擎                       |
| D2  | 是否将活跃方向从 8 个压缩为 3 个                     | 综合纪要认可/延后了 8 个方向并行                                     | **压缩为 3 个**：安全加固、Control Mode 加固、文档补充 |
| D3  | Phase 1 是否允许新功能开发                           | 综合纪要 Phase 1 包含 Agent 样本收集 + A/B 测试                      | **不允许**。Phase 1 只做加固和修复                     |
| D4  | 是否接受缩小的 Android MVP（QR + 4 按钮，1.5 天）    | 综合纪要 Android 范围较大（QR + 命令面板 + 推送 + 手势 + badge）     | **接受缩小的 MVP**。其余延后                           |
| D5  | Kill criteria 是否加入"herdr 发布 Web Dashboard"条件 | 综合纪要未考虑此竞品风险                                             | **加入**。这是最可能发生的高影响事件                   |

---

## 八、附录：代码审查记录

| 审查项            | 文件                                                              | 发现                                                                                        |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Control Mode 实现 | `apps/api/src/tmux-stream.ts`                                     | ✅ 已实现 `tmux -C attach-session`，含 initial capture + pending buffer + 转义解码 + resize |
| WebSocket 流      | `apps/api/src/server.ts:72-108`                                   | ✅ WebSocket 升级和生命周期管理已就位                                                       |
| 认证机制          | `apps/api/src/server.ts:33-36, isAuthorized()`                    | ⚠️ 单 token，无分级                                                                         |
| CORS 配置         | `apps/api/src/server.ts:send()`                                   | ❌ `Access-Control-Allow-Origin: *`                                                         |
| 审计日志          | 全项目 grep                                                       | ❌ 不存在                                                                                   |
| tmux 命令封装     | `apps/api/src/tmux.ts`                                            | ⚠️ 每次调用 spawn 新进程，但核心流路径已走 control mode                                     |
| 测试覆盖          | `apps/api/tests/`, `apps/website/tests/`, `packages/utils/tests/` | ❌ `tmux-stream.ts` 和 `tmux.ts` 无直接单元测试                                             |
| 架构文档          | `docs/`                                                           | ⚠️ 仅有 `API.md`（未验证准确性），无 ADR、无数据流文档                                      |

---

_复审完成。本报告不编辑任何代码文件，仅输出复审意见供监督者决策。_
