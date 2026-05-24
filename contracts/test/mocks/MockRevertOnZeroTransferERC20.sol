// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 в стиле старых нестандартных токенов: реверится
///         на `transfer(_, 0)` / `transferFrom(_, _, 0)`. Используется
///         для теста защиты `if (penaltyAmt > 0)` в emergencyWithdraw.
contract MockRevertOnZeroTransferERC20 is ERC20 {
    constructor() ERC20("Zero Revert", "ZRT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (amount == 0) revert("ERC20: zero transfer forbidden");
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (amount == 0) revert("ERC20: zero transferFrom forbidden");
        return super.transferFrom(from, to, amount);
    }
}
