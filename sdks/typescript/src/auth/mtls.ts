import { Agent } from "undici";

export interface MtlsOptions {
  cert: string | Buffer;
  key: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
  /** HTTPS origins allowed to receive the client certificate. */
  origins?: readonly string[];
}

/** A private dispatcher; this never changes Node's global TLS or fetch settings. */
export function createMtlsFetch(options: MtlsOptions): { fetch: typeof fetch; close: () => Promise<void> } {
  if (!options.cert || !options.key) throw new TypeError("Provide an mTLS certificate and private key");
  const origins = new Set((options.origins ?? ["https://api-mtls.wise-sandbox.com", "https://api-mtls.transferwise.com"]).map((value) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.href !== `${url.origin}/`) throw new TypeError("mTLS origins must be HTTPS origins");
    return url.origin;
  }));
  const agent = new Agent({ connect: { cert: options.cert, key: options.key, ca: options.ca,
    passphrase: options.passphrase, rejectUnauthorized: true } });
  const mtlsFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("mTLS requests require HTTPS");
    const requestInit: RequestInit & { dispatcher?: Agent } = { ...init, redirect: "manual" };
    if (origins.has(url.origin)) requestInit.dispatcher = agent;
    return globalThis.fetch(input, requestInit);
  };
  return { fetch: mtlsFetch, close: () => agent.close() };
}
