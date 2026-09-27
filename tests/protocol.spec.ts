import { describe, expect, it, vi } from "vitest";
import {
  validatePath, UploadError, HubProtocolV1_0_0, HubProtocol, PROTOCOL_REGISTRY,
  KIND, makeFrame,
  type ProgramEndInfo,
} from "../src/device/protocol";
import { MockTransport } from "../src/transport/mock";

// ── Helpers ───────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

/** Push a pre-built frame directly into the protocol parser, bypassing write(). */
function inject(transport: MockTransport, frame: Uint8Array): void {
  (transport as unknown as { dataCbs: Set<(b: Uint8Array) => void> })
    .dataCbs.forEach((cb) => cb(frame));
}

/** Build a HELLO payload: [proto_ver:u8][name\0][ver\0][fw\0] */
function helloPayload(protoVer: number, name: string, ver: string, fw = ""): Uint8Array {
  const nb = enc.encode(name + "\0");
  const vb = enc.encode(ver + "\0");
  const fb = enc.encode(fw + "\0");
  const p = new Uint8Array(1 + nb.length + vb.length + fb.length);
  p[0] = protoVer;
  p.set(nb, 1);
  p.set(vb, 1 + nb.length);
  p.set(fb, 1 + nb.length + vb.length);
  return p;
}

