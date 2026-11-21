import { describe, expect, it, vi } from "vitest";
import {
  validatePath, UploadError, HubProtocolV1, HubProtocol,
  parseProtoVersion, formatProtoVersion, protoVersionError,
  KIND, makeFrame, decodeVarint, UPLOAD_CHUNK, DATA_FRAME_OVERHEAD, CancelledError, DEFAULT_TIMEOUT_MS,
  FLAGS_ECHO, FLAGS_ECHO_RX, FLAGS_NO_ACK, formatEchoFrame, UnsupportedFeatureError,
  REMOTE_OP, RemoteType, encodeRemoteDef, encodeRemoteSet, encodeRemoteValue, packRemote, decodeRemote,
  type ProgramEndInfo, type EchoFrame, type RemoteEvent,
} from "../src/device/protocol";
import { MockTransport } from "../src/device/sim/mockHub";
import { PROTO_FEATURES, protoFeatures, supportsFlag, supportsKind } from "../src/device/protocolFeatures";
import { CmdId } from "../src/device/cmdHelpers";

// ── Helpers ───────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

/** Push a pre-built frame directly into the protocol parser, bypassing write(). */
function inject(transport: MockTransport, frame: Uint8Array): void {
  (transport as unknown as { dataCbs: Set<(b: Uint8Array) => void> })
    .dataCbs.forEach((cb) => cb(frame));
}

/** Build a HELLO payload: [proto_ver:u32 BE][name\0][ver\0][fw\0] */
function helloPayload(protoVer: number, name: string, ver: string, fw = ""): Uint8Array {
  const nb = enc.encode(name + "\0");
  const vb = enc.encode(ver + "\0");
  const fb = enc.encode(fw + "\0");
  const p = new Uint8Array(4 + nb.length + vb.length + fb.length);
  new DataView(p.buffer).setUint32(0, protoVer, false);
  p.set(nb, 4);
  p.set(vb, 4 + nb.length);
  p.set(fb, 4 + nb.length + vb.length);
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
  it("proto_ver is a packed u32 semver: major<<24 | minor<<16 | patch", () => {
    expect(parseProtoVersion(0x01000000)).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseProtoVersion(0x0102012C)).toEqual({ major: 1, minor: 2, patch: 300 });
    expect(formatProtoVersion(0x0203000A)).toBe("2.3.10");
  });

  it("accepts any 1.x device, refuses other majors and pre-1.0.0 firmware", () => {
    expect(protoVersionError(0x01000000)).toBeNull();
    expect(protoVersionError(0x01050003)).toBeNull();
    expect(protoVersionError(0)).toMatch(/older than 1\.0\.0.*update the hub firmware/);
    expect(protoVersionError(0x02000000)).toMatch(/v2\.0\.0.*update the app/);
  });

  it("legacy single-byte proto_ver HELLO parses as version 0 with board info", () => {
    const transport = new MockTransport();
    const proto = new HubProtocol(transport);
    const name = enc.encode("B2OP Hub\0v1.1.0\0v2.2.0\0");
    const legacy = new Uint8Array(1 + name.length);
    legacy[0] = 3;
    legacy.set(name, 1);
    inject(transport, makeFrame(KIND.HELLO, 0xFF, 0, legacy));
    expect(proto.protocolVersion).toBe(0);
    expect(proto.boardName).toBe("B2OP Hub");
    expect(proto.fwVersion).toBe("v2.2.0");
    proto.dispose();
  });

  it("HubProtocolV1 is exported and matches HubProtocol alias", () => {
    expect(HubProtocolV1).toBe(HubProtocol);
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
    expect(proto.protocolVersion).toBe(0x01020000);
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
    expect(proto.protocolVersion).toBe(0x01020000);
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
    inject(transport, makeFrame(KIND.HELLO, 0xFF, 0, helloPayload(0x01000000, "MyBoard", "3.1.4", "fw2.0")));
    expect(sink).toHaveBeenCalledWith({
      protocolVersion: 0x01000000,
      boardName: "MyBoard",
      boardVersion: "3.1.4",
      fwVersion: "fw2.0",
    });
    proto.dispose();
    await transport.disconnect();
  });
});

// ── Feature gating ───────────────────────────────────────────────────────────

