// scripts/deploy/deploy.js
// Simplified deployment script with options

const { main } = require("./deploy_contracts");

// Check if running with specific network
async function runDeployment() {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  console.log(`Deploying to network: ${network}`);
  
  await main();
}

if (require.main === module) {
  runDeployment()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runDeployment };
