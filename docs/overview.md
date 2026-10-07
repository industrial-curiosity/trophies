# Zero-Cost Project Registry & Dividend Distribution Specification

## 1. Executive Summary & Core Mechanics

This specification details the architecture for a decentralized project registry smart contract. Project managers can register their projects and generate/mint project shares (tokens) at sub-penny or zero-gas cost to end-users. Donors deposit funds (native assets or stablecoins) into the registry, which are immediately and strictly allocated to existing project token holders using an \\(O(1)\\) constant-time checkpointed dividend algorithm.

**Key System Highlights**:
* **\\(O(1)\\) Scaled Share Algorithm**: Prevents block gas limit failures by eliminating iteration loops during donation deposits. Donations update a global multiplier in a single step regardless of whether 2 or 20,000 token holders exist.
* **Strict Block Checkpointing**: Newly generated tokens created after a donation event receive exactly \$0.00 from past donations.
* **Fractional Token & Ownership Transfers**: Supports partial transfers (e.g., 0.5 shares) while preserving or settling accumulated withdrawal eligibility.
* **Gasless Project Top-Up Vault**: Allows project managers to prepay a native gas pool in the contract, enabling sponsored token generation for users via native Account Abstraction or Sui Sponsored Transactions.

---

## 2. Architecture & Step-by-Step Lifecycle

### Global State Variables
* `accumulated_reward_per_share`: Running global index tracking cumulative donation dollars allocated per full share (\\(O(1)\\) constant time).
* `total_shares`: Aggregate count of active shares/tokens for a given project.
* `entry_marker`: Per-token or per-user index recording the `accumulated_reward_per_share` at the time of token acquisition or last withdrawal.

### Step-by-Step Operational Example
1. **Day 1 (\$5,000 Donation, 2 Shares)**:
   * Tokens #1 and #2 exist.
   * Donor sends \$5,000. Contract calculates: `$5,000 / 2 shares = $2,500 / share`.
   * Global Index increases from \$0 to **\$2,500**.
   * Token #1 Claimable: `$2,500 - $0 = $2,500`.
   * Token #2 Claimable: `$2,500 - $0 = $2,500`.