describe("protocol feature table", () => {
  it("newer minors fall back to the newest known table", () => {
    expect(protoFeatures(0x01000000)).toBe(PROTO_FEATURES[0]);
    expect(protoFeatures(0x01FF0000)).toBe(PROTO_FEATURES[PROTO_FEATURES.length - 1]);
  });

  it("FAST_UPLOAD flag starts at minor 1", () => {
    expect(supportsFlag(0x01000000, "FAST_UPLOAD")).toBe(false);
    expect(supportsFlag(0x0100FFFF, "FAST_UPLOAD")).toBe(false);
    expect(supportsFlag(0x01010000, "FAST_UPLOAD")).toBe(true);
  });

  it("allows everything before HELLO, blocks disabled kinds / cmds after", async () => {
    const table = PROTO_FEATURES[PROTO_FEATURES.length - 1]; // mock speaks the newest minor
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    expect(proto.features).toBeNull();
    await proto.requestHello();
    expect(proto.features).toBe(table);

    table.kinds.MV = false;
    table.cmds.HUB_GET_BATTERY = false;
    try {
      const write = vi.spyOn(transport, "write");
      await expect(proto.mv("/sd/a", "/sd/b")).rejects.toBeInstanceOf(UnsupportedFeatureError);
      await expect(proto.mv("/sd/a", "/sd/b")).rejects.toThrow(/MV is not supported.*v1\.2\.0/);
      await expect(proto.cmd(Uint8Array.of(CmdId.HUB_GET_BATTERY))).rejects.toThrow(/HUB_GET_BATTERY/);
      expect(write).not.toHaveBeenCalled();
    } finally {
      table.kinds.MV = true;
      table.cmds.HUB_GET_BATTERY = true;
    }
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

// ── v2.0.0 streaming (chunked UPLOAD / READ, ABORT) ──────────────────────────

/** Parse every frame in a host write: [{seq, kind, payload}]. */
function parseFrames(buf: Uint8Array): { seq: number; kind: number; payload: Uint8Array }[] {
  const out: { seq: number; kind: number; payload: Uint8Array }[] = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] !== 0x7E) { i++; continue; }
    const [len, off] = decodeVarint(buf, i + 1);
    out.push({ seq: buf[off], kind: buf[off + 2], payload: buf.slice(off + 3, off + 3 + len) });
    i = off + 3 + len;
  }
  return out;
}

function chunkPayload(off: number, data: Uint8Array): Uint8Array {
  const p = new Uint8Array(4 + data.length);
  new DataView(p.buffer).setUint32(0, off, false);
  p.set(data, 4);
  return p;
}

describe("v2.0.0 streaming transfers", () => {
  it("UPLOAD sends each DATA frame as one writeFast call within the MTU (FAST_UPLOAD)", async () => {
    const transport = new MockTransport();
    // Subscribe before connect so the proactive HELLO (proto 1.1.0) is seen.
    const proto = new HubProtocol(transport);
    await transport.connect();
    expect(proto.features?.flags.FAST_UPLOAD).toBe(true);
    const fast: Uint8Array[] = [];
    const slow: Uint8Array[] = [];
    const origWrite = transport.write.bind(transport);
    transport.writeFast = async (c: Uint8Array) => { fast.push(c); return origWrite(c); };
    transport.write = async (c: Uint8Array) => { slow.push(c); return origWrite(c); };
    const data = new Uint8Array(20000).map((_, i) => i & 0xFF);
    await proto.upload("/sd/big.bin", data);
    expect(transport.files["/sd/big.bin"]).toEqual(data);
    const mtu = transport.info.mtu!;
    const chunkSize = mtu - 3 - DATA_FRAME_OVERHEAD;
    const up = slow.flatMap(parseFrames).find((f) => f.kind === KIND.UPLOAD)!;
    // Every fast write is exactly one whole DATA frame that fits one GATT write.
    expect(fast.every((w) => w.length <= mtu - 3)).toBe(true);
    const chunks = fast.map((w) => { const f = parseFrames(w); expect(f).toHaveLength(1); return f[0]; });
    expect(chunks.every((c) => c.kind === KIND.DATA && c.seq === up.seq)).toBe(true);
    expect(slow.flatMap(parseFrames).some((f) => f.kind === KIND.DATA)).toBe(false);
    expect(new DataView(chunks[1].payload.buffer, chunks[1].payload.byteOffset).getUint32(0, false)).toBe(chunkSize);
    proto.dispose();
    await transport.disconnect();
  });

  it("UPLOAD uses acknowledged UPLOAD_CHUNK writes without FAST_UPLOAD (proto 1.0.x)", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    await new Promise((r) => queueMicrotask(r as () => void));
    inject(transport, makeFrame(KIND.HELLO, 0xFF, 0, helloPayload(0x01000000, "MockHub", "1.0.0", "v1.1.0")));
    expect(proto.features?.flags.FAST_UPLOAD).toBe(false);
    const fast = vi.fn(async (_c: Uint8Array) => {});
    const frames: { seq: number; kind: number; payload: Uint8Array }[] = [];
    const orig = transport.write.bind(transport);
    transport.writeFast = fast;
    transport.write = async (c: Uint8Array) => { frames.push(...parseFrames(c)); return orig(c); };
    const data = new Uint8Array(20000).map((_, i) => i & 0xFF);
    await proto.upload("/sd/big.bin", data);
    expect(transport.files["/sd/big.bin"]).toEqual(data);
    expect(fast).not.toHaveBeenCalled();
    const up = frames.find((f) => f.kind === KIND.UPLOAD)!;
    const chunks = frames.filter((f) => f.kind === KIND.DATA);
    expect(chunks.every((c) => c.seq === up.seq && c.payload.length <= 4 + UPLOAD_CHUNK)).toBe(true);
    expect(new DataView(chunks[1].payload.buffer, chunks[1].payload.byteOffset).getUint32(0, false)).toBe(UPLOAD_CHUNK);
    proto.dispose();
    await transport.disconnect();
  });

  it("zero-length UPLOAD completes after ACK", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    await proto.upload("/sd/empty.py", new Uint8Array(0));
    expect(transport.files["/sd/empty.py"]?.length).toBe(0);
    proto.dispose();
    await transport.disconnect();
  });

  it("READ assembles chunks by offset even when out of order", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    let seq = -1;
    transport.write = async (c: Uint8Array) => { seq = parseFrames(c)[0].seq; };
    const progress: [number, number][] = [];
    const p = proto.readFile("/sd/x", 1000, (s, t) => progress.push([s, t]));
    await new Promise((r) => setTimeout(r, 0));
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, 6, false);
    inject(transport, makeFrame(KIND.ACK, seq, 0, size));
    inject(transport, makeFrame(KIND.DATA, seq, 0, chunkPayload(3, enc.encode("def"))));
    inject(transport, makeFrame(KIND.DATA, seq, 0, chunkPayload(0, enc.encode("abc"))));
    inject(transport, makeFrame(KIND.OK, seq, 0));
    expect(new TextDecoder().decode(await p)).toBe("abcdef");
    expect(progress.at(-1)).toEqual([6, 6]);
    proto.dispose();
  });

  it("READ duplicate chunk doesn't mask a missing one", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    let seq = -1;
    transport.write = async (c: Uint8Array) => { seq = parseFrames(c)[0].seq; };
    const p = proto.readFile("/sd/x", 1000);
    await new Promise((r) => setTimeout(r, 0));
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, 6, false);
    inject(transport, makeFrame(KIND.ACK, seq, 0, size));
    inject(transport, makeFrame(KIND.DATA, seq, 0, chunkPayload(0, enc.encode("abc"))));
    inject(transport, makeFrame(KIND.DATA, seq, 0, chunkPayload(0, enc.encode("abc"))));
    inject(transport, makeFrame(KIND.OK, seq, 0));
    await expect(p).rejects.toThrow(/3 of 6/);
    proto.dispose();
  });

  it("DeviceClient.disconnect sends ABORT for an active transfer", async () => {
    const { DeviceClient } = await import("../src/device/deviceClient");
    const transport = new MockTransport({ files: { "/sd/f.bin": new Uint8Array(3000) } });
    transport.manualRead = true;
    const client = new DeviceClient(transport);
    await transport.connect();
    const frames: { seq: number; kind: number; payload: Uint8Array }[] = [];
    const orig = transport.write.bind(transport);
    transport.write = async (c: Uint8Array) => { frames.push(...parseFrames(c)); return orig(c); };
    const p = client.readFileRaw("/sd/f.bin").catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 0));
    await client.disconnect();
    expect(frames.some((f) => f.kind === KIND.ABORT)).toBe(true);
    expect(await p).toBeInstanceOf(Error);
  });

  it("READ short of size rejects", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    let seq = -1;
    transport.write = async (c: Uint8Array) => { seq = parseFrames(c)[0].seq; };
    const p = proto.readFile("/sd/x", 1000);
    await new Promise((r) => setTimeout(r, 0));
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, 6, false);
    inject(transport, makeFrame(KIND.ACK, seq, 0, size));
    inject(transport, makeFrame(KIND.DATA, seq, 0, chunkPayload(0, enc.encode("abc"))));
    inject(transport, makeFrame(KIND.OK, seq, 0));
    await expect(p).rejects.toThrow(/3 of 6/);
    proto.dispose();
  });

  it("READ via mock round-trips a multi-chunk file", async () => {
    const data = new Uint8Array(3000).map((_, i) => (i * 7) & 0xFF);
    const transport = new MockTransport({ files: { "/sd/f.bin": data } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    expect(await proto.readFile("/sd/f.bin")).toEqual(data);
    proto.dispose();
    await transport.disconnect();
  });

  it("throwing from READ progress cancels and sends ABORT for that SEQ", async () => {
    const data = new Uint8Array(3000);
    const transport = new MockTransport({ files: { "/sd/f.bin": data } });
    transport.manualRead = true;
    await transport.connect();
    const proto = new HubProtocol(transport);
    const frames: { seq: number; kind: number; payload: Uint8Array }[] = [];
    const orig = transport.write.bind(transport);
    transport.write = async (c: Uint8Array) => { frames.push(...parseFrames(c)); return orig(c); };
    let calls = 0;
    const p = proto.readFile("/sd/f.bin", 1000, () => { if (++calls === 2) throw new Error("Cancelled"); });
    await new Promise((r) => setTimeout(r, 0));
    transport.pumpRead(1);
    await expect(p).rejects.toThrow("Cancelled");
    await new Promise((r) => setTimeout(r, 0));
    const read = frames.find((f) => f.kind === KIND.READ)!;
    const abort = frames.find((f) => f.kind === KIND.ABORT);
    expect(abort?.payload).toEqual(Uint8Array.of(read.seq));
    // Mock stopped the stream: remaining chunks are no-ops.
    transport.pumpRead();
    proto.dispose();
    await transport.disconnect();
  });

  it("throwing from UPLOAD progress sends ABORT and stops sending chunks", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    const frames: { seq: number; kind: number; payload: Uint8Array }[] = [];
    const orig = transport.write.bind(transport);
    transport.write = async (c: Uint8Array) => { frames.push(...parseFrames(c)); return orig(c); };
    const p = proto.upload("/sd/big.bin", new Uint8Array(64 * 1024), 2000, () => { throw new Error("Cancelled"); });
    await expect(p).rejects.toThrow("Cancelled");
    await new Promise((r) => setTimeout(r, 10));
    const up = frames.find((f) => f.kind === KIND.UPLOAD)!;
    expect(frames.some((f) => f.kind === KIND.ABORT && f.payload[0] === up.seq)).toBe(true);
    expect(frames.filter((f) => f.kind === KIND.DATA).length).toBeLessThan(64);
    expect(transport.files["/sd/big.bin"]).toBeUndefined();
    proto.dispose();
    await transport.disconnect();
  });

  it("UPLOAD ERR from device rejects", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    let seq = -1;
    transport.write = async (c: Uint8Array) => {
      const f = parseFrames(c)[0];
      if (f.kind === KIND.UPLOAD) seq = f.seq;
    };
    const p = proto.upload("/sd/x", new Uint8Array(10), 1000);
    await new Promise((r) => setTimeout(r, 0));
    inject(transport, makeFrame(KIND.ERR, seq, 0, enc.encode("UPLOAD: open /sd/x")));
    await expect(p).rejects.toThrow("UPLOAD: open /sd/x");
    proto.dispose();
  });

  it("abort() with no target sends empty ABORT and resolves on OK", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    await expect(proto.abort()).resolves.toBeUndefined();
    await expect(proto.abort(42)).rejects.toThrow("ABORT: no such stream");
    proto.dispose();
    await transport.disconnect();
  });

  it("overlapping READs are queued instead of hitting 'READ busy'", async () => {
    const a = new Uint8Array(2000).fill(1);
    const b = new Uint8Array(1500).fill(2);
    const transport = new MockTransport({ files: { "/sd/a": a, "/sd/b": b } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    const [ra, rb] = await Promise.all([proto.readFile("/sd/a"), proto.readFile("/sd/b")]);
    expect(ra).toEqual(a);
    expect(rb).toEqual(b);
    proto.dispose();
    await transport.disconnect();
  });

  it("overlapping UPLOADs are queued; a failed one doesn't block the next", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    const x = new Uint8Array(5000).fill(3);
    const y = new Uint8Array(300).fill(4);
    const cancelled = proto.upload("/sd/c", new Uint8Array(9000), 2000, () => { throw new Error("Cancelled"); });
    const p1 = proto.upload("/sd/x", x);
    const p2 = proto.upload("/sd/y", y);
    await expect(cancelled).rejects.toThrow("Cancelled");
    await Promise.all([p1, p2]);
    expect(transport.files["/sd/x"]).toEqual(x);
    expect(transport.files["/sd/y"]).toEqual(y);
    proto.dispose();
    await transport.disconnect();
  });

  it("overlapping streams of different kinds are queued instead of hitting EBUSY", async () => {
    const a = new Uint8Array(2000).fill(1);
    const transport = new MockTransport({ files: { "/sd/a": a } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    const up = new Uint8Array(3000).fill(5);
    const [ra] = await Promise.all([
      proto.readFile("/sd/a"),
      proto.upload("/sd/u", up),
      proto.cp("/sd/a", "/sd/c"),
    ]);
    expect(ra).toEqual(a);
    expect(transport.files["/sd/u"]).toEqual(up);
    expect(transport.files["/sd/c"]).toEqual(a);
    proto.dispose();
    await transport.disconnect();
  });

  it("queued stream rejects after dispose without sending", async () => {
    const transport = new MockTransport({ files: { "/sd/a": new Uint8Array(3000) } });
    transport.manualRead = true;
    await transport.connect();
    const proto = new HubProtocol(transport);
    const first = proto.readFile("/sd/a", 1000).catch((e: Error) => e);
    const second = proto.readFile("/sd/a", 1000).catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 0));
    proto.dispose();
    expect(((await first) as Error).message).toBe("Disposed");
    expect(((await second) as Error).message).toBe("Disposed");
    await transport.disconnect();
  });

  it("CP resolves after ACK + OK", async () => {
    const transport = new MockTransport({ files: { "/sd/a": enc.encode("x") } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    await proto.cp("/sd/a", "/sd/b");
    expect(transport.files["/sd/b"]).toEqual(enc.encode("x"));
    proto.dispose();
    await transport.disconnect();
  });

  it("stray ERR for a finished SEQ doesn't end a running program", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    setRunning(proto);
    const end = vi.fn();
    proto.setProgramEndSink(end);
    inject(transport, makeFrame(KIND.ERR, 5, 0, enc.encode("DATA: no active upload")));
    expect(end).not.toHaveBeenCalled();
    expect(proto.isProgramRunning()).toBe(true);
    proto.dispose();
  });
});

