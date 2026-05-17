# 第二轮辩论：市场/用户视角复审 Round 1

> **角色**: Round 2 Market/User Debater  
> **评审对象**: Round 1 Synthesis（综合纪要）、Agent A–E 原始报告  
> **视角**: 用户粘性、传播性、MVP 可验证性、GTM/社区/包装  
> **日期**: 2026-05-17  
> **核心立场**: 从市场和用户出发否决空泛方向、认可可带来粘性和分发的方向、深化 GTM 和包装建议

---

## 一、总判断

Round 1 综合纪要的**优先级排序和技术判断大体合理**，但在以下三个维度存在系统性偏差：

1. **"平台思维"过度**：多个方向本质是在为没有用户的基础设施做过度设计（Workspace 抽象、SDK/CLI、Plugin 框架），这是"先建庙再找人拜"的典型错误。
2. **"叙事与 MVP 脱节"**：产品定位讨论偏向品牌文案层面，但缺乏"MVP 第一天用户打开看到什么"的具体设计。定位要可 MVP 化才有意义。
3. **"分发渠道未锚定"**：大量讨论围绕功能优先级，但几乎没有回答"第一批 100 个用户从哪里来"这个关键问题。

---

## 二、否决方向：空泛、不易传播、不易 MVP 验证

### ❌ 否决 1：Workspace 项目工作区（D2 / R5）

**否决理由**：

- **零用户需求验证**：没有一条外部反馈要求"把 tmux session 组织成项目工作区"。muxy 做 workspace 是因为它是 macOS 本地应用，workspace 切换是本地工作流的核心——tmuapp 是远程管理工具，用户场景完全不同。
- **MVP 无法验证**："API 层预留 Workspace 类型"是幽灵基础设施——用户看不到、用不了、无法产生反馈。这是典型的"基础设施先行"错误。
- **叙事空泛**：在 remote tmux cockpit 的语境下，"workspace"对用户意味着什么？用户已经用 tmux session name 做粗粒度分组，不需要一个新的抽象层来重新定义他们的工作方式。
- **与核心价值脱节**：tmuapp 的核心钩子是"AI agent 卡住了，手机上一键回复"——workspace 组织与此无关，是分散注意力的方向。

**替代建议**：如果未来确实需要组织 session，最低成本做法是让用户给 session 加 tag/label（一个字符串字段），而不是定义一个 workspace 对象绑定 git branch + project path + layout。

---

### ❌ 否决 2：API/SDK/CLI 控制面（D6 / H1）

**否决理由**：

- **无人会集成**：MAU < 10 的项目做 SDK，是在给空气修管道。没有任何自动化系统、脚本、agent supervisor 会去集成一个零用户项目的 HTTP API。
- **开发者幻想**：Agent A 说"tmuapp 可同时服务 Web、人、手机、脚本和 agent supervisor"——但当前没有任何 agent supervisor 在寻找 tmux HTTP API 来集成。这是臆想的需求。
- **优先级倒置**：应该先用功能（Agent Cockpit）吸引用户，等用户真的开始说"我想用 API 自动化这个操作"时再做 SDK。而不是反过来。
- **维护负担**：SDK 和 CLI 一旦发布就有维护承诺——版本兼容、文档更新、bug 修复。对单人项目这是沉重负担。

**替代建议**：保持现有 HTTP API 的简单可用即可。如果真的出现自动化需求（比如有人写 shell script 调 tmuapp API），再考虑标准化文档。不做 SDK/CLI 作为方向。

---

### ❌ 否决 3：Pane Layout 可视化编辑器（D7 / H2）

**否决理由**：

- **功能而非方向**：这是一个 UI 增强，不应作为战略方向讨论。它应该放在 backlog 里，等用户反馈驱动再做。
- **投入产出倒挂**：拖拽分屏编辑器的工程量大（需要解析 tmux layout 字符串、实现拖拽交互、状态同步），但 tmux 用户已经有 `split-window` + `select-layout` 的命令行方式完成布局。Web 拖拽对这个用户群不是刚需。
- **不带来粘性也不带来分发**：没有人会因为"可以拖拽调整 tmux 窗格大小"而选择 tmuapp。这不是差异化叙事的组成部分。

---

### ❌ 否决 4：国内网络穿透方案（D8 / H3）

**否决理由**：

