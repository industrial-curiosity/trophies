// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ProjectRegistry} from "../src/ProjectRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function prank(address) external;
    function deal(address, uint256) external;
    function expectRevert(bytes4) external;
    function cool(address target) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

contract TestToken is ERC20 {
    bool public tax;
    bool public blocked;
    constructor() ERC20("Test", "TST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTax(bool value) external {
        tax = value;
    }

    function setBlocked(bool value) external {
        blocked = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked, "blocked");
        if (tax && from != address(0) && to != address(0) && value > 0) {
            super._update(from, address(0), 1);
            super._update(from, to, value - 1);
        } else {
            super._update(from, to, value);
        }
    }
}

contract RejectEther {
    receive() external payable {
        revert("reject");
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xf23a6e61;
    }
}

contract ReenterClaim {
    ProjectRegistry public registry;
    uint256 public project;
    bool public reentered;

    constructor(ProjectRegistry r, uint256 id) {
        registry = r;
        project = id;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xf23a6e61;
    }

    receive() external payable {
        (reentered,) = address(registry).call(abi.encodeCall(registry.claim, (project, address(0))));
    }
}

contract ProjectRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant UNIT = 1e18;
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA);
    address private constant OWNER = address(0xFEE);
    ProjectRegistry private registry;
    uint256 private project;

    function setUp() public {
        registry = new ProjectRegistry(OWNER);
        project = registry.registerProject();
        vm.deal(address(this), 1e30);
    }

    function _mint(address to, uint256 quantity) private {
        registry.mint(project, to, quantity, "contribution", "https://example.test/work");
    }

    function _whole(uint256 id, address asset, address holder) private view returns (uint256) {
        (uint256 value,) = registry.entitlement(id, asset, holder);
        return value;
    }

    function _eq(uint256 actual, uint256 expected) private pure {
        require(actual == expected, "unexpected amount");
    }

    function testPastEarningsStayWithSellerAfterFullTransfer() public {
        _mint(ALICE, UNIT);
        registry.donateNative{value: 20_000}(project);
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, BOB, project, UNIT, "");
        _eq(registry.balanceOf(ALICE, project), 0);
        _eq(_whole(project, address(0), ALICE), 19_900);
        _eq(_whole(project, address(0), BOB), 0);
        vm.prank(ALICE);
        registry.claim(project, address(0));
        _eq(ALICE.balance, 19_900);
        registry.donateNative{value: 20_000}(project);
        _eq(_whole(project, address(0), ALICE), 0);
        _eq(_whole(project, address(0), BOB), 19_900);
    }

    function testFractionalTransferAndMintDoNotGrantOldRewards() public {
        _mint(ALICE, 2 * UNIT);
        registry.donateNative{value: 20_000}(project);
        _mint(ALICE, UNIT);
        _mint(CAROL, UNIT);
        _eq(_whole(project, address(0), ALICE), 19_900);
        _eq(_whole(project, address(0), CAROL), 0);
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, BOB, project, UNIT / 2, "");
        registry.donateNative{value: 80_000}(project);
        _eq(_whole(project, address(0), ALICE), 69_650);
        _eq(_whole(project, address(0), BOB), 9_950);
        _eq(_whole(project, address(0), CAROL), 19_900);
    }

    function testRecipientKeepsExistingCredit() public {
        _mint(ALICE, UNIT);
        _mint(BOB, UNIT);
        registry.donateNative{value: 40_000}(project);
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, BOB, project, UNIT, "");
        _eq(_whole(project, address(0), ALICE), 19_900);
        _eq(_whole(project, address(0), BOB), 19_900);
    }

    function testSelfTransferDoesNotDuplicateCredit() public {
        _mint(ALICE, UNIT);
        registry.donateNative{value: 20_000}(project);
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, ALICE, project, UNIT / 2, "");
        _eq(registry.balanceOf(ALICE, project), UNIT);
        _eq(_whole(project, address(0), ALICE), 19_900);
    }

    function testGenerationRecord() public {
        vm.recordLogs();
        _mint(ALICE, UNIT / 2);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory record = logs[logs.length - 1];
        require(
            record.topics[0] == keccak256("TrophiesGenerated(uint256,address,address,uint256,string,string)"),
            "missing mint event"
        );
        _eq(uint256(record.topics[1]), project);
        _eq(uint256(record.topics[2]), uint160(address(this)));
        _eq(uint256(record.topics[3]), uint160(ALICE));
        (uint256 quantity, string memory description, string memory externalReference) =
            abi.decode(record.data, (uint256, string, string));
        _eq(quantity, UNIT / 2);
        require(keccak256(bytes(description)) == keccak256("contribution"), "description missing");
        require(keccak256(bytes(externalReference)) == keccak256("https://example.test/work"), "reference missing");
    }

    function testUnauthorizedMintAndAssetRegistration() public {
        vm.expectRevert(ProjectRegistry.Unauthorized.selector);
        vm.prank(BOB);
        registry.mint(project, BOB, UNIT, "", "");
        TestToken token = new TestToken();
        vm.expectRevert(ProjectRegistry.Unauthorized.selector);
        vm.prank(BOB);
        registry.enableAsset(project, address(token));
    }

    function testInvalidProjectAndZeroDonation() public {
        vm.expectRevert(ProjectRegistry.InvalidProject.selector);
        registry.donateNative{value: 1}(999);
        vm.expectRevert(ProjectRegistry.InvalidAmount.selector);
        registry.donateNative{value: 1}(project);
        _mint(ALICE, UNIT);
        vm.expectRevert(ProjectRegistry.InvalidAmount.selector);
        registry.donateNative(project);
    }

    function testNoBurningOrUpgradeEntryPoint() public {
        _mint(ALICE, UNIT);
        vm.expectRevert(ProjectRegistry.InvalidRecipient.selector);
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, address(0), project, UNIT, "");
        (bool burn,) =
            address(registry).call(abi.encodeWithSignature("burn(address,uint256,uint256)", ALICE, project, UNIT));
        (bool upgrade,) = address(registry).call(abi.encodeWithSignature("upgradeTo(address)", ALICE));
        require(!burn && !upgrade, "forbidden entry point");
    }

    function testManagerPauseAllowsWithdrawal() public {
        _mint(ALICE, UNIT);
        registry.donateNative{value: 20_000}(project);
        registry.setManagerPause(project, true);
        vm.expectRevert(ProjectRegistry.Paused.selector);
        _mint(BOB, UNIT);
        vm.expectRevert(ProjectRegistry.Paused.selector);
        registry.donateNative{value: 1}(project);
        vm.expectRevert(ProjectRegistry.Paused.selector);
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, BOB, project, UNIT, "");
        vm.prank(ALICE);
        registry.claim(project, address(0));
        _eq(ALICE.balance, 19_900);
    }

    function testOwnerPauseCannotBeOverriddenByManager() public {
        _mint(ALICE, UNIT);
        registry.donateNative{value: 20_000}(project);
        vm.prank(OWNER);
        registry.setOwnerPause(project, true, true);
        registry.setManagerPause(project, false);
        vm.expectRevert(ProjectRegistry.Paused.selector);
        vm.prank(ALICE);
        registry.claim(project, address(0));
        _eq(_whole(project, address(0), ALICE), 19_900);
        vm.prank(OWNER);
        registry.setOwnerPause(project, false, false);
        vm.prank(ALICE);
        registry.claim(project, address(0));
        _eq(ALICE.balance, 19_900);
    }

    function testGlobalPauseAndOwnerAuthorization() public {
        vm.expectRevert(ProjectRegistry.Unauthorized.selector);
        registry.setGlobalPause(true, true);
        vm.prank(OWNER);
        registry.setGlobalPause(true, false);
        vm.expectRevert(ProjectRegistry.Paused.selector);
        registry.registerProject();
        vm.expectRevert(ProjectRegistry.Unauthorized.selector);
        registry.setOwnerPause(project, false, false);
    }

    function testFeeRemainderPreventsDonationSplitting() public {
        _mint(ALICE, UNIT);
        registry.donateNative{value: 199}(project);
        registry.donateNative{value: 1}(project);
        ProjectRegistry.Asset memory asset = registry.assetInfo(project, address(0));
        _eq(asset.fees, 1);
        _eq(asset.feeRemainder, 0);
        _eq(_whole(project, address(0), ALICE), 199);
        vm.prank(OWNER);
        registry.collectFees(project, address(0));
        _eq(OWNER.balance, 1);
        vm.expectRevert(ProjectRegistry.Unauthorized.selector);
        registry.collectFees(project, address(0));
    }

    function testFractionalRewardsSurviveClaimsAndZeroBalance() public {
        _mint(ALICE, UNIT);
        _mint(BOB, 2 * UNIT);
        for (uint256 i; i < 3; ++i) {
            registry.donateNative{value: 1}(project);
            vm.prank(ALICE);
            registry.claim(project, address(0));
        }
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, CAROL, project, UNIT, "");
        (uint256 whole, uint256 remainder) = registry.entitlement(project, address(0), ALICE);
        _eq(whole, 0);
        require(remainder > 0, "lost sub-unit entitlement");
        vm.prank(CAROL);
        registry.safeTransferFrom(CAROL, ALICE, project, UNIT, "");
        registry.donateNative{value: 1}(project);
        vm.prank(ALICE);
        registry.claim(project, address(0));
        _eq(ALICE.balance, 1);
    }

    function testTokenAndProjectIsolation() public {
        TestToken token = new TestToken();
        registry.enableAsset(project, address(token));
        _mint(ALICE, UNIT);
        token.mint(address(this), 20_000);
        token.approve(address(registry), 20_000);
        registry.donateToken(project, address(token), 20_000);
        registry.donateNative{value: 40_000}(project);
        uint256 other = registry.registerProject();
        registry.mint(other, BOB, UNIT, "", "");
        registry.donateNative{value: 60_000}(other);
        _eq(_whole(project, address(token), ALICE), 19_900);
        _eq(_whole(project, address(0), ALICE), 39_800);
        _eq(_whole(other, address(0), ALICE), 0);
        vm.prank(ALICE);
        registry.claim(project, address(token));
        _eq(token.balanceOf(ALICE), 19_900);
        _eq(_whole(other, address(0), BOB), 59_700);
    }

    function testRejectedTokenDepositIsAtomic() public {
        TestToken token = new TestToken();
        registry.enableAsset(project, address(token));
        _mint(ALICE, UNIT);
        token.mint(address(this), 100);
        token.approve(address(registry), 100);
        token.setTax(true);
        vm.expectRevert(ProjectRegistry.UnsupportedAsset.selector);
        registry.donateToken(project, address(token), 100);
        _eq(token.balanceOf(address(this)), 100);
        _eq(registry.assetInfo(project, address(token)).received, 0);
    }

    function testPayoutFailurePreservesCreditAndTransferStillWorks() public {
        TestToken token = new TestToken();
        registry.enableAsset(project, address(token));
        _mint(ALICE, UNIT);
        token.mint(address(this), 20_000);
        token.approve(address(registry), 20_000);
        registry.donateToken(project, address(token), 20_000);
        token.setTax(true);
        vm.expectRevert(ProjectRegistry.UnsupportedAsset.selector);
        vm.prank(ALICE);
        registry.claim(project, address(token));
        _eq(_whole(project, address(token), ALICE), 19_900);
        vm.prank(ALICE);
        registry.safeTransferFrom(ALICE, BOB, project, UNIT, "");
        token.setTax(false);
        vm.prank(ALICE);
        registry.claim(project, address(token));
        _eq(token.balanceOf(ALICE), 19_900);
    }

    function testNativePayoutFailurePreservesCredit() public {
        RejectEther reject = new RejectEther();
        _mint(address(reject), UNIT);
        registry.donateNative{value: 20_000}(project);
        vm.expectRevert(ProjectRegistry.PayoutFailed.selector);
        vm.prank(address(reject));
        registry.claim(project, address(0));
        _eq(_whole(project, address(0), address(reject)), 19_900);
        _eq(registry.assetInfo(project, address(0)).holderVault, 19_900);
    }

    function testClaimReentrancyCannotDoublePay() public {
        ReenterClaim receiver = new ReenterClaim(registry, project);
        _mint(address(receiver), UNIT);
        registry.donateNative{value: 20_000}(project);
        vm.prank(address(receiver));
        registry.claim(project, address(0));
        require(!receiver.reentered(), "claim reentered");
        _eq(address(receiver).balance, 19_900);
        _eq(_whole(project, address(0), address(receiver)), 0);
    }

    function testAccountingBounds() public {
        registry.mint(project, ALICE, registry.MAX_ACCOUNTING_AMOUNT(), "", "");
        vm.expectRevert(ProjectRegistry.AccountingLimit.selector);
        _mint(BOB, 1);
    }

    function testFuzzDonationTransferClaimConservation(uint96 amount, uint64 fraction) public {
        uint256 donation = uint256(amount) + 200;
        uint256 transferred = uint256(fraction) % (UNIT + 1);
        _mint(ALICE, UNIT);
        registry.donateNative{value: donation}(project);
        if (transferred > 0) {
            vm.prank(ALICE);
            registry.safeTransferFrom(ALICE, BOB, project, transferred, "");
        }
        registry.donateNative{value: donation}(project);
        vm.prank(ALICE);
        registry.claim(project, address(0));
        vm.prank(BOB);
        registry.claim(project, address(0));
        vm.prank(OWNER);
        registry.collectFees(project, address(0));
        ProjectRegistry.Asset memory a = registry.assetInfo(project, address(0));
        _eq(ALICE.balance + BOB.balance + OWNER.balance + address(registry).balance, 2 * donation);
        _eq(registry.balanceOf(ALICE, project) + registry.balanceOf(BOB, project), UNIT);
        _eq(a.holderVault + a.fees, address(registry).balance);
    }
    event log_named_uint(string key, uint256 value);

    function testDonationCostDoesNotGrowWithHolderCount() public {
        uint256 one = registry.registerProject();
        uint256 many = registry.registerProject();
        registry.mint(one, ALICE, 100 * UNIT, "", "");
        for (uint256 i; i < 100; ++i) {
            registry.mint(many, address(uint160(1000 + i)), UNIT, "", "");
        }
        vm.cool(address(registry));
        uint256 start = gasleft();
        registry.donateNative{value: 20_000}(one);
        uint256 oneGas = start - gasleft();
        vm.cool(address(registry));
        start = gasleft();
        registry.donateNative{value: 20_000}(many);
        uint256 manyGas = start - gasleft();
        emit log_named_uint("donation, 1 holder", oneGas);
        emit log_named_uint("donation, 100 holders", manyGas);
        require(manyGas <= oneGas + 1000, "donation grows with holders");
    }

    function testTransferCostGrowsWithEnabledAssets() public {
        uint256 one = registry.registerProject();
        uint256 many = registry.registerProject();
        for (uint256 i; i < 5; ++i) {
            registry.enableAsset(many, address(new TestToken()));
        }
        registry.mint(one, ALICE, UNIT, "", "");
        registry.mint(many, ALICE, UNIT, "", "");
        vm.cool(address(registry));
        vm.prank(ALICE);
        uint256 start = gasleft();
        registry.safeTransferFrom(ALICE, BOB, one, UNIT / 2, "");
        uint256 oneGas = start - gasleft();
        vm.cool(address(registry));
        vm.prank(ALICE);
        start = gasleft();
        registry.safeTransferFrom(ALICE, BOB, many, UNIT / 2, "");
        uint256 manyGas = start - gasleft();
        emit log_named_uint("transfer, 1 asset", oneGas);
        emit log_named_uint("transfer, 6 assets", manyGas);
        require(manyGas > oneGas, "asset cost not measured");
    }

    function testBatchTransfersPreserveBothProjectsAndDuplicateIds() public {
        _mint(ALICE, 2 * UNIT);
        registry.donateNative{value: 20_000}(project);
        uint256 other = registry.registerProject();
        registry.mint(other, ALICE, UNIT, "", "");
        registry.donateNative{value: 40_000}(other);
        uint256[] memory ids = new uint256[](3);
        uint256[] memory amounts = new uint256[](3);
        ids[0] = project;
        ids[1] = other;
        ids[2] = project;
        amounts[0] = UNIT / 2;
        amounts[1] = UNIT;
        amounts[2] = UNIT / 2;
        vm.prank(ALICE);
        registry.safeBatchTransferFrom(ALICE, BOB, ids, amounts, "");
        _eq(_whole(project, address(0), ALICE), 19_900);
        _eq(_whole(other, address(0), ALICE), 39_800);
        _eq(_whole(project, address(0), BOB), 0);
        _eq(registry.balanceOf(BOB, project), UNIT);
        _eq(registry.balanceOf(BOB, other), UNIT);
    }

    function testLifetimeReceiptBoundWithSmallestShareUnit() public {
        _mint(ALICE, 1);
        uint256 maximum = registry.MAX_ACCOUNTING_AMOUNT();
        vm.deal(address(this), maximum + 1);
        registry.donateNative{value: maximum}(project);
        _eq(_whole(project, address(0), ALICE), maximum - maximum / 200);
        vm.expectRevert(ProjectRegistry.AccountingLimit.selector);
        registry.donateNative{value: 1}(project);
        _eq(registry.assetInfo(project, address(0)).received, maximum);
    }
}
