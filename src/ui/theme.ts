import { useDark } from "../state/store";

/** Shared colour tokens for light/dark chrome. */
export interface Palette {
  dark: boolean;
  appBg: string;
  panelBg: string;
  panelAltBg: string;
  surface: string;
  border: string;
  text: string;
  dimText: string;
  accent: string;
  accentText: string;
  hoverBg: string;
  activeBg: string;
  inputBg: string;
  danger: string;
  dangerBg: string;
  warnText: string;
  warnBg: string;
  warnBorder: string;
  okText: string;
  overlay: string;
  shadow: string;
  menuBg: string;
}

const DARK: Palette = {
  dark: true,
  appBg: "#06090b",
  panelBg: "#0a0f13",
  panelAltBg: "#0b1216",
  surface: "#0b1216",
  border: "#164e63",
  text: "#dff5fb",
  dimText: "#7aabb8",
  accent: "#0e7490",
  accentText: "#ffffff",
  hoverBg: "#111a20",
  activeBg: "#0e3347",
  inputBg: "#111a20",
  danger: "#ffb0b0",
  dangerBg: "#4a1414",
  warnText: "#fecaca",
  warnBg: "#3f1d1d",
  warnBorder: "#7f1d1d",
  okText: "#a9dcbc",
  overlay: "rgba(0,0,0,0.6)",
  shadow: "0 10px 30px rgba(0,0,0,0.5)",
  menuBg: "#0d171c",
};

const LIGHT: Palette = {
  dark: false,
  appBg: "#eaf4f7",
  panelBg: "#d4eaf1",
  panelAltBg: "#e0eff4",
  surface: "#ffffff",
  border: "#b6dbe4",
  text: "#0b3b48",
  dimText: "#4a7e8f",
  accent: "#0e7490",
  accentText: "#ffffff",
  hoverBg: "#daeef5",
  activeBg: "#c0e2ec",
  inputBg: "#f6fbfd",
  danger: "#b91c1c",
  dangerBg: "#ffe4e4",
  warnText: "#7f1d1d",
  warnBg: "#fef2f2",
  warnBorder: "#fecaca",
  okText: "#166534",
  overlay: "rgba(11,59,72,0.45)",
  shadow: "0 10px 30px rgba(0,111,143,0.25)",
  menuBg: "#ffffff",
};

export function palette(dark: boolean): Palette {
  return dark ? DARK : LIGHT;
}

export function usePalette(): Palette {
  return palette(useDark());
}