- **技术合规风险高**：Agent D 已指出合规风险。FRP/自建 relay 在国内有灰色地带，作为开源项目推荐或集成这类方案，可能招致法律/监管风险。
- **维护成本沉重**：穿透方案涉及持续运维（relay 服务器带宽成本、可用性监控），这不是一个开源工具项目应该承担的运营负担。
- **MVP 不需要**：当前 MVP 用户是远程开发机上的开发者——他们已经有 SSH/Tailscale/VPN。穿透是"规模化后"的问题，不是"0→1"的问题。
- **触发条件已足够**：Round 1 设定"中国大陆用户占比 >30%"才启动——当前 0 个外部用户，这个方向 6 个月内都不需要讨论。

**替代建议**：在 README 里提供清晰的部署指南（Tailscale + Cloudflare Tunnel + nginx），让用户自行选择。不集成、不自建。

---

## 三、认可方向：能带来用户粘性和分发

### ✅ 强认可 1：AI Agent 状态感知 + Cockpit（D1+D13 / R1）

**认可理由**：

- **用户粘性机制明确**：一旦用户设置 tmuapp 来监控 agent，每次 agent 卡住都会打开 app——这创造了高频使用习惯。这是所有方向中唯一能产生"习惯回路"（cue → routine → reward）的功能。
- **分发钩子清晰**："你的 AI agent 在服务器上卡住了？手机上看一眼，一键回复"——这个一句话说明让潜在用户立刻理解价值。这是所有方向中传播性最强的叙事。
- **市场窗口真实**：Claude Code/Codex/Aider 的用户量在爆发式增长（Round 1 引用 8.7% 使用率季度增长 1.4%），这些用户每天都在面对"agent 卡在确认提示"的痛点。这不是臆想的需求。
- **herdr 不是威胁而是验证**：herdr 820★ 证明了"agent 状态感知"有市场需求。但 herdr 是终端内 TUI，不做 Web/Android/Docker——tmuapp 的场景是 herdr 明确不覆盖的。两者互补而非竞争。

**深化建议**：

1. **MVP 必须极致聚焦**：不做"Detector 框架"，只做 3 个硬编码检测器（Claude Code、Codex、Aider），每种只识别 2 种状态（running / waiting_input）。框架化是过度设计。
2. **MVP 第一天用户体验**：用户打开 tmuapp → 看到 session 列表 → 每个 session/pane 上有一个小 badge（🟢 running / 🟡 waiting / ⚪ idle）→ 点进 pane 看最近输出 → 点击"y"按钮一键回复。这就是全部。不需要侧边栏、不需要状态面板、不需要排序筛选。
3. **传播话术**：不是"AI Agent 遥控器"这种技术名词——而是"**Agent 卡了？手机秒回。**"这种场景化表达。在 V2EX/掘金/Reddit 的标题应该用这个，而不是产品名称。

---

### ✅ 强认可 2：安全加固（D4 / R2）

**认可理由**：

- **解除 adoption blocker**：当前单 token 模型让用户不敢在公网暴露 tmuapp。多 token + 只读模式一上线，立即解锁"手机远程看护"场景——这和 Agent Cockpit 是互补的。
- **传播间接价值**：安全本身不是传播点，但"敢暴露到公网"解锁了远程使用场景，远程使用场景才是传播点。

**深化建议**：

1. **部署指南是真正的交付物**：不是"多 token 分级代码"——而是"5 分钟部署指南"：`docker run` + Tailscale 一条命令 + 自动 HTTPS。用户从"看到 tmuapp"到"手机上看到 agent 状态"应该 <5 分钟。
2. **只读 token 是关键**：read-only token 比 admin/write 更重要——因为大多数用户 90% 的时间是在"看"而不是"操作"。只读模式降低了风险感知，让更多人敢部署。
3. **审计日志最小化**：不需要复杂日志系统——只需在 `server.ts` 的 kill/input/resize 路径上打一行 `console.log` 即可。过度设计审计系统是浪费时间。

---

### ✅ 强认可 3：Control Mode 流式架构（D5 / R3）

**认可理由**：

- **技术前提**：没有实时流，Agent 状态检测的延迟就不可接受。这是 Agent Cockpit 的基础设施。
- **代码验证**：`apps/api/src/tmux-stream.ts`（168 行）已经实现了 `tmux -C attach-session` + `%output` 解析 + 初始 capture 缓冲——说明 control mode 的基础已经存在，不是从零开始。

**深化建议**：

