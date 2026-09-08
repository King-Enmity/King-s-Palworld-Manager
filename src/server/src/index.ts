import Fastify from "fastify";

const app = Fastify({
  logger: true
});

app.get("/health", async () => {
  return {
    status: "ok",
    product: "King's Palworld Manager",
    version: "0.1.0-dev",
    timestamp: new Date().toISOString()
  };
});

app.get("/api/v1/system", async () => {
  return {
    product: "King's Palworld Manager",
    edition: "self-hosted",
    version: "0.1.0-dev",
    authentication: false
  };
});

const port = Number(process.env.KPM_HTTP_PORT ?? 8080);
const host = process.env.KPM_BIND_ADDRESS ?? "127.0.0.1";

await app.listen({
  port,
  host
});
