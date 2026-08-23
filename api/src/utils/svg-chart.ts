export type ChartPoint = { date: string; value: number };

/**
 * Renders a minimal dependency-free SVG line chart with an area fill.
 * Browsers render it directly (Content-Type: image/svg+xml).
 */
export function buildLineChartSvg(params: {
  title: string;
  points: ChartPoint[];
  width?: number;
  height?: number;
}): string {
  const width = params.width ?? 720;
  const height = params.height ?? 320;
  const padX = 56;
  const padTop = 44;
  const padBottom = 40;
  const points = params.points;

  if (points.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="16" y="28" font-family="sans-serif" font-size="14" fill="#555">${escapeXml(
      params.title
    )}</text><text x="16" y="56" font-family="sans-serif" font-size="12" fill="#999">No data</text></svg>`;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const innerW = width - padX - 24;
  const innerH = height - padTop - padBottom;

  const xAt = (i: number): number =>
    padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number): number =>
    padTop + (1 - (v - min) / (max - min || 1)) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${xAt(points.length - 1).toFixed(1)},${(
    padTop + innerH
  ).toFixed(1)} L${xAt(0).toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;

  const gridLines: string[] = [];
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * g) / 4;
    const y = yAt(v).toFixed(1);
    gridLines.push(
      `<line x1="${padX}" y1="${y}" x2="${width - 24}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>` +
        `<text x="${padX - 8}" y="${Number(y) + 4}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#9ca3af">${formatShort(v)}</text>`
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const labels = [
    { x: padX, anchor: "start", text: first.date },
    {
      x: width - 24,
      anchor: "end",
      text: last.date,
    },
  ]
    .map(
      (l) =>
        `<text x="${l.x}" y="${height - 14}" text-anchor="${l.anchor}" font-family="sans-serif" font-size="10" fill="#6b7280">${escapeXml(l.text)}</text>`
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<text x="16" y="24" font-family="sans-serif" font-size="14" fill="#111111">${escapeXml(params.title)}</text>
<text x="${width - 24}" y="24" text-anchor="end" font-family="sans-serif" font-size="12" fill="#374151">${formatShort(last.value)}</text>
${gridLines.join("")}
<path d="${areaPath}" fill="#3b82f6" opacity="0.12"/>
<path d="${linePath}" fill="none" stroke="#2563eb" stroke-width="2"/>
<circle cx="${xAt(points.length - 1).toFixed(1)}" cy="${yAt(last.value).toFixed(1)}" r="3.5" fill="#2563eb"/>
${labels}
</svg>`;
}

function formatShort(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
