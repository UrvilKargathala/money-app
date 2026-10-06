// Pure user-agent prettifier for session/device lists. Unknown or garbage
// input falls back to the raw string, then "Unknown device" - never blank.

export function deviceName(ua: string | null | undefined): string {
  if (!ua || !ua.trim()) return "Unknown device";
  const s = ua.trim();

  let browser: string | null = null;
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/Chrome\//.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = "Safari";

  let os: string | null = null;
  if (/iPhone/.test(s)) os = "iPhone";
  else if (/iPad/.test(s)) os = "iPad";
  else if (/Android/.test(s)) {
    const m = /Android\s[\d.]+;\s([^;)]+)/.exec(s);
    os = m ? `Android (${m[1].trim()})` : "Android";
  } else if (/Windows NT/.test(s)) os = "Windows";
  else if (/Mac OS X/.test(s)) os = "Mac";
  else if (/Linux/.test(s)) os = "Linux";
  else if (/CrOS/.test(s)) os = "Chromebook";

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}
