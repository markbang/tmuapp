import { createApiServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

const token = process.env.TMUAPP_TOKEN?.trim();
createApiServer({
  tokenConfig: token ? { admin: [token], write: [token], read: [token] } : undefined,
}).listen(port, host, () => {
  console.log(`tmuapp api listening on http://${host}:${port}`);
});
