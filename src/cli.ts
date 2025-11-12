import { defineCommand, runMain } from "citty";
import { consola } from "consola";

import { serverCommand } from "./commands/server.ts";

export const main = defineCommand({
  meta: {
    name: "jam",
    description: "WireGuard VPN Server Management",
    version: "1.0.0",
  },
  subCommands: {
    server: serverCommand,
  },
});

runMain(main).catch((err) => {
  consola.error(err);
  process.exit(1);
});
