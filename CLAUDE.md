# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**wgsvr** is a WireGuard VPN server management system with CLI and HTTP API. It handles server initialization, firewall configuration, and dynamic peer management.

## Development Commands

### Running the Application
```bash
pnpm start              # Start WireGuard server with HTTP management API
pnpm node src/cli.ts peer create <name> <ip> [publicHost]  # Generate peer config via CLI
```

### TypeScript Execution
The project uses TypeScript with `--experimental-transform-types` for direct TS execution without a build step. No separate compile or build process is needed.

## Codebase Architecture

### Directory Structure

```
src/
├── cli.ts                    # Main CLI entry point
├── commands/
│   ├── server.ts            # Server initialization command
│   └── peer.ts              # Peer generation command
└── packlets/                # Modular components
    ├── config/              # Configuration constants
    ├── server/              # HTTP API (Elysia)
    ├── wireguard/           # WireGuard utilities
    └── utils/               # Helper utilities
```

### Component Breakdown

**`src/cli.ts`**
- Main CLI entry point using Citty framework
- Defines two subcommands: `peer` and `server`
- Error handling and process exit management

**`src/commands/server.ts:14-33`**
- Main server command handler
- Orchestrates initialization flow: config → WireGuard setup → iptables → HTTP server
- Functions: `initializeWireGuardConfig()`, `setupWireGuard()`, `setupIptables()`, `startHttpServer()`

**`src/commands/server.ts:36-80`** - `initializeWireGuardConfig()`
- Checks if `wg0.conf` exists; creates it if missing
- Generates server keypair using `wg genkey` and `wg pubkey`
- Writes keys to `/etc/wireguard/privatekey` and `/etc/wireguard/publickey`
- Creates default WireGuard interface configuration

**`src/commands/server.ts:82-95`** - `setupWireGuard()`
- Executes `wg-quick up wg0` to bring up the interface
- Displays WireGuard status via `wg show wg0`

**`src/commands/server.ts:97-138`** - `setupIptables()`
- Flushes and configures firewall rules
- Sets FORWARD policy to DROP (default deny)
- Adds rules for:
  - NAT masquerading for outbound client traffic
  - Allowing established/related connections
  - Client → allowed target subnet communication
  - Target subnet → client responses
  - **Blocks peer-to-peer traffic** between clients
  - Drops all other WireGuard traffic

**`src/commands/peer.ts:11-85`**
- Peer creation subcommand
- Validates IP via `validatePeerIP()`
- Generates peer credentials
- Outputs formatted configs and keys to console
- Provides step-by-step setup instructions

**`src/packlets/config/index.ts`**
- Centralized configuration object
- Network ranges, ports, directories, public hostname
- Exported as const type for type safety

**`src/packlets/server/index.ts:14-23`** - API Authentication
- `apiKeyGuard()` middleware validates `x-api-key` header
- Applied to all `/api/*` routes via `group()` wrapper

**`src/packlets/server/index.ts:39-51`** - `GET /api/config`
- Reads and returns current `wg0.conf` file content

**`src/packlets/server/index.ts:53-71`** - `PUT /api/config`
- Writes new configuration to `wg0.conf`
- Applies changes live via `wg syncconf wg0 <(wg-quick strip wg0)`
- No restart needed

**`src/packlets/server/index.ts:72-75`** - `GET /api/stats`
- Returns output of `wg show wg0` command for interface statistics

**`src/packlets/server/index.ts:76-117`** - `GET /api/generatePeerConfig`
- Query parameters: `ip` (required), `clientName` (required), `publicHost` (optional)
- Validates IP is in WireGuard subnet and not reserved
- Generates peer keys and formats configs
- Returns `serverConfig` and `clientConfig` JSON

**`src/packlets/wireguard/index.ts:23-29`** - `getServerPublicKey()`
- Reads server's public key from disk
- Used by peer generation to configure client's peer section

**`src/packlets/wireguard/index.ts:31-44`** - `generateClientKeys()`
- Runs `wg genkey` and `wg pubkey` to create keypair
- Returns both private and public keys

