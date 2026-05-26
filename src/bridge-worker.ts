import { createHmac, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { BridgeSigner, CiHmacBridgeSigner, KmsPlaceholderBridgeSigner, PrivateKeyBridgeSigner } from "./signer";
import * as dotenv from "dotenv";

dotenv.config();

function runId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

type ShipmentEvent = {
  shipmentId: string;
  rutHash: string;
  userWallet?: string;
  pointsToMint: bigint;
  sourceTimestamp: number;
};

type RawWebhookEvent = {
  shipmentId: unknown;
  rutHash: unknown;
  userWallet?: unknown;
  pointsToMint: unknown;
  sourceTimestamp: unknown;
};

function buildEventId(event: ShipmentEvent): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["string", "string", "string", "uint256", "uint256"],
      [event.shipmentId, event.rutHash, event.userWallet ?? "registered-user-path", event.pointsToMint, event.sourceTimestamp]
    )
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function parsePositivePoints(raw: string): bigint {
  const parsed = ethers.parseUnits(raw, 18);
  if (parsed <= 0n) throw new Error(`POINTS_TO_MINT must be > 0: ${raw}`);
  return parsed;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

function parseBooleanFlag(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  throw new Error(`Invalid boolean flag value: ${raw}`);
}

function parseUnixTimestamp(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid SOURCE_TIMESTAMP: ${raw}`);
  return n;
}


function parseMaxSkew(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 7 * 24 * 60 * 60) {
    throw new Error(`Invalid MAX_TIMESTAMP_SKEW_SEC: ${raw}`);
  }
  return n;
}

function validateTimestampNotStale(sourceTimestamp: number, maxSkewSec: number): void {
  const now = Math.floor(Date.now() / 1000);
  const delta = Math.abs(now - sourceTimestamp);
  if (delta > maxSkewSec) {
    throw new Error(`SOURCE_TIMESTAMP out of allowed skew. delta=${delta}s max=${maxSkewSec}s`);
  }
}

function validateWebhookSignature(payload: string, signatureHex: string, secret: string): void {
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signatureHex, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Invalid WEBHOOK_SIGNATURE for EVENT_PAYLOAD_JSON");
  }
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}: must be non-empty string`);
  }
  return value.trim();
}

function parseWebhookEvent(payloadJson: string, defaultWallet: string): ShipmentEvent {
  const raw = JSON.parse(payloadJson) as RawWebhookEvent;

  const shipmentId = asNonEmptyString(raw.shipmentId, "shipmentId");
  const rutHash = asNonEmptyString(raw.rutHash, "rutHash");
  const pointsToMint = parsePositivePoints(asNonEmptyString(raw.pointsToMint, "pointsToMint"));
  const sourceTimestamp = parseUnixTimestamp(String(raw.sourceTimestamp));

  let userWallet = defaultWallet;
  if (raw.userWallet !== undefined) {
    const maybeWallet = asNonEmptyString(raw.userWallet, "userWallet");
    if (!ethers.isAddress(maybeWallet)) {
      throw new Error("Invalid userWallet: must be a valid EVM address");
    }
    userWallet = maybeWallet;
  }

  return { shipmentId, rutHash, userWallet, pointsToMint, sourceTimestamp };
}

function loadBusinessEvent(defaultWallet: string): ShipmentEvent {
  const payloadJson = process.env.EVENT_PAYLOAD_JSON;
  if (payloadJson) {
    const webhookSecret = required("WEBHOOK_SECRET");
    const webhookSignature = required("WEBHOOK_SIGNATURE");
    validateWebhookSignature(payloadJson, webhookSignature, webhookSecret);
    return parseWebhookEvent(payloadJson, defaultWallet);
  }

  const userWallet = process.env.USER_WALLET || defaultWallet;
  if (!ethers.isAddress(userWallet)) {
    throw new Error("Invalid USER_WALLET: must be a valid EVM address");
  }

  return {
    shipmentId: process.env.SHIPMENT_ID || "SHIP-2026-000123",
    rutHash: process.env.RUT_HASH || ethers.id("rut-demo-with-salt"),
    userWallet,
    pointsToMint: parsePositivePoints(process.env.POINTS_TO_MINT || "100"),
    sourceTimestamp: parseUnixTimestamp(process.env.SOURCE_TIMESTAMP || String(Math.floor(Date.now() / 1000)))
  };
}

