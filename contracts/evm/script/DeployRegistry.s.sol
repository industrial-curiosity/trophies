// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ProjectRegistry} from "../src/ProjectRegistry.sol";

interface VmDeploy {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployRegistry {
    VmDeploy private constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (ProjectRegistry registry) {
        uint256 expectedChain = vm.envUint("EXPECTED_CHAIN_ID");
        require(block.chainid == expectedChain, "unexpected deployment network");
        address owner = vm.envAddress("OWNER_ADDRESS");
        vm.startBroadcast();
        registry = new ProjectRegistry(owner);
        vm.stopBroadcast();
    }
}