1. **不要过度投入**：当前实现已覆盖核心功能（实时输出流 + resize）。需要补充的是心跳和重连，而不是重构整个架构。增量改进 2-3 周可完成，不需要 4-6 周。
2. **用户不可见的工作要限时**：Control Mode 改进对用户是"感觉更流畅了"，不是新功能。应该设 2 周时限——如果 2 周内完成心跳+重连，就上线；否则先发布 Agent Cockpit 用现有架构（capture 轮询降级），后续再优化。

**代码证据**：`tmux-stream.ts:21-47` 已实现 control mode 连接 + stdout buffer + `%output` 解析；`tmux-stream.ts:57-70` 实现了初始 capture 缓冲机制避免重复输出；`tmux-stream.ts:93-100` 实现了 `refresh-client -C` resize。缺失的是心跳 ping/pong 和客户端重连逻辑。

---

### ✅ 条件认可 4：Android 深化（D3 / R4）

**认可理由**：

- **稀缺差异化**：tmuapp 是唯一有生产级 Android 客户端的开源 tmux 管理工具——这个事实本身就是传播素材。
- **但粘性取决于推送通知**：没有推送通知的 Android 客户端只是"小屏版 Web console"，用户没有理由专门打开 app。**推送通知是 Android 的粘性锚点**——"agent 卡住了，手机收到通知，一键回复"才是习惯回路。

**深化建议**：

1. **推送通知是第一优先级**，不是 QR 配对。QR 配对降低的是配置门槛（一次性），推送通知创造的是持续使用习惯（每天多次）。优先级应该是：推送通知 → 快捷命令面板 → QR 配对。
2. **推送通知的国内适配**：FCM 在国内不可用。必须同时支持 HMS Push（华为）和极光推送（JPush）或统一推送联盟（UPS）。这是国内市场的硬性约束。
3. **Kill Criteria 收紧**：Round 1 设 3 个月 <200 下载 → 降级。建议改为 **2 个月 <100 下载且 <10 个活跃用户（每周至少打开 1 次）** → 降级。活跃用户数比下载量更能反映粘性。
4. **MVP 不做手势系统**：Agent B 提出的"双指滑动=方向键、三指上滑=session 切换器"是过度设计。MVP 只需要：session 列表 + 状态 badge + "y/n/Enter/Ctrl-C"按钮 + 推送通知。

---

## 四、定位深化：从文案到 MVP 可验证的叙事

### Round 1 定位冲突回顾

| 定位                                                               | 问题                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| "AI Agent 遥控器"（A/B）                                           | 技术名词，非用户语言；暗示需要理解"agent"概念才能使用 |
| "DevOps tmux 运维面板"（D）                                        | DevOps 用户已有 Grafana/SSH，不需要另一个面板         |
| "自托管 tmux cockpit for remote tasks and coding agents"（E 折中） | 过长、不口语化、无场景感                              |

### 建议定位：场景化 + 口语化

**对外传播定位**：

> **Agent 卡了？手机秒回。**
>
> tmuapp 让你在浏览器和手机上实时看到服务器上的 AI coding agent 状态，一键回复确认提示。

**对内产品定位**：

> tmuapp = 远程 tmux cockpit，核心价值是"看到 agent 状态 + 快速回复"，不是"完整的 tmux 管理台"。

**为什么这样定位**：

1. **场景化而非功能化**："Agent 卡了？手机秒回"直接描述了用户的痛点场景，不需要解释什么是 tmux、什么是 agent、什么是 cockpit。
2. **MVP 可验证**：这个定位对应的功能集是明确的——agent 状态 badge + 快捷回复按钮 + 推送通知。第一天上线就兑现了定位承诺。
3. **传播性**：这句话可以在 V2EX/掘金/HN 的标题里直接使用，比"自托管 tmux cockpit"有 10 倍以上的点击率。

### 定位 A/B 测试建议

Round 1 建议做 landing page A/B 测试（V3），但三个版本都太技术化。建议改为：

- **A**: "Agent 卡了？手机秒回。"（场景钩子）
- **B**: "在浏览器里看护你的 AI coding agent。"（功能描述）
- **C**: "自托管 tmux Web 控制台。"（技术定位，对照组）

测 CTR 和 bounce rate，$50 每组就够了。

---

## 五、GTM 深化：第一批 100 个用户从哪来

### Round 1 的 GTM 缺失

