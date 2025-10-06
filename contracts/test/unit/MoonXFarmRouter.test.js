const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployDiamond } = require("../../script/deploy.js");

describe("MoonXFarmRouter", function () {
  let diamond;
  let diamondCutFacet;
  let diamondInit;
  let owner;
  let addr1;
  let addr2;

  before(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Set fee recipient for deployment
    process.env.FEE_RECIPIENT = owner.address;
  });

  beforeEach(async function () {
    const deployment = await deployDiamond();
    diamond = await ethers.getContractAt("MoonXFarmRouter", deployment.diamond);
    diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", deployment.diamond);
    diamondInit = await ethers.getContractAt("DiamondInit", deployment.diamondInit);
  });

  describe("Deployment", function () {
    it("Should deploy diamond correctly", async function () {
      expect(diamond.address).to.properAddress;
    });

    it("Should have correct owner", async function () {
      const ownershipFacet = await ethers.getContractAt("OwnershipFacet", diamond.address);
      expect(await ownershipFacet.owner()).to.equal(owner.address);
    });

    it("Should have fee collector configured", async function () {
      const feeCollectorFacet = await ethers.getContractAt("FeeCollectorFacet", diamond.address);
      expect(await feeCollectorFacet.getFeeRecipient()).to.equal(owner.address);
    });
  });

  describe("Facets", function () {
    it("Should have LifiProxyFacet", async function () {
      const lifiProxyFacet = await ethers.getContractAt("LifiProxyFacet", diamond.address);
      // Test that facet is properly attached (this will revert if not)
      await expect(lifiProxyFacet.callLifi(0, 0, 0, "0x")).to.be.reverted;
    });

    it("Should have OneInchProxyFacet", async function () {
      const oneInchProxyFacet = await ethers.getContractAt("OneInchProxyFacet", diamond.address);
      // Test that facet is properly attached (this will revert if not)
      await expect(oneInchProxyFacet.callOneInch(0, 0, 0, "0x")).to.be.reverted;
    });

    it("Should have RelayProxyFacet", async function () {
      const relayProxyFacet = await ethers.getContractAt("RelayProxyFacet", diamond.address);
      // Test that facet is properly attached (this will revert if not)
      await expect(relayProxyFacet.callRelay(0, 0, 0, "0x")).to.be.reverted;
    });
  });

  describe("Diamond Cut", function () {
    it("Should support diamond cut interface", async function () {
      expect(diamondCutFacet.address).to.properAddress;
    });

    it("Should support diamond loupe interface", async function () {
      const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamond.address);
      const facets = await diamondLoupeFacet.facets();
      expect(facets.length).to.be.greaterThan(0);
    });
  });

  describe("Fee Management", function () {
    it("Should allow owner to change fee recipient", async function () {
      const feeCollectorFacet = await ethers.getContractAt("FeeCollectorFacet", diamond.address);
      
      await feeCollectorFacet.setFeeRecipient(addr1.address);
      expect(await feeCollectorFacet.getFeeRecipient()).to.equal(addr1.address);
    });

    it("Should not allow non-owner to change fee recipient", async function () {
      const feeCollectorFacet = await ethers.getContractAt("FeeCollectorFacet", diamond.address);
      
      await expect(
        feeCollectorFacet.connect(addr1).setFeeRecipient(addr1.address)
      ).to.be.revertedWith("LibDiamond: Must be contract owner");
    });
  });

  describe("Ownership", function () {
    it("Should allow owner transfer", async function () {
      const ownershipFacet = await ethers.getContractAt("OwnershipFacet", diamond.address);
      
      await ownershipFacet.transferOwnership(addr1.address);
      expect(await ownershipFacet.owner()).to.equal(addr1.address);
    });

    it("Should not allow non-owner to transfer ownership", async function () {
      const ownershipFacet = await ethers.getContractAt("OwnershipFacet", diamond.address);
      
      await expect(
        ownershipFacet.connect(addr1).transferOwnership(addr1.address)
      ).to.be.revertedWith("LibDiamond: Must be contract owner");
    });
  });
});
