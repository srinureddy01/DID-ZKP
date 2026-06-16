// scripts/deploy/deploy_contracts.js
// Deployment script for DID Protocol Smart Contracts

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

// ==================== Configuration ====================

const CONFIG = {
  // Contract names
  contracts: {
    didRegistry: "DIDRegistry",
    zkpVerifier: "ZKPVerifier",
    credentialNFT: "CredentialNFT",
  },
  
  // Deployment options
  options: {
    verify: true,
    saveDeployment: true,
    logGasUsage: true,
    waitConfirmations: 1,
  },
  
  // Network configurations
  networks: {
    localhost: {
      chainId: 31337,
      name: "Hardhat Local",
      explorer: "",
    },
    sepolia: {
      chainId: 11155111,
      name: "Sepolia",
      explorer: "https://sepolia.etherscan.io",
    },
    goerli: {
      chainId: 5,
      name: "Goerli",
      explorer: "https://goerli.etherscan.io",
    },
    mainnet: {
      chainId: 1,
      name: "Ethereum Mainnet",
      explorer: "https://etherscan.io",
    },
  },
};

// ==================== Deployment Logger ====================

class DeploymentLogger {
  constructor() {
    this.logs = [];
    this.startTime = Date.now();
  }

  info(message) {
    const log = `[INFO] ${message}`;
    console.log(chalk.blue(log));
    this.logs.push({ level: "info", message, timestamp: new Date().toISOString() });
  }

  success(message) {
    const log = `[SUCCESS] ${message}`;
    console.log(chalk.green(log));
    this.logs.push({ level: "success", message, timestamp: new Date().toISOString() });
  }

  error(message) {
    const log = `[ERROR] ${message}`;
    console.log(chalk.red(log));
    this.logs.push({ level: "error", message, timestamp: new Date().toISOString() });
  }

  warn(message) {
    const log = `[WARN] ${message}`;
    console.log(chalk.yellow(log));
    this.logs.push({ level: "warn", message, timestamp: new Date().toISOString() });
  }

  debug(message) {
    if (process.env.DEBUG) {
      const log = `[DEBUG] ${message}`;
      console.log(chalk.gray(log));
      this.logs.push({ level: "debug", message, timestamp: new Date().toISOString() });
    }
  }

  section(title) {
    console.log(chalk.cyan("\n" + "=".repeat(60)));
    console.log(chalk.cyan.bold(`  ${title}`));
    console.log(chalk.cyan("=".repeat(60) + "\n"));
  }

  printDeploymentSummary(deployments) {
    this.section("DEPLOYMENT SUMMARY");
    
    console.log(chalk.white("Network:"), chalk.green(hre.network.name));
    console.log(chalk.white("Chain ID:"), chalk.green(hre.network.config.chainId));
    console.log(chalk.white("Block Number:"), chalk.green(deployments.blockNumber || "N/A"));
    console.log(chalk.white("Gas Used:"), chalk.green(deployments.totalGasUsed || "N/A"));
    console.log(chalk.white("Deployment Time:"), chalk.green(`${Date.now() - this.startTime}ms`));
    console.log("");
    
    console.log(chalk.white("Contracts Deployed:"));
    for (const [name, data] of Object.entries(deployments.contracts)) {
      console.log(`  ${chalk.cyan(name)}:`);
      console.log(`    Address: ${chalk.green(data.address)}`);
      if (data.txHash) console.log(`    Tx Hash: ${chalk.gray(data.txHash)}`);
      if (data.gasUsed) console.log(`    Gas Used: ${chalk.gray(data.gasUsed)}`);
      if (data.explorerUrl) console.log(`    Explorer: ${chalk.blue(data.explorerUrl)}`);
    }
    console.log("");
  }

