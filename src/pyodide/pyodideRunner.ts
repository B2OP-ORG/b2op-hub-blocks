import type { DeviceClient } from "../device/deviceClient";
import { CmdId, ParseReply } from "../device/cmdHelpers";

// Loaded lazily on first use
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PyodideInterface = any;

const HUB_STUB_URL = new URL("./hubStub.py", import.meta.url).href;

export interface PyodideRunner {
  run(code: string, device: DeviceClient, signal: AbortSignal, onStdout: (t: string) => void): Promise<void>;
  dispose(): void;
}

let pyodideInstance: PyodideInterface | null = null;

async function getPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;
  // @ts-expect-error - loaded from CDN via script tag
  const { loadPyodide } = globalThis;
  if (!loadPyodide) {
    throw new Error("Pyodide not loaded — add the CDN script to index.html");
  }
  pyodideInstance = await loadPyodide();
  return pyodideInstance;
}

async function loadHubStub(): Promise<string> {
  const res = await fetch(HUB_STUB_URL);
  return res.text();
}

export async function createPyodideRunner(): Promise<PyodideRunner> {
  const pyodide = await getPyodide();
  const hubStub = await loadHubStub();

  let currentDevice: DeviceClient | null = null;

  // Bridge: send a command, no return value
  pyodide.globals.set("_b2op_send_cmd", async (cmdId: number, args: number[]) => {
    if (!currentDevice) return;
    await currentDevice.cmd(cmdId, new Uint8Array(args));
  });

  // Bridge: execute Python code via device REPL (for hub API calls with no binary cmd)
  pyodide.globals.set("_b2op_exec_repl", async (code: string) => {
    if (!currentDevice) return;
    await currentDevice.exec(code);
  });

  // Bridge: send a command, return parsed f32LE values
  pyodide.globals.set("_b2op_send_cmd_data", async (cmdId: number, args: number[]): Promise<number[]> => {
    if (!currentDevice) return [];
    const data = await currentDevice.cmd(cmdId, new Uint8Array(args));
    // For CMD_PORT_GET_VALUE, parse as f32LE array
    if (cmdId === CmdId.PORT_GET_VALUE) {
      return ParseReply.portGetValue(data);
    }
    return Array.from(data);
  });

  // Install hub stub into Pyodide globals
  await pyodide.runPythonAsync(hubStub);

  const interruptBuffer = new Uint8Array(new SharedArrayBuffer(4));

  return {
    async run(code, device, signal, onStdout) {
      currentDevice = device;
      pyodide.setStdout({ batched: onStdout });
      pyodide.setStderr({ batched: onStdout });

      if (typeof SharedArrayBuffer !== "undefined") {
        pyodide.setInterruptBuffer(interruptBuffer);
      }

      const onAbort = () => {
        if (typeof SharedArrayBuffer !== "undefined") {
          // SIGINT = 2
          Atomics.store(interruptBuffer, 0, 2);
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });

      try {
        await pyodide.runPythonAsync(code);
      } finally {
        signal.removeEventListener("abort", onAbort);
        if (typeof SharedArrayBuffer !== "undefined") {
          Atomics.store(interruptBuffer, 0, 0);
        }
        currentDevice = null;
      }
    },

    dispose() {
      pyodideInstance = null;
    },
  };
}
