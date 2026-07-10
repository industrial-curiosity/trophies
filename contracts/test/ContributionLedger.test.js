const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ContributionLedger", () => {
  let ledger, admin, company, stranger;
  const employeeId = ethers.id("alice@example.com");
  const companyId = ethers.id("acme-corp");
  const proofHash = ethers.id("JIRA-123: shipped payments service");

  beforeEach(async () => {
    [admin, company, stranger] = await ethers.getSigners();
    ledger = await ethers.deployContract("ContributionLedger");
    await ledger.setCompanyAuthorization(company.address, true);
  });

  it("only admin can authorize companies", async () => {
    await expect(
      ledger.connect(stranger).setCompanyAuthorization(stranger.address, true)
    ).to.be.revertedWithCustomError(ledger, "NotAdmin");
  });

  it("authorized company issues, unauthorized wallet cannot", async () => {
    await expect(
      ledger.connect(company).issueContribution(employeeId, companyId, "code", proofHash)
    )
      .to.emit(ledger, "ContributionIssued")
      .withArgs(0, employeeId, companyId, company.address);

    await expect(
      ledger.connect(stranger).issueContribution(employeeId, companyId, "code", proofHash)
    ).to.be.revertedWithCustomError(ledger, "NotAuthorizedCompany");
  });

  it("stores record, indexes by employee, verifies publicly", async () => {
    await ledger.connect(company).issueContribution(employeeId, companyId, "code", proofHash);
    await ledger.connect(company).issueContribution(employeeId, companyId, "design", proofHash);

    const ids = await ledger.getEmployeeContributionIds(employeeId);
    expect(ids.map(Number)).to.deep.equal([0, 1]);
    expect(await ledger.totalContributions()).to.equal(2);

    const c = await ledger.getContribution(1);
    expect(c.contributionType).to.equal("design");
    expect(c.issuer).to.equal(company.address);
    expect(c.proofHash).to.equal(proofHash);
    expect(c.timestamp).to.be.gt(0);

    const [exists, stillAuthorized] = await ledger.verifyContribution(0);
    expect(exists).to.equal(true);
    expect(stillAuthorized).to.equal(true);

    const [missingExists] = await ledger.verifyContribution(99);
    expect(missingExists).to.equal(false);
  });

  it("revoking company blocks new issuance but keeps old records", async () => {
    await ledger.connect(company).issueContribution(employeeId, companyId, "code", proofHash);
    await ledger.setCompanyAuthorization(company.address, false);

    await expect(
      ledger.connect(company).issueContribution(employeeId, companyId, "code", proofHash)
    ).to.be.revertedWithCustomError(ledger, "NotAuthorizedCompany");

    const [exists, stillAuthorized] = await ledger.verifyContribution(0);
    expect(exists).to.equal(true);
    expect(stillAuthorized).to.equal(false);
  });
});
