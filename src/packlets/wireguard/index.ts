import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import inRange from "ip-range-check";
import { join } from "path";
import { CONFIG } from "../config/index.ts";

const WG_CONFIG_DIR = CONFIG.WG_CONFIG_DIR;
const WG_SUBNET = CONFIG.WG_SUBNET;

export interface GeneratedPeer {
  clientPrivateKey: string;
  clientPublicKey: string;
  serverPublicKey: string;
  presharedKey: string;
}

export interface PeerInfo {
  name: string;
  ip: string;
  publicHost: string;
}

export function getServerPublicKey(): string {
  const pubKeyPath = join(WG_CONFIG_DIR, "publickey");
  if (!existsSync(pubKeyPath)) {
    throw new Error(`Server public key not found at ${pubKeyPath}`);
  }
  return readFileSync(pubKeyPath, "utf8").trim();
}

export function generateClientKeys(): {
  privateKey: string;
  publicKey: string;
} {
  try {
    const privateKey = execSync("wg genkey", { encoding: "utf8" }).trim();
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, {
      encoding: "utf8",
    }).trim();
    return { privateKey, publicKey };
  } catch (error) {
    throw new Error(`Failed to generate client keys: ${error}`);
  }
}

export function generatePresharedKey(): string {
  try {
    return execSync("wg genpsk", { encoding: "utf8" }).trim();
  } catch (error) {
    throw new Error(`Failed to generate PSK: ${error}`);
  }
}

export function generatePeer(): GeneratedPeer {
  const { privateKey: clientPrivateKey, publicKey: clientPublicKey } =
    generateClientKeys();
  const serverPublicKey = getServerPublicKey();
  const presharedKey = generatePresharedKey();

  return {
    clientPrivateKey,
    clientPublicKey,
    serverPublicKey,
    presharedKey,
  };
}

export function formatServerPeerConfig(
  clientName: string,
  ip: string,
  peer: GeneratedPeer
): string {
  return `
[Peer]
# ${clientName}
PublicKey = ${peer.clientPublicKey}
PresharedKey = ${peer.presharedKey}
AllowedIPs = ${ip}/32
`;
}

export function formatClientConfig(
  ip: string,
  publicHost: string,
  peer: GeneratedPeer
): string {
  return `[Interface]
PrivateKey = ${peer.clientPrivateKey}
Address = ${ip}/32

[Peer]
PublicKey = ${peer.serverPublicKey}
PresharedKey = ${peer.presharedKey}
AllowedIPs = ${CONFIG.ALLOWED_TARGET_SUBNET}
Endpoint = ${publicHost}:${CONFIG.WG_PORT}
PersistentKeepalive = 25
`;
}

export function validatePeerIP(ip: string): { valid: boolean; error?: string } {
  // Check if IP is in the WireGuard subnet range
  const isInRange = inRange(ip, WG_SUBNET);

  if (!isInRange) {
    return {
      valid: false,
      error: `IP must be in ${WG_SUBNET} range`,
    };
  }

  // Reserve server IP
  if (ip === CONFIG.WG_SERVER_IP) {
    return {
      valid: false,
      error: `${CONFIG.WG_SERVER_IP} is reserved for WireGuard server`,
    };
  }

  return { valid: true };
}
