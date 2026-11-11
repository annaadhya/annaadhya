/** TEMPORARY network diagnostic — probes candidate API upstreams from INSIDE the
 *  storefront container and reports which path works. Remove after the API_URL
 *  fix lands. Also emits a JSON log line so it lands in runtime-logs. */
import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import http from "node:http";

export const dynamic = "force-dynamic";

interface ProbeResult {
  url: string;
  ok: boolean;
  status?: number;
  ms: number;
  error?: string;
  bodyHead?: string;
}

async function probeFetch(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
    const text = await res.text();
    return {
      url,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      bodyHead: text.slice(0, 120),
    };
  } catch (e) {
    return { url, ok: false, ms: Date.now() - started, error: `${e}`.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

function probeRawIp(ip: string, host: string, path: string, port = 80, timeoutMs = 5000): Promise<ProbeResult> {
  const url = `http://${ip}:${port}${path} (Host: ${host})`;
  const started = Date.now();
  return new Promise((resolve) => {
    const req = http.request(
      { host: ip, port, path, method: "GET", headers: { host } },
      (res) => {
        let body = "";
        res.on("data", (c) => { if (body.length < 200) body += c; });
        res.on("end", () =>
          resolve({ url, ok: (res.statusCode ?? 500) < 500, status: res.statusCode, ms: Date.now() - started, bodyHead: body.slice(0, 120) }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ url, ok: false, ms: Date.now() - started, error: "timeout" }); });
    req.on("error", (e) => resolve({ url, ok: false, ms: Date.now() - started, error: `${e.message}`.slice(0, 160) }));
    req.end();
  });
}

export async function GET() {
  const apiPath = "/api/v1/health";
  const dnsResult = await dns.lookup("staging.annaadhya.com", { all: true }).catch((e) => [{ error: `${e.message}` }] as never);

  const probes = await Promise.all([
    probeFetch(`https://staging.annaadhya.com${apiPath}`),
    probeFetch(`http://staging.annaadhya.com${apiPath}`),
    probeRawIp("217.21.94.7", "staging.annaadhya.com", apiPath, 80),
    probeRawIp("217.21.94.7", "staging.annaadhya.com", apiPath, 4000),
    probeRawIp("217.21.94.7", "staging.annaadhya.com", apiPath, 3000),
    probeFetch("http://127.0.0.1:3000/robots.txt"),
  ]);

  const payload = {
    when: new Date().toISOString(),
    api_url_env: process.env.API_URL ?? "(unset)",
    dns_staging: dnsResult,
    probes,
  };
  console.log(JSON.stringify({ timestamp: payload.when, level: "INFO", message: `diag-upstream ${JSON.stringify(payload)}` }));
  return NextResponse.json(payload);
}
