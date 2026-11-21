// ── Kind constants ────────────────────────────────────────────────────────────
export const KIND = {
  HELLO_REQ:  0x01,
  PING:       0x10,
  MTU_REQ:    0x11,
  RUN:        0x12,
  STOP:       0x13,
  UPLOAD:     0x14,
  READ:       0x15,
  LS:         0x16,
  MV:         0x17,
  CP:         0x18,
  RM:         0x19,
  MKDIR:      0x1A,
  ABORT:      0x1B,
  ECHO_BLE:   0x1C,
  REMOTE:     0x1D,
  HELLO:      0x20,
  OK:         0x21,
  ERR:        0x22,
  ACK:        0x23,
  PROGRESS:   0x24,
  DATA:       0x25,
  STDOUT:     0x30,
  STDERR:     0x31,
  PROG_END:   0x32,
  PROG_START: 0x33,
  EXEC:       0x34,
  CMD:        0x35,
} as const;

export const FLAGS_NO_ACK = 0x01;
/** Device→host on USB: frame is a copy of BLE traffic (ECHO_BLE on). */
export const FLAGS_ECHO = 0x02;
/** With FLAGS_ECHO: the copied frame went host→hub (else hub→host). */
export const FLAGS_ECHO_RX = 0x04;
/** Device reply when the link's stream slot / the runner is taken. */
export const ERR_BUSY = "busy";
export const SEQ_UNSOLICITED = 0xFF;

/** File bytes per UPLOAD DATA chunk (whole frame must fit the device's 2 KiB frame buffer). */
export const UPLOAD_CHUNK = 1024;
/** Max UPLOAD bytes in flight past the device's last PROGRESS (it reports every 4 KiB). */
export const UPLOAD_WINDOW = 4096;
/** DATA frame bytes besides file data: MAGIC + 2-byte LEN varint + SEQ/FLAGS/KIND + offset:u32. */
export const DATA_FRAME_OVERHEAD = 1 + 2 + 3 + 4;
/** Smallest data chunk worth the one-write fast path (below it, use acknowledged 1 KiB chunks). */
export const MIN_FAST_UPLOAD_CHUNK = 64;