  saveDeploymentLog(deploymentPath) {
    const logData = {
      timestamp: new Date().toISOString(),
      network: hre.network.name,
      chainId: hre.network.config.chainId,
      logs: this.logs,
      duration: Date.now() - this.startTime,
    };
    
    const logFile = path.join(deploymentPath, `deployment-log-${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    this.info(`Deployment log saved to: ${logFile}`);
  }
}

// ==================== Main Deployment Function ====================

async function main() {
  const logger = new DeploymentLogger();
  
  logger.section("DID PROTOCOL DEPLOYMENT");
  logger.info(`Network: ${hre.network.name} (Chain ID: ${hre.network.config.chainId})`);
  logger.info(`Deployer Address: ${(await hre.ethers.getSigners())[0].address}`);
  
  // Get deployment configuration
  const networkName = hre.network.name;
  const networkConfig = CONFIG.networks[networkName] || CONFIG.networks.localhost;
  const isLocalNetwork = networkName === "localhost" || networkName === "hardhat";
  
  logger.info(`Deploying to: ${networkConfig.name}`);
  logger.info(`Verification ${CONFIG.options.verify && !isLocalNetwork ? "enabled" : "disabled"}`);
  
  // Get deployer signer
  const [deployer] = await hre.ethers.getSigners();
  const deployerBalance = await deployer.getBalance();
  logger.info(`Deployer Balance: ${hre.ethers.utils.formatEther(deployerBalance)} ETH`);
  
  if (deployerBalance.lt(hre.ethers.utils.parseEther("0.1"))) {
    logger.warn("Low balance! Deployment may fail due to insufficient funds.");
  }
  
  // Deploy contracts
  const deployments = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    blockNumber: null,
    totalGasUsed: "0",
    contracts: {},
  };
  
  try {
    // ==================== 1. Deploy DIDRegistry ====================
    logger.section("DEPLOYING DIDRegistry");
    
    const DIDRegistry = await hre.ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();
    await didRegistry.deployed();
    
    const didRegistryTx = await didRegistry.deployTransaction.wait(CONFIG.options.waitConfirmations);
    
    deployments.contracts.didRegistry = {
      address: didRegistry.address,
      txHash: didRegistryTx.transactionHash,
      gasUsed: didRegistryTx.gasUsed.toString(),
      deployedAt: new Date().toISOString(),
      explorerUrl: networkConfig.explorer ? `${networkConfig.explorer}/address/${didRegistry.address}` : null,
    };
    
    logger.success(`DIDRegistry deployed at: ${didRegistry.address}`);
    logger.info(`Transaction hash: ${didRegistryTx.transactionHash}`);
    logger.info(`Gas used: ${didRegistryTx.gasUsed.toString()}`);
    
    // ==================== 2. Deploy ZKPVerifier ====================
    logger.section("DEPLOYING ZKPVerifier");
    
    const ZKPVerifier = await hre.ethers.getContractFactory("ZKPVerifier");
    const zkpVerifier = await ZKPVerifier.deploy(didRegistry.address);
    await zkpVerifier.deployed();
    
    const zkpVerifierTx = await zkpVerifier.deployTransaction.wait(CONFIG.options.waitConfirmations);
    
    deployments.contracts.zkpVerifier = {
      address: zkpVerifier.address,
      txHash: zkpVerifierTx.transactionHash,
      gasUsed: zkpVerifierTx.gasUsed.toString(),
      deployedAt: new Date().toISOString(),
      explorerUrl: networkConfig.explorer ? `${networkConfig.explorer}/address/${zkpVerifier.address}` : null,
    };
    
    logger.success(`ZKPVerifier deployed at: ${zkpVerifier.address}`);
    logger.info(`Transaction hash: ${zkpVerifierTx.transactionHash}`);
    logger.info(`Gas used: ${zkpVerifierTx.gasUsed.toString()}`);
    
    // ==================== 3. Deploy CredentialNFT ====================
    logger.section("DEPLOYING CredentialNFT");
    
    const CredentialNFT = await hre.ethers.getContractFactory("CredentialNFT");
    const credentialNFT = await CredentialNFT.deploy(
      "DID Credential",
      "DIDC",
      didRegistry.address,
      zkpVerifier.address
    );
    await credentialNFT.deployed();
    
    const credentialNFTTx = await credentialNFT.deployTransaction.wait(CONFIG.options.waitConfirmations);
    
    deployments.contracts.credentialNFT = {
      address: credentialNFT.address,
      txHash: credentialNFTTx.transactionHash,
      gasUsed: credentialNFTTx.gasUsed.toString(),
      deployedAt: new Date().toISOString(),
      explorerUrl: networkConfig.explorer ? `${networkConfig.explorer}/address/${credentialNFT.address}` : null,
    };
    
    logger.success(`CredentialNFT deployed at: ${credentialNFT.address}`);
    logger.info(`Transaction hash: ${credentialNFTTx.transactionHash}`);
    logger.info(`Gas used: ${credentialNFTTx.gasUsed.toString()}`);
    
    // ==================== 4. Grant Roles ====================
    logger.section("CONFIGURING ROLES");
    
    // Grant ISSUER_ROLE to deployer
    const ISSUER_ROLE = await credentialNFT.ISSUER_ROLE();
    const REVOKER_ROLE = await credentialNFT.REVOKER_ROLE();
    const VERIFIER_ROLE = await credentialNFT.VERIFIER_ROLE();
    
    logger.info(`ISSUER_ROLE: ${ISSUER_ROLE}`);
    logger.info(`REVOKER_ROLE: ${REVOKER_ROLE}`);
    logger.info(`VERIFIER_ROLE: ${VERIFIER_ROLE}`);
    
    // Grant roles to deployer
    let tx = await credentialNFT.grantRole(ISSUER_ROLE, deployer.address);
    await tx.wait();
    logger.success(`Granted ISSUER_ROLE to ${deployer.address}`);
    
    tx = await credentialNFT.grantRole(REVOKER_ROLE, deployer.address);
    await tx.wait();
    logger.success(`Granted REVOKER_ROLE to ${deployer.address}`);
    
    tx = await credentialNFT.grantRole(VERIFIER_ROLE, deployer.address);
    await tx.wait();
    logger.success(`Granted VERIFIER_ROLE to ${deployer.address}`);
    
    // ==================== 5. Configure ZKPVerifier ====================
    logger.section("CONFIGURING ZKPVerifier");
    
    // Register verification keys (will need to be updated with real keys)
    // const PROOF_TYPE_AGE = 0;
    // const PROOF_TYPE_IDENTITY = 1;
    // const PROOF_TYPE_CREDENTIAL = 2;
    // 
    // const mockVkHash = hre.ethers.utils.keccak256(
    //   hre.ethers.utils.toUtf8Bytes("mock-verification-key")
    // );
    // 
    // await zkpVerifier.registerVerificationKey(PROOF_TYPE_AGE, mockVkHash);
    // await zkpVerifier.registerVerificationKey(PROOF_TYPE_IDENTITY, mockVkHash);
    // await zkpVerifier.registerVerificationKey(PROOF_TYPE_CREDENTIAL, mockVkHash);
    // logger.success("Registered verification keys");
    
    // Set verification cooldown
    // await zkpVerifier.setVerificationCooldown(60);
    // logger.success("Verification cooldown set to 60 seconds");
    
    // ==================== 6. Save Deployment Data ====================
    logger.section("SAVING DEPLOYMENT DATA");
    
    deployments.blockNumber = await hre.ethers.provider.getBlockNumber();
    deployments.totalGasUsed = Object.values(deployments.contracts)
      .reduce((sum, c) => sum + BigInt(c.gasUsed || 0), BigInt(0))
      .toString();
    
    // Create deployment directory
    const deploymentDir = path.join(__dirname, "../../deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    // Save deployment data
    const deploymentData = {
      deploymentId: `deployment-${Date.now()}`,
      network: hre.network.name,
      chainId: hre.network.config.chainId,
      timestamp: new Date().toISOString(),
      blockNumber: deployments.blockNumber,
      totalGasUsed: deployments.totalGasUsed,
      contracts: deployments.contracts,
      config: {
        waitConfirmations: CONFIG.options.waitConfirmations,
        verified: CONFIG.options.verify && !isLocalNetwork,
      },
    };
    
    // Save individual contract addresses to JSON
    const addressesFile = path.join(deploymentDir, `addresses-${hre.network.name}.json`);
    const addressesData = {
      network: hre.network.name,
      chainId: hre.network.config.chainId,
      updatedAt: new Date().toISOString(),
      contracts: {
        didRegistry: deployments.contracts.didRegistry.address,
        zkpVerifier: deployments.contracts.zkpVerifier.address,
        credentialNFT: deployments.contracts.credentialNFT.address,
      },
      explorerUrl: networkConfig.explorer,
    };
    fs.writeFileSync(addressesFile, JSON.stringify(addressesData, null, 2));
    logger.success(`Contract addresses saved to: ${addressesFile}`);
    
    // Save full deployment data
    const deploymentFile = path.join(deploymentDir, `deployment-${hre.network.name}-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
    logger.success(`Deployment data saved to: ${deploymentFile}`);
    
    // ==================== 7. Print Summary ====================
    logger.printDeploymentSummary(deployments);
    
    // ==================== 8. Save Deployment Log ====================
    logger.saveDeploymentLog(deploymentDir);
    
    // ==================== 9. Verify Contracts (if enabled) ====================
    if (CONFIG.options.verify && !isLocalNetwork) {
      logger.section("VERIFYING CONTRACTS");
      
      try {
        await verifyContract("DIDRegistry", didRegistry.address, []);
        await verifyContract("ZKPVerifier", zkpVerifier.address, [didRegistry.address]);
        await verifyContract(
          "CredentialNFT", 
          credentialNFT.address, 
          ["DID Credential", "DIDC", didRegistry.address, zkpVerifier.address]
        );
        logger.success("All contracts verified on Etherscan!");
      } catch (error) {
        logger.error(`Verification failed: ${error.message}`);
        logger.warn("You can verify contracts manually using:\n" +
          `npx hardhat verify --network ${hre.network.name} ${didRegistry.address}\n` +
          `npx hardhat verify --network ${hre.network.name} ${zkpVerifier.address} ${didRegistry.address}\n` +
          `npx hardhat verify --network ${hre.network.name} ${credentialNFT.address} "DID Credential" "DIDC" ${didRegistry.address} ${zkpVerifier.address}`
        );
      }
    }
    
    // ==================== 10. Export for Frontend ====================
    logger.section("EXPORTING FOR FRONTEND");
    
    const frontendEnv = path.join(__dirname, "../../frontend/.env");
    if (fs.existsSync(frontendEnv)) {
      const envContent = fs.readFileSync(frontendEnv, "utf8");
      const updatedContent = envContent
        .replace(/VITE_DID_REGISTRY_ADDRESS=.*/, `VITE_DID_REGISTRY_ADDRESS=${didRegistry.address}`)
        .replace(/VITE_ZKP_VERIFIER_ADDRESS=.*/, `VITE_ZKP_VERIFIER_ADDRESS=${zkpVerifier.address}`)
        .replace(/VITE_CREDENTIAL_NFT_ADDRESS=.*/, `VITE_CREDENTIAL_NFT_ADDRESS=${credentialNFT.address}`);
      
      fs.writeFileSync(frontendEnv, updatedContent);
      logger.success(`Updated frontend .env file with contract addresses`);
    } else {
      // Create .env file with contract addresses
      const envTemplate = `
# Contract Addresses
VITE_DID_REGISTRY_ADDRESS=${didRegistry.address}
VITE_ZKP_VERIFIER_ADDRESS=${zkpVerifier.address}
VITE_CREDENTIAL_NFT_ADDRESS=${credentialNFT.address}

# Network Configuration
VITE_CHAIN_ID=${hre.network.config.chainId}
VITE_CHAIN_NAME=${networkConfig.name}
VITE_CHAIN_RPC_URL=${hre.network.config.url || "http://localhost:8545"}
`;
      fs.writeFileSync(path.join(__dirname, "../../frontend/.env"), envTemplate.trim());
      logger.success(`Created frontend .env file with contract addresses`);
    }
    
    logger.section("DEPLOYMENT COMPLETE! 🚀");
    logger.success("All contracts have been successfully deployed.");
    logger.info("You can now interact with the DID Protocol contracts.");
    
    return deployments;
    
  } catch (error) {
    logger.error(`Deployment failed: ${error.message}`);
    console.error(error);
    
    // Save error log
    const deploymentDir = path.join(__dirname, "../../deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const errorLog = {
      timestamp: new Date().toISOString(),
      network: hre.network.name,
      error: error.message,
      stack: error.stack,
      logs: logger.logs,
    };
    
    fs.writeFileSync(
      path.join(deploymentDir, `deployment-error-${Date.now()}.json`),
      JSON.stringify(errorLog, null, 2)
    );
    
    throw error;
  }
}

// ==================== Helper Functions ====================

/**
 * Verify a contract on Etherscan
 */
async function verifyContract(contractName, address, constructorArgs) {
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
      contract: `contracts/${contractName}.sol:${contractName}`,
    });
    console.log(chalk.green(`✅ Verified ${contractName} at ${address}`));
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(chalk.yellow(`⚠️ ${contractName} already verified`));
    } else {
      throw error;
    }
  }
}

/**
 * Export deployment data for frontend
 */
function exportDeploymentData(deployments, networkName) {
  const exportPath = path.join(__dirname, "../../frontend/src/config/contracts.js");
  const contractAddresses = {};
  
  for (const [name, data] of Object.entries(deployments.contracts)) {
    contractAddresses[name.toUpperCase() + "_ADDRESS"] = data.address;
  }
  
  const configContent = `// Auto-generated deployment configuration
// Network: ${networkName}
// Deployed: ${new Date().toISOString()}

export const CONTRACT_ADDRESSES = ${JSON.stringify(contractAddresses, null, 2)};

export const NETWORK_CONFIG = {
  chainId: ${hre.network.config.chainId},
  name: "${networkName}",
  explorerUrl: "${CONFIG.networks[networkName]?.explorer || ""}",
};
`;
  
  fs.writeFileSync(exportPath, configContent);
}

// ==================== Run Deployment ====================

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
