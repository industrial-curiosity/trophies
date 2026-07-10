const fs = require("fs");
const path = require("path");
const { ethers, network, artifacts } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const ledger = await ethers.deployContract("ContributionLedger");
  await ledger.waitForDeployment();
  const address = await ledger.getAddress();
  console.log(`ContributionLedger deployed to ${address} on ${network.name} by ${deployer.address}`);

  // Demo convenience: deployer doubles as an authorized company.
  await (await ledger.setCompanyAuthorization(deployer.address, true)).wait();
  console.log(`Authorized ${deployer.address} as issuing company`);

  // Hand the frontend everything it needs.
  const { abi } = await artifacts.readArtifact("ContributionLedger");
  const out = path.join(__dirname, "..", "..", "web", "lib", "deployment.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ address, network: network.name, abi }, null, 2));
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
