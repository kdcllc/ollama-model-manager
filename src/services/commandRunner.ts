import { exec, execFile } from "child_process";
import { CommandResult } from "../types";

export function runCommand(command: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        shell: "/bin/bash"
      },
      (error, stdout, stderr) => {
        if (error) {
          const rawCode = (error as { code?: number | string }).code;
          const exitCode = typeof rawCode === "number" ? rawCode : Number(rawCode || 1);
          resolve({
            ok: false,
            exitCode,
            stdout: stdout || "",
            stderr: stderr || error.message
          });
          return;
        }

        resolve({
          ok: true,
          exitCode: 0,
          stdout: stdout || "",
          stderr: stderr || ""
        });
      }
    );
  });
}

export function runCommandFile(
  file: string,
  args: string[] | undefined,
  timeoutMs: number
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      Array.isArray(args) ? args : [],
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          const rawCode = (error as { code?: number | string }).code;
          const exitCode = typeof rawCode === "number" ? rawCode : Number(rawCode || 1);
          resolve({
            ok: false,
            exitCode,
            stdout: stdout || "",
            stderr: stderr || error.message
          });
          return;
        }

        resolve({
          ok: true,
          exitCode: 0,
          stdout: stdout || "",
          stderr: stderr || ""
        });
      }
    );
  });
}
