// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentWallet} from "../src/AgentWallet.sol";

contract Deploy is Script {
    function run(address owner, address usdc, address agent) external {
        vm.startBroadcast();
        AgentWallet wallet = new AgentWallet(owner, usdc, agent);
        vm.stopBroadcast();

        console.log("AgentWallet deployed at:", address(wallet));
    }
}