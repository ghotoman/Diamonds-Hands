// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IDiamondHandsVaultView} from "./IDiamondHandsViews.sol";

/// @title  DiamondHandsBrag
/// @notice Lets a Diamond Hands vault owner publicly tag a vault with a short
///         memo — "why I locked this". One on-chain event per brag, indexable
///         by user and vault, so a feed UI can render a stream of commitments
///         without any off-chain database.
/// @dev    Stateless: no storage. The auth check (`vault.owner() == sender`)
///         keeps people from bragging on someone else's lock. Memo is capped
///         at 280 bytes — fits a tweet, keeps gas predictable.
contract DiamondHandsBrag {
    /// @notice A user publicly tagged a vault with a memo.
    /// @param user  The vault's owner (= msg.sender).
    /// @param vault The vault clone the brag is about.
    /// @param memo  Free-form text, ≤ 280 bytes.
    event Bragged(address indexed user, address indexed vault, string memo);

    error NotVaultOwner();
    error MemoTooLong(uint256 length, uint256 max);

    uint256 public constant MAX_MEMO_BYTES = 280;

    /// @notice Emit a `Bragged` event tagged with the caller's vault.
    /// @dev    Only the vault's owner can brag about it. Memo length is the
    ///         UTF-8 byte length (Solidity `bytes(memo).length`); a tweet's
    ///         worth of characters fits without surprise.
    function brag(address vault, string calldata memo) external {
        if (IDiamondHandsVaultView(vault).owner() != msg.sender) revert NotVaultOwner();
        uint256 len = bytes(memo).length;
        if (len > MAX_MEMO_BYTES) revert MemoTooLong(len, MAX_MEMO_BYTES);
        emit Bragged(msg.sender, vault, memo);
    }
}
