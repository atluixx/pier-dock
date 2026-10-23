interface Env {
  GITHUB_TOKEN: string;
  REPO: string;
  LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const LABELS = ["bug", "enhancement"];
const MAX_TITLE = 200;
const MAX_BODY = 60_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!(await env.LIMITER.limit({ key: ip })).success) return json({ error: "too many reports" }, 429);

    const report = await request.json<{ kind?: unknown; title?: unknown; body?: unknown }>().catch(() => null);
    const { kind, title, body } = report ?? {};
    if (typeof kind !== "string" || !LABELS.includes(kind)) return json({ error: "invalid kind" }, 400);
    if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE) return json({ error: "invalid title" }, 400);
    if (typeof body !== "string" || body.length > MAX_BODY) return json({ error: "invalid body" }, 400);

    const response = await fetch(`https://api.github.com/repos/${env.REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "pier-report",
      },
      body: JSON.stringify({ title: title.trim(), body, labels: [kind] }),
    });
    const issue = await response.json<{ html_url?: string; message?: string }>().catch(() => ({}) as { html_url?: string; message?: string });
    if (!response.ok || !issue.html_url) {
      console.error(`github responded ${response.status}: ${issue.message ?? "no message"}`);
      return json({ error: "could not create the issue" }, 502);
    }
    return json({ url: issue.html_url });
  },
};
