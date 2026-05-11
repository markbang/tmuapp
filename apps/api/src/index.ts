import { createApiServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

createApiServer().listen(port, host, () => {
  console.log(`tmuapp api listening on http://${host}:${port}`);
});
