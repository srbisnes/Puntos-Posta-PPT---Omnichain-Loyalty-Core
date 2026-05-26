import { expect } from "chai";
import { ethers } from "hardhat";

describe("PostaLoyaltyToken", function () {
  async function deployFixture() {
    const [admin, minter, user, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("PostaLoyaltyToken");
    const token = await Token.deploy(
      admin.address,
      minter.address,
      ethers.parseUnits("1000", 18),
      ethers.parseUnits("5000", 18)
    );
    await token.waitForDeployment();
    return { token, admin, minter, user, other };
  }

  it("rejects invalid constructor caps", async function () {
    const [admin, minter] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("PostaLoyaltyToken");
    await expect(Token.deploy(admin.address, minter.address, 0n, 1n)).to.be.reverted;
    await expect(Token.deploy(admin.address, minter.address, 2n, 1n)).to.be.reverted;
  });

  it("rejects pause and mint from unauthorized accounts with specific errors", async function () {
    const { token, user } = await deployFixture();
    await expect(token.connect(user).mintPoints(user.address, 1n, ethers.id("e"), ethers.id("r"))).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await expect(token.connect(user).pause()).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("rejects zero-amount mint", async function () {
    const { token, minter, user } = await deployFixture();
    await expect(token.connect(minter).mintPoints(user.address, 0n, ethers.id("event-0"), ethers.id("rut-0"))).to.be.revertedWithCustomError(token, "InvalidAmount");
  });

  it("mints with valid eventId and rejects duplicates", async function () {
    const { token, minter, user } = await deployFixture();
    const eventId = ethers.id("event-1");
    const rutHash = ethers.id("rut-1");
    const amount = ethers.parseUnits("100", 18);

    await expect(token.connect(minter).mintPoints(user.address, amount, eventId, rutHash)).not.to.be.reverted;
    await expect(token.connect(minter).mintPoints(user.address, amount, eventId, rutHash)).to.be.revertedWithCustomError(token, "EventAlreadyProcessed");
  });

  it("supports minting directly to registered wallet and unregister lifecycle", async function () {
    const { token, admin, minter, user } = await deployFixture();
    const rutHash = ethers.id("rut-registered");
    await token.connect(admin).registerUser(rutHash, user.address);

    await expect(token.connect(minter).mintPointsToRegisteredUser(rutHash, ethers.parseUnits("10", 18), ethers.id("event-reg"))).not
      .to.be.reverted;

    expect(await token.balanceOf(user.address)).to.equal(ethers.parseUnits("10", 18));

    await token.connect(admin).unregisterUser(rutHash);
    await expect(
      token.connect(minter).mintPointsToRegisteredUser(rutHash, ethers.parseUnits("1", 18), ethers.id("event-reg-2"))
    ).to.be.revertedWithCustomError(token, "RegistryNotFound");
  });

  it("enforces registry mismatch on direct mint when identity exists", async function () {
    const { token, admin, minter, user, other } = await deployFixture();
    const rutHash = ethers.id("rut-locked");
    await token.connect(admin).registerUser(rutHash, user.address);

    await expect(
      token.connect(minter).mintPoints(other.address, ethers.parseUnits("1", 18), ethers.id("event-lock"), rutHash)
    ).to.be.revertedWithCustomError(token, "RegistryMismatch");
  });

  it("updates remaining daily capacity after mint", async function () {
    const { token, minter, user } = await deployFixture();
    const before = await token.remainingDailyCapacity();
    expect(before).to.equal(ethers.parseUnits("5000", 18));

    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("250", 18), ethers.id("event-cap"), ethers.id("rut-cap"));

    const after = await token.remainingDailyCapacity();
    expect(after).to.equal(ethers.parseUnits("4750", 18));
  });


  it("tracks minted, burned and outstanding liability", async function () {
    const { token, minter, user } = await deployFixture();
    const mintAmount = ethers.parseUnits("50", 18);

    await token.connect(minter).mintPoints(user.address, mintAmount, ethers.id("event-ledger"), ethers.id("rut-ledger"));

    expect(await token.totalMinted()).to.equal(mintAmount);
    expect(await token.totalBurned()).to.equal(0n);
    expect(await token.outstandingLiability()).to.equal(mintAmount);

    const burnAmount = ethers.parseUnits("20", 18);
    await token.connect(user).burn(burnAmount);

    expect(await token.totalBurned()).to.equal(burnAmount);
    expect(await token.outstandingLiability()).to.equal(ethers.parseUnits("30", 18));
  });

  it("enforces maxMintPerTx custom error", async function () {
    const { token, minter, user } = await deployFixture();
    await expect(
      token.connect(minter).mintPoints(user.address, ethers.parseUnits("1001", 18), ethers.id("event-max"), ethers.id("rut-max"))
    ).to.be.revertedWithCustomError(token, "MintTooLarge");
  });

  it("enforces daily cap custom error", async function () {
    const { token, minter, user } = await deployFixture();
    for (let i = 0; i < 5; i++) {
      await token.connect(minter).mintPoints(
        user.address,
        ethers.parseUnits("1000", 18),
        ethers.id(`event-day-${i}`),
        ethers.id(`rut-day-${i}`)
      );
    }

    await expect(
      token.connect(minter).mintPoints(user.address, 1n, ethers.id("event-day-over"), ethers.id("rut-day-over"))
    ).to.be.revertedWithCustomError(token, "DailyCapExceeded");
  });


  it("prevents accidental renounce of critical roles", async function () {
    const { token, admin, minter } = await deployFixture();

    await expect(token.connect(admin).renounceRole(await token.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.revertedWithCustomError(
      token,
      "CriticalRoleRenounceForbidden"
    );

    await expect(token.connect(minter).renounceRole(await token.MINTER_ROLE(), minter.address)).to.be.revertedWithCustomError(
      token,
      "CriticalRoleRenounceForbidden"
    );
  });


  it("enforces max total supply of 21 million tokens", async function () {
    const [admin, minter, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("PostaLoyaltyToken");
    const maxSupply = ethers.parseUnits("21000000", 18);

    const token = await Token.deploy(admin.address, minter.address, maxSupply, maxSupply);
    await token.waitForDeployment();

    await token.connect(minter).mintPoints(user.address, maxSupply, ethers.id("event-max-supply-ok"), ethers.id("rut-max-supply-ok"));

    await expect(
      token.connect(minter).mintPoints(user.address, 1n, ethers.id("event-max-supply-over"), ethers.id("rut-max-supply-over"))
    ).to.be.revertedWithCustomError(token, "MaxSupplyExceeded");
  });


  it("exposes mintCheck preflight status codes", async function () {
    const { token, admin, minter, user, other } = await deployFixture();

    const ok = await token.mintCheck(user.address, ethers.parseUnits("1", 18), ethers.id("event-check-ok"), ethers.id("rut-check-ok"), true);
    expect(ok[0]).to.equal(0n);

    await token.connect(admin).registerUser(ethers.id("rut-check-locked"), user.address);
    const mismatch = await token.mintCheck(other.address, ethers.parseUnits("1", 18), ethers.id("event-check-mismatch"), ethers.id("rut-check-locked"), true);
    expect(mismatch[0]).to.equal(7n);

    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("1000", 18), ethers.id("event-check-cap-1"), ethers.id("rut-check-cap-1"));
    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("1000", 18), ethers.id("event-check-cap-2"), ethers.id("rut-check-cap-2"));
    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("1000", 18), ethers.id("event-check-cap-3"), ethers.id("rut-check-cap-3"));
    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("1000", 18), ethers.id("event-check-cap-4"), ethers.id("rut-check-cap-4"));
    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("1000", 18), ethers.id("event-check-cap-5"), ethers.id("rut-check-cap-5"));

    const dailyExceeded = await token.mintCheck(user.address, ethers.parseUnits("1", 18), ethers.id("event-check-cap-over"), ethers.id("rut-check-cap-over"), true);
    expect(dailyExceeded[0]).to.equal(8n);
  });



  it("returns MINT_CHECK_EVENT_PROCESSED once event was minted", async function () {
    const { token, minter, user } = await deployFixture();
    const eventId = ethers.id("event-check-processed");
    const rutHash = ethers.id("rut-check-processed");

    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("1", 18), eventId, rutHash);

    const status = await token.mintCheck(user.address, ethers.parseUnits("1", 18), eventId, rutHash, true);
    expect(status[0]).to.equal(await token.MINT_CHECK_EVENT_PROCESSED());
  });

  it("returns MINT_CHECK_MAX_SUPPLY when supply cap would be exceeded", async function () {
    const [admin, minter, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("PostaLoyaltyToken");
    const maxSupply = ethers.parseUnits("21000000", 18);
    const token = await Token.deploy(admin.address, minter.address, maxSupply, maxSupply);
    await token.waitForDeployment();

    await token.connect(minter).mintPoints(user.address, maxSupply, ethers.id("event-supply-ok"), ethers.id("rut-supply-ok"));

    const status = await token.mintCheck(
      user.address,
      1n,
      ethers.id("event-supply-over"),
      ethers.id("rut-supply-over"),
      true
    );

    expect(status[0]).to.equal(await token.MINT_CHECK_MAX_SUPPLY());
    expect(status[2]).to.equal(0n);
  });

  it("returns MINT_CHECK_PAUSED when contract is paused", async function () {
    const { token, admin, user } = await deployFixture();
    await token.connect(admin).pause();
    const status = await token.mintCheck(user.address, ethers.parseUnits("1", 18), ethers.id("event-paused"), ethers.id("rut-paused"), true);
    expect(status[0]).to.equal(await token.MINT_CHECK_PAUSED());
  });


  it("keeps mintCheck constants stable and returns coherent remaining supply", async function () {
    const { token, user } = await deployFixture();

    expect(await token.MINT_CHECK_OK()).to.equal(0n);
    expect(await token.MINT_CHECK_PAUSED()).to.equal(1n);
    expect(await token.MINT_CHECK_ZERO_USER()).to.equal(2n);
    expect(await token.MINT_CHECK_INVALID_AMOUNT()).to.equal(3n);
    expect(await token.MINT_CHECK_EVENT_PROCESSED()).to.equal(4n);
    expect(await token.MINT_CHECK_PER_TX_CAP()).to.equal(5n);
    expect(await token.MINT_CHECK_MAX_SUPPLY()).to.equal(6n);
    expect(await token.MINT_CHECK_REGISTRY_MISMATCH()).to.equal(7n);
    expect(await token.MINT_CHECK_DAILY_CAP()).to.equal(8n);

    const status = await token.mintCheck(
      user.address,
      ethers.parseUnits("1", 18),
      ethers.id("event-constants"),
      ethers.id("rut-constants"),
      true
    );

    // status[2] == remainingSupply, should equal MAX_SUPPLY when totalSupply is still zero
    expect(status[2]).to.equal(await token.MAX_SUPPLY());
  });

  it("pauses mints and transfers", async function () {
    const { token, admin, minter, user, other } = await deployFixture();
    await token.connect(minter).mintPoints(user.address, ethers.parseUnits("10", 18), ethers.id("event-4"), ethers.id("rut-4"));
    await token.connect(admin).pause();
    await expect(token.connect(minter).mintPoints(user.address, 1n, ethers.id("event-5"), ethers.id("rut-5"))).to.be.reverted;
    await expect(token.connect(user).transfer(other.address, 1n)).to.be.reverted;
  });
});
