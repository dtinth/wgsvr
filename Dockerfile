FROM node:lts-slim

# Install WireGuard and networking tools
RUN apt-get update && apt-get install -y \
  wireguard-tools \
  wireguard \
  iptables \
  iproute2 \
  && rm -rf /var/lib/apt/lists/*

# Create WireGuard config directory
RUN mkdir -p /etc/wireguard && chmod 700 /etc/wireguard

# Enable IP forwarding and WireGuard settings
RUN echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf && \
  echo "net.ipv4.conf.all.src_valid_mark=1" >> /etc/sysctl.conf

# Set working directory
WORKDIR /app

# Copy package files if needed
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install

# Copy application
COPY . .

# Expose WireGuard port (example - adjust as needed)
EXPOSE 51820/udp

# Start application (or WireGuard if standalone)
CMD ["pnpm", "start"]
