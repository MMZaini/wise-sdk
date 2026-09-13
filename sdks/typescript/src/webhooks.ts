import { constants, createPublicKey, verify, KeyObject } from "node:crypto";
import { WiseError } from "./generated/errors/WiseError.js";

/** Verify X-Signature-SHA256 against the original HTTP body bytes. */
export function verifyWebhookSignature({ body, signature, publicKey }: {
  body: Uint8Array;
  signature: string | null | undefined;
  publicKey: string | Buffer | KeyObject;
}): boolean {
  if (!(body instanceof Uint8Array)) throw new TypeError("Provide the original webhook body bytes");
  if (!signature || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signature)) return false;
  const key = publicKey instanceof KeyObject && publicKey.type === "public"
    ? publicKey : createPublicKey(publicKey);
  if (key.asymmetricKeyType !== "rsa") throw new TypeError("Wise webhook verification requires an RSA public key");
  return verify("sha256", body, { key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signature, "base64"));
}

/** A permission error alone is not an SCA challenge. */
export function getScaChallenge(error: unknown): { oneTimeToken: string } | undefined {
  if (!(error instanceof WiseError) || error.statusCode !== 403) return undefined;
  const headers = error.rawResponse?.headers;
  const token = headers?.get("x-2fa-approval");
  return headers?.get("x-2fa-approval-result") === "REJECTED" && token ? { oneTimeToken: token } : undefined;
}
