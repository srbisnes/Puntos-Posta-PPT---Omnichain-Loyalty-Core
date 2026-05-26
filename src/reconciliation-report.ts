import { createHash, createHmac } from "crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { writeFileSync } from "fs";

dotenv.config();

const ABI = [
  "event PointsMinted(address indexed user, uint256 amount, bytes32 indexed eventId, bytes32 rutHash)",
  "function totalMinted() view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function outstandingLiability() view returns (uint256)"
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmacSha256Hex(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

function parseNonNegativeInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

async function main(): Promise<void> {
  const rpcUrl = required("ARBITRUM_SEPOLIA_RPC_URL");
  const tokenAddress = required("TOKEN_ADDRESS");
  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("Invalid TOKEN_ADDRESS: must be a valid EVM address");
  }
  const fromBlock = parseNonNegativeInt(process.env.REPORT_FROM_BLOCK, 0, "REPORT_FROM_BLOCK");
  const toBlock = process.env.REPORT_TO_BLOCK ? parseNonNegativeInt(process.env.REPORT_TO_BLOCK, 0, "REPORT_TO_BLOCK") : "latest";
  if (toBlock !== "latest" && toBlock < fromBlock) {
    throw new Error(`Invalid REPORT_TO_BLOCK: ${process.env.REPORT_TO_BLOCK}`);
  }
  const outputPath = process.env.REPORT_OUTPUT_PATH || "reconciliation-report.json";
  const expectedChainId = parsePositiveInt(process.env.REPORT_EXPECTED_CHAIN_ID, 421614, "REPORT_EXPECTED_CHAIN_ID");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const token = new ethers.Contract(tokenAddress, ABI, provider);

  const filter = token.filters.PointsMinted();
  const logs = await token.queryFilter(filter, fromBlock, toBlock);

  let mintedFromEvents = 0n;
  const eventIds: string[] = [];
  for (const log of logs) {
    mintedFromEvents += log.args.amount;
    eventIds.push(log.args.eventId);
  }

  const totalMinted: bigint = await token.totalMinted();
  const totalBurned: bigint = await token.totalBurned();
  const liability: bigint = await token.outstandingLiability();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error(`Unexpected chainId=${network.chainId}. Expected ${expectedChainId}.`);
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    network: network.name,
    chainId: Number(network.chainId),
    tokenAddress,
    range: { fromBlock, toBlock },
    expectedChainId,
    eventsCount: logs.length,
    eventIdsHash: sha256Hex(eventIds.join("|")),
    mintedFromEvents: mintedFromEvents.toString(),
    totalMinted: totalMinted.toString(),
    totalBurned: totalBurned.toString(),
    outstandingLiability: liability.toString(),
    parityOk: mintedFromEvents === totalMinted
  };

  const reportJson = JSON.stringify(report, null, 2);
  writeFileSync(outputPath, reportJson);

  const reportDigest = sha256Hex(reportJson);
  const reportHmacSecret = process.env.REPORT_HMAC_SECRET;
  const artifactSigningMode = (process.env.ARTIFACT_SIGNING_MODE || "none").toLowerCase();
  const artifactSigner = process.env.ARTIFACT_SIGNER || null;
  const reportSignature = artifactSigningMode === "hmac"
    ? hmacSha256Hex(reportJson, reportHmacSecret || "")
    : null;

  if (artifactSigningMode === "hmac" && !reportHmacSecret) {
    throw new Error("REPORT_HMAC_SECRET is required when ARTIFACT_SIGNING_MODE=hmac");
  }

  console.log(reportJson);
  console.log(JSON.stringify({ reportDigest, reportSignature, artifactSigningMode, artifactSigner, outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
