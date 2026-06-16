# Use Cases

## 1. Local Development & Testing

Deploy contracts to a local Hardhat network for rapid development, debugging, and automated testing.

### Steps

```bash
# Start local node
npx hardhat node

# Deploy contracts
npx hardhat run scripts/deploy/deploy_contracts.js --network localhost
```

### Benefits

* Fast deployment cycles
* No gas costs
* Ideal for unit and integration testing
* Easy contract debugging

---

## 2. Testnet Deployment (Sepolia)

Deploy contracts to the Sepolia Ethereum testnet before moving to production.

### Steps

```bash
npx hardhat run scripts/deploy/deploy_contracts.js --network sepolia
```

### Benefits

* Test with real blockchain infrastructure
* Validate contract interactions
* Simulate production environments
* Verify frontend and backend integrations

---

## 3. Contract Verification

Verify deployed contracts on a block explorer after deployment to make source code publicly accessible and auditable.

### Steps

```bash
npx hardhat run scripts/deploy/deploy_contracts.js --network sepolia
npx hardhat verify
```

### Benefits

* Increased transparency
* Easier debugging and monitoring
* Public source code verification
* Improved trust for users and auditors

---

## 4. CI/CD and Automated Deployments

Use predefined npm scripts to simplify deployment workflows in development and continuous integration pipelines.

### Local Deployment

```bash
npm run deploy
```

### Sepolia Deployment

```bash
npm run deploy:sepolia
```

### Benefits

* Consistent deployment commands
* Reduced manual errors
* Easy integration with GitHub Actions, GitLab CI, or Jenkins
* Faster team onboarding

---

## Example Workflow

1. Develop and test contracts locally.
2. Deploy to the local Hardhat network.
3. Run automated tests.
4. Deploy to Sepolia for staging validation.
5. Verify contracts on the block explorer.
6. Proceed to mainnet deployment when testing is complete.
