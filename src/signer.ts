import { createHmac } from "crypto";
import { ethers } from "ethers";

export type TxRequest = {
  to: string;
  data: string;
  value?: bigint;
};

export interface BridgeSigner {
  getAddress(): Promise<string>;
  sendTransaction(tx: TxRequest): Promise<ethers.TransactionResponse>;
}

export class PrivateKeyBridgeSigner implements BridgeSigner {
  private readonly wallet: ethers.Wallet;

  constructor(privateKey: string, provider: ethers.Provider) {
    this.wallet = new ethers.Wallet(privateKey, provider);
  }

  async getAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  async sendTransaction(tx: TxRequest): Promise<ethers.TransactionResponse> {
    return this.wallet.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n
    });
  }
}

export interface ExternalSigningClient {
  getAddress(): Promise<string>;
  signAndSend(tx: TxRequest): Promise<ethers.TransactionResponse>;
}

export class ExternalServiceBridgeSigner implements BridgeSigner {
  constructor(private readonly client: ExternalSigningClient) {}

  async getAddress(): Promise<string> {
    const address = await this.client.getAddress();
    if (!ethers.isAddress(address)) {
      throw new Error("External signer returned an invalid EVM address");
    }
    return address;
  }

  async sendTransaction(tx: TxRequest): Promise<ethers.TransactionResponse> {
    if (!ethers.isAddress(tx.to)) {
      throw new Error("Invalid tx.to address for external signer");
    }
    return this.client.signAndSend(tx);
  }
}

/**
 * Deterministic HMAC-backed signer for CI integration checks.
 * Produces a stable pseudo-address from key id + secret and never broadcasts tx.
 */
export class CiHmacBridgeSigner implements BridgeSigner {
  private readonly address: string;

  constructor(private readonly keyId: string, private readonly secret: string) {
    if (!keyId || !secret) {
      throw new Error("CI_HMAC_KEY_ID and CI_HMAC_SECRET are required for ci_hmac mode");
    }
    const digest = createHmac("sha256", secret).update(keyId).digest("hex");
    this.address = ethers.getAddress(`0x${digest.slice(0, 40)}`);
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async sendTransaction(_tx: TxRequest): Promise<ethers.TransactionResponse> {
    throw new Error("ci_hmac signer is preflight-only and never broadcasts transactions");
  }
}

export class KmsPlaceholderBridgeSigner implements BridgeSigner {
  constructor(private readonly kmsAddress: string) {
    if (!ethers.isAddress(kmsAddress)) {
      throw new Error("Invalid KMS_SIGNER_ADDRESS: must be a valid EVM address");
    }
  }

  async getAddress(): Promise<string> {
    return this.kmsAddress;
  }

  async sendTransaction(_tx: TxRequest): Promise<ethers.TransactionResponse> {
    throw new Error("KMS signer mode is placeholder-only. Implement institutional KMS/HSM signing before use.");
  }
}
