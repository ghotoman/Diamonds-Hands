// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";
import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";

/// @title  Deploy
/// @notice Деплоит DiamondHandsVault (implementation, immutable) и
///         DiamondHandsFactory с переданным feeReceiver. Использует
///         vm.envUint("PRIVATE_KEY") и vm.envAddress("FEE_RECEIVER").
/// @dev    Деплой на реальную сеть: нужно `--rpc-url`, `--broadcast`
///         и переменные окружения в .env. Для локального dry-run
///         используется anvil + стандартный приватный ключ.
contract Deploy is Script {
    function run() external returns (DiamondHandsVault impl, DiamondHandsFactory factory) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address feeReceiver = vm.envAddress("FEE_RECEIVER");

        vm.startBroadcast(deployerPrivateKey);

        impl = new DiamondHandsVault();
        factory = new DiamondHandsFactory(address(impl), feeReceiver);

        vm.stopBroadcast();

        console.log("Vault implementation:", address(impl));
        console.log("Factory:            ", address(factory));
        console.log("Fee receiver:       ", feeReceiver);
        console.log("Factory owner:      ", factory.owner());
    }
}
