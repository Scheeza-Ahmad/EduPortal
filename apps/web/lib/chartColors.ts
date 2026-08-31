// Validated categorical + status hues (light-mode instance — this app has no
// dark-mode toggle yet, so only the light steps are wired in).
// Order is the CVD-safety mechanism: never reassign or cycle these.
export const CHART_COLORS = {
  series1: '#2a78d6', // blue
  series2: '#eb6834', // orange
  series3: '#1baf7a', // aqua
  series4: '#eda100', // yellow
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  textSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
} as const;
