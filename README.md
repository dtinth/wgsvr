# wgsvr - WireGuard Access Control

A Docker-based WireGuard VPN server for restricting access to a backend server. Clients connect via WireGuard and can only access specific services - they cannot communicate with each other or access anything outside the allowed subnet.

## Use Case

You have a backend server you want to restrict access to. Instead of opening ports to the internet:

1. Deploy this Docker container on your host
2. Create WireGuard peers for each person who needs access
3. Each peer lives on subnet `10.100.128.0/17` and can only reach your backend server on `10.100.0.0/24`
4. Peers cannot communicate with each other or access anything outside their allowed network

## Requirements

- **Docker host**: Modern Debian-based system (recommended for simplicity)
  - Only tested with Debian as a Docker host
  - Requires kernel with WireGuard support
- **Docker runtime** with capability to run privileged containers
- **Environment**: `API_KEY` and `PUBLIC_HOST` variables (required), `ALLOWED_TARGET_SUBNET` (optional)

## Deployment

### Setup .env File

Create a `.env` file with your configuration:

```sh
# .env

# Generate with: openssl rand -hex 32
API_KEY=

# IP or hostname that can reach the server
PUBLIC_HOST=

# (Optional) Subnet that WireGuard clients can access
# Default: 10.100.0.0/24
ALLOWED_TARGET_SUBNET=10.100.0.0/24
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  wireguard:
    image: wgsv
    restart: unless-stopped
    environment:
      - TZ=Asia/Bangkok
      - API_KEY=${API_KEY}
      - PUBLIC_HOST=${PUBLIC_HOST}
      - ALLOWED_TARGET_SUBNET=${ALLOWED_TARGET_SUBNET:-10.100.0.0/24}
    volumes:
      - etc_wireguard:/etc/wireguard
      - /lib/modules:/lib/modules:ro
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.ip_forward=1
      - net.ipv4.conf.all.src_valid_mark=1
    ports:
      - "22111:22111/tcp"
      - "51820:51820/udp"
    networks:
      mynet:
        ipv4_address: 10.100.0.2

volumes:
  etc_wireguard:

networks:
  mynet:
    driver: bridge
    ipam:
      config:
        - subnet: 10.100.0.0/24
          gateway: 10.100.0.250
```

### Build & Run

```bash
docker build -t wgsv .
docker compose up -d
```

On first run, the container generates a WireGuard keypair and saves it to the `etc_wireguard` volume. This persists across restarts.

## Basic Usage

All API calls require the `x-api-key: $API_KEY` header.

### 1. Get Current Configuration

```bash
curl -H "x-api-key: $API_KEY" \
  http://localhost:22111/api/config
```

Returns the current `/etc/wireguard/wg0.conf` file.

### 2. Generate a New Peer

```bash
curl -H "x-api-key: $API_KEY" \
  "http://localhost:22111/api/generatePeerConfig?ip=10.100.128.10&clientName=alice"
```

Returns:
```json
{
  "serverConfig": "[Peer]\n# alice\nPublicKey = ...\n...",
  "clientConfig": "[Interface]\nPrivateKey = ...\n..."
}
```

This generates a new keypair but **does not save it**. You need to manually add the server config to the WireGuard configuration.

### 3. Add Peer to Server Configuration

Append the `serverConfig` from step 2 to the configuration, then update the server:

```bash
curl -X PUT -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"config": "<entire updated wg0.conf content>"}' \
  http://localhost:22111/api/config
```

The new peer is live immediately.

### 4. Check Interface Stats

```bash
curl -H "x-api-key: $API_KEY" \
  http://localhost:22111/api/stats
```

Shows WireGuard interface statistics including transferred bytes per peer.

## Network Architecture

- **WireGuard peers**: `10.100.128.0/17` subnet
  - Server interface IP: `10.100.128.1`
  - Each peer assigned a `/32` address (e.g., `10.100.128.10`)
  - Example: `alice` might be `10.100.128.10`

- **Backend services**: Configurable subnet (default `10.100.0.0/24`)
  - Controlled by `ALLOWED_TARGET_SUBNET` environment variable
  - Clients can reach anything on this subnet
  - Cannot reach anything outside this range
  - Cannot reach each other

- **WireGuard port**: `51820/udp` (mapped from container)
- **API port**: `22111/tcp` (mapped from container)

## Peer Assignment Workflow

1. Generate peer configuration via API/CLI
2. Assign an unused IP from `10.100.128.0/17` (excluding `10.100.128.1`)
3. Add server config section to WireGuard configuration
4. Apply configuration via API
5. Share client config with the peer (contains their private key, server public key, etc.)

## Security

- **Peer isolation**: Clients cannot communicate with each other (firewall rules block peer-to-peer traffic)
- **Network restriction**: Clients can only access services on the configured subnet (default `10.100.0.0/24`, customizable via `ALLOWED_TARGET_SUBNET`)
- **API authentication**: All management API calls require `x-api-key` header
- **Key persistence**: Server keypair persists across restarts via volume mount

## HTTP API Reference

All endpoints require `x-api-key` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/config` | Retrieve current WireGuard configuration |
| PUT | `/api/config` | Update WireGuard configuration |
| GET | `/api/stats` | Display interface statistics and peer usage |
| GET | `/api/generatePeerConfig` | Generate new peer keypair and config |

### generatePeerConfig Query Parameters

- `ip` (required) - Peer IP address (must be in `10.100.128.0/17`)
- `clientName` (required) - Name for the peer (used in comments)
- `publicHost` (optional) - Override the public hostname (defaults to `$PUBLIC_HOST`)
