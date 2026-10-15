import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_OWNER;

if (!token || !login) {
  throw new Error("GITHUB_TOKEN and PROFILE_OWNER are required.");
}

const query = `
  query ContributionCalendar($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": `${login}-profile-readme`,
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed with ${response.status}.`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(`GitHub GraphQL error: ${payload.errors[0].message}`);
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar?.weeks?.length) {
  throw new Error(`No contribution calendar found for ${login}.`);
}

const weeks = calendar.weeks;
const cell = 10;
const gap = 3;
const step = cell + gap;
const left = 48;
const top = 68;
const width = Math.max(760, left + weeks.length * step + 34);
const height = 205;

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const monthLabels = [];
let previousMonth = null;
for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
  const firstDay = weeks[weekIndex].contributionDays[0];
  if (!firstDay) continue;
  const date = new Date(`${firstDay.date}T00:00:00Z`);
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  if (month !== previousMonth) {
    monthLabels.push({ label: month, x: left + weekIndex * step });
    previousMonth = month;
  }
}

const cells = [];
for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
  for (const day of weeks[weekIndex].contributionDays) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    const x = left + weekIndex * step;
    const y = top + weekday * step;
    const color = day.contributionCount === 0 ? "#161B22" : day.color;
    cells.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${escapeXml(color)}"><title>${escapeXml(day.date)}: ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}</title></rect>`,
    );
  }
}

const firstDate = weeks[0].contributionDays[0]?.date ?? "";
const lastWeek = weeks.at(-1);
const lastDate = lastWeek?.contributionDays.at(-1)?.date ?? "";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(login)} contribution activity</title>
  <desc id="desc">${calendar.totalContributions} public contributions from ${escapeXml(firstDate)} through ${escapeXml(lastDate)}.</desc>
  <rect width="100%" height="100%" rx="12" fill="#0D1117" />
  <text x="24" y="27" fill="#70A5FD" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="16" font-weight="600">Contribution Activity</text>
  <text x="24" y="44" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="11">${calendar.totalContributions} public contributions in the last year</text>
  ${monthLabels.map(({ label, x }) => `<text x="${x}" y="61" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="10">${label}</text>`).join("\n  ")}
  <text x="22" y="${top + step + 8}" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="9">Mon</text>
  <text x="22" y="${top + step * 3 + 8}" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="9">Wed</text>
  <text x="22" y="${top + step * 5 + 8}" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="9">Fri</text>
  ${cells.join("\n  ")}
  <text x="24" y="190" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="10">${escapeXml(firstDate)} → ${escapeXml(lastDate)}</text>
  <text x="${width - 174}" y="190" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="10">Less</text>
  <rect x="${width - 144}" y="181" width="10" height="10" rx="2" fill="#161B22" />
  <rect x="${width - 129}" y="181" width="10" height="10" rx="2" fill="#0E4429" />
  <rect x="${width - 114}" y="181" width="10" height="10" rx="2" fill="#006D32" />
  <rect x="${width - 99}" y="181" width="10" height="10" rx="2" fill="#26A641" />
  <rect x="${width - 84}" y="181" width="10" height="10" rx="2" fill="#39D353" />
  <text x="${width - 65}" y="190" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="10">More</text>
</svg>
`;

await mkdir("profile", { recursive: true });
await writeFile("profile/contribution-graph.svg", svg, "utf8");
console.log(`Generated contribution graph for ${login}.`);
