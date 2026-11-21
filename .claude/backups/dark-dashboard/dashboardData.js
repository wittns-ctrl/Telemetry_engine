// Placeholder figures for the dark dashboard, taken from the reference template.
// Nothing here comes from the API yet: when the backend is reconnected these
// get replaced with real telemetry.

export const KPIS = [
  { label: "Total Visitors", value: "1.6k+", change: -17, color: "var(--qd-red)", spark: "red" },
  { label: "Time Spent, Hr", value: "8.49", change: 24, color: "var(--qd-blue)", spark: "blue" },
  { label: "AVG Requsts Received", value: "10.4", change: 10, color: "var(--qd-green)", spark: "green" },
];

export const TOTAL_SESSIONS = { label: "Total Sessions", value: "2.4k+", change: 17 };

// Sparklines in the reference's own pixel space: [x, y] inside a 45 × 30 box.
export const SPARKS = {
  red: [[3, 7], [6, 5], [9, 4], [12, 8], [15, 12], [18, 11], [21, 8], [24, 8], [27, 21], [30, 25], [33, 24], [36, 20], [39, 19], [42, 24]],
  blue: [[3, 30], [6, 22], [9, 19], [12, 21], [15, 25], [18, 24], [21, 15], [24, 7], [27, 9], [30, 12], [33, 11], [36, 6], [39, 4], [42, 5]],
  green: [[3, 31], [6, 19], [9, 19], [12, 21], [15, 22], [18, 16], [21, 16], [24, 16], [27, 11], [30, 10], [36, 8], [39, 7], [42, 8], [45, 11]],
};

// Total Sessions area chart, in a 176 × 178 box (the card's own size).
export const AREA_POINTS = [[0,146],[1,141],[5,131],[9,118],[13,109],[17,107],[21,109],[25,111],[29,110],[33,101],[37,96],[41,97],[45,98],[49,97],[53,92],[57,91],[61,94],[65,100],[69,105],[73,110],[77,112],[81,114],[85,113],[89,110],[93,108],[97,109],[101,111],[105,116],[109,121],[113,125],[117,126],[121,125],[125,124],[129,121],[133,118],[137,116],[141,117],[145,120],[149,122],[153,123],[157,121],[161,118],[165,113],[169,108],[173,100],[176,95]];
export const AREA_MARKER = { x: 96, y: 108.5 };

// Sessions overview: [position 0–1 across the plot, sessions 0–300].
export const OVERVIEW_POINTS = [[0.0,53.1],[0.0106,83.6],[0.0212,101.5],[0.0318,104.9],[0.0424,108.8],[0.053,120.8],[0.0636,126.8],[0.0742,128.8],[0.0848,133.4],[0.0954,129.4],[0.106,114.2],[0.1166,99.6],[0.1272,95.6],[0.1378,100.2],[0.1484,102.9],[0.159,96.9],[0.1696,85.6],[0.1802,76.3],[0.1908,74.3],[0.2014,79.0],[0.212,83.6],[0.2226,83.6],[0.2332,81.0],[0.2438,83.0],[0.2544,94.9],[0.265,112.8],[0.2756,126.8],[0.2862,130.8],[0.2968,129.4],[0.3074,132.7],[0.318,144.0],[0.3286,160.0],[0.3392,174.6],[0.3498,182.5],[0.3604,186.5],[0.371,191.8],[0.3816,198.5],[0.3922,204.4],[0.4028,208.4],[0.4134,208.4],[0.424,204.4],[0.4346,199.1],[0.4452,195.8],[0.4558,197.8],[0.4664,199.8],[0.477,189.8],[0.4876,169.9],[0.4982,154.0],[0.5088,150.0],[0.5194,155.3],[0.53,160.0],[0.5406,158.6],[0.5512,154.6],[0.5618,152.7],[0.5724,156.6],[0.583,165.3],[0.5936,167.3],[0.6042,156.6],[0.6148,140.7],[0.6254,127.4],[0.636,120.8],[0.6466,118.8],[0.6572,115.5],[0.6678,108.8],[0.6784,102.2],[0.689,102.2],[0.6996,114.8],[0.7102,136.7],[0.7208,156.0],[0.7314,165.9],[0.742,170.6],[0.7527,178.5],[0.7633,193.8],[0.7739,212.4],[0.7845,230.3],[0.7951,245.6],[0.8057,256.2],[0.8163,260.8],[0.8269,256.9],[0.8375,247.6],[0.8481,244.9],[0.8587,254.9],[0.8693,270.1],[0.8799,278.1],[0.8905,272.8],[0.9011,258.2],[0.9117,242.9],[0.9223,231.6],[0.9329,223.7],[0.9435,215.7],[0.9541,203.1],[0.9647,188.5],[0.9753,179.2],[0.9859,177.2],[0.9965,180.5]];
// Day labels exactly as the reference prints them, with their full dates for CSV export.
export const OVERVIEW_DAYS = [
  { at: 0.0265, label: "28 Ma", date: "2026-03-28" },
  { at: 0.1343, label: "29 Ma", date: "2026-03-29" },
  { at: 0.2403, label: "30 Ma", date: "2026-03-30" },
  { at: 0.3463, label: "31 Ma", date: "2026-03-31" },
  { at: 0.4523, label: "01 Ap", date: "2026-04-01" },
  { at: 0.5583, label: "02 Ap", date: "2026-04-02" },
  { at: 0.6608, label: "03 Ap", date: "2026-04-03" },
  { at: 0.7633, label: "04 Ap", date: "2026-04-04" },
  { at: 0.8693, label: "05 Ap", date: "2026-04-05" },
  { at: 0.9735, label: "06 Ap", date: "2026-04-06" },
];
export const OVERVIEW_HIGHLIGHT = { at: 0.4523, change: 17 };

export const TOP_SESSIONS = [
  { icon: "chrome", name: "Chrome", sub: "Top Browser", value: "2k+" },
  { icon: "windows", name: "Windows", sub: "Top Platform", value: "1.9k+" },
  { icon: "stack", name: "Stack Overflow", sub: "Top Sources", value: "1.6k+" },
];

// Radar: the blob's distance from the centre every 10°, clockwise from the top
// (Explorer), in the reference's pixels; the outer ring sits at 99.
export const BROWSER_VIEWS = {
  labels: ["Explorer", "Safari", "Chrome", "Firefox"],
  outline: [78, 70, 54, 45, 43, 42, 43, 46, 50, 52, 50, 45, 43, 41, 45, 51, 59, 75, 86, 77, 63, 56, 54, 54, 56, 61, 67, 66, 57, 51, 47, 45, 45, 49, 59, 71],
};

export const STATS = [
  { kind: "ring", name: "Online Visitors", sub: "Max 878", percent: 30, value: "320" },
  { kind: "ring", name: "Online Visitors", sub: "Max 878", percent: 87, value: "320" },
  { kind: "spark", name: "Average Revenue", sub: "+21%", value: "3.1k+" },
];
export const REVENUE_SPARK = [[3,47],[6,44],[9,40],[12,35],[15,31],[18,28],[21,26],[24,26],[27,27],[30,30],[33,33],[36,35],[40,36],[45,34],[48,29],[51,19],[54,10],[57,6],[60,5]];
