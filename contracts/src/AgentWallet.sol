// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AgentWallet
/// @notice Holds USDC. A human owner controls it; a separate agent key can only send USDC.
contract AgentWallet is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public agent;

    error NotAgent();
    error ZeroAddress();

    event AgentSet(address indexed agent);
    event AgentRevoked(address indexed agent);
    event AgentTransfer(address indexed to, uint256 amount);
    event OwnerWithdraw(address indexed to, uint256 amount);

    constructor(address owner_, address usdc_, address agent_) Ownable(owner_) {
        if (usdc_ == address(0) || agent_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        agent = agent_;
        emit AgentSet(agent_);
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    function transferUSDC(address to, uint256 amount) external onlyAgent {
        if (to == address(0)) revert ZeroAddress();
        usdc.safeTransfer(to, amount);
        emit AgentTransfer(to, amount);
    }

    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        agent = newAgent;
        emit AgentSet(newAgent);
    }

    function revokeAgent() external onlyOwner {
        emit AgentRevoked(agent);
        agent = address(0);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        usdc.safeTransfer(to, amount);
        emit OwnerWithdraw(to, amount);
    }
}