// ── Cancel via AbortSignal: ABORT, then wait for the device ──────────────────

describe("AbortSignal cancel", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  /** Hold ABORT frames until release(); everything else goes to the mock. */
  function holdAborts(transport: MockTransport) {
    const orig = transport.write.bind(transport);
    const held: Uint8Array[] = [];
    const frames: { seq: number; kind: number; payload: Uint8Array }[] = [];
    transport.write = async (c: Uint8Array) => {
      const fs = parseFrames(c);
      frames.push(...fs);
      if (fs.some((f) => f.kind === KIND.ABORT)) { held.push(c); return; }
      return orig(c);
    };
    return { frames, release: async () => { for (const c of held.splice(0)) await orig(c); } };
  }

  it("all default timeouts are 3 s", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(3000);
  });

  it("READ cancel sends ABORT and only rejects after the device's ERR 'aborted'", async () => {
    const transport = new MockTransport({ files: { "/sd/f.bin": new Uint8Array(3000) } });
    transport.manualRead = true;
    await transport.connect();
    const proto = new HubProtocol(transport);
    const h = holdAborts(transport);
    const ctl = new AbortController();
    let settled = false;
    const progress = vi.fn();
    const p = proto.readFile("/sd/f.bin", 1000, progress, ctl.signal).finally(() => { settled = true; });
    await tick();
    transport.pumpRead(1);
    const before = progress.mock.calls.length;
    ctl.abort();
    await tick();
    const read = h.frames.find((f) => f.kind === KIND.READ)!;
    expect(h.frames.find((f) => f.kind === KIND.ABORT)?.payload).toEqual(Uint8Array.of(read.seq));
    transport.pumpRead(1); // chunk still in flight: ignored, no progress
    await tick();
    expect(progress.mock.calls.length).toBe(before);
    expect(settled).toBe(false); // device hasn't confirmed yet
    await h.release();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    proto.dispose();
    await transport.disconnect();
  });

  it("UPLOAD cancel stops chunks, waits for confirmation, leaves no file", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    const h = holdAborts(transport);
    const ctl = new AbortController();
    let settled = false;
    const p = proto.upload("/sd/big.bin", new Uint8Array(64 * 1024), 1000, () => ctl.abort(), ctl.signal)
      .finally(() => { settled = true; });
    await tick(); await tick();
    expect(h.frames.some((f) => f.kind === KIND.ABORT)).toBe(true);
    const sentChunks = h.frames.filter((f) => f.kind === KIND.DATA).length;
    await tick();
    expect(settled).toBe(false);
    expect(h.frames.filter((f) => f.kind === KIND.DATA).length).toBe(sentChunks);
    await h.release();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(transport.files["/sd/big.bin"]).toBeUndefined();
    proto.dispose();
    await transport.disconnect();
  });

  it("cancel that loses the race to OK still rejects as cancelled", async () => {
    const transport = new MockTransport({ files: { "/sd/a": enc.encode("hi") } });
    transport.manualRead = true;
    await transport.connect();
    const proto = new HubProtocol(transport);
    const h = holdAborts(transport);
    const ctl = new AbortController();
    const p = proto.readFile("/sd/a", 1000, undefined, ctl.signal);
    await tick();
    ctl.abort();
    await tick();
    transport.pumpRead(); // device finishes before seeing ABORT
    await h.release();    // → ERR "ABORT: no such stream"
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    proto.dispose();
    await transport.disconnect();
  });

  it("already-aborted signal never sends the request", async () => {
    const transport = new MockTransport({ files: { "/sd/a": enc.encode("hi") } });
    await transport.connect();
    const proto = new HubProtocol(transport);
    const h = holdAborts(transport);
    const ctl = new AbortController();
    ctl.abort();
    await expect(proto.readFile("/sd/a", 1000, undefined, ctl.signal)).rejects.toBeInstanceOf(CancelledError);
    expect(h.frames.length).toBe(0);
    proto.dispose();
    await transport.disconnect();
  });
});

