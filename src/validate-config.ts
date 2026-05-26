import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

function assertCond(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  assertCond(Number.isInteger(value) && value > 0, `Invalid ${name}: ${raw}`);
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(v)) return true;
  if (["0", "false", "no", "n"].includes(v)) return false;
  throw new Error(`Invalid boolean value: ${raw}`);
}

function main(): void {
  const tokenAddress = process.env.TOKEN_ADDRESS || "";
  if (tokenAddress) {
    assertCond(ethers.isAddress(tokenAddress), "TOKEN_ADDRESS must be a valid EVM address");
  }

  const signerMode = (process.env.SIGNER_MODE || "private_key").toLowerCase();
  assertCond(["private_key", "kms_placeholder"].includes(signerMode), "SIGNER_MODE must be private_key or kms_placeholder");

  if (signerMode === "private_key") {
    assertCond(!!process.env.BRIDGE_PRIVATE_KEY, "BRIDGE_PRIVATE_KEY is required when SIGNER_MODE=private_key");
  }
  if (signerMode === "kms_placeholder") {
    assertCond(ethers.isAddress(process.env.KMS_SIGNER_ADDRESS || ""), "KMS_SIGNER_ADDRESS must be a valid EVM address when SIGNER_MODE=kms_placeholder");
  }

  const expectedChainId = parsePositiveInt(process.env.EXPECTED_CHAIN_ID, 421614, "EXPECTED_CHAIN_ID");
  const reportExpectedChainId = parsePositiveInt(process.env.REPORT_EXPECTED_CHAIN_ID, 421614, "REPORT_EXPECTED_CHAIN_ID");
  const maxSkew = parsePositiveInt(process.env.MAX_TIMESTAMP_SKEW_SEC, 86400, "MAX_TIMESTAMP_SKEW_SEC");
  assertCond(maxSkew <= 7 * 24 * 60 * 60, "MAX_TIMESTAMP_SKEW_SEC must be <= 604800");

  const broadcastEnabled = parseBoolean(process.env.BROADCAST_ENABLED, true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        signerMode,
        expectedChainId,
        reportExpectedChainId,
        broadcastEnabled,
        maxTimestampSkewSec: maxSkew
      },
      null,
      2
    )
  );
}

main();