**`src/packlets/wireguard/index.ts:46-52`** - `generatePresharedKey()`
- Executes `wg genpsk` for additional security layer
- Pre-shared keys authenticate peers in addition to public key

**`src/packlets/wireguard/index.ts:54-66`** - `generatePeer()`
- Combines key generation and server public key retrieval
- Returns `GeneratedPeer` object with all keys needed for a peer

**`src/packlets/wireguard/index.ts:68-79`** - `formatServerPeerConfig()`
- Formats peer section for server's `wg0.conf`
- Structure: `[Peer]` with public key, PSK, allowed IPs

**`src/packlets/wireguard/index.ts:82-97`** - `formatClientConfig()`
- Formats complete client configuration file
- Includes: interface (private key, address), peer (server public key, PSK, allowed IPs, endpoint, keepalive)

**`src/packlets/wireguard/index.ts:100-120`** - `validatePeerIP()`
- Uses `ip-range-check` to verify IP is in `WG_SUBNET`
- Prevents assigning server's own IP to a peer
- Returns validation object with error message if invalid

**`src/packlets/utils/index.ts`**
- Helper functions for command execution
- `runCommand()` - executes command with logging, captures output
- `runCommandSync()` - simple sync execution

### Key Data Flows

**Server Startup Flow:**
1. `initializeWireGuardConfig()` - Generates/loads keys, creates config file
2. `setupWireGuard()` - Brings up interface, displays status
3. `setupIptables()` - Configures firewall rules
4. `startHttpServer()` - Starts Elysia server, listens on API_PORT

**Peer Generation Flow (CLI or API):**
1. Validate IP with `validatePeerIP()`
2. Generate keypair and PSK with `generatePeer()`
3. Format server section with `formatServerPeerConfig()`
4. Format client section with `formatClientConfig()`
5. Return/display both configs

### Dependencies

- **@elysiajs/node** - Node.js adapter for Elysia HTTP framework
- **elysia** - HTTP framework with type safety
- **citty** - Lightweight CLI framework
- **execa** - Process execution library
- **consola** - Styled console logging
- **ip-range-check** - IP range validation
- **ofetch** - HTTP client library

### Environment Variables

- `PUBLIC_HOST` - Public VPN endpoint hostname (fallback: `vpn.example.com`)
- `API_KEY` - Required for API authentication; should be set before starting server
- `ALLOWED_TARGET_SUBNET` - Subnet that WireGuard clients can access (fallback: `10.100.0.0/24`)

### Configuration Constants (src/packlets/config/index.ts)

- `WG_CONFIG_DIR` - `/etc/wireguard`
- `WG_INTERFACE` - `wg0`
- `API_PORT` - 22111
- `WG_PORT` - 51820
- `WG_SUBNET` - `10.100.128.0/17`
- `WG_SERVER_IP` - `10.100.128.1`
- `ALLOWED_TARGET_SUBNET` - From env or `10.100.0.0/24`
- `PUBLIC_HOST` - From env or `vpn.example.com`

## Important Implementation Details

### Iptables Configuration

The firewall setup uses a default-deny approach:
- FORWARD policy set to DROP
- Only explicitly allowed traffic passes
- Key restriction: peer-to-peer (wg0 to wg0) is explicitly blocked via rule at line 122
- Clients cannot communicate with each other, only with allowed target subnet

### WireGuard Configuration Management

- Configuration file: `/etc/wireguard/wg0.conf`
- Server keys stored in `/etc/wireguard/privatekey` and `/etc/wireguard/publickey`
- Live updates use `wg syncconf` instead of interface restart (no downtime)
- Each peer added to server config requires a `[Peer]` section with client's public key

### API Security

- All API routes use Elysia's `group()` middleware for header validation
- API key is compared directly against `process.env.API_KEY`
- Invalid or missing API key throws error caught by Elysia error handler

### IP Address Management

- Peer IPs validated against `WG_SUBNET` using ip-range-check library
- Server IP (`10.100.128.1`) is reserved and cannot be assigned to peers
- No persistent tracking of assigned IPs; manual coordination required
