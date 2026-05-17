# 反方/风控/竞争分析：tmuapp 未来方向风险评估

> **角色：Agent D（反方/风控/竞争分析）**
> 目标：挑刺、否决、降级、找出不会死的路线。
> 基准时间：2026-05-17
> 对标竞品：muxy.app（428★）、herdr.dev（820★）、tmuxy.sh（26★）

---

## 一、第一轮：候选方向全枚举

### 1.1 当前 tmuapp 已有方向

| #   | 方向              | 状态   | 简述                                                       |
| --- | ----------------- | ------ | ---------------------------------------------------------- |
| D1  | Web tmux 控制台   | 已实现 | React + wterm/xterm.js，HTTP API，session/window/pane 管理 |
| D2  | Docker 化部署     | 已实现 | GHCR 发布，一键启动 tmux 容器                              |
| D3  | Android 客户端    | 已实现 | Jetpack Compose，APK 签名发布，session 列表 + pane 输入    |
| D4  | Bearer Token 安全 | 已实现 | TMUAPP_TOKEN 保护 API 端点                                 |
| D5  | tmux CLI 封装 API | 已实现 | 通过 `tmux` 命令行的 HTTP facade                           |

### 1.2 可扩展方向（候选）

| #   | 方向                               | 类型          | 参考/竞品已做                          |
| --- | ---------------------------------- | ------------- | -------------------------------------- |
| C1  | 实时流式 pane 输出（control mode） | 架构升级      | tmuxy 已做                             |
| C2  | AI Agent 感知与编排                | 新市场        | herdr 已做，webmux/dmux/agentdock 在做 |
| C3  | 多机/多 server tmux 管理           | 横向扩展      | tmux-web-manager 在做                  |
| C4  | 原生桌面应用（Tauri）              | 平台拓展      | tmuxy 已做                             |
| C5  | iOS 客户端                         | 平台拓展      | agentboard 已做                        |
| C6  | macOS 原生终端模拟器（取代 tmux）  | 终端模拟器    | muxy 已做                              |
| C7  | Git worktree 集成                  | AI 开发工作流 | dmux, webmux 已做                      |
| C8  | Kanban/看板式 Agent 管理           | AI 开发可视化 | tmux-kanban 已做                       |
| C9  | 团队协作（多用户共享 session）     | SaaS/企业     | 无人完整实现                           |
| C10 | Plugin/扩展生态                    | 平台化        | tmux TPM 已有生态                      |
| C11 | WebSocket/SSE 实时推送             | 技术增强      | 部分竞品已做                           |
| C12 | 移动端优先 + PWA                   | 差异化        | agentboard 部分覆盖                    |

---

## 二、第二轮：逐项否决/认可/降级

### 2.1 D1-D5（已有方向）深度审查

#### D1: Web tmux 控制台 — **保留但需架构升级**

**现状**：HTTP API + wterm/xterm.js 渲染，通过 tmux CLI 轮询获取 pane 输出。
**致命弱点**：

