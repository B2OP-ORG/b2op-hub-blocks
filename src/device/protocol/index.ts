/**
 * Hub wire protocol v1.x (proto_ver = 1.2.0). Binary framing.
 *
 * Frame: [0x7E][LEN:varint][SEQ:u8][FLAGS:u8][KIND:u8][PAYLOAD:LEN bytes]
 *
 * LEN  LEB128 LE, up to 5 bytes. Bit 7 = continuation.
 * SEQ  Host→Device: monotonic 0x00–0xFF. Device→Host: 0xFF = unsolicited.
 * FLAGS  bit 0 NO_ACK (device sends no reply, ≥ 1.2.0; ignored on UPLOAD / READ /
 *        CP / DATA). SEQ is still a real counter (REMOTE SET drops stale SEQs).
 *        bit 1 ECHO   (device→host, USB only: copy of a BLE frame; see ECHO_BLE)
 *        bit 2 ECHO_RX (with ECHO: the copied frame was host→hub)
 * KIND   see KIND constants below.
 *
 * USB and BLE are separate device-side sessions. A request is answered only
 * on the link it came from; STDOUT / PROG_START / PROG_END go to both. Each
 * link runs one stream (UPLOAD / READ / CP) at a time; another stream request
 * meanwhile gets ERR "busy" (also RUN / EXEC while the runner is taken), so
 * streams are queued here (see oneAtATime()).
 *
 * Host → Device:
 *   0x01  HELLO_REQ  ()                        → OK with board-info payload
 *   0x10  PING       ()                        → OK
 *   0x11  MTU_REQ    ()                        → OK [mtu:u16 BE]
 *   0x12  RUN        path:utf8                 → OK; then PROG_END (unsolicited)
 *   0x13  STOP       ()                        → OK (FLAGS=NO_ACK: fire-and-forget)
 *   0x14  UPLOAD     [path_len:u8][path bytes][file_size:u32 BE] → ACK; host sends DATA chunks → PROGRESS* → OK
 *   0x15  READ       path:utf8                 → ACK [size:u32 BE]; DATA chunks; OK
 *   0x16  LS         path:utf8                 → DATA [is_dir:u8][name\0]...
 *   0x17  MV         [src_len:u8][src][dst_len:u8][dst] → OK
 *   0x18  CP         [src_len:u8][src][dst_len:u8][dst] → ACK; OK (runs in background)
 *   0x19  RM         path:utf8                 → OK
 *   0x1A  MKDIR      path:utf8                 → OK  (mkdir -p; OK if already a dir)
 *   0x1B  ABORT      [target_seq:u8] or ()     → OK; cancelled stream gets ERR "aborted" on its own SEQ
 *                    Host MUST send ABORT whenever it gives up on a stream locally
 *                    (cancel, timeout, bad chunk, disconnect) or the device keeps streaming.
 *   0x1C  ECHO_BLE   [enable:u8] or ()         → OK [enabled:u8]  (USB only)
 *                    While on, every BLE frame is copied to USB with FLAGS ECHO (+ ECHO_RX).
 *   0x1D  REMOTE     [op:u8][entries…]         → OK  (≥ 1.2.0; controls for the `remote` module)
 *                    op DEFINE 0x01 [id][type][name_len][name]…, SET 0x02 [id][value]…,
 *                    CLEAR 0x03 [id]… (none = all). SET is streamed with FLAGS NO_ACK.
 *   0x25  DATA       [offset:u32 BE][bytes]    UPLOAD chunks (SEQ = the UPLOAD's SEQ)
 *
 * Device → Host:
 *   0x20  HELLO      [proto_ver:u32 BE][board_name\0][board_ver\0][fw_ver\0]  SEQ=0xFF
 *                    proto_ver = major<<24 | minor<<16 | patch
 *   0x21  OK         payload (utf8 or structured, see cmd)
 *   0x22  ERR        error message utf8
 *   0x23  ACK        optional msg  (echoes SEQ, resets idle timer)
 *   0x24  PROGRESS   [sent:u32 BE][total:u32 BE]
 *   0x25  DATA       binary payload (echoes SEQ); READ chunks are [offset:u32 BE][bytes]
 *   0x30  STDOUT     utf8 text  SEQ=0xFF
 *   0x31  STDERR     utf8 text  SEQ=0xFF
 *   0x32  PROG_END   [ok:u8][message utf8]  SEQ=0xFF
 *   0x33  PROG_START path:utf8              SEQ=0xFF; menu-initiated run started, or hub already running on BLE connect
 *   0x1D  REMOTE     [op:u8][entries…]      SEQ=0xFF; program messages (remote.create_message /
 *                    remote.send): DEFINE / SET / CLEAR, same encoding as host → device
 */

export * from "./constants";
export * from "./version";
export * from "./framing";
export * from "./remote";
export * from "./types";
export * from "./frameParser";
export * from "./payloads";
export * from "./paths";
export { HubProtocolV1, HubProtocolV1 as HubProtocol } from "./hubProtocol";
