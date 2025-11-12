import { node } from "@elysiajs/node";
import { Elysia, t } from "elysia";
import { execa } from "execa";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CONFIG } from "../config/index.ts";
import {
  formatClientConfig,
  formatServerPeerConfig,
  generatePeer,
  getServerPublicKey,
  validatePeerIP,
} from "../wireguard/index.ts";

const API_KEY = process.env.API_KEY;
const WG_CONFIG_PATH = join(CONFIG.WG_CONFIG_DIR, "wg0.conf");

// API Key verification middleware
const apiKeyGuard = ({ headers }: { headers: Record<string, string> }) => {
  const apiKey = headers["x-api-key"];
  if (!apiKey || apiKey !== API_KEY) {
    throw new Error("Unauthorized");
  }
};

export const app = new Elysia({ adapter: node() })
  .get("/", "Hello Elysia")
  .group(
    "/api",
    {
      headers: t.Object({
        "x-api-key": t.String(),
      }),
    },
    (app) =>
      app
        .onBeforeHandle(({ headers }) => {
          apiKeyGuard({ headers });
        })
        .get(
          "/config",
          async () => {
            const config = readFileSync(WG_CONFIG_PATH, "utf8");
            return { config };
          },
          {
            response: {
              200: t.Object({
                config: t.String(),
              }),
            },
          }
        )
        .put(
          "/config",
          async ({ body, status }) => {
            writeFileSync(WG_CONFIG_PATH, body.config);
            await execa("bash", ["-c", "wg syncconf wg0 <(wg-quick strip wg0)"]);
            return { success: true, message: "Configuration updated" };
          },
          {
            body: t.Object({
              config: t.String(),
            }),
            response: {
              200: t.Object({
                success: t.Boolean(),
                message: t.String(),
              }),
            },
          }
        )
        .get("/stats", async () => {
          const stats = await execa("wg show wg0", { shell: true });
          return stats.stdout;
        })
        .get(
          "/serverInfo",
          async () => {
            const publicKey = getServerPublicKey();
            const endpoint = `${CONFIG.PUBLIC_HOST}:${CONFIG.WG_PORT}`;
            return {
              publicKey,
              endpoint,
            };
          },
          {
            response: {
              200: t.Object({
                publicKey: t.String(),
                endpoint: t.String(),
              }),
            },
          }
        )
        .get(
          "/generatePeerConfig",
          async ({ query }) => {
            const ip = query.ip as string;
            const clientName = query.clientName as string;
            const publicHost = (query.publicHost as string) || CONFIG.PUBLIC_HOST;

            // Validate required parameters
            if (!ip || !clientName) {
              throw new Error('Missing required parameters: ip and clientName');
            }

            // Validate IP
            const validation = validatePeerIP(ip);
            if (!validation.valid) {
              throw new Error(validation.error);
            }

            // Generate peer config
            const peer = generatePeer();
            const serverConfig = formatServerPeerConfig(clientName, ip, peer);
            const clientConfig = formatClientConfig(ip, publicHost, peer);

            return {
              serverConfig,
              clientConfig,
            };
          },
          {
            query: t.Object({
              ip: t.String(),
              clientName: t.String(),
              publicHost: t.Optional(t.String()),
            }),
            response: {
              200: t.Object({
                serverConfig: t.String(),
                clientConfig: t.String(),
              }),
            },
          }
        )
  );