Round 1 综合纪要几乎没有讨论分发策略，除了 Agent B 提到的"V2EX/掘金发帖"和"中文内容输出"。但这些是泛泛的社区运营建议，不是可执行的 GTM 计划。

### 可执行 GTM 方案

#### 渠道 1：AI Agent 用户社区（最高优先级）

- **目标人群**：正在使用 Claude Code / Codex / Aider 的开发者
- **具体渠道**：
  - Claude Code Discord / Reddit r/ClaudeAI
  - Codex GitHub Discussions
  - Aider GitHub Issues/Discussions
  - Hacker News "Show HN" 帖子
- **话术**："你在服务器上跑 Claude Code，离开桌面后它卡在确认提示？tmuapp 让你从手机/浏览器看到状态并一键回复。"
- **目标**：2 周内 30 个外部用户创建 session

#### 渠道 2：中文开发者社区（次要优先级）

- **目标人群**：国内使用 tmux + AI agent 的开发者
- **具体渠道**：
  - V2EX /create 节发帖（标题："Agent 卡了？手机秒回——tmuapp 让你远程看护 AI coding agent"）
  - 掘金发布实战指南（"tmux + Claude Code 远程遥控实战"）
  - 即刻/微信技术群分享
- **关键内容**：3 分钟演示视频——手机收到推送通知 → 打开 app → 看到 agent 等待确认 → 点击"y" → agent 继续运行。**这是传播性最强的内容形式**。

#### 渠道 3：GitHub 开源社区（持续运营）

- **README 重写**：当前 README 是技术文档，不是价值主张文档。第一段应该是"Agent 卡了？手机秒回。"，然后才是技术细节。
- **GitHub Topics 标签**：添加 `tmux`, `claude-code`, `codex`, `ai-agent`, `remote-monitor` 标签
- **Release Notes 价值化**：每次 release 的 changelog 应突出用户可见变化，而不是内部重构

#### 渠道 4：Docker Hub / GHCR（被动分发）

- `docker pull ghcr.io/markbang/tmuapp` 的描述应该包含"AI agent monitoring"关键词
- Docker Compose example 应展示"启动 + 连接 + 看到 agent 状态"的完整流程

### 分发节奏

| 阶段   | 时间    | 目标         | 关键动作                                               |
| ------ | ------- | ------------ | ------------------------------------------------------ |
| 冷启动 | 0-2 周  | 30 外部用户  | Agent Cockpit MVP 上线 + Show HN + Claude Discord 发帖 |
| 验证   | 2-6 周  | 100 外部用户 | 中文社区内容 + 演示视频 + Android 推送通知上线         |
| 增长   | 6-12 周 | 300 外部用户 | GitHub README 重写 + 定位 A/B 测试 + 持续内容输出      |

---

## 六、包装深化：从"功能列表"到"用户旅程"

### 当前问题

tmuapp 的 README 和文档是功能列表式描述（"HTTP API、WebSocket、Docker、Android"），没有描述用户如何从"第一次听说 tmuapp"到"日常使用 tmuapp"的完整旅程。

### 建议包装结构

#### 新用户旅程（5 分钟从零到看到 agent）

```
Step 1: docker run -d -p 3000:3000 -v /tmp/tmux:/tmp/tmux ghcr.io/markbang/tmuapp
Step 2: 打开浏览器 http://localhost:3000
Step 3: 看到你的 tmux session 列表 + agent 状态 badge
Step 4: 点进一个 "waiting" 的 pane → 点击 "y" 一键回复
```

这个 4 步旅程就是 tmuapp 的核心价值主张的 MVP 兑现。所有文档、README、landing page 都应该围绕这个旅程设计。

#### Android 用户旅程（3 分钟从安装到收到通知）

```
Step 1: 下载 APK → 打开 → 扫 QR 码配对
Step 2: 看到 session 列表 + agent 状态 badge
Step 3: 收到推送通知 "Claude Code 等待确认"
Step 4: 打开 app → 点击 "y" → agent 继续
```

---

## 七、商业化深化：延后但有预案

Round 1 正确判断"PMF 未验证前不启动商业化"。但需要明确预案，避免未来仓促定价。

### 预案原则

