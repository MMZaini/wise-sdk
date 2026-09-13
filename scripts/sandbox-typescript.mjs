import { WiseClient, WiseEnvironment } from "../sdks/typescript/dist/index.js";

if (!process.env.WISE_ACCESS_TOKEN) throw new Error("Set WISE_ACCESS_TOKEN to a sandbox token");
const client = new WiseClient({ environment: WiseEnvironment.Sandbox, maxRetries: 0, timeoutInSeconds: 20 });
try {
  const profiles = await client.profiles.list();
  if (!profiles.length || profiles[0]?.id == null) throw new Error("No sandbox profile is available");
  const balances = await client.balances.list({ profileId: profiles[0].id, types: "STANDARD,SAVINGS" });
  console.log(JSON.stringify({ language: "typescript", profiles: profiles.length, balances: balances.length, result: "passed" }));
} catch (error) {
  console.error(JSON.stringify({ language: "typescript", result: "failed", status: error.statusCode ?? null, errorType: error.name }));
  process.exitCode = 1;
}
