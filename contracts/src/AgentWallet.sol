// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title
/// @notice
contract AgentWallet is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    address public agent;
    uint64 public agentExpiry;

    uint256 public maxPerTx;
    uint256 public maxPerDay;
    uint256 public currentDay;
    uint256 public spentToday;
    mapping(address => bool) public isAllowedRecipient;

    error NotAgent();
    error AgentExpired();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidExpiry();
    error InvalidLimits();
    error RecipientNotAllowed(address to);
    error ExceedsPerTxLimit(uint256 amount, uint256 limit);
    error ExceedsDailyLimit(uint256 amount, uint256 remaining);

    event AgentSet(address indexed agent, uint64 expiry);
    event AgentRevoked(address indexed agent);
    event LimitsSet(uint256 maxPerTx, uint256 maxPerDay);
    event RecipientAllowed(address indexed recipient, bool allowed);
    event AgentTransfer(address indexed to, uint256 amount, uint256 spentToday);
    event OwnerWithdraw(address indexed to, uint256 amount);

    constructor(
        address owner_,
        address usdc_,
        address agent_,
        uint64 agentExpiry_,
        uint256 maxPerTx_,
        uint256 maxPerDay_
    ) Ownable(owner_) {
        if (usdc_ == address(0) || agent_ == address(0)) revert ZeroAddress();
        if (agentExpiry_ <= block.timestamp) revert InvalidExpiry();
        usdc = IERC20(usdc_);
        agent = agent_;
        agentExpiry = agentExpiry_;
        _setLimits(maxPerTx_, maxPerDay_);
        emit AgentSet(agent_, agentExpiry_);
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    function transferUSDC(address to, uint256 amount) external onlyAgent {
        if (block.timestamp > agentExpiry) revert AgentExpired();
        if (amount == 0) revert ZeroAmount();
        if (!isAllowedRecipient[to]) revert RecipientNotAllowed(to);
        if (amount > maxPerTx) revert ExceedsPerTxLimit(amount, maxPerTx);

        uint256 remaining = remainingToday();
        if (amount > remaining) revert ExceedsDailyLimit(amount, remaining);

        uint256 today = block.timestamp / 1 days;
        if (today != currentDay) {
            currentDay = today;
            spentToday = 0;
        }
        spentToday += amount;

        usdc.safeTransfer(to, amount);
        emit AgentTransfer(to, amount, spentToday);
    }

    function remainingToday() public view returns (uint256) {
        uint256 spent = (block.timestamp / 1 days == currentDay) ? spentToday : 0;
        return spent >= maxPerDay ? 0 : maxPerDay - spent;
    }

    function setAgent(address newAgent, uint64 expiry) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert InvalidExpiry();
        agent = newAgent;
        agentExpiry = expiry;
        emit AgentSet(newAgent, expiry);
    }

    function revokeAgent() external onlyOwner {
        emit AgentRevoked(agent);
        agent = address(0);
        agentExpiry = 0;
    }

    function setLimits(uint256 maxPerTx_, uint256 maxPerDay_) external onlyOwner {
        _setLimits(maxPerTx_, maxPerDay_);
    }

    function setRecipientAllowed(address recipient, bool allowed) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        isAllowedRecipient[recipient] = allowed;
        emit RecipientAllowed(recipient, allowed);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        usdc.safeTransfer(to, amount);
        emit OwnerWithdraw(to, amount);
    }

    function _setLimits(uint256 maxPerTx_, uint256 maxPerDay_) internal {
        if (maxPerTx_ == 0 || maxPerTx_ > maxPerDay_) revert InvalidLimits();
        maxPerTx = maxPerTx_;
        maxPerDay = maxPerDay_;
        emit LimitsSet(maxPerTx_, maxPerDay_);
    }
}