/** Pack LS directory entries: repeated [is_dir:u8][name\0] */
function lsPayload(entries: { name: string; isDir: boolean }[]): Uint8Array {
  const parts = entries.map((e) => {
    const nb = enc.encode(e.name + "\0");
    const r = new Uint8Array(1 + nb.length);
    r[0] = e.isDir ? 1 : 0;
    r.set(nb, 1);
    return r;
  });
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** Force programRunning=true via private field access (for PROG_END injection tests). */
function setRunning(proto: HubProtocol): void {
  (proto as unknown as { programRunning: boolean }).programRunning = true;
}

// ── validatePath ──────────────────────────────────────────────────────────────

describe("protocol.validatePath", () => {
  it("accepts /sd/ paths by default", () => {
    validatePath("/sd/prog.py", { allowRoot: false });
  });

  it("rejects root paths without allowRoot", () => {
    expect(() => validatePath("/prog.py", { allowRoot: false })).toThrow(UploadError);
  });

  it("accepts root paths when allowRoot enabled", () => {
    validatePath("/prog.py", { allowRoot: true });
  });

  it("always rejects /main.py, /boot.py, /boot.mpy, /runner.py", () => {
    for (const p of ["/main.py", "/boot.py", "/boot.mpy", "/runner.py"]) {
      expect(() => validatePath(p, { allowRoot: true })).toThrow(/forbidden/i);
    }
  });
});

// ── Basic commands ─────────────────────────────────────────────────────────────

describe("HubProtocol binary frame IO", () => {
  it("PING → OK", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    await expect(proto.ping()).resolves.toBeUndefined();
    proto.dispose();
    await transport.disconnect();
  });

  it("UPLOAD + READ roundtrip", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    const bytes = enc.encode("print('hi')\n");
    await proto.upload("/sd/x.py", bytes);
    const back = await proto.readFile("/sd/x.py");
    expect(new TextDecoder().decode(back)).toBe("print('hi')\n");
    proto.dispose();
    await transport.disconnect();
  });

  it("MTU handshake returns integer", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    const n = await proto.mtu();
    expect(n).toBe(185);
    proto.dispose();
    await transport.disconnect();
  });

  it("LS returns parsed dir entries via mock", async () => {
    const transport = new MockTransport({
      files: {
        "/sd/a.py": enc.encode(""),
        "/sd/sub/b.py": enc.encode(""),
      },
    });
    await transport.connect();
    const proto = new HubProtocol(transport);
    const entries = await proto.ls("/sd");
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "a.py", isDir: false },
        { name: "sub", isDir: true },
      ])
    );
    proto.dispose();
    await transport.disconnect();
  });

  it("LS parses injected [is_dir:u8][name\\0] payload", async () => {
    const transport = new MockTransport();
    // Intercept writes so LS request never reaches mock; we reply manually.
    const proto = new HubProtocol(transport);
    await transport.connect();
    let capturedSeq = -1;
    transport.write = async (frame: Uint8Array) => {
      // SEQ is at offset 1+varintLen; varint for small LS payload is 1 byte.
      // Walk to end of varint.
      let off = 1;
      while (frame[off] & 0x80) off++;
      off++;
      capturedSeq = frame[off];
    };
    const lsP = proto.ls("/sd", 1000);
    await new Promise((r) => setTimeout(r, 0)); // let write fire
    const payload = lsPayload([
      { name: "main.py", isDir: false },
      { name: "lib", isDir: true },
    ]);
    inject(transport, makeFrame(KIND.DATA, capturedSeq, 0, payload));
    const entries = await lsP;
    expect(entries).toEqual([
      { name: "main.py", isDir: false },
      { name: "lib", isDir: true },
    ]);
    proto.dispose();
    await transport.disconnect();
  });

  it("MV renames file", async () => {
    const transport = new MockTransport({ files: { "/sd/a.py": enc.encode("x") } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    await proto.mv("/sd/a.py", "/sd/b.py");
    expect(transport.files["/sd/b.py"]).toBeDefined();
    expect(transport.files["/sd/a.py"]).toBeUndefined();
    proto.dispose();
    await transport.disconnect();
  });

  it("CP copies file", async () => {
    const transport = new MockTransport({ files: { "/sd/a.py": enc.encode("x") } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    await proto.cp("/sd/a.py", "/sd/b.py");
    expect(transport.files["/sd/a.py"]).toBeDefined();
    expect(transport.files["/sd/b.py"]).toBeDefined();
    proto.dispose();
    await transport.disconnect();
  });

  it("RM deletes file", async () => {
    const transport = new MockTransport({ files: { "/sd/a.py": enc.encode("x") } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    await proto.rm("/sd/a.py");
    expect(transport.files["/sd/a.py"]).toBeUndefined();
    proto.dispose();
    await transport.disconnect();
  });
});

// ── HELLO ─────────────────────────────────────────────────────────────────────

describe("HELLO / requestHello", () => {
  it("PROTOCOL_REGISTRY maps proto_ver 2 to semver 1.0.0", () => {
    expect(PROTOCOL_REGISTRY.get(2)).toBe("1.0.0");
  });

  it("PROTOCOL_REGISTRY does not contain unknown versions", () => {
    expect(PROTOCOL_REGISTRY.has(99)).toBe(false);
  });

  it("HubProtocolV1_0_0 is exported and matches HubProtocol alias", () => {
    expect(HubProtocolV1_0_0).toBe(HubProtocol);
  });

  it("parses proactive HELLO frame and populates board info", async () => {
    const transport = new MockTransport();
    // Create proto BEFORE connect so it is subscribed when HELLO fires.
    const proto = new HubProtocol(transport);
    await transport.connect();
    // The mock sends HELLO on connect via queueMicrotask; flush it.
    await new Promise((r) => queueMicrotask(r as () => void));
    expect(proto.boardName).toBe("MockHub");
    expect(proto.boardVersion).toBe("1.0.0");
    expect(proto.fwVersion).toBe("v1.1.0");
    expect(proto.protocolVersion).toBe(2);
    proto.dispose();
    await transport.disconnect();
  });

  it("requestHello sends HELLO_REQ and populates board info from OK payload", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    await proto.requestHello();
    expect(proto.boardName).toBe("MockHub");
    expect(proto.boardVersion).toBe("1.0.0");
    expect(proto.fwVersion).toBe("v1.1.0");
    expect(proto.protocolVersion).toBe(2);
    proto.dispose();
    await transport.disconnect();
  });

  it("helloSink fires with correct info including fwVersion", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    const sink = vi.fn();
    proto.setHelloSink(sink);
    // Inject a HELLO frame with custom board info.
    inject(transport, makeFrame(KIND.HELLO, 0xFF, 0, helloPayload(2, "MyBoard", "3.1.4", "fw2.0")));
    expect(sink).toHaveBeenCalledWith({
      protocolVersion: 2,
      boardName: "MyBoard",
      boardVersion: "3.1.4",
      fwVersion: "fw2.0",
    });
    proto.dispose();
    await transport.disconnect();
  });
});

// ── RUN / PROG_END ────────────────────────────────────────────────────────────

describe("RUN + PROG_END", () => {
  it("runProgram resolves on OK and PROG_END fires programEndSink", async () => {
    const transport = new MockTransport({
      files: { "/sd/y.py": enc.encode("") },
      stdout: "hello\n",
    });
    await transport.connect();
    const proto = new HubProtocol(transport);
    let out = "";
    proto.setStdoutSink((t) => { out += t; });
    const endP = new Promise<ProgramEndInfo>((res) => proto.setProgramEndSink(res));
    await proto.runProgram("/sd/y.py");
    const info = await endP;
    expect(info.ok).toBe(true);
    expect(out).toBe("hello\n");
    proto.dispose();
    await transport.disconnect();
  });

  it("PROG_END ok=0 fires sink with ok=false", async () => {
    const transport = new MockTransport();
    const proto = new HubProtocol(transport);
    await transport.connect();
    // Directly set programRunning so the PROG_END handler fires.
    setRunning(proto);
    const endP = new Promise<ProgramEndInfo>((res) => proto.setProgramEndSink(res));
    const msg = enc.encode("TypeError: boom");
    const p = new Uint8Array(1 + msg.length);
    p[0] = 0;
    p.set(msg, 1);
    inject(transport, makeFrame(KIND.PROG_END, 0xFF, 0, p));
    const info = await endP;
    expect(info.ok).toBe(false);
    expect(info.message).toBe("TypeError: boom");
    proto.dispose();
    await transport.disconnect();
  });

  it("STDOUT/STDERR frames route to sinks", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    let out = "";
    let err = "";
    proto.setStdoutSink((t) => { out += t; });
    proto.setStderrSink((t) => { err += t; });
    inject(transport, makeFrame(KIND.STDOUT, 0xFF, 0, enc.encode("hello world\n")));
    inject(transport, makeFrame(KIND.STDERR, 0xFF, 0, enc.encode("Traceback\n")));
    expect(out).toBe("hello world\n");
    expect(err).toBe("Traceback\n");
    proto.dispose();
    await transport.disconnect();
  });
});

// ── SEQ / waiter matching ─────────────────────────────────────────────────────

describe("SEQ-keyed waiter matching", () => {
  it("replies route to correct waiters by SEQ", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);

    // Start two requests; intercept the transport writes to delay replies.
    const written: Uint8Array[] = [];
    const origWrite = transport.write.bind(transport);
    transport.write = async (chunk: Uint8Array) => { written.push(chunk); };

    const ping1 = proto.ping(500);
    const ping2 = proto.ping(500);

    // Drain the microtask queue so both writes are captured.
    await new Promise((r) => setTimeout(r, 0));

    // Extract SEQs from the written frames.
    // Frame: [0x7E][varint LEN][SEQ][FLAGS][KIND][payload...]
    const seqOf = (frame: Uint8Array) => {
      let off = 1; // skip 0x7E
      // decode varint
      while (frame[off] & 0x80 && off < frame.length - 1) off++;
      off++; // past last varint byte
      return frame[off]; // SEQ byte
    };

    expect(written.length).toBe(2);
    const seq1 = seqOf(written[0]);
    const seq2 = seqOf(written[1]);

    // Restore real write so disconnect works.
    transport.write = origWrite;

    // Reply to seq2 first, then seq1 — replies arrive out of issue-order.
    inject(transport, makeFrame(KIND.OK, seq2, 0));
    inject(transport, makeFrame(KIND.OK, seq1, 0));

    await expect(ping1).resolves.toBeUndefined();
    await expect(ping2).resolves.toBeUndefined();

    proto.dispose();
    await transport.disconnect();
  });
});

