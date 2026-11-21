import * as Blockly from "blockly/core";
import { CONTROL_COLOUR } from "../blocks/defs/hub";

/**
 * Scratch-inspired theme. Workspace + flyout stay light (Scratch-like);
 * accents shift to cyan. Category chips keep varied vivid colours.
 */
export const friendlyTheme = Blockly.Theme.defineTheme("lhbFriendly", {
  name: "lhbFriendly",
  base: Blockly.Themes.Zelos,
  componentStyles: {
    workspaceBackgroundColour: "#fbf7ee",
    toolboxBackgroundColour: "#ffffff",
    toolboxForegroundColour: "#1a1a1a",
    flyoutBackgroundColour: "#f6fbfd",
    flyoutForegroundColour: "#0b3b48",
    flyoutOpacity: 0.98,
    scrollbarColour: "#8ed3e6",
    insertionMarkerColour: "#0e7490",
    insertionMarkerOpacity: 0.45,
    markerColour: "#0e7490",
    cursorColour: "#0e7490",
    selectedGlowColour: "#0e7490",
    selectedGlowOpacity: 0.9,
    replacementGlowColour: "#0e7490",
  },
  // Category colours mirror the Zelos block style colours so each toolbox
  // chip visually matches the blocks inside it.
  categoryStyles: {
    events_category: { colour: "#FFBF00" },
    hub_category: { colour: "#4C97FF" },
    motor_category: { colour: "#40BF4A" },
    sensor_category: { colour: "#9966FF" },
    logic_category: { colour: "#4C97FF" },
    loop_category: { colour: "#0fBD8C" },
    math_category: { colour: "#59C059" },
    text_category: { colour: "#FFBF00" },
    list_category: { colour: "#9966FF" },
    variable_category: { colour: "#FF8C1A" },
    procedure_category: { colour: "#FF6680" },
  },
  // Loop blocks live in the Control category: give them its colour.
  blockStyles: {
    loop_blocks: { colourPrimary: CONTROL_COLOUR },
  },
  fontStyle: {
    family: 'system-ui, "Segoe UI", Roboto, sans-serif',
    weight: "600",
    size: 13,
  },
  startHats: true,
});