// ── BLE echo (ECHO_BLE, FLAGS ECHO / ECHO_RX) ────────────────────────────────

describe("BLE echo", () => {
  it("setBleEcho sends ECHO_BLE and resolves to the device state", async () => {
    const transport = new MockTransport();
    await transport.connect();
    const proto = new HubProtocol(transport);
    await expect(proto.setBleEcho(true)).resolves.toBe(true);
    expect(transport.bleEcho).toBe(true);
    await expect(proto.setBleEcho(false)).resolves.toBe(false);
    expect(transport.bleEcho).toBe(false);
    proto.dispose();
    await transport.disconnect();
  });

  it("echoed frames go to the echo sink, never to waiters or stdout", async () => {
    const transport = new MockTransport();
    transport.write = async () => {}; // keep our PING unanswered
    await transport.connect();
    const proto = new HubProtocol(transport);
    const echoes: EchoFrame[] = [];
    const out = vi.fn();
    proto.setEchoSink((f) => echoes.push(f));
    proto.addStdoutSink(out);
    const ping = proto.ping(200);
    // BLE host's OK for the same SEQ (0) must not settle our PING.
    inject(transport, makeFrame(KIND.OK, 0, FLAGS_ECHO, new Uint8Array(0)));
    inject(transport, makeFrame(KIND.STDOUT, 0xFF, FLAGS_ECHO, enc.encode("hi\n")));
    inject(transport, makeFrame(KIND.READ, 7, FLAGS_ECHO | FLAGS_ECHO_RX, enc.encode("/sd/x.py")));
    await expect(ping).rejects.toThrow("protocol timeout");
    expect(out).not.toHaveBeenCalled();
    expect(echoes.map((e) => [e.direction, e.kind, e.seq, e.flags])).toEqual([
      ["tx", KIND.OK, 0, 0],
      ["tx", KIND.STDOUT, 0xFF, 0],
      ["rx", KIND.READ, 7, 0],
    ]);
    expect(formatEchoFrame(echoes[2])).toBe('[BLE host→hub] READ seq=07 "/sd/x.py"');
    expect(formatEchoFrame(echoes[0])).toBe("[BLE hub→host] OK seq=00 0B");
    proto.dispose();
  });
});

