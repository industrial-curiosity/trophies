// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Network-local, immutable registry. Amounts use each asset's base units.
contract ProjectRegistry is ERC1155, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant SHARE_UNIT = 1e18;
    uint256 public constant REWARD_SCALE = 1e36;
    uint256 public constant MAX_ACCOUNTING_AMOUNT = type(uint128).max;
    address public immutable owner;
    uint256 public projectCount;
    bool public operationsPaused;
    bool public withdrawalsPaused;

    struct Project {
        address manager;
        uint256 supply;
        bool managerPaused;
        bool ownerPaused;
        bool withdrawalsPaused;
        address[] assets;
    }

    struct Asset {
        bool enabled;
        uint256 index;
        uint256 holderVault;
        uint256 fees;
        uint256 feeRemainder;
        uint256 received;
    }

    struct Account {
        uint256 checkpoint;
        uint256 scaledCredit;
    }

    mapping(uint256 => Project) private projects;
    mapping(uint256 => mapping(address => Asset)) private assets;
    mapping(uint256 => mapping(address => mapping(address => Account))) private accounts;

    error Unauthorized();
    error InvalidProject();
    error InvalidAmount();
    error InvalidRecipient();
    error Paused();
    error UnsupportedAsset();
    error PayoutFailed();
    error AccountingLimit();

    event ProjectRegistered(uint256 indexed projectId, address indexed manager);
    event AssetEnabled(uint256 indexed projectId, address indexed asset);
    event TrophiesGenerated(
        uint256 indexed projectId,
        address indexed issuer,
        address indexed recipient,
        uint256 quantity,
        string description,
        string externalReference
    );
    event DonationReceived(
        uint256 indexed projectId, address indexed asset, address indexed donor, uint256 gross, uint256 fee, uint256 net
    );
    event Claimed(uint256 indexed projectId, address indexed asset, address indexed holder, uint256 amount);
    event FeesCollected(uint256 indexed projectId, address indexed asset, uint256 amount);
    event ManagerPauseChanged(uint256 indexed projectId, bool paused);
    event OwnerPauseChanged(uint256 indexed projectId, bool operations, bool withdrawals);
    event GlobalPauseChanged(bool operations, bool withdrawals);

    constructor(address platformOwner) ERC1155("") {
        if (platformOwner == address(0) || platformOwner == address(this)) revert InvalidRecipient();
        owner = platformOwner;
    }

    function registerProject() external returns (uint256 id) {
        if (operationsPaused) revert Paused();
        id = ++projectCount;
        projects[id].manager = msg.sender;
        _enableAsset(id, address(0));
        emit ProjectRegistered(id, msg.sender);
    }

    function enableAsset(uint256 id, address asset) external {
        Project storage p = _project(id);
        if (msg.sender != p.manager) revert Unauthorized();
        _requireActive(p);
        if (asset == address(this) || (asset != address(0) && asset.code.length == 0)) revert UnsupportedAsset();
        _enableAsset(id, asset);
    }

    function mint(
        uint256 id,
        address recipient,
        uint256 quantity,
        string calldata description,
        string calldata externalReference
    ) external nonReentrant {
        Project storage p = _project(id);
        if (msg.sender != p.manager) revert Unauthorized();
        if (quantity == 0) revert InvalidAmount();
        _mint(recipient, id, quantity, "");
        emit TrophiesGenerated(id, msg.sender, recipient, quantity, description, externalReference);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes memory data)
        public
        override
        nonReentrant
    {
        if (to == address(0) || to == address(this)) revert InvalidRecipient();
        super.safeTransferFrom(from, to, id, value, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values,
        bytes memory data
    ) public override nonReentrant {
        if (to == address(0) || to == address(this)) revert InvalidRecipient();
        super.safeBatchTransferFrom(from, to, ids, values, data);
    }

    function donateNative(uint256 id) external payable nonReentrant {
        _donate(id, address(0), msg.value);
    }

    function donateToken(uint256 id, address token, uint256 amount) external nonReentrant {
        if (token == address(0)) revert UnsupportedAsset();
        _requireDonation(id, token, amount);
        IERC20 coin = IERC20(token);
        uint256 beforeBalance = coin.balanceOf(address(this));
        coin.safeTransferFrom(msg.sender, address(this), amount);
        if (coin.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedAsset();
        _donate(id, token, amount);
    }

    function claim(uint256 id, address asset) external nonReentrant returns (uint256 amount) {
        Project storage p = _project(id);
        _requireWithdrawals(p);
        if (!assets[id][asset].enabled) revert UnsupportedAsset();
        _accrue(id, asset, msg.sender, balanceOf(msg.sender, id));
        Account storage a = accounts[id][asset][msg.sender];
        amount = a.scaledCredit / REWARD_SCALE;
        if (amount == 0) return 0;
        a.scaledCredit %= REWARD_SCALE;
        assets[id][asset].holderVault -= amount;
        emit Claimed(id, asset, msg.sender, amount);
        _pay(asset, msg.sender, amount);
    }

    function collectFees(uint256 id, address asset) external nonReentrant returns (uint256 amount) {
        if (msg.sender != owner) revert Unauthorized();
        _requireWithdrawals(_project(id));
        if (!assets[id][asset].enabled) revert UnsupportedAsset();
        amount = assets[id][asset].fees;
        if (amount == 0) return 0;
        assets[id][asset].fees = 0;
        emit FeesCollected(id, asset, amount);
        _pay(asset, owner, amount);
    }

    function setManagerPause(uint256 id, bool paused) external {
        Project storage p = _project(id);
        if (msg.sender != p.manager) revert Unauthorized();
        p.managerPaused = paused;
        emit ManagerPauseChanged(id, paused);
    }

    function setOwnerPause(uint256 id, bool operational, bool withdrawal) external {
        if (msg.sender != owner) revert Unauthorized();
        Project storage p = _project(id);
        p.ownerPaused = operational;
        p.withdrawalsPaused = withdrawal;
        emit OwnerPauseChanged(id, operational, withdrawal);
    }

    function setGlobalPause(bool operational, bool withdrawal) external {
        if (msg.sender != owner) revert Unauthorized();
        operationsPaused = operational;
        withdrawalsPaused = withdrawal;
        emit GlobalPauseChanged(operational, withdrawal);
    }

    function projectInfo(uint256 id)
        external
        view
        returns (
            address manager,
            uint256 supply,
            bool operationalPause,
            bool withdrawalPause,
            address[] memory enabledAssets
        )
    {
        Project storage p = _project(id);
        return (
            p.manager,
            p.supply,
            operationsPaused || p.managerPaused || p.ownerPaused,
            withdrawalsPaused || p.withdrawalsPaused,
            p.assets
        );
    }

    function assetInfo(uint256 id, address asset) external view returns (Asset memory) {
        _project(id);
        return assets[id][asset];
    }

    function entitlement(uint256 id, address asset, address holder)
        external
        view
        returns (uint256 whole, uint256 scaledRemainder)
    {
        _project(id);
        if (!assets[id][asset].enabled) revert UnsupportedAsset();
        Account storage a = accounts[id][asset][holder];
        uint256 credit = a.scaledCredit + balanceOf(holder, id) * (assets[id][asset].index - a.checkpoint);
        return (credit / REWARD_SCALE, credit % REWARD_SCALE);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (to == address(0) || to == address(this)) revert InvalidRecipient();
        for (uint256 i; i < ids.length; ++i) {
            Project storage p = _project(ids[i]);
            _requireActive(p);
            if (values[i] == 0) revert InvalidAmount();
            if (from != address(0)) _settle(ids[i], from);
            if (to != from) _settle(ids[i], to);
            if (from == address(0)) {
                if (values[i] > MAX_ACCOUNTING_AMOUNT - p.supply) revert AccountingLimit();
                p.supply += values[i];
            }
        }
        super._update(from, to, ids, values);
    }

    function _settle(uint256 id, address holder) private {
        uint256 balance = balanceOf(holder, id);
        address[] storage list = projects[id].assets;
        for (uint256 i; i < list.length; ++i) {
            _accrue(id, list[i], holder, balance);
        }
    }

    function _accrue(uint256 id, address asset, address holder, uint256 balance) private {
        Account storage a = accounts[id][asset][holder];
        uint256 index = assets[id][asset].index;
        a.scaledCredit += balance * (index - a.checkpoint);
        a.checkpoint = index;
    }

    function _enableAsset(uint256 id, address asset) private {
        if (assets[id][asset].enabled) return;
        assets[id][asset].enabled = true;
        projects[id].assets.push(asset);
        emit AssetEnabled(id, asset);
    }

    function _requireDonation(uint256 id, address asset, uint256 amount) private view {
        Project storage p = _project(id);
        _requireActive(p);
        if (!assets[id][asset].enabled) revert UnsupportedAsset();
        if (amount == 0 || p.supply == 0) revert InvalidAmount();
        if (amount > MAX_ACCOUNTING_AMOUNT - assets[id][asset].received) revert AccountingLimit();
    }

    function _donate(uint256 id, address asset, uint256 amount) private {
        _requireDonation(id, asset, amount);
        Asset storage a = assets[id][asset];
        uint256 residue = amount % 200 + a.feeRemainder;
        uint256 fee = amount / 200 + residue / 200;
        a.feeRemainder = residue % 200;
        uint256 net = amount - fee;
        a.received += amount;
        a.fees += fee;
        a.holderVault += net;
        a.index += Math.mulDiv(net, REWARD_SCALE, projects[id].supply);
        emit DonationReceived(id, asset, msg.sender, amount, fee, net);
    }

    function _pay(address asset, address recipient, uint256 amount) private {
        if (asset == address(0)) {
            (bool success,) = payable(recipient).call{value: amount}("");
            if (!success) revert PayoutFailed();
        } else {
            IERC20 coin = IERC20(asset);
            uint256 vaultBefore = coin.balanceOf(address(this));
            uint256 recipientBefore = coin.balanceOf(recipient);
            coin.safeTransfer(recipient, amount);
            if (
                coin.balanceOf(address(this)) + amount != vaultBefore
                    || coin.balanceOf(recipient) != recipientBefore + amount
            ) revert UnsupportedAsset();
        }
    }

    function _project(uint256 id) private view returns (Project storage p) {
        p = projects[id];
        if (p.manager == address(0)) revert InvalidProject();
    }

    function _requireActive(Project storage p) private view {
        if (operationsPaused || p.ownerPaused || p.managerPaused) revert Paused();
    }

    function _requireWithdrawals(Project storage p) private view {
        if (withdrawalsPaused || p.withdrawalsPaused) revert Paused();
    }
}
