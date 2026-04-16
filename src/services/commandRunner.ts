import { exec, execFile, spawn } from "child_process";
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

export function runCommandWithSudoPassword(
  command: string,
  sudoPassword: string,
  timeoutMs: number
): Promise<CommandResult> {
  return new Promise((resolve) => {
    // Wrap the command so sudo reads password from stdin (-S) and ignores cached credentials (-k)
    const safeCommand = command.replace(/'/g, "'\\''");
    const child = spawn("sudo", ["-S", "-k", "-p", "", "sh", "-c", safeCommand], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, exitCode: 124, stdout, stderr: stderr + "\nTimeout" });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: 1, stdout, stderr: stderr || error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = code ?? 1;
      resolve({ ok: exitCode === 0, exitCode, stdout, stderr });
    });

    // Write password to stdin and close it so sudo can proceed
    child.stdin.write(sudoPassword.replace(/[\r\n]/g, "") + "\n");
    child.stdin.end();
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