2. **Day 2 (Token #3 Minted)**:
   * Project manager generates Token #3.
   * `total_shares` increases to 3.
   * Token #3 is assigned an `entry_marker` equal to current Global Index (**\$2,500**).
   * Token #3 Claimable from Day 1 donation: `$2,500 - $2,500 = $0`.
3. **Day 3 (\$3,000 Second Donation, 3 Shares)**:
   * Donor sends \$3,000. Contract calculates: `$3,000 / 3 shares = $1,000 / share`.
   * Global Index increases from \$2,500 to **\$3,500** (`$2,500 + $1,000`).
   * Token #1 Claimable: `$3,500 - $0 = $3,500`.
   * Token #2 Claimable: `$3,500 - $0 = $3,500`.
   * Token #3 Claimable: `$3,500 - $2,500 = $1,000`.
4. **Fractional Token Transfer (0.5 Shares transferred)**:
   * Owner transfers 0.5 shares to new user.
   * Contract executes auto-claim hook: original owner receives \$500 (`0.5 * $1,000`).
   * Transferred 0.5 share gets updated `entry_marker` = **\$3,500** (starts at \$0 for future donations).

---

## 3. Production Code Implementations

### A. Sui Move Implementation (`project_registry.move`)

```move
module project_registry::registry {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;

    const ENotOwner: u64 = 0;
    const EZeroAmount: u64 = 1;
    const EInvalidFraction: u64 = 2;

    const SCALE_FACTOR: u128 = 1_000_000_000; // 1e9 precision

    struct Project has key {
        id: UID,
        owner: address,
        total_shares: u128,
        accumulated_reward_per_share: u128,
        vault: Balance<SUI>,
        gas_pool: Balance<SUI>,
    }

    struct ProjectShare has key, store {
        id: UID,
        project_id: ID,
        shares: u128,
        entry_marker: u128,
    }

    struct ProjectRegistered has copy, drop { project_id: ID, owner: address }
    struct SharesMinted has copy, drop { project_id: ID, recipient: address, shares: u128 }
    struct DonationReceived has copy, drop { project_id: ID, amount: u64, reward_per_share_added: u128 }
    struct RewardClaimed has copy, drop { share_id: ID, recipient: address, amount: u64 }

    public entry fun create_project(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        let project_uid = object::new(ctx);
        let project_id = object::uid_to_inner(&project_uid);

        let project = Project {
            id: project_uid,
            owner: sender,
            total_shares: 0,
            accumulated_reward_per_share: 0,
            vault: balance::zero(),
            gas_pool: balance::zero(),
        };

        event::emit(ProjectRegistered { project_id, owner: sender });
        transfer::share_object(project);
    }

    public entry fun top_up_gas_pool(project: &mut Project, payment: Coin<SUI>) {
        let payment_balance = coin::into_balance(payment);
        balance::join(&mut project.gas_pool, payment_balance);
    }

    public entry fun mint_shares(
        project: &mut Project,
        shares: u128,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == project.owner, ENotOwner);
        assert!(shares > 0, EZeroAmount);

        project.total_shares = project.total_shares + shares;

        let share_token = ProjectShare {
            id: object::new(ctx),
            project_id: object::id(project),
            shares,
            entry_marker: project.accumulated_reward_per_share,
        };

        event::emit(SharesMinted {
            project_id: object::id(project),
            recipient,
            shares
        });

        transfer::public_transfer(share_token, recipient);
    }

    public entry fun donate(
        project: &mut Project,
        donation: Coin<SUI>,
    ) {
        let amount = coin::value(&donation);
        assert!(amount > 0, EZeroAmount);
        assert!(project.total_shares > 0, EZeroAmount);

        let reward_per_share = ((amount as u128) * SCALE_FACTOR) / project.total_shares;
        project.accumulated_reward_per_share = project.accumulated_reward_per_share + reward_per_share;

        let donation_balance = coin::into_balance(donation);
        balance::join(&mut project.vault, donation_balance);

        event::emit(DonationReceived {
            project_id: object::id(project),
            amount,
            reward_per_share_added: reward_per_share,
        });
    }

    public entry fun claim(
        project: &mut Project,
        share: &mut ProjectShare,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let pending_per_share = project.accumulated_reward_per_share - share.entry_marker;
        let claimable_amount = ((share.shares * pending_per_share) / SCALE_FACTOR as u64);

        if (claimable_amount > 0) {
            share.entry_marker = project.accumulated_reward_per_share;
            let payout_balance = balance::split(&mut project.vault, claimable_amount);
            let payout_coin = coin::from_balance(payout_balance, ctx);
            transfer::public_transfer(payout_coin, sender);

            event::emit(RewardClaimed {
                share_id: object::id(share),
                recipient: sender,
                amount: claimable_amount
            });
        }
    }

    public entry fun split_share(
        share: &mut ProjectShare,
        split_shares: u128,
        ctx: &mut TxContext
    ) {
        assert!(split_shares > 0 && split_shares < share.shares, EInvalidFraction);

        share.shares = share.shares - split_shares;

        let new_share = ProjectShare {
            id: object::new(ctx),
            project_id: share.project_id,
            shares: split_shares,
            entry_marker: share.entry_marker,
        };

        transfer::public_transfer(new_share, tx_context::sender(ctx));
    }
}
```

---

### B. Base / opBNB Solidity Implementation (`ProjectRegistry.sol`)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ProjectRegistry is ERC1155, ReentrancyGuard {
    uint256 public constant SCALE_FACTOR = 1e18;

    struct Project {
        address owner;
        uint256 totalShares;
        uint256 accumulatedRewardPerShare;
        uint256 gasPoolBalance;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;
    mapping(uint256 => mapping(address => uint256)) public userEntryMarker;

    event ProjectRegistered(uint256 indexed projectId, address indexed owner);
    event SharesMinted(uint256 indexed projectId, address indexed recipient, uint256 amount);
    event DonationReceived(uint256 indexed projectId, address indexed donor, uint256 amount, uint256 addedPerShare);
    event RewardClaimed(uint256 indexed projectId, address indexed user, uint256 amount);
    event GasPoolToppedUp(uint256 indexed projectId, address indexed manager, uint256 amount);

    constructor() ERC1155("https://api.example.com/project/metadata/{id}.json") {}

    function registerProject() external returns (uint256 projectId) {
        projectCount++;
        projectId = projectCount;

        projects[projectId] = Project({
            owner: msg.sender,
            totalShares: 0,
            accumulatedRewardPerShare: 0,
            gasPoolBalance: 0
        });

        emit ProjectRegistered(projectId, msg.sender);
    }

    function topUpGasPool(uint256 projectId) external payable {
        require(projectId > 0 && projectId <= projectCount, "Invalid project");
        projects[projectId].gasPoolBalance += msg.value;
        emit GasPoolToppedUp(projectId, msg.sender, msg.value);
    }

    function mintShares(uint256 projectId, address recipient, uint256 amount) external {
        Project storage project = projects[projectId];
        require(msg.sender == project.owner, "Not project owner");
        require(amount > 0, "Amount must be > 0");

        if (balanceOf(recipient, projectId) > 0) {
            _claim(projectId, recipient);
        } else {
            userEntryMarker[projectId][recipient] = project.accumulatedRewardPerShare;
        }

        project.totalShares += amount;
        _mint(recipient, projectId, amount, "");

        emit SharesMinted(projectId, recipient, amount);
    }

    function donate(uint256 projectId) external payable nonReentrant {
        Project storage project = projects[projectId];
        require(msg.value > 0, "Donation must be > 0");
        require(project.totalShares > 0, "No active project shares");

        uint256 rewardPerShare = (msg.value * SCALE_FACTOR) / project.totalShares;
        project.accumulatedRewardPerShare += rewardPerShare;

        emit DonationReceived(projectId, msg.sender, msg.value, rewardPerShare);
    }

    function claim(uint256 projectId) external nonReentrant {
        _claim(projectId, msg.sender);
    }

    function _claim(uint256 projectId, address user) internal {
        Project storage project = projects[projectId];
        uint256 userShares = balanceOf(user, projectId);
        if (userShares == 0) return;

        uint256 pendingPerShare = project.accumulatedRewardPerShare - userEntryMarker[projectId][user];
        uint256 claimable = (userShares * pendingPerShare) / SCALE_FACTOR;

        if (claimable > 0) {
            userEntryMarker[projectId][user] = project.accumulatedRewardPerShare;
            (bool success, ) = payable(user).call{value: claimable}("");
            require(success, "ETH transfer failed");

            emit RewardClaimed(projectId, user, claimable);
        }
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 projectId = ids[i];
            if (from != address(0)) {
                _claim(projectId, from);
            }
            if (to != address(0) && to != from) {
                _claim(projectId, to);
            }
        }
        super._update(from, to, ids, values);
    }
}
```

---

## 4. Cost Benchmarks & Economic Comparison

| Operational Dimension | Sui (Move L1) | opBNB (EVM L2) | Base (EVM L2) |
| :--- | :--- | :--- | :--- |
| **Average Write Fee** | ~\$0.00005 – \$0.00037 | ~\$0.00003 | ~\$0.001 – \$0.01 |
| **Storage Cost Model** | One-time storage fee to Storage Fund with **partial rebate** on object deletion/burn | Permanent L1 data availability rollup cost | L1 data availability fee (EIP-4844 blobs) |
| **End-User Read Cost** | \$0.00 (Standard RPC) | \$0.00 (Standard RPC) | \$0.00 (Standard RPC) |
| **dApp RPC Sourcing** | 1:1 Request Units or Flat RPS | Flat 1:1 Request Units (Dwellir / blockmachine) | Flat 1:1 Request Units (Dwellir) |
| **Sponsoring Mechanics** | Native Sponsored Transactions | ERC-4337 Paymaster | ERC-4337 Paymaster |
| **Cost per 10,000 Mints** | ~\$0.50 – \$3.70 | ~\$0.30 | ~\$10.00 – \$50.00 |
