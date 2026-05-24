// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 с blacklist'ом в стиле USDC. Реверит любой transfer,
///         если from или to в blacklist. Используется для теста кейса
///         «feeReceiver попал в blacklist и emergencyWithdraw упадёт».
contract MockBlacklistToken is ERC20 {
    mapping(address => bool) public blacklisted;

    constructor() ERC20("Blacklist", "BLK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function blacklist(address user) external {
        blacklisted[user] = true;
    }

    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (blacklisted[msg.sender] || blacklisted[to]) {
            revert("ERC20: blacklisted");
        }
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (blacklisted[from] || blacklisted[to]) {
            revert("ERC20: blacklisted");
        }
        return super.transferFrom(from, to, amount);
    }
}
