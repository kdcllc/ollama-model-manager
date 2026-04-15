const { exec, execFile } = require("child_process");

function runCommand(command, timeoutMs) {
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
          resolve({
            ok: false,
            exitCode: error.code || 1,
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

function runCommandFile(file, args, timeoutMs) {
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
          resolve({
            ok: false,
            exitCode: error.code || 1,
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

module.exports = {
  runCommand,
  runCommandFile
};
