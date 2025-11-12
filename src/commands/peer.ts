import { defineCommand } from "citty";
import { consola } from "consola";
import { CONFIG } from "../packlets/config/index.ts";
import {
  formatClientConfig,
  formatServerPeerConfig,
  generatePeer,
  validatePeerIP,
} from "../packlets/wireguard/index.ts";

export const peerCommand = defineCommand({
  meta: {
    name: "peer",
    description: "Generate WireGuard peer configurations",
  },
  subCommands: {
    create: defineCommand({
      meta: {
        name: "create",
        description: "Create a new peer configuration",
      },
      args: {
        name: {
          type: "string",
          description: "Client name (e.g., alice, bob, client1)",
          required: true,
        },
        ip: {
          type: "string",
          description: "Client IP address (must be in the WireGuard subnet range)",
          required: true,
        },
        publicHost: {
          type: "string",
          description: "Public host for WireGuard endpoint",
          default: process.env.PUBLIC_HOST || "vpn.example.com",
        },
      },
      async run({ args }) {
        try {
          const clientName = args.name as string;
          const ip = args.ip as string;
          const publicHost = args.publicHost as string;

          // Validate IP
          const validation = validatePeerIP(ip);
          if (!validation.valid) {
            consola.error(validation.error);
            process.exit(1);
          }

          consola.info(`Generating peer configuration for: ${clientName}`);

          const peer = generatePeer();

          const serverConfig = formatServerPeerConfig(clientName, ip, peer);
          const clientConfig = formatClientConfig(ip, publicHost, peer);

          consola.box("SERVER CONFIG (add to /etc/wireguard/wg0.conf)");
          consola.log(serverConfig);

          consola.box("CLIENT CONFIG");
          consola.log(clientConfig);

          consola.box("KEYS & PSK");
          consola.log(`Client Private Key: ${peer.clientPrivateKey}`);
          consola.log(`Client Public Key:  ${peer.clientPublicKey}`);
          consola.log(`Server Public Key:  ${peer.serverPublicKey}`);
          consola.log(`Pre-Shared Key:     ${peer.presharedKey}`);

          consola.box("NEXT STEPS");
          consola.log(
            "1. Copy server config section to /etc/wireguard/wg0.conf"
          );
          consola.log("2. Run: wg syncconf wg0 <(wg-quick strip wg0)");
          consola.log("3. Give client the client config");
          consola.log(`4. Client can then reach services in ${CONFIG.ALLOWED_TARGET_SUBNET}`);
        } catch (error) {
          consola.error(error);
          process.exit(1);
        }
      },
    }),
  },
});
