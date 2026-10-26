// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentWallet} from "../src/AgentWallet.sol";

contract Deploy is Script {
    function run(
        address owner,
        address usdc,
        address agent,
        uint256 expiryDays,
        uint256 maxPerTx,
        uint256 maxPerDay
    ) external {
        vm.startBroadcast();
        AgentWallet wallet = new AgentWallet(
            owner,
            usdc,
            agent,
            uint64(block.timestamp + expiryDays * 1 days),
            maxPerTx,
            maxPerDay
        );
        wallet.setRecipientAllowed(owner, true);
        vm.stopBroadcast();

        console.log("AgentWallet deployed at:", address(wallet));
    }
}