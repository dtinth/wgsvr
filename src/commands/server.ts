import { execSync } from "child_process";
import { defineCommand } from "citty";
import { consola } from "consola";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { CONFIG } from "../packlets/config/index.ts";
import { app } from "../packlets/server/index.ts";

export const serverCommand = defineCommand({
  meta: {
    name: "server",
    description: "Start WireGuard server with HTTP management API",
  },
  async run() {
    try {
      consola.info("Initializing WireGuard server...");

      // Initialize default config if needed
      initializeWireGuardConfig();

      // Set up WireGuard interface
      setupWireGuard();

      // Set up iptables rules
      setupIptables();

      // Start HTTP server
      await startHttpServer(app);
    } catch (error) {
      consola.error(error);
      process.exit(1);
    }
  },
});

function initializeWireGuardConfig() {
  const configPath = join(CONFIG.WG_CONFIG_DIR, "wg0.conf");
  const privateKeyPath = join(CONFIG.WG_CONFIG_DIR, "privatekey");
  const publicKeyPath = join(CONFIG.WG_CONFIG_DIR, "publickey");

  consola.info("Initializing WireGuard configuration...");

  // Check if config already exists
  if (existsSync(configPath)) {
    consola.log("✓ WireGuard configuration already exists");
    return;
  }

  // Generate server keys if they don't exist
  if (!existsSync(privateKeyPath) || !existsSync(publicKeyPath)) {
    consola.log("Generating WireGuard server keys...");
    try {
      const privateKey = execSync("wg genkey", { encoding: "utf8" }).trim();
      const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, {
        encoding: "utf8",
      }).trim();

      writeFileSync(privateKeyPath, privateKey);
      writeFileSync(publicKeyPath, publicKey);
      consola.success("✓ Server keys generated");
    } catch (error) {
      throw new Error(`Failed to generate server keys: ${error}`);
    }
  }

  // Create default wg0.conf
  const privateKey = readFileSync(privateKeyPath, "utf8").trim();
  const subnetMask = CONFIG.WG_SUBNET.split('/')[1];
  const defaultConfig = `[Interface]
Address = ${CONFIG.WG_SERVER_IP}/${subnetMask}
ListenPort = ${CONFIG.WG_PORT}
PrivateKey = ${privateKey}
`;

  try {
    writeFileSync(configPath, defaultConfig);
    consola.success("✓ Default WireGuard configuration created");
  } catch (error) {
    throw new Error(`Failed to create WireGuard configuration: ${error}`);
  }
}

function setupWireGuard() {
  consola.info("Setting up WireGuard interface...");

  try {
    execSync("wg-quick up wg0", { stdio: "inherit" });
    consola.success("WireGuard interface configured");

    const status = execSync("wg show wg0", { encoding: "utf8" });
    consola.box("WireGuard Status");
    consola.log(status);
  } catch (error) {
    throw new Error(`Failed to set up WireGuard: ${error}`);
  }
}

function setupIptables() {
  consola.info("Setting up iptables firewall rules...");

  const rules = [
    ["iptables -F FORWARD || true", "Flush FORWARD chain"],
    ["iptables -F INPUT || true", "Flush INPUT chain"],
    ["iptables -t nat -F POSTROUTING || true", "Flush NAT POSTROUTING"],
    [
      `iptables -t nat -A POSTROUTING -s ${CONFIG.WG_SUBNET} -o eth0 -j MASQUERADE`,
      "Enable MASQUERADE for WireGuard clients",
    ],
    ["iptables -P FORWARD DROP", "Set default FORWARD policy to DROP"],
    [
      "iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
      "Allow established connections",
    ],
    [
      `iptables -A FORWARD -i wg0 -o eth0 -d ${CONFIG.ALLOWED_TARGET_SUBNET} -j ACCEPT`,
      "Allow WireGuard clients to reach allowed target subnet",
    ],
    [
      `iptables -A FORWARD -i eth0 -o wg0 -s ${CONFIG.ALLOWED_TARGET_SUBNET} -j ACCEPT`,
      "Allow target subnet responses to WireGuard clients",
    ],
    [
      "iptables -A FORWARD -i wg0 -o wg0 -j DROP",
      "Block WireGuard peer-to-peer traffic",
    ],
    ["iptables -A FORWARD -i wg0 -j DROP", "Drop all other WireGuard traffic"],
  ];

  for (const [cmd, desc] of rules) {
    try {
      execSync(cmd, { stdio: "ignore" });
      consola.log(`✓ ${desc}`);
    } catch (error) {
      consola.error(`✗ ${desc}`);
    }
  }

  consola.success("iptables rules configured");
}

async function startHttpServer(elysia: any) {
  consola.info("Starting HTTP server...");
  await elysia.listen(CONFIG.API_PORT);
  consola.success(`HTTP server running on port ${CONFIG.API_PORT}`);
}
