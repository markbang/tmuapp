import { createApiServer, type TokenConfig } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

createApiServer({
  tokenConfig: tokenConfigFromEnv(process.env),
  corsOrigin: firstValue(process.env.TMUAPP_CORS_ORIGIN ?? process.env.TMUAPP_CORS_ORIGINS),
}).listen(port, host, () => {
  console.log(`tmuapp api listening on http://${host}:${port}`);
});

function tokenConfigFromEnv(env: NodeJS.ProcessEnv): TokenConfig | undefined {
  const legacyToken = tokens(env.TMUAPP_TOKEN);
  const config: TokenConfig = {
    admin: [...tokens(env.TMUAPP_TOKEN_ADMIN), ...legacyToken],
    write: tokens(env.TMUAPP_TOKEN_WRITE),
    read: tokens(env.TMUAPP_TOKEN_READ),
  };

  return config.admin.length + config.write.length + config.read.length > 0 ? config : undefined;
}

function tokens(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function firstValue(value: string | undefined) {
  return tokens(value)[0];
}
