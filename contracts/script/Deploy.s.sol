// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {DiamondHandsVault} from "../src/DiamondHandsVault.sol";
import {DiamondHandsFactory} from "../src/DiamondHandsFactory.sol";

/// @title  Deploy
/// @notice Деплоит DiamondHandsVault (implementation, immutable) и
///         DiamondHandsFactory с переданным feeReceiver.
/// @dev    Подписант (deployer) задаётся НА CLI, а не в коде:
///         - `--account <name>`  — зашифрованный keystore (рекомендуется,
///                                 ключ не лежит открытым текстом);
///         - `--ledger`          — аппаратный кошелёк (для mainnet);
///         - `--private-key 0x…` — сырой ключ (только для тестнета / dry-run).
///         Единственная обязательная env-переменная — FEE_RECEIVER
///         (публичный адрес, не секрет). RPC и BaseScan-ключ передаются
///         флагами/`foundry.toml`. См. полный runbook в docs/deploy.md.
contract Deploy is Script {
    function run() external returns (DiamondHandsVault impl, DiamondHandsFactory factory) {
        address feeReceiver = vm.envAddress("FEE_RECEIVER");
        if (feeReceiver == address(0)) revert("FEE_RECEIVER is zero");

        // Подписант берётся из CLI (--account / --ledger / --private-key).
        vm.startBroadcast();

        impl = new DiamondHandsVault();
        factory = new DiamondHandsFactory(address(impl), feeReceiver);

        vm.stopBroadcast();

        console.log("Chain ID:            ", block.chainid);
        console.log("Vault implementation:", address(impl));
        console.log("Factory:             ", address(factory));
        console.log("Fee receiver:        ", feeReceiver);
        console.log("Factory owner:       ", factory.owner());
    }
}
