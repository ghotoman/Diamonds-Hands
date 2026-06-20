// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title  DiamondHandsRegistry
/// @notice Self-sovereign profile registry — a user binds a display name and a
///         social link to their address. Frontends substitute the registered
///         name for the raw 0x… when rendering vault owners.
/// @dev    No moderation, no fees, no admin. Each address controls its own
///         entry; clearing fields restores anonymity. Fields are length-capped
///         so a frontend can render them without surprise.
contract DiamondHandsRegistry {
    struct Profile {
        string name; // ≤ 32 bytes (e.g. "ghotoman.eth")
        string link; // ≤ 200 bytes (e.g. "https://x.com/ghotoman_x")
        uint64 updatedAt; // block.timestamp of last setProfile
    }

    /// @notice Public profile for each address.
    mapping(address => Profile) private _profiles;

    /// @notice Emitted on every successful setProfile. Use this to index the
    ///         current state of every profile without scanning storage.
    event ProfileUpdated(address indexed user, string name, string link);

    error NameTooLong(uint256 length, uint256 max);
    error LinkTooLong(uint256 length, uint256 max);

    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_LINK_BYTES = 200;

    /// @notice Set (or update) the caller's profile. Passing empty strings
    ///         clears the field — that's how a user removes their info.
    function setProfile(string calldata name, string calldata link) external {
        uint256 nl = bytes(name).length;
        uint256 ll = bytes(link).length;
        if (nl > MAX_NAME_BYTES) revert NameTooLong(nl, MAX_NAME_BYTES);
        if (ll > MAX_LINK_BYTES) revert LinkTooLong(ll, MAX_LINK_BYTES);

        _profiles[msg.sender] = Profile({name: name, link: link, updatedAt: uint64(block.timestamp)});
        emit ProfileUpdated(msg.sender, name, link);
    }

    /// @notice Read a profile. Returns empty strings for an unset address.
    function getProfile(address user) external view returns (Profile memory) {
        return _profiles[user];
    }
}