1. **不阉割核心功能**：Agent 状态检测 + 快捷回复 + 推送通知必须是免费的。这些是产品核心价值，收费会杀死 adoption。
2. **Pro 功能必须是"锦上添花"**：多服务器聚合、高级手势、快捷回复库自定义——这些是增值而非核心。
3. **定价锚点**：参考 Pocketmux $9.99/年 ≈ ¥72/年。tmuapp Pro 可定 ¥48/年（低于竞品，符合国内付费阈值）。
4. **托管服务不是近期方向**：基础设施投入大、合规风险高、国内云服务市场已被阿里云/腾讯云占据。

### 具体预案

| 层级           | 免费                | Pro ¥48/年                 |
| -------------- | ------------------- | -------------------------- |
| Agent 状态检测 | ✅ 3 种 agent       | ✅ 全部 agent + 自定义规则 |
| 快捷回复       | ✅ y/n/Enter/Ctrl-C | ✅ 自定义命令库            |
| 推送通知       | ✅ 基础通知         | ✅ 自定义触发规则 + 多通道 |
| 服务器数量     | ✅ 1 台             | ✅ 多台聚合                |
| 安全           | ✅ 多 token + 只读  | ✅ 审计日志导出            |

---

## 八、修订后的优先级排序

### 与 Round 1 的差异

| Round 1 排序              | 本轮修订                                | 变化原因                                                                      |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| P1: Control Mode 流式架构 | **P1: Agent Cockpit MVP**（含快捷回复） | Control Mode 是基础设施不是方向；Agent Cockpit 才是用户可感知的价值，应先发布 |
| P2: Agent 状态层 MVP      | 合入 P1                                 | 不可分割——状态检测和 Cockpit 是一个 MVP                                       |
| P3: 安全加固              | **P2: 安全加固 + 部署指南**             | 保持，但强调部署指南是核心交付物                                              |
| P4: Android 深化          | **P3: Android 推送通知优先**            | 推送通知 > QR 配对 > 手势                                                     |
| P5: Workspace 抽象        | **❌ 否决**                             | 零用户需求验证，幽灵基础设施                                                  |
| H1: API/SDK/CLI           | **❌ 否决**                             | 空管道问题                                                                    |
| H2: Pane Layout 编辑器    | **❌ 否决**                             | 功能而非方向                                                                  |
| H3: 国内穿透              | **❌ 否决**                             | 合规风险+运营负担                                                             |

### 修订后的执行序列

#### Sprint 1（0-2 周）：Agent Cockpit MVP 上线

- `apps/api/src/agent-detect.ts`：3 个硬编码检测器（Claude Code / Codex / Aider）
- Web overview 增加 status badge（🟢/🟡/⚪）
- 快捷回复按钮面板（y/n/Enter/Ctrl-C）
- Control Mode 心跳 + 重连（增量改进，2 周时限）
- README 重写：定位 + 5 分钟安装旅程

#### Sprint 2（2-4 周）：安全 + 部署体验

- 多 token 分级（admin/write/read-only）
- 只读 token 禁止 POST/DELETE
- 部署指南文档（Tailscale / Cloudflare Tunnel / nginx）
- Docker Compose example 展示完整流程
- Landing page 上线（含定位 A/B 测试）

#### Sprint 3（4-6 周）：Android 推送通知

- 服务端检测 "waiting_input" 状态 → 触发推送
- Android 接收推送 → 打开对应 pane
- 国内推送通道适配（HMS Push / JPush）
- QR 配对（次优先级）
- 快捷命令面板

#### Sprint 4（6-8 周）：验证与调整

- 定位 A/B 测试结果分析
- Android kill criteria 评估（2 个月 <100 下载 → 降级）
- Agent 检测准确率评估（<70% → 转向 hook 方案）
- 根据用户反馈决定下一步方向

---

## 九、修订后的 Kill Criteria

| 层级       | 条件                               | 时限        | 行动                                   |
| ---------- | ---------------------------------- | ----------- | -------------------------------------- |
| 项目级     | 2 周内 <30 外部用户创建 session    | Sprint 1 后 | 重新定义产品方向或停止                 |
| 项目级     | 6 周内 <100 外部用户               | Sprint 3 后 | 大幅缩减范围，只保留核心               |
| Agent 检测 | 准确率 <70%（基于 50+ 样本测试集） | Sprint 1 后 | 放弃启发式，转向 Claude Code hook 事件 |
| Android    | 2 个月 <100 下载 或 <10 周活跃用户 | Sprint 4 后 | 降级为维护模式                         |
| 定位 A/B   | 所有版本 CTR <2%                   | Sprint 2 后 | 重写价值主张                           |