async function runDemo(): Promise<void> {
  const correlationId = runId();
  const rpcUrl = required("ARBITRUM_SEPOLIA_RPC_URL");
  const privateKey = required("BRIDGE_PRIVATE_KEY");
  const tokenAddress = required("TOKEN_ADDRESS");
  const mintMode = process.env.MINT_MODE || "registered";
  const expectedChainId = parsePositiveInt(process.env.EXPECTED_CHAIN_ID, 421614, "EXPECTED_CHAIN_ID");
  const maxTimestampSkewSec = parseMaxSkew(process.env.MAX_TIMESTAMP_SKEW_SEC || "86400");
  const broadcastEnabled = parseBooleanFlag(process.env.BROADCAST_ENABLED, true);

  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("Invalid TOKEN_ADDRESS: must be a valid EVM address");
  }

  if (mintMode !== "registered" && mintMode !== "direct") {
    throw new Error(`Invalid MINT_MODE=${mintMode}. Use registered or direct.`);
  }

  const signerMode = (process.env.SIGNER_MODE || "private_key").toLowerCase();
  if (!["private_key", "kms_placeholder", "ci_hmac"].includes(signerMode)) {
    throw new Error(`Invalid SIGNER_MODE=${signerMode}. SIGNER_MODE must be one of: private_key, kms_placeholder, ci_hmac`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer: BridgeSigner = signerMode === "kms_placeholder"
    ? new KmsPlaceholderBridgeSigner(required("KMS_SIGNER_ADDRESS"))
    : signerMode === "ci_hmac"
      ? new CiHmacBridgeSigner(required("CI_HMAC_KEY_ID"), required("CI_HMAC_SECRET"))
      : new PrivateKeyBridgeSigner(privateKey, provider);

  const signerAddress = await signer.getAddress();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error(`Unexpected chainId=${network.chainId}. Expected ${expectedChainId}.`);
  }

  const abi = [
    "function mintPoints(address user, uint256 amount, bytes32 eventId, bytes32 rutHash) external",
    "function mintPointsToRegisteredUser(bytes32 rutHash, uint256 amount, bytes32 eventId) external",
    "function remainingDailyCapacity() external view returns (uint256)",
    "function mintCheck(address user, uint256 amount, bytes32 eventId, bytes32 rutHash, bool enforceRegistryIfExists) external view returns (uint8 code, uint256 remainingDailyCapacityValue, uint256 remainingSupply)"
  ];

  const iface = new ethers.Interface(abi);
  const readToken = new ethers.Contract(tokenAddress, abi, provider);
  const businessEvent = loadBusinessEvent(signerAddress);

  validateTimestampNotStale(businessEvent.sourceTimestamp, maxTimestampSkewSec);

  if (!ethers.isHexString(businessEvent.rutHash, 32)) {
    throw new Error("Invalid rutHash: must be a bytes32 hex string");
  }

  const eventId = buildEventId(businessEvent);
  const remainingCap: bigint = await readToken.remainingDailyCapacity();
  const preflight = await readToken.mintCheck(businessEvent.userWallet, businessEvent.pointsToMint, eventId, businessEvent.rutHash, mintMode === "direct");
  if (preflight.code !== 0n) {
    throw new Error(`mintCheck failed with code=${preflight.code} remainingDailyCapacity=${preflight.remainingDailyCapacityValue} remainingSupply=${preflight.remainingSupply}`);
  }

  if (businessEvent.pointsToMint > remainingCap) {
    throw new Error(`Mint exceeds remaining daily capacity: requested=${businessEvent.pointsToMint} remaining=${remainingCap}`);
  }

  if (mintMode === "direct") {
    await readToken.mintPoints.staticCall(businessEvent.userWallet, businessEvent.pointsToMint, eventId, businessEvent.rutHash);
  } else {
    await readToken.mintPointsToRegisteredUser.staticCall(businessEvent.rutHash, businessEvent.pointsToMint, eventId);
  }

  const data = mintMode === "direct"
    ? iface.encodeFunctionData("mintPoints", [businessEvent.userWallet, businessEvent.pointsToMint, eventId, businessEvent.rutHash])
    : iface.encodeFunctionData("mintPointsToRegisteredUser", [businessEvent.rutHash, businessEvent.pointsToMint, eventId]);

  console.log("Correlation ID:", correlationId);
  console.log("Network chainId:", network.chainId.toString());
  console.log("Signer mode:", signerMode);
  console.log("Signer address:", signerAddress);
  console.log("Mint mode:", mintMode);
  console.log("Event ID:", eventId);
  console.log("Broadcast enabled:", broadcastEnabled);

  if (!broadcastEnabled) {
    console.log(`Broadcast disabled for ${correlationId}: preflight checks passed, transaction not submitted.`);
    return;
  }

  const tx = await signer.sendTransaction({ to: tokenAddress, data, value: 0n });
  console.log(`Mint tx submitted (${correlationId}):`, tx.hash);
  await tx.wait();
  console.log("Mint confirmed");
}

runDemo().catch((err) => {
  console.error(err);
  process.exit(1);
});
