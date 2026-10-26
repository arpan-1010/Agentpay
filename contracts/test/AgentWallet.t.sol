// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentWallet} from "../src/AgentWallet.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AgentWalletTest is Test {
    AgentWallet wallet;
    MockUSDC usdc;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address stranger = makeAddr("stranger");
    address recipient = makeAddr("recipient");

    function setUp() public {
        usdc = new MockUSDC();
        wallet = new AgentWallet(owner, address(usdc), agent);
        usdc.mint(address(wallet), 10e6);
    }

    function test_AgentCanTransfer() public {
        vm.prank(agent);
        wallet.transferUSDC(recipient, 1e6);

        assertEq(usdc.balanceOf(recipient), 1e6);
        assertEq(usdc.balanceOf(address(wallet)), 9e6);
    }

    function test_StrangerCannotTransfer() public {
        vm.prank(stranger);
        vm.expectRevert(AgentWallet.NotAgent.selector);
        wallet.transferUSDC(recipient, 1e6);
    }

    function test_OwnerCannotActAsAgent() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.NotAgent.selector);
        wallet.transferUSDC(recipient, 1e6);
    }

    function test_RevokedAgentIsBlocked() public {
        vm.prank(owner);
        wallet.revokeAgent();

        vm.prank(agent);
        vm.expectRevert(AgentWallet.NotAgent.selector);
        wallet.transferUSDC(recipient, 1e6);
    }

    function test_OnlyOwnerCanRevoke() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        wallet.revokeAgent();
    }

    function test_OwnerCanReplaceAgent() public {
        vm.prank(owner);
        wallet.setAgent(stranger);

        vm.prank(agent);
        vm.expectRevert(AgentWallet.NotAgent.selector);
        wallet.transferUSDC(recipient, 1e6);

        vm.prank(stranger);
        wallet.transferUSDC(recipient, 1e6);
        assertEq(usdc.balanceOf(recipient), 1e6);
    }

    function test_OwnerCanWithdraw() public {
        vm.prank(owner);
        wallet.withdraw(owner, 4e6);
        assertEq(usdc.balanceOf(owner), 4e6);
    }

    function test_CannotSendToZeroAddress() public {
        vm.prank(agent);
        vm.expectRevert(AgentWallet.ZeroAddress.selector);
        wallet.transferUSDC(address(0), 1e6);
    }

    function test_CannotSpendMoreThanBalance() public {
        vm.prank(agent);
        vm.expectRevert();
        wallet.transferUSDC(recipient, 11e6);
    }
}