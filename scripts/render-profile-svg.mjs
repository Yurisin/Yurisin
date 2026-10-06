const COLORS = { background: '#0D1117', text: '#C9D1D9', blue: '#58A6FF', green: '#3FB950' };

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

function frame(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <rect width="${width}" height="${height}" rx="12" fill="${COLORS.background}" stroke="${COLORS.blue}"/>
  <style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:${COLORS.text}}.title{font-size:18px;font-weight:600;fill:${COLORS.blue}}.accent{fill:${COLORS.green}}</style>
  <text x="24" y="34" class="title">${escapeXml(title)}</text>
  ${body}
</svg>
`;
}

export function renderStatsSvg(data) {
  const rows = [
    ['Commits', data.totalCommits],
    ['Pull requests', data.totalPullRequests],
    ['Issues', data.totalIssues],
    ['Private contributions', data.restrictedContributions],
  ];
  const body = rows.map(([label, value], index) => {
    const y = 70 + index * 28;
    return `<text x="24" y="${y}">${escapeXml(label)}</text><text x="396" y="${y}" text-anchor="end" class="accent">${escapeXml(value)}</text>`;
  }).join('\n  ');
  return frame(420, 175, 'GitHub activity — last 12 months', body);
}

function normalizedLanguages(languages) {
  const positive = languages.filter((item) => Number.isFinite(item.bytes) && item.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  if (positive.length <= 6) return positive;
  const first = positive.slice(0, 5);
  const otherBytes = positive.slice(5).reduce((sum, item) => sum + item.bytes, 0);
  return [...first, { name: 'Other', bytes: otherBytes, color: COLORS.text }];
}

export function renderTopLangsSvg(data) {
  const languages = normalizedLanguages(data.languages ?? []);
  if (!languages.length) {
    return frame(420, 120, 'Languages', `<circle cx="28" cy="68" r="5" fill="${COLORS.green}"/><text x="42" y="73">No aggregate language data available</text><text x="24" y="102" font-size="11" fill="${COLORS.blue}">Detected code distribution — not proficiency</text>`);
  }
  const total = languages.reduce((sum, item) => sum + item.bytes, 0);
  const rows = languages.map((item, index) => {
    const y = 68 + index * 25;
    const color = /^#[0-9A-F]{6}$/i.test(item.color ?? '') ? item.color : COLORS.green;
    const percentage = ((item.bytes / total) * 100).toFixed(1);
    return `<circle cx="28" cy="${y - 5}" r="5" fill="${color}"/><text x="42" y="${y}">${escapeXml(item.name)}</text><text x="396" y="${y}" text-anchor="end" class="accent">${percentage}%</text>`;
  }).join('\n  ');
  const height = 105 + languages.length * 25;
  return frame(420, height, 'Languages', `${rows}\n  <text x="24" y="${height - 16}" font-size="11" fill="${COLORS.blue}">Detected code distribution — not proficiency</text>`);
}

export function validateSvg(svg, kind) {
  const errors = [];
  if (!/^<svg\b[^>]*>[\s\S]*<\/svg>\s*$/i.test(svg)) errors.push('invalid-svg-root');
  if (!/<svg\b[^>]*\bwidth="\d+"[^>]*\bheight="\d+"[^>]*\bviewBox="[^"]+"/i.test(svg)) errors.push('missing-dimensions');
  for (const color of Object.values(COLORS)) if (!svg.toUpperCase().includes(color.toUpperCase())) errors.push(`missing-color:${color}`);
  if (/<script|\bon\w+\s*=|<foreignObject|(?:href|src)\s*=\s*["']https?:\/\//i.test(svg)) errors.push('unsafe-active-content');
  if (/\b(?:token|secret|password|api[_-]?key)\s*[:=]/i.test(svg)) errors.push('secret-like-content');
  if (/\b(?:repository|organization|generated at|timestamp|commit sha)\b/i.test(svg)) errors.push('private-metadata-label');
  if (kind === 'top-langs' && !/Detected code distribution — not proficiency/.test(svg)) errors.push('missing-language-qualification');
  return [...new Set(errors)];
}
