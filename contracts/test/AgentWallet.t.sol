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
    address notAllowed = makeAddr("notAllowed");

    uint256 constant PER_TX = 2e6;
    uint256 constant PER_DAY = 5e6;
    uint64 expiry;

    function setUp() public {
        vm.warp(10 days);
        expiry = uint64(block.timestamp + 7 days);

        usdc = new MockUSDC();
        wallet = new AgentWallet(owner, address(usdc), agent, expiry, PER_TX, PER_DAY);
        usdc.mint(address(wallet), 100e6);

        vm.prank(owner);
        wallet.setRecipientAllowed(recipient, true);
    }

    function _send(address to, uint256 amount) internal {
        vm.prank(agent);
        wallet.transferUSDC(to, amount);
    }

    function test_TransferWithinPolicy() public {
        _send(recipient, 1e6);
        assertEq(usdc.balanceOf(recipient), 1e6);
        assertEq(wallet.spentToday(), 1e6);
        assertEq(wallet.remainingToday(), 4e6);
    }

    function test_RevertsOverPerTxLimit() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentWallet.ExceedsPerTxLimit.selector, 3e6, PER_TX));
        wallet.transferUSDC(recipient, 3e6);
    }

    function test_ExactlyPerTxLimitIsAllowed() public {
        _send(recipient, PER_TX);
        assertEq(usdc.balanceOf(recipient), PER_TX);
    }

    function test_RevertsOverDailyLimit() public {
        _send(recipient, 2e6);
        _send(recipient, 2e6);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentWallet.ExceedsDailyLimit.selector, 2e6, 1e6));
        wallet.transferUSDC(recipient, 2e6);
    }

    function test_DailyLimitResetsNextDay() public {
        _send(recipient, 2e6);
        _send(recipient, 2e6);
        _send(recipient, 1e6);
        assertEq(wallet.remainingToday(), 0);

        vm.warp(block.timestamp + 1 days);
        assertEq(wallet.remainingToday(), PER_DAY);

        _send(recipient, 2e6);
        assertEq(wallet.spentToday(), 2e6);
    }

    function test_LoweringDailyLimitBelowSpentDoesNotUnderflow() public {
        _send(recipient, 2e6);
        _send(recipient, 2e6);

        vm.prank(owner);
        wallet.setLimits(1e6, 3e6);
        assertEq(wallet.remainingToday(), 0);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentWallet.ExceedsDailyLimit.selector, 1e6, 0));
        wallet.transferUSDC(recipient, 1e6);
    }

    function test_RevertsNonAllowlistedRecipient() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentWallet.RecipientNotAllowed.selector, notAllowed));
        wallet.transferUSDC(notAllowed, 1e6);
    }

    function test_RemovedRecipientIsBlocked() public {
        vm.prank(owner);
        wallet.setRecipientAllowed(recipient, false);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentWallet.RecipientNotAllowed.selector, recipient));
        wallet.transferUSDC(recipient, 1e6);
    }

    function test_ZeroAddressIsNeverAllowed() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.ZeroAddress.selector);
        wallet.setRecipientAllowed(address(0), true);
    }

    function test_WorksUpToExpiryAndFailsAfter() public {
        vm.warp(expiry);
        _send(recipient, 1e6);

        vm.warp(uint256(expiry) + 1);
        vm.prank(agent);
        vm.expectRevert(AgentWallet.AgentExpired.selector);
        wallet.transferUSDC(recipient, 1e6);
    }

    function test_OwnerCanRenewExpiredAgent() public {
        vm.warp(uint256(expiry) + 1);

        vm.prank(owner);
        wallet.setAgent(agent, uint64(block.timestamp + 1 days));

        _send(recipient, 1e6);
        assertEq(usdc.balanceOf(recipient), 1e6);
    }

    function test_SetAgentRejectsPastExpiry() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.InvalidExpiry.selector);
        wallet.setAgent(agent, uint64(block.timestamp));
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

    function test_AgentCannotChangeItsOwnPolicy() public {
        vm.startPrank(agent);
        bytes memory notOwner = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent);

        vm.expectRevert(notOwner);
        wallet.setLimits(100e6, 100e6);

        vm.expectRevert(notOwner);
        wallet.setRecipientAllowed(notAllowed, true);

        vm.expectRevert(notOwner);
        wallet.setAgent(agent, uint64(block.timestamp + 365 days));

        vm.expectRevert(notOwner);
        wallet.withdraw(agent, 1e6);
        vm.stopPrank();
    }

    function test_ZeroAmountRejected() public {
        vm.prank(agent);
        vm.expectRevert(AgentWallet.ZeroAmount.selector);
        wallet.transferUSDC(recipient, 0);
    }

    function test_InvalidLimitsRejected() public {
        vm.startPrank(owner);
        vm.expectRevert(AgentWallet.InvalidLimits.selector);
        wallet.setLimits(6e6, 5e6);

        vm.expectRevert(AgentWallet.InvalidLimits.selector);
        wallet.setLimits(0, 5e6);
        vm.stopPrank();
    }

    function test_OwnerCanWithdraw() public {
        vm.prank(owner);
        wallet.withdraw(owner, 4e6);
        assertEq(usdc.balanceOf(owner), 4e6);
    }

    function testFuzz_DailyCapNeverExceeded(uint256 a, uint256 b, uint256 c, uint256 d) public {
        uint256[4] memory amounts = [a, b, c, d];

        for (uint256 i = 0; i < 4; i++) {
            uint256 amt = bound(amounts[i], 1, PER_TX);
            vm.prank(agent);
            try wallet.transferUSDC(recipient, amt) {} catch {}
        }

        assertLe(wallet.spentToday(), PER_DAY);
        assertLe(usdc.balanceOf(recipient), PER_DAY);
    }
}