**注意**：比 Round 1 更激进——0→1 阶段的容错空间很小。6 个月的项目级 Kill Criteria 太宽松，2-3 个月就应做出判断。

---

## 十、关键风险补充

| #   | 风险                        | 等级 | 说明                                                  | 缓解                                                                  |
| --- | --------------------------- | ---- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| M1  | **Agent 交互模式变化**      | 🔴   | Claude Code/Codex 更新 UI 格式后检测规则失效          | 规则与版本绑定；优先 hook 方案（如果 Claude Code 提供 webhook）       |
| M2  | **推送通知国内合规**        | 🔴   | FCM 不可用，HMS/JPush 需要开发者账号和应用备案        | 初版用 WebSocket 长连接模拟推送（不需要第三方通道），降低合规风险     |
| M3  | **MVP 上线冷启动失败**      | 🟠   | 如果 2 周内无人使用，说明定位或痛点假设错误           | 准备好 Plan B：降级为"tmux Web viewer"（纯只读查看，不做 agent 检测） |
| M4  | **功能蔓延到"tmux 管理台"** | 🟠   | 开发过程中容易加入"完整 tmux CRUD"而非聚焦 agent 监控 | 每个 sprint 只做与"agent 状态 + 快捷回复"直接相关的功能               |
| M5  | **竞品快速跟进**            | 🟡   | herdr 可能增加 Web/移动端支持                         | 加速 MVP 发布，先发优势比功能完整更重要                               |

**补充说明 M2（推送通知）**：Round 1 和 Agent B 都把 FCM/HMS 作为推送方案，但初版完全可以避免第三方依赖——用 WebSocket 长连接 + 本地 NotificationManager 实现伪推送。用户打开 app 后 WebSocket 保持连接，服务端检测到 agent 状态变化时通过 WS 推消息，Android 端触发本地通知。这样不需要任何云服务账号，零合规风险。真正的云端推送可以在用户量达到 100+ 后再引入。

---

## 十一、对 Agent E 报告的说明

Agent E（host-gpt55）的报告文件实际内容为空（仅 473 字节的思考过程日志残留），未包含有效的分析或建议。因此本轮复审不考虑 Agent E 的输入，所有判断基于 Agent A/B/C/D 的原始报告和 Round 1 综合纪要。

---

## 十二、总结：三条核心否决 + 四条核心认可 + 一个核心叙事

### 否决

1. **Workspace 抽象**：零需求验证的幽灵基础设施
2. **SDK/CLI 控制面**：给空气修管道
3. **Pane Layout 编辑器 + 国内穿透**：功能而非方向 / 合规风险过高

### 认可

1. **Agent Cockpit MVP**：唯一能创造使用习惯和传播钩子的方向
2. **安全加固 + 部署指南**：解锁远程使用场景的 adoption blocker
3. **Control Mode 增量改进**：Agent Cockpit 的技术前提，2 周时限
4. **Android 推送通知**：创造习惯回路的关键锚点

### 核心叙事

> **Agent 卡了？手机秒回。**

这个叙事决定了产品做什么、不做什么、先做什么、后做什么。所有功能决策都应该用这个叙事做过滤器：能直接兑现"看到状态 + 快速回复"承诺的做，不能的不做。

---

## 证据来源

| 来源                                                    | 用途                                         |
| ------------------------------------------------------- | -------------------------------------------- |
| `apps/api/src/tmux-stream.ts`（168 行）                 | 验证 Control Mode 已有基础实现，增量改进可行 |
| `apps/api/src/server.ts:324-330`（`isAuthorized` 函数） | 验证当前单 token 认证模型                    |
| GitHub API `markbang/tmuapp`（0 stars, 0 forks）        | 验证项目当前用户量极低                       |
| `git log --oneline`（59 commits since May 1）           | 验证开发活跃度                               |
| Agent A 报告（12 个方向发散 + 否决/合并）               | Round 1 输入                                 |
| Agent B 报告（产品/市场/用户场景 + 竞品全景）           | Round 1 输入                                 |
| Agent C 报告（技术架构 + 里程碑路线）                   | Round 1 输入                                 |
| Agent D 报告（反方/风控/竞争分析）                      | Round 1 输入                                 |
| Agent E 报告（空文件，排除）                            | —                                            |
| Round 1 综合纪要                                        | 评审对象                                     |