// ── NO_ACK ────────────────────────────────────────────────────────────────────

describe("NO_ACK / stop fire-and-forget", () => {
  it("stop(noAck=true) resolves without waiting for a reply", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    // No mock reply will come; should still resolve immediately.
    transport.write = async () => {};
    await expect(proto.stop(true)).resolves.toBeUndefined();
    proto.dispose();
    await transport.disconnect();
  });
});

// ── PROGRESS ──────────────────────────────────────────────────────────────────

describe("PROGRESS callbacks", () => {
  it("upload fires progress callbacks and resets idle timer", async () => {
    // Large file to trigger multiple PROGRESS frames from the mock.
    const data = new Uint8Array(6000).fill(0x42);
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    const calls: [number, number][] = [];
    await proto.upload("/sd/big.bin", data, 10000, (sent, total) => {
      calls.push([sent, total]);
    });
    // At least one progress call should have fired.
    expect(calls.length).toBeGreaterThan(0);
    for (const [sent, total] of calls) {
      expect(sent).toBeLessThanOrEqual(total);
      expect(total).toBe(data.length);
    }
    proto.dispose();
    await transport.disconnect();
  });
});

// ── varint encoding ───────────────────────────────────────────────────────────

describe("encodeVarint / frame boundary", () => {
  it("single-byte varint for payloads 0–127", () => {
    for (const n of [0, 1, 63, 127]) {
      const f = makeFrame(KIND.PING, 0, 0, new Uint8Array(n));
      expect(f[1]).toBeLessThan(0x80); // no continuation bit
    }
  });

  it("two-byte varint for payload 128", () => {
    const f = makeFrame(KIND.PING, 0, 0, new Uint8Array(128));
    expect(f[1] & 0x80).toBeTruthy();  // first byte has continuation
    expect(f[2] & 0x80).toBeFalsy();   // second byte is last
  });

  it("encodeVarint round-trips back through parser", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    // 200-byte payload — two-byte varint
    const payload = new Uint8Array(200).fill(0x61);
    let received = "";
    proto.setStdoutSink((t) => { received += t; });
    inject(transport, makeFrame(KIND.STDOUT, 0xFF, 0, payload));
    expect(received).toBe(new TextDecoder().decode(payload));
    proto.dispose();
    await transport.disconnect();
  });
});
