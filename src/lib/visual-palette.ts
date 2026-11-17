import type { GroupStatus } from "./attendance";
import type { Theme } from "./theme";

export type FlowColors = {
  registered: string;
  attended: string;
  absent: string;
  pending: string;
  channels: readonly string[];
};

export type VisualPalette = {
  surface: string;
  text: string;
  muted: string;
  border: string;
  grid: string;
  accent: string;
  warning: string;
  flow: FlowColors;
  samples: Record<GroupStatus, string>;
  heatmap: {
    empty: string;
    noRecord: string;
    pending: string;
    levels: readonly [string, string, string, string];
    text: string;
  };
};

export const visualPalettes: Record<Theme, VisualPalette> = {
  light: {
    surface: "#ffffff",
    text: "#192822",
    muted: "#4f635a",
    border: "#b9cec7",
    grid: "#dae5e0",
    accent: "#287355",
    warning: "#875110",
    flow: {
      registered: "#357caa", attended: "#298660", absent: "#6079aa", pending: "#b77a31",
      channels: ["#3d83b0", "#349277", "#8267b9", "#388a90", "#629746", "#a765ae", "#978332", "#657a97"],
    },
    samples: { ready: "#277455", incomplete: "#b37a29", small: "#4a63b1", empty: "#677b86" },
    heatmap: {
      empty: "#e7edee", noRecord: "#f0f3f4", pending: "#fae8cc",
      levels: ["#e0f1f8", "#b6dce8", "#90d3c3", "#65bb9c"], text: "#183b32",
    },
  },
  dark: {
    surface: "#152127",
    text: "#e6f0ed",
    muted: "#adc0c2",
    border: "#45636e",
    grid: "#334852",
    accent: "#83d9b7",
    warning: "#f4cc91",
    flow: {
      registered: "#58c6fa", attended: "#50e2af", absent: "#7b9cc9", pending: "#f4b66b",
      channels: ["#65cfff", "#53e0b5", "#ad9dff", "#8bd8f7", "#85dca6", "#e6a4f3", "#c6de76", "#8b9fba"],
    },
    samples: { ready: "#62ebba", incomplete: "#f6be78", small: "#96b3ff", empty: "#71889e" },
    heatmap: {
      empty: "#263840", noRecord: "#1d2d36", pending: "#5c3e2c",
      levels: ["#174251", "#20586a", "#23685e", "#267052"], text: "#ecf6f7",
    },
  },
};
