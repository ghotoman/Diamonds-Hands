// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 с конфигурируемым fee (в bps) при каждом transfer.
///         Используется для теста balanceOf-delta защиты.
contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public feeBps;

    constructor(uint256 _feeBps) ERC20("Fee Token", "FEE") {
        feeBps = _feeBps;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeBps(uint256 _feeBps) external {
        feeBps = _feeBps;
    }

    function _update(address from, address to, uint256 value)
        internal
        override
    {
        // mint / burn оставляем без fee
        if (from == address(0) || to == address(0) || feeBps == 0) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = (value * feeBps) / 10000;
        uint256 net = value - fee;
        super._update(from, to, net);
        if (fee > 0) {
            super._update(from, address(this), fee);
        }
    }
}
