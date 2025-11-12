import { execSync } from "child_process";
import { consola } from "consola";

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

export function runCommand(cmd: string, description: string): CommandResult {
  try {
    consola.info(description);
    const output = execSync(cmd, { stdio: "pipe", encoding: "utf8" });
    consola.success(`${description} - done`);
    return { success: true, output: output.trim() };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    consola.error(`${description} failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export function runCommandSync(cmd: string): string {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8" }).trim();
}
