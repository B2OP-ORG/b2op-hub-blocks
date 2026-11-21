// Streaming frame parser shared by the host protocol and the mock hub.
// Wire format: MAGIC(0x7E) · LEN(varint) · SEQ · FLAGS · KIND · PAYLOAD[LEN]

const Phase = { Idle: 0, Varint: 1, Fixed: 2, Payload: 3 } as const;
type Phase = typeof Phase[keyof typeof Phase];

export type FrameHandler = (seq: number, flags: number, kind: number, payload: Uint8Array) => void;

export class FrameParser {
  private phase: Phase = Phase.Idle;
  private varintAccum = 0;
  private varintShift = 0;
  private varintBytesRead = 0;
  private payloadLen = 0;
  /** Fixed header bytes [SEQ, FLAGS, KIND]. */
  private fixedBuf: number[] = [];
  private seq = 0;
  private flags = 0;
  private kind = 0;
  private payloadBuf: Uint8Array | null = null;
  private payloadFilled = 0;

  private readonly onFrame: FrameHandler;

  constructor(onFrame: FrameHandler) {
    this.onFrame = onFrame;
  }

  /** Drop any partially parsed frame and wait for the next MAGIC byte. */
  reset(): void {
    this.phase = Phase.Idle;
    this.varintAccum = 0;
    this.varintShift = 0;
    this.varintBytesRead = 0;
    this.payloadLen = 0;
    this.fixedBuf = [];
    this.seq = 0;
    this.flags = 0;
    this.kind = 0;
    this.payloadBuf = null;
    this.payloadFilled = 0;
  }

  /** Feed raw bytes; calls the handler once per complete frame. */
  feed(chunk: Uint8Array): void {
    let i = 0;
    while (i < chunk.length) {
      switch (this.phase) {
        case Phase.Idle: {
          // Scan for MAGIC 0x7E
          while (i < chunk.length && chunk[i] !== 0x7E) i++;
          if (i < chunk.length) {
            i++; // consume 0x7E
            this.phase = Phase.Varint;
            this.varintAccum = 0;
            this.varintShift = 0;
            this.varintBytesRead = 0;
          }
          break;
        }
        case Phase.Varint: {
          while (i < chunk.length) {
            const b = chunk[i++];
            this.varintAccum |= (b & 0x7F) << this.varintShift;
            this.varintShift += 7;
            this.varintBytesRead++;
            if (!(b & 0x80) || this.varintBytesRead === 5) {
              this.payloadLen = this.varintAccum;
              this.phase = Phase.Fixed;
              this.fixedBuf = [];
              break;
            }
          }
          break;
        }
        case Phase.Fixed: {
          while (i < chunk.length && this.fixedBuf.length < 3) {
            this.fixedBuf.push(chunk[i++]);
          }
          if (this.fixedBuf.length === 3) {
            const [seq, flags, kind] = this.fixedBuf;
            this.seq = seq;
            this.flags = flags;
            this.kind = kind;
            if (this.payloadLen > 0) {
              this.payloadBuf = new Uint8Array(this.payloadLen);
              this.payloadFilled = 0;
              this.phase = Phase.Payload;
            } else {
              this.reset();
              this.onFrame(seq, flags, kind, new Uint8Array(0));
            }
          }
          break;
        }
        case Phase.Payload: {
          // Bulk copy from chunk
          const buf = this.payloadBuf!;
          const need = this.payloadLen - this.payloadFilled;
          const take = Math.min(need, chunk.length - i);
          buf.set(chunk.subarray(i, i + take), this.payloadFilled);
          this.payloadFilled += take;
          i += take;
          if (this.payloadFilled === this.payloadLen) {
            const { seq, flags, kind } = this;
            this.reset();
            this.onFrame(seq, flags, kind, buf);
          }
          break;
        }
      }
    }
  }
}
