import type { StateCreator } from "zustand";
import type { AppState, TransferState } from "./types";

/** Upload/download progress and cancellation. */
export interface TransferSlice {
  transfer: TransferState | null;
  /** Cancel clicked; stays true ("Cancelling…") until the transfer ends. */
  transferCancel: boolean;
  /** Aborted by cancelTransfer(); pass `transferSignal()` to device transfers. */
  transferController: AbortController | null;
  setTransfer: (t: TransferState | null) => void;
  /** Signal for the current transfer (created on first use, cleared with setTransfer(null)). */
  transferSignal: () => AbortSignal;
  cancelTransfer: () => void;
}

export const createTransferSlice: StateCreator<AppState, [], [], TransferSlice> = (set, get) => ({
  transfer: null,
  transferCancel: false,
  transferController: null,
  setTransfer: (transfer) => set(transfer ? { transfer } : { transfer: null, transferCancel: false, transferController: null }),
  transferSignal: () => {
    let c = get().transferController;
    if (!c) { c = new AbortController(); set({ transferController: c }); }
    return c.signal;
  },
  cancelTransfer: () => {
    set({ transferCancel: true });
    get().transferController?.abort();
  },
});
