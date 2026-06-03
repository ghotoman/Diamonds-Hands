// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20, который при `transfer` / `transferFrom` пытается
///         сделать reentry в произвольный контракт по сохранённым
///         параметрам атаки. Если nonReentrant работает — внешний
///         call вернёт `(false, errordata)`, наш токен пропустит
///         попытку и завершит обычный transfer; тест PASS.
///         Если nonReentrant НЕ сработает — call вернёт `success=true`,
///         и наш токен ревертит с сигнальной ошибкой, чтобы тест FAIL.
contract MockReentrantToken is ERC20 {
    address public target;
    bytes public attackData;
    bool public attackOnTransfer;
    bool public attackOnTransferFrom;
    bool internal _attacking;

    constructor() ERC20("Reentrant", "RNT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(address _target, bytes calldata _data, bool _onTransfer, bool _onTransferFrom) external {
        target = _target;
        attackData = _data;
        attackOnTransfer = _onTransfer;
        attackOnTransferFrom = _onTransferFrom;
    }

    function _tryAttack() internal {
        if (target == address(0) || _attacking) return;
        _attacking = true;
        (bool success,) = target.call(attackData);
        _attacking = false;
        // Если reentry "успешен" — это критическая ошибка теста.
        if (success) revert("Reentry succeeded but should not");
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (attackOnTransfer) _tryAttack();
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attackOnTransferFrom) _tryAttack();
        return super.transferFrom(from, to, amount);
    }
}