// ── REMOTE (protocol 1.2) ─────────────────────────────────────────────────────

/** Proto connected to a mock that has sent HELLO (features known). */
async function connected(): Promise<{ transport: MockTransport; proto: HubProtocol }> {
  const transport = new MockTransport();
  const proto = new HubProtocol(transport);
  await transport.connect();
  await new Promise((r) => queueMicrotask(r as () => void));
  return { transport, proto };
}

describe("REMOTE", () => {
  it("is gated to protocol minor 2", () => {
    expect(supportsKind(0x01010000, "REMOTE")).toBe(false);
    expect(supportsKind(0x01020000, "REMOTE")).toBe(true);
  });

  it("rejects locally on a 1.1 hub", async () => {
    const { transport, proto } = await connected();
    inject(transport, makeFrame(KIND.HELLO, 0xFF, 0, helloPayload(0x01010000, "MockHub", "1.0.0")));
    await expect(proto.remoteDefine([{ id: 0, type: RemoteType.Int, name: "speed" }])).rejects.toBeInstanceOf(UnsupportedFeatureError);
    await expect(proto.remoteSet([{ id: 0, type: RemoteType.Int, value: 1 }])).rejects.toThrow(/REMOTE is not supported/);
    proto.dispose();
  });

  it("encodes the protocol.rst example byte for byte", () => {
    const [def] = packRemote(REMOTE_OP.DEFINE, [
      encodeRemoteDef({ id: 0, type: RemoteType.Int, name: "speed" }),
      encodeRemoteDef({ id: 1, type: RemoteType.Float, name: "gain" }),
    ]);
    expect(Array.from(def)).toEqual([1, 0, 0, 5, ...enc.encode("speed"), 1, 1, 4, ...enc.encode("gain")]);
    const [set] = packRemote(REMOTE_OP.SET, [
      encodeRemoteSet({ id: 0, type: RemoteType.Int, value: 40 }),
      encodeRemoteSet({ id: 1, type: RemoteType.Float, value: 0.5 }),
    ]);
    expect(Array.from(set)).toEqual([2, 0, 0, 0, 0, 0x28, 1, 0, 0, 0, 0x3f]);
  });

  it("validates names, ids and clamps values", () => {
    expect(() => encodeRemoteDef({ id: 0, type: RemoteType.Int, name: "" })).toThrow(/bad name/);
    expect(() => encodeRemoteDef({ id: 0, type: RemoteType.Int, name: "x".repeat(33) })).toThrow(/bad name/);
    expect(() => encodeRemoteDef({ id: 256, type: RemoteType.Int, name: "a" })).toThrow(/bad id/);
    expect(Array.from(encodeRemoteValue(RemoteType.Int, 1e12))).toEqual([0x7F, 0xFF, 0xFF, 0xFF]);
    expect(Array.from(encodeRemoteValue(RemoteType.Int, 2.6))).toEqual([0, 0, 0, 3]);
    expect(Array.from(encodeRemoteValue(RemoteType.Bool, true))).toEqual([1]);
    // Str is cut to 255 bytes at a UTF-8 boundary.
    const s = encodeRemoteValue(RemoteType.Str, "é".repeat(200));
    expect(s[0]).toBe(254);
    expect(s.length).toBe(255);
  });

  it("packs entries into frames without splitting one", () => {
    const entries = Array.from({ length: 40 }, (_, id) => encodeRemoteDef({ id, type: RemoteType.Int, name: "n".repeat(20) }));
    const frames = packRemote(REMOTE_OP.DEFINE, entries, 100);
    expect(frames.every((f) => f.length <= 100 && f[0] === REMOTE_OP.DEFINE)).toBe(true);
    expect(frames.reduce((n, f) => n + (f.length - 1) / 23, 0)).toBe(40);
  });

  it("DEFINE / SET / CLEAR reach the device store", async () => {
    const { transport, proto } = await connected();
    await proto.remoteDefine([
      { id: 0, type: RemoteType.Int, name: "speed" },
      { id: 1, type: RemoteType.Bool, name: "light" },
      { id: 2, type: RemoteType.Str, name: "msg" },
      { id: 3, type: RemoteType.Float, name: "gain" },
    ]);
    await proto.remoteSet([
      { id: 0, type: RemoteType.Int, value: -40 },
      { id: 1, type: RemoteType.Bool, value: true },
      { id: 2, type: RemoteType.Str, value: "hé" },
      { id: 3, type: RemoteType.Float, value: 0.25 },
    ], { ack: true });
    expect([...transport.remoteControls.values()].map((c) => [c.name, c.value]))
      .toEqual([["speed", -40], ["light", true], ["msg", "hé"], ["gain", 0.25]]);
    await proto.remoteClear([1]);
    expect(transport.remoteControls.has(1)).toBe(false);
    await proto.remoteClear();
    expect(transport.remoteControls.size).toBe(0);
    proto.dispose();
  });

  it("streams SET with NO_ACK, one fast write per frame within the MTU", async () => {
    const { transport, proto } = await connected();
    await proto.remoteDefine([{ id: 0, type: RemoteType.Int, name: "speed" }, { id: 1, type: RemoteType.Str, name: "s" }]);
    const fast: Uint8Array[] = [];
    const slow: Uint8Array[] = [];
    const origWrite = transport.write.bind(transport);
    transport.writeFast = async (c: Uint8Array) => { fast.push(c); return origWrite(c); };
    transport.write = async (c: Uint8Array) => { slow.push(c); return origWrite(c); };
    const replies: Uint8Array[] = [];
    transport.onData((c) => replies.push(c));
    await proto.remoteSet([{ id: 0, type: RemoteType.Int, value: 7 }]);
    // Frame bigger than one GATT write (MTU 185): acknowledged write instead.
    await proto.remoteSet([{ id: 1, type: RemoteType.Str, value: "x".repeat(200) }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(fast).toHaveLength(1);
    expect(slow).toHaveLength(1);
    const frames = [...fast, ...slow].flatMap(parseFrames);
    expect(frames.every((f) => f.kind === KIND.REMOTE)).toBe(true);
    expect(fast[0][3]).toBe(FLAGS_NO_ACK); // [7E][len][seq][flags]…
    expect(transport.remoteControls.get(0)!.value).toBe(7);
    expect(replies).toHaveLength(0); // NO_ACK: no reply
    proto.dispose();
  });

  it("device skips a SET older than the last applied one", async () => {
    const { transport, proto } = await connected();
    await proto.remoteDefine([{ id: 0, type: RemoteType.Int, name: "speed" }]);
    const set = (seq: number, v: number) =>
      (transport as unknown as { dispatch(s: number, f: number, k: number, p: Uint8Array): void })
        .dispatch(seq, FLAGS_NO_ACK, KIND.REMOTE, packRemote(REMOTE_OP.SET, [encodeRemoteSet({ id: 0, type: RemoteType.Int, value: v })])[0]);
    set(10, 0);
    set(9, 50); // late
    expect(transport.remoteControls.get(0)!.value).toBe(0);
    set(11, 20);
    expect(transport.remoteControls.get(0)!.value).toBe(20);
    proto.dispose();
  });

  it("surfaces device ERR", async () => {
    const { proto } = await connected();
    await expect(proto.remoteSet([{ id: 9, type: RemoteType.Int, value: 1 }], { ack: true })).rejects.toThrow("REMOTE: unknown id 9");
    proto.dispose();
  });

  it("decodes program messages and tracks their types", async () => {
    const { transport, proto } = await connected();
    const events: RemoteEvent[] = [];
    proto.setRemoteSink((e) => events.push(e));
    transport.emitRemote(packRemote(REMOTE_OP.DEFINE, [
      encodeRemoteDef({ id: 0, type: RemoteType.Float, name: "distance" }),
      encodeRemoteDef({ id: 1, type: RemoteType.Str, name: "state" }),
    ])[0]);
    transport.emitRemote(packRemote(REMOTE_OP.SET, [
      encodeRemoteSet({ id: 0, type: RemoteType.Float, value: 12.5 }),
      encodeRemoteSet({ id: 1, type: RemoteType.Str, value: "ok" }),
    ])[0]);
    transport.emitRemote(Uint8Array.of(REMOTE_OP.CLEAR));
    expect(events).toEqual([
      { op: "define", defs: [{ id: 0, type: RemoteType.Float, name: "distance" }, { id: 1, type: RemoteType.Str, name: "state" }] },
      { op: "set", values: [{ id: 0, value: 12.5 }, { id: 1, value: "ok" }] },
      { op: "clear", ids: [] },
    ]);
    // After CLEAR the types are gone: a SET for id 0 can't be decoded.
    expect(decodeRemote(Uint8Array.of(REMOTE_OP.SET, 0, 1, 2, 3, 4), new Map())).toEqual({ op: "set", values: [] });
    proto.dispose();
  });

  it("decodes device SETs for host controls (one id space with messages)", async () => {
    const { transport, proto } = await connected();
    const events: RemoteEvent[] = [];
    proto.setRemoteSink((e) => events.push(e));
    await proto.remoteDefine([{ id: 0, type: RemoteType.Int, name: "speed" }, { id: 1, type: RemoteType.Str, name: "msg" }]);
    expect(transport.programCreate(5, "level", RemoteType.Float)).toBeNull();
    expect(transport.programSend(0, 42)).toBeNull(); // program moves the host's slider
    expect(transport.programSend(1, "hi")).toBeNull();
    expect(transport.programSend(5, 1.5)).toBeNull();
    expect(transport.remoteControls.get(0)!.value).toBe(42);
    // Host CLEAR keeps program slots; program end keeps host controls (and their types).
    await proto.remoteClear([1]);
    expect(transport.remoteControls.has(5)).toBe(true);
    transport.programEnd();
    expect(transport.programSend(0, -3)).toBeNull();
    expect(transport.remoteControls.has(5)).toBe(false);
    expect(events).toEqual([
      { op: "define", defs: [{ id: 5, type: RemoteType.Float, name: "level" }] },
      { op: "set", values: [{ id: 0, value: 42 }] },
      { op: "set", values: [{ id: 1, value: "hi" }] },
      { op: "set", values: [{ id: 5, value: 1.5 }] },
      { op: "clear", ids: [] },
      { op: "set", values: [{ id: 0, value: -3 }] },
    ]);
    proto.dispose();
  });

  it("keeps controls and program messages apart in one id space", async () => {
    const { transport, proto } = await connected();
    const events: RemoteEvent[] = [];
    proto.setRemoteSink((e) => events.push(e));
    await proto.remoteDefine([{ id: 0, type: RemoteType.Int, name: "speed" }]);
    // Declaring the control itself is a no-op; another name / type on its id or its name elsewhere is refused.
    expect(transport.programCreate(0, "speed", RemoteType.Int)).toBeNull();
    expect(transport.programCreate(0, "speed", RemoteType.Float)).toBe("id taken");
    expect(transport.programCreate(3, "speed", RemoteType.Int)).toBe("name taken");
    expect(events).toEqual([]);
    // A host DEFINE over a program slot drops it: the device says so.
    expect(transport.programCreate(4, "level", RemoteType.Float)).toBeNull();
    await proto.remoteDefine([{ id: 4, type: RemoteType.Bool, name: "light" }]);
    expect(events.at(-1)).toEqual({ op: "clear", ids: [4] });
    expect(transport.programSend(4, true)).toBeNull();
    expect(events.at(-1)).toEqual({ op: "set", values: [{ id: 4, value: true }] });
    proto.dispose();
  });

  it("requestHello clears program messages before the device resends them", async () => {
    const { proto } = await connected();
    const events: RemoteEvent[] = [];
    proto.setRemoteSink((e) => events.push(e));
    await proto.requestHello();
    expect(events[0]).toEqual({ op: "clear", ids: [] });
    proto.dispose();
  });
});
