export const CONFIG = {
  WG_CONFIG_DIR: "/etc/wireguard",
  WG_INTERFACE: "wg0",
  API_PORT: 22111,
  WG_PORT: 51820,
  WG_SUBNET: "10.100.128.0/17",
  WG_SERVER_IP: "10.100.128.1",
  ALLOWED_TARGET_SUBNET: process.env.ALLOWED_TARGET_SUBNET || "10.100.0.0/24",
  PUBLIC_HOST: process.env.PUBLIC_HOST || "vpn.example.com",
} as const;

export type Config = typeof CONFIG;
