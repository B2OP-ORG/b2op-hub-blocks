import { describe, expect, it } from "vitest";
import { MockTransport } from "../src/device/sim/mockHub";
import { DeviceClient } from "../src/device/deviceClient";

async function makeClient(opts?: Parameters<typeof MockTransport>[0]) {
  const transport = new MockTransport(opts);
  const client = new DeviceClient(transport);
  await client.connect();
  return { transport, client };
}

describe("MockTransport + DeviceClient (HubProtocol)", () => {
  it("connects and pings", async () => {
    const { client } = await makeClient();
    await client.disconnect();
  });

  it("run() uploads temp file, triggers RUN, streams stdout", async () => {
    const { transport, client } = await makeClient();
    transport.setNextStdout("hello\n");
    const res = await client.run("print('hello')");
    expect(res.stdout).toBe("hello\n");
    expect(transport.files["/sd/__web_run.py"]).toBeDefined();
    await client.disconnect();
  });

  it("upload() records file in mock FS", async () => {
    const { transport, client } = await makeClient();
    const bytes = new TextEncoder().encode("print('uploaded')\n");
    await client.upload("/sd/foo.py", bytes, {
      policy: { allowRoot: false },
      autoRun: false,
    });
    expect(transport.files["/sd/foo.py"].length).toBe(bytes.length);
    await client.disconnect();
  });

  it("rejects forbidden paths client-side", async () => {
    const { client } = await makeClient();
    const bytes = new TextEncoder().encode("x");
    await expect(
      client.upload("/main.py", bytes, { policy: { allowRoot: true }, autoRun: false }),
    ).rejects.toThrow(/forbidden/i);
    await client.disconnect();
  });

  it("readFile() returns uploaded contents", async () => {
    const { client } = await makeClient();
    const bytes = new TextEncoder().encode("data\n");
    await client.upload("/sd/x.py", bytes, { policy: { allowRoot: false }, autoRun: false });
    const back = await client.readFile("/sd/x.py");
    expect(back).toBe("data\n");
    await client.disconnect();
  });
});