1. **tmux CLI 是轮询模型，不是实时流。**每个 `/api/panes/:target/capture` 调用都是完整的 `tmux capture-pane` 进程启动。对于 240 行 × 多 pane 的轮询，延迟累积不可接受。tmux 官方文档明确指出 format subscriptions 每秒只更新一次。[Source](https://github.com/tmux/tmux/issues/3449)

2. **与 tmuxy 正面竞争架构劣势明显。** tmuxy 使用 control mode (`tmux -CC`) 通过 stdin/stdout 实现实时事件推送，无需轮询。tmuapp 的 CLI 轮询模型在延迟、吞吐、CPU 开销上全面落后。

3. **wterm 是好选择，但 xterm.js 性能存在历史问题。** xterm.js 在大屏高列数下曾有 FPS 骤降问题（155 cols 时降至 4-14 FPS）。[Source](https://github.com/xtermjs/xterm.js/issues/1677) wterm 的 Zig/WASM 方案理论上更好但成熟度未知。

**判决**：保留，但必须从 CLI 轮询迁移到 control mode 流式架构，否则用户体验无法追上 tmuxy。

#### D2: Docker 化部署 — **保留，低风险**

**优势**：简单、可复制、CI/CD 友好。竞品中仅 tmuxy 有 devcontainer，herdr 是单二进制不需要容器。
**风险**：Docker 内 tmux 的 PTY 隔离、信号处理、终端尺寸同步有坑，但都是已知可解的工程问题。
**判决**：保留。这是 tmuapp 相对于 herdr（需本地安装）和 muxy（仅 macOS）的差异化部署优势。

#### D3: Android 客户端 — **降级为实验性**

**问题**：

1. Android 终端使用场景极其有限。在手机上管理 tmux session 的 TAM（Total Addressable Market）极小。
2. agentboard 已经做了 iOS Safari 适配，覆盖了移动端需求，无需原生 App。
3. herdr 通过 SSH + Moshi 实现了手机端使用，无需额外客户端。
4. CI/CD 签名流程复杂（需要 keystore secrets），维护成本高。

**唯一可能的差异化**：如果 tmuapp 定位为"运维人员的移动 tmux 控制面板"，Android 客户端可能有小众市场。但这不是一个 VC 可投的方向。

**判决**：降级。保留但不对其投入核心资源，改为维护模式。若 3 个月内无 100+ 下载，Kill。

#### D4: Bearer Token 安全 — **保留**

**现状**：已经实现，无额外成本。
**风险**：tmux socket 权限才是真正安全边界，Bearer token 只是纵深防御的一层。如果攻击者能访问 localhost 或 Docker 端口，token 保护价值有限。
**判决**：保留，不需要额外投入。

#### D5: tmux CLI 封装 API — **需重构**

**问题**：每个 API 调用启动一个新 `tmux` 子进程。高并发下进程风暴。
**对比**：

- tmuxy: control mode 持久连接，零进程启动开销
- herdr: Rust 单二进制，内建 PTY 管理

**判决**：这是当前最大的架构债务。必须重构为 control mode 或至少加入连接池。

---

### 2.2 C1-C12（候选方向）风险评估

#### C1: 实时流式 pane 输出（control mode） — **必须做，高优先级**

**为什么必须做**：不做的后果是永远活在 tmuxy 的阴影下。tmuxy 虽然只有 26 星，但其架构是正确的——control mode 是 tmux 官方推荐的 GUI 集成方式。
**风险**：中等。control mode 协议复杂（iTerm2 专用协议），tmuxy 的 `docs/TMUX.md` 已经记录了已知 bug 和限制。[Source](https://github.com/flplima/tmuxy/blob/main/docs/TMUX.md)
**可规避打法**：参考 tmuxy-core 的 Rust 实现，用 Node.js 重写一个轻量 control mode client。利用已有 ws 依赖实现 WebSocket 推流。
**判决**：认可。这是 tmuapp 从"能用"到"好用"的必经之路。

#### C2: AI Agent 感知与编排 — **否决，或极度降级**

**为什么否决**：

1. **herdr 已经赢了这个细分市场。** 820 星，2 个月内从 0 到 0.5.0，开发速度极快，社区活跃。它被产品化定义为"agent multiplexer"，叙事清晰有力。
2. **竞争者密度极高：** dmux、webmux、agentdock、agent-bridge、tmux-kanban 都在做同一件事。这是一个拥挤的赛道。
3. **herdr 的护城河：**
   - Rust 单二进制，零依赖安装：`curl -fsSL https://herdr.dev/install.sh | sh`
   - 内建 agent state detection（blocked/working/done）
   - Socket API 让 agent 可以编排其他 agent
   - 已支持 Claude Code、Codex、Gemini CLI、Cline、Kimi、Copilot CLI
   - AGPL-3.0 但对个人开发者无影响
4. **tmuapp 做 Agent 感知从零开始**，且架构基础（CLI 轮询）不支撑实时 agent 状态检测。

**判决**：否决。除非能找到 herdr 完全没覆盖的 niche（如"企业内部 Agent 审计面板"），否则不要进入 Agent 编排市场。

#### C3: 多机/多 server tmux 管理 — **降级**

**现状**：solanian/tmux-web-manager 只 1 星，说明这个需求不强。
**分析**：tmux 本身通过 SSH + `tmux attach` 已解决远程管理问题。多 server 管理的真实场景是运维团队管理生产服务器，但运维人员更倾向于 SSH 直接操作而非通过 Web GUI。
**判决**：降级。可作为远期功能，但不是 0→1 阶段的核心。

#### C4: 原生桌面应用（Tauri） — **降级**

**tmuxy 已实现** Tauri 桌面应用。但 tmuxy 只有 26 星，说明桌面端的增量需求不大。
**tmuapp 的优势**：Web 优先本来就是 tmuapp 的定位，Tauri 包装的边际收益远不如改善 Web 体验。
**判决**：降级。Web PWA 可以覆盖桌面场景（window controls, keyboard shortcuts），无需额外桌面客户端。

#### C5: iOS 客户端 — **否决**

agentboard 已经做了 iOS Safari 适配（paste、touch scrolling、keyboard shortcuts）。原生 iOS App 审查和上架成本高，且 Android 客户端的低下载量已证明移动原生 App 需求不强。
**判决**：否决。投入 PWA 移动适配即可覆盖 iOS。

#### C6: macOS 原生终端模拟器 — **否决**

muxy 428 星，27 个 release，SwiftUI + libghostty，MIT 协议。这是 muxy 的核心领地。
**为什么 tmuapp 绝对不能做**：

1. **技术栈完全不匹配**：tmuapp 是 TypeScript/Node.js/Web，终端模拟器需要 C/Rust/Swift + GPU 加速
2. **muxy 已有先发优势和性能护城河**：libghostty 是 Zig 编写的高性能终端引擎
3. **这不是 GUI for tmux，而是取代 tmux**：与 tmuapp 的使命完全矛盾
   **判决**：否决。不要碰终端模拟器。

#### C7: Git worktree 集成 — **降级**

dmux 和 webmux 已经做了 worktree + tmux 集成。技术上是 tmux + git worktree 的组合，实现成本中等。但这是 Agent 工作流的一个子功能，如果否决了 C2（Agent 编排），单独做 worktree 集成价值有限。
**判决**：降级。如果未来决定进入 Agent 工作流（推翻 C2 否决），可作为差异化特性。

#### C8: Kanban/看板式 Agent 管理 — **否决**

tmux-kanban 已经做了拖拽看板 + tmux 终端。技术上很酷，但看板 UI 与 tmux 终端管理的核心场景不匹配（你到底是要看终端输出还是看卡片状态？）。
**判决**：否决。UI 范式冲突。

#### C9: 团队协作（多用户共享 session） — **认可，探索**

**为什么可能有机会**：

1. **无人完整实现**：tmux 本身不支持多用户共享 session 的权限控制
2. **企业需求真实**：on-call 工程师需要共享查看终端状态，但不应有写权限
3. **可结合 Bearer Token 做 RBAC**：tmuapp 已有 auth 基础
4. **不与 herdr/muxy 正面竞争**：herdr 是个人工具，muxy 是 macOS 本地应用

**风险**：

- 安全挑战巨大（tmux session 共享意味着 shell 共享）
- tmuapp 当前的 tmux CLI 封装是每个请求新建进程，无法做 session 级别的连接管理

**判决**：认可为远期差异化方向，但需要先完成 C1（control mode 流式架构）作为基础。

#### C10: Plugin/扩展生态 — **否决**

tmux 已有 TPM（Tmux Plugin Manager）生态，100+ 插件。tmuapp 作为 Web GUI 层无法与 tmux 原生插件生态竞争。tmuapp 可以做的是兼容展示 tmux 插件效果，而非另起炉灶。
**判决**：否决。对接 tmux 现有生态即可。

#### C11: WebSocket/SSE 实时推送 — **认可，与 C1 合并**

API 已经有 ws 依赖（`package.json` 中有 `ws`），说明设计上已有实时推送意图。需要确认当前实现状态：如果 control mode 已接入，WebSocket 是自然的传输层。
**判决**：认可。作为 C1 的子任务推进。

#### C12: 移动端优先 + PWA — **降级**

agentboard 覆盖了移动端场景。但 agentboard 是 agent 优化的，tmuapp 可以区分定位为"通用 tmux 管理的移动端"。
**判决**：降级。PWA 适配作为 Web 体验优化的一部分，而非独立方向。

---

## 三、竞争态势矩阵

### 3.1 核心维度对比

| 维度             | tmuapp                 | muxy.app               | herdr.dev           | tmuxy              |
| ---------------- | ---------------------- | ---------------------- | ------------------- | ------------------ |
| **架构基座**     | tmux CLI 轮询          | 自研终端（libghostty） | Rust 自研 PTY       | tmux control mode  |
| **平台**         | Web + Android + Docker | macOS 原生             | 终端（跨平台）      | Web + Tauri 桌面   |
| **实时性**       | ❌ 轮询                | ✅ 原生 GPU 渲染       | ✅ PTY 直连         | ✅ control mode 流 |
| **AI Agent**     | ❌ 无                  | ❌ 无                  | ✅ 核心功能         | ❌ 无              |
| **安装门槛**     | Docker 或 Node.js      | macOS App              | `curl \| sh`        | brew cask          |
| **许可证**       | 未声明                 | MIT                    | AGPL-3.0            | MIT                |
| **成熟度**       | v0.1.1，有 CI/CD       | v0.21.0，428★          | v0.5.0，820★        | 开发中，26★        |
| **GitHub Stars** | 未知                   | 428                    | 820                 | 26                 |
| **团队规模**     | 1人？                  | 1人（saeedvaziry）     | 1人（ogulcancelik） | 1人（flplima）     |
| **发布时间**     | ~2026 Q1?              | 2026-03-31             | 2026-03-27          | 2026-01-06         |

### 3.2 正面竞争弱点分析

#### vs muxy.app 的弱点

| tmuapp 弱点        | muxy 优势                      | 严重程度                                    |
| ------------------ | ------------------------------ | ------------------------------------------- |
| Web 终端的渲染延迟 | libghostty GPU 加速，原生体验  | 🔴 高                                       |
| 无原生 macOS 体验  | SwiftUI 原生窗口、菜单、快捷键 | 🟡 中（tmuapp 不 targeting macOS 原生体验） |
| 无内置 VCS 集成    | 内置 git diff 和操作           | 🟡 中                                       |
| 终端模拟器不完整   | libghostty 是完整终端引擎      | 🟡 中                                       |

**可规避打法**：

- tmuapp 不竞争 macOS 原生终端市场 → 不与 muxy 正面冲突
- tmuapp 的核心价值是"随时随地通过浏览器访问 tmux"，muxy 完全不做这个
- Docker 部署是 muxy 无法企及的（macOS 应用无法容器化）

#### vs herdr.dev 的弱点

| tmuapp 弱点        | herdr 优势                       | 严重程度                     |
| ------------------ | -------------------------------- | ---------------------------- |
| 零 Agent 感知      | Agent state detection 是核心功能 | 🔴 高（如果进入 Agent 市场） |
| tmux CLI 轮询架构  | Rust PTY 直连，零开销            | 🔴 高                        |
| 需要浏览器/Node.js | 单二进制，`curl \| sh`           | 🟡 中                        |
| 无 Socket API      | 完整 Socket API 供 agent 编排    | 🔴 高（如果进入 Agent 市场） |

**可规避打法**：

- **核心策略：不进入 Agent 编排市场** → herdr 的竞争优势不相关
- tmuapp 定位为"Web tmux 管理控制台"，与 herdr 的"Agent multiplexer"错位
- Web GUI 是 herdr 明确不做的事（herdr 排斥 GUI、Electron、Web Dashboard）
- tmuapp 的 Docker/远程访问是 herdr 不提供的部署模式

#### vs tmuxy 的弱点

| tmuapp 弱点              | tmuxy 优势                      | 严重程度        |
| ------------------------ | ------------------------------- | --------------- |
| CLI 轮询 vs control mode | tmuxy 架构正确，实时流式        | 🔴 高           |
| 无 Tauri 桌面客户端      | tmuxy 有桌面+Web 双模式         | 🟡 中           |
| 无 image/markdown 渲染   | tmuxy 的 RICH-RENDERING.md 规划 | 🟢 低（可后补） |
| stars 更少               | 26★ vs ?                        | 🟢 低（都不大） |

**可规避打法**：

- tmuxy 明确标注"Not ready for production"，这是 tmuapp 的时间窗口
- tmuapp 已有 Docker + CI/CD + Android APK 的完整交付流水线，tmuxy 没有
- tmuapp 可以先完成 control mode 迁移，消除架构劣势

### 3.3 tmuapp 独特定位机会

1. **"tmux 的 Web 运维面板"**：唯一有 Docker 镜像 + HTTP API + Bearer Token 的 tmux Web 方案
2. **"tmux for DevOps"**：不跟 Agent 开发者卷，而是服务运维工程师的远程 tmux 管理需求
3. **跨平台可访问性**：唯一的 Web + Android + Docker 三位一体方案

---

## 四、风险矩阵

### 4.1 风险评级标准

| 等级    | 概率   | 影响      | 说明           |
| ------- | ------ | --------- | -------------- |
| 🔴 致命 | >50%   | 项目失败  | 必须规避       |
| 🟠 严重 | 30-50% | 重大返工  | 需要缓解计划   |
| 🟡 中等 | 15-30% | 延迟/超支 | 接受并监控     |
| 🟢 低   | <15%   | 可接受    | 不需要主动管理 |

### 4.2 风险清单

| #   | 风险                                          | 概率    | 影响             | 等级 | 缓解措施                                      |
| --- | --------------------------------------------- | ------- | ---------------- | ---- | --------------------------------------------- |
| R1  | **架构落后（CLI 轮询）导致无法竞争**          | 高(70%) | 致命             | 🔴   | 立即启动 control mode 迁移                    |
| R2  | **Agent 市场被 herdr 主导**                   | 高(80%) | 致命（如果进入） | 🔴   | 不进入 Agent 编排市场                         |
| R3  | **tmux 用户群体不买 Web GUI 的账**            | 中(40%) | 严重             | 🟠   | MVP 验证实验（见第六节）                      |
| R4  | **单点维护风险（单人项目）**                  | 中(35%) | 严重             | 🟠   | 文档化架构，减少 bus factor                   |
| R5  | **tmux 上游 breaking change**                 | 低(10%) | 中等             | 🟡   | 锁定 tmux 版本，CI 测试覆盖                   |
| R6  | **control mode 协议复杂度超出预期**           | 中(30%) | 严重             | 🟠   | 参考 tmuxy-core，分阶段交付                   |
| R7  | **移动端需求被证明不存在**                    | 中(40%) | 中等             | 🟡   | Android 降级为维护模式                        |
| R8  | **Docker 内 tmux 的兼容性问题**               | 低(15%) | 中等             | 🟡   | 已有 CI 测试，持续覆盖                        |
| R9  | **竞品（herdr/muxy）进入 Web 领域**           | 低(20%) | 严重             | 🟠   | 加速 control mode 迁移，建立先发优势          |
| R10 | **AI Agent 直接绕过 tmux 使用自己的终端管理** | 中(25%) | 严重             | 🟠   | 保持 tmux 标准协议兼容，不依赖 Agent 特定行为 |

---

## 五、Kill Criteria（何时放弃某方向）

### 5.1 项目级 Kill Criteria

| 条件                          | 测量方式   | 时限          |
| ----------------------------- | ---------- | ------------- |
| Web 控制台 MAU < 10（含自己） | 自建埋点   | 发布后 3 个月 |
| GitHub stars < 50             | GitHub API | 发布后 6 个月 |
| 无外部贡献者/issue            | GitHub     | 发布后 6 个月 |
| 未完成 control mode 迁移      | 代码审查   | 2026 Q3 末    |

### 5.2 方向级 Kill Criteria

| 方向                             | Kill 条件                            | 测量                          |
| -------------------------------- | ------------------------------------ | ----------------------------- |
| **Android 客户端**               | 下载量 < 100 或 3 个月内无活跃使用   | Google Play / GitHub Releases |
| **Agent 编排**（如果被推翻上诉） | 无法在 2 周内复现 herdr 核心功能 80% | 内部 demo                     |
| **多机管理**                     | 无 ≥3 个用户请求该功能               | Issue/讨论                    |
| **Tauri 桌面客户端**             | Web PWA 已覆盖 90% 桌面需求          | 用户调研                      |
| **团队协作**                     | 无 ≥2 个企业用户明确需求             | 用户访谈                      |

### 5.3 架构级 Kill Criteria

| 条件                                | 行动                            |
| ----------------------------------- | ------------------------------- |
| control mode 迁移超过 3 个月未完成  | 考虑 fork tmuxy-core 而非自研   |
| wterm 出现严重渲染 bug 且无上游修复 | 回退到纯 xterm.js               |
| tmux 上游宣布移除 control mode      | 立即转向 SSH + tmux attach 方案 |

---

## 六、MVP 验证实验

### 实验 1：Web tmux 控制台 PMF 验证

**假设**：运维/开发者愿意通过浏览器管理 tmux session（而非 SSH + tmux attach）

**实验设计**：

- 发布一个极简 landing page + Docker 一键启动命令
- 在 r/tmux, Hacker News, dev.to 发布介绍
- 埋点追踪：Docker pull 次数、health endpoint 被调用次数、session API 被调用次数
- 目标：2 周内 50 次 Docker pull + 10 个外部 IP 创建 session

**成功标准**：≥10 个独立外部 IP 创建 session 且回访
**失败行动**：如果仅 0-2 个外部用户，重新评估整个产品方向

### 实验 2：control mode vs CLI 性能对比

**假设**：control mode 方案的延迟和吞吐显著优于 CLI 轮询

**实验设计**：

- 在相同 tmux 环境（3 个 window，各 4 个 pane）下
- 分别用 CLI 轮询（1s 间隔）和 control mode 实时流
- 测量：pane 更新延迟（从键按下到 Web 终端显示）、CPU 使用率、带宽
- 发布 benchmark 数据在 README 中

**成功标准**：control mode 延迟 < 50ms，CLI 轮询延迟 > 500ms（差距 >10x）
**失败行动**：如果差距 <3x，control mode 迁移的优先级降低

### 实验 3：定位噪音测试（Positioning Noise Test）

**假设**：不同定位描述的吸引力不同

**实验设计**：

- 准备 3 个 landing page 副本，仅标题和一句话描述不同：
  - A: "tmux Web 管理控制台"
  - B: "面向 DevOps 的 tmux 运维面板"
  - C: "浏览器里的 tmux：随时随地管理你的 session"
- 在 Google Ads / Reddit Ads 上小额投放（$50 each）
- 测量 CTR 和 bounce rate

**成功标准**：某一定位的 CTR > 3% 且 bounce rate < 60%
**失败行动**：全部低于阈值 → 产品价值主张需要重新定义

### 实验 4：竞品用户流失原因访谈

**假设**：herdr/muxy 用户有未被满足的需求

**实验设计**：

- 在 herdr 和 muxy 的 GitHub issues/discussions 中分析用户抱怨
- 联系 5 位活跃用户进行 15 分钟访谈
- 关注：他们为什么选择 herdr/muxy？有什么不满？是否愿意尝试替代品？

**成功标准**：发现至少 2 个 herdr/muxy 的明确短板，且 tmuapp 可以弥补
**失败行动**：如果用户满意度极高且无明确痛点，tmuapp 需要找到完全不同的市场切入点

---

## 七、保守但有竞争力的路线

### 7.1 推荐路线：tmux Web 运维面板

**一句话定位**："自托管的 tmux Web 控制台——通过浏览器和 HTTP API 管理 tmux session，支持 Docker 部署和 Bearer Token 安全。"

**核心差异 vs 竞品**：

| 维度       | tmuapp 路线        | muxy             | herdr            | tmuxy     |
| ---------- | ------------------ | ---------------- | ---------------- | --------- |
| 定位       | Web tmux 控制台    | macOS 终端模拟器 | Agent 多路复用器 | tmux GUI  |
| 用户       | DevOps/运维/SRE    | macOS 开发者     | AI 工程师        | tmux 用户 |
| 部署       | Docker / 自托管    | macOS App Store  | curl pipe sh     | brew cask |
| Agent 感知 | 不涉及             | 不涉及           | 核心             | 不涉及    |
| 移动端     | PWA（轻量）        | 无               | SSH + Moshi      | Web       |
| 商业化     | 企业自托管 license | 免费 MIT         | AGPL（限制商用） | 免费 MIT  |

### 7.2 非目标（明确不做）

1. ❌ 不进入终端模拟器市场（让给 muxy）
2. ❌ 不进入 Agent 编排市场（让给 herdr）
3. ❌ 不做 macOS/iOS 原生客户端
4. ❌ 不做 Git worktree 集成
5. ❌ 不做看板/Kanban UI

### 7.3 6 个月路线图（保守版）

**Phase 1（Month 1-2）：架构债务清理**

- control mode 迁移（参考 tmuxy-core）
- WebSocket 实时 pane 流式推送
- wterm 性能基准测试和优化

**Phase 2（Month 3-4）：PMF 验证**

- 实验 1-4 执行
- 根据实验结果调整定位
- 打磨 onboarding 体验（5 分钟内从零到看到 pane）

**Phase 3（Month 5-6）：差异化功能**

- PWA 支持（离线缓存、推送通知）
- 多 session 仪表板（一览所有 session 状态）
- 日志/审计（谁在什么时候执行了什么操作）

### 7.4 为什么这个路线不会死

1. **不与 herdr 正面竞争**：herdr 的用户是 AI 工程师，在终端里工作；tmuapp 的用户是运维，在浏览器里工作
2. **不与 muxy 正面竞争**：muxy 是 macOS 原生应用；tmuapp 是 Web + Docker，覆盖 Linux 服务器和远程场景
3. **不与 tmuxy 正面竞争**：tmuxy 还在开发中，且定位模糊（"the missing tmux GUI"）；tmuapp 有更清晰的运维定位
4. **tmux 不会消失**：tmux 是 RHEL 8+ 推荐的默认多路复用器，装机量巨大且持续增长
5. **Web GUI 的真实需求**：tmux 的学习曲线是公认的痛点（keybindings），降低入门门槛有真实价值

---

## 八、监督者协调

当前分析已完成，无阻塞问题。所有风险已识别并给出缓解方案。路线图已压缩为最保守、最不会死的方向。

**若需要决策**：建议将 C1（control mode 迁移）作为最高优先级启动，在迁移完成前冻结所有新功能开发。

---

## Sources

### 竞品一手来源

- **muxy.app** (https://muxy.dev/) — 产品首页，明确定位和功能
- **muxy-app/muxy** (https://github.com/muxy-app/muxy) — 428★，SwiftUI + libghostty，macOS 原生
- **herdr.dev** (https://herdr.dev/) — 产品首页，"tmux for agents"
- **ogulcancelik/herdr** (https://github.com/ogulcancelik/herdr) — 820★，Rust，Agent multiplexer
- **tmuxy.sh** (https://tmuxy.sh/) — 产品首页，"The missing tmux GUI"
- **flplima/tmuxy** (https://github.com/flplima/tmuxy) — 26★，Rust + React + Tauri

### 技术参考

- **tmux Control Mode Wiki** (https://github.com/tmux/tmux/wiki/Control-Mode) — 官方文档
- **tmux issue #3449** (https://github.com/tmux/tmux/issues/3449) — control mode signaling 限制
- **tmux issue #4302** (https://github.com/tmux/tmux/issues/4302) — passthrough output
- **wterm** (https://wterm.dev/) — Zig/WASM 终端渲染器
- **xterm.js issue #1677** (https://github.com/xtermjs/xterm.js/issues/1677) — 渲染性能降级

### 其他竞品（排除原因）

- agentboard — Agent 优化，与 herdr 重叠
- agentdock/webmux/dmux — Agent 编排赛道，拥挤
- tmux-kanban — UI 范式冲突（看板 vs 终端）
- tmux-web-manager — 1★，需求未验证
- TmuxBar — macOS 菜单栏应用，太窄
