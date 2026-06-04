// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mintable test ERC-20 for exercising Diamond Hands on a testnet.
///         Anyone can mint — testnet only, never deploy to mainnet.
contract TestToken is ERC20 {
    constructor() ERC20("Diamond Test Token", "DHT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title  DeployMockToken
/// @notice Deploys a mintable test ERC-20 and mints an initial supply to the
///         deployer, so you have a token to lock in a vault on Base Sepolia.
/// @dev    Signer is supplied on the CLI (see docs/deploy.md):
///         forge script script/DeployMockToken.s.sol:DeployMockToken \
///           --rpc-url base_sepolia --account dh-deployer --broadcast -vvv
contract DeployMockToken is Script {
    function run() external returns (TestToken token) {
        vm.startBroadcast();

        token = new TestToken();
        token.mint(msg.sender, 1_000_000 ether);

        vm.stopBroadcast();

        console.log("TestToken (DHT):", address(token));
        console.log("Minted 1,000,000 DHT to:", msg.sender);
    }
}
