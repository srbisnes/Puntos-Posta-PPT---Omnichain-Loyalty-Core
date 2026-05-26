import { ethers } from "hardhat";

function readAddressEnv(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid address for ${name}: ${value}`);
  }
  return value;
}

function readAmountEnv(name: string, fallback: string): bigint {
  const raw = process.env[name] || fallback;
  const parsed = ethers.parseUnits(raw, 18);
  if (parsed <= 0n) {
    throw new Error(`Invalid non-positive amount for ${name}: ${raw}`);
  }
  return parsed;
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const admin = readAddressEnv("ADMIN_ADDRESS", deployer.address);
  const minter = readAddressEnv("MINTER_ADDRESS", deployer.address);

  const maxMintPerTx = readAmountEnv("MAX_MINT_PER_TX", "100000");
  const dailyMintCap = readAmountEnv("DAILY_MINT_CAP", "1000000");

  if (maxMintPerTx > dailyMintCap) {
    throw new Error("Invalid cap configuration: MAX_MINT_PER_TX cannot exceed DAILY_MINT_CAP");
  }

  const Token = await ethers.getContractFactory("PostaLoyaltyToken");
  const token = await Token.deploy(admin, minter, maxMintPerTx, dailyMintCap);
  await token.waitForDeployment();

  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin);
  console.log("Minter:", minter);
  console.log("Max mint per tx:", maxMintPerTx.toString());
  console.log("Daily mint cap:", dailyMintCap.toString());
  console.log("PostaLoyaltyToken deployed at:", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
