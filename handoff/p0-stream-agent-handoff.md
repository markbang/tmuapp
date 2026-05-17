## ✅ P0.2 + P0.3 完成，27 files, +5558/-278

| 模块                         | 实现                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| **P0.2 WebSocket heartbeat** | 服务器 `socket.ping()` 每 30s，客户端忽略 `ping` 消息                 |
| **P0.2 重连**                | 指数退避 1s/2s/4s/8s/30s，最多 5 次，重连前 capture 同步              |
| **P0.3 agent-detector**      | `detectAgentState()` — 识别 spinner、Thinking…、prompt `$#>❯`、空输出 |
| **P0.3 快捷回复**            | Cockpit 底部 quick-reply bar: [Y] [N] [↵] [^C] [^D]                   |
| **安全加固**                 | `tokenConfig` 多 token 分级（admin/write/read），audit 日志           |
| **API 文档**                 | `docs/API.md` 补充鉴权分级 + WebSocket 协议说明                       |
