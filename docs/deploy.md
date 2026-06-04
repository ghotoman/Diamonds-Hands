# Diamond Hands — Deployment Runbook & Addresses

Деплой выполняется **со своей машины** (не из облачной песочницы Claude:
её сетевой allowlist блокирует Base RPC и BaseScan). Ключ деплоера
никуда не передаётся — он живёт в зашифрованном keystore у тебя локально.

---

## 0. Предусловия (один раз)

```bash
# Foundry установлен?
forge --version            # если нет: curl -L https://foundry.paradigm.xyz | bash && foundryup

# Репозиторий со сабмодулями
git clone <repo-url> && cd Diamonds-Hands
git submodule update --init --recursive

cd contracts
forge build && forge test   # sanity: 104 unit-теста должны быть зелёными
```

---

## 1. Завести ОДНОРАЗОВЫЙ deployer-кошелёк

Не используй основной кошелёк: этот адрес становится `owner` Factory
(может pause / setImplementation / setFeeReceiver).

**Рекомендуется — зашифрованный keystore (пароль, без plaintext-ключа):**

```bash
# Вариант A: импортировать существующий приватный ключ под паролем
cast wallet import dh-deployer --interactive
#   → вставь приватный ключ, задай пароль. Ключ ляжет в ~/.foundry/keystores/

# Вариант B: сгенерировать новый кошелёк сразу в keystore
cast wallet new ~/.foundry/keystores
#   → запомни адрес и пароль; приватный ключ нигде не светится
```

Узнать адрес keystore-аккаунта:

```bash
cast wallet address --account dh-deployer
```

---

## 2. Пополнить Base Sepolia ETH

Деплой стоит ~2.66M газа — на Base это копейки. `0.01` тестового ETH
хватит с запасом. Faucet'ы (любой):

- https://www.alchemy.com/faucets/base-sepolia
- https://docs.base.org/docs/tools/network-faucets

Отправь на адрес из шага 1. Проверка баланса:

```bash
cast balance <deployer-address> --rpc-url https://sepolia.base.org --ether
```

---

## 3. Настроить `.env` (только несекретный конфиг)

```bash
cd contracts
cp .env.example .env
```

Заполни в `.env`:

- `FEE_RECEIVER=0x...` — куда идут penalty (можно = адрес deployer'а).
- `BASESCAN_API_KEY=...` — опционально, для `--verify` (бесплатно на basescan.org).
- `BASE_SEPOLIA_RPC_URL=...` — опционально (есть публичный дефолт).

⚠️ Приватный ключ в `.env` НЕ нужен — подписант идёт через `--account`.
`.env` уже в `.gitignore`.

---

## 4. (Опционально) Симуляция без отправки

Прогоняет скрипт против форка, ничего не публикует:

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --account dh-deployer
```

(`base_sepolia` — именованный эндпоинт из `foundry.toml`, читает
`BASE_SEPOLIA_RPC_URL`. Форж спросит пароль keystore.)

---

## 5. Деплой (broadcast)

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_sepolia \
  --account dh-deployer \
  --broadcast \
  --verify \
  -vvv
```

- `--account dh-deployer` → форж спросит пароль keystore и подпишет им.
- `--verify` → автоверификация исходников на BaseScan (нужен `BASESCAN_API_KEY`).
  Можно опустить и верифицировать позже (шаг 7b).

В выводе будут адреса impl и factory + `Factory owner`. Скопируй их
в таблицу внизу этого файла.

> Альтернативы подписанта:
> - сырой ключ (только тестнет): `--private-key $PRIVATE_KEY` вместо `--account`;
> - аппаратный кошелёк (для mainnet): `--ledger`.

---

## 6. Проверка задеплоенного состояния

Подставь адреса из вывода шага 5:

```bash
FACTORY=0x...
IMPL=0x...
RPC=https://sepolia.base.org

cast call $FACTORY "owner()(address)"           --rpc-url $RPC   # = твой deployer
cast call $FACTORY "implementation()(address)"  --rpc-url $RPC   # = $IMPL
cast call $FACTORY "feeReceiver()(address)"      --rpc-url $RPC   # = FEE_RECEIVER
cast call $FACTORY "vaultCount()(uint256)"       --rpc-url $RPC   # = 0
cast call $FACTORY "paused()(bool)"              --rpc-url $RPC   # = false
cast call $FACTORY "MAX_LOCK_DURATION()(uint256)" --rpc-url $RPC  # = 157680000

# implementation защищён от прямой инициализации (ожидается revert):
cast call $IMPL "initialize(address,address,uint256,uint256,bool,address,uint16)" \
  0x0000000000000000000000000000000000000001 \
  0x0000000000000000000000000000000000000001 \
  1 9999999999 true \
  0x0000000000000000000000000000000000000001 500 \
  --rpc-url $RPC
#   → revert 0xf92ee8a9 (InvalidInitialization) — это корректно.
```

---

## 7. Верификация на BaseScan

**7a.** Если деплоил с `--verify`, она уже прошла — проверь страницы
контрактов на https://sepolia.basescan.org.

**7b. Ручная верификация (если `--verify` пропускали/падала):**

```bash
# Vault: без аргументов конструктора
forge verify-contract $IMPL src/DiamondHandsVault.sol:DiamondHandsVault \
  --chain base-sepolia --watch

# Factory: два аргумента конструктора (implementation, feeReceiver)
forge verify-contract $FACTORY src/DiamondHandsFactory.sol:DiamondHandsFactory \
  --chain base-sepolia --watch \
  --constructor-args $(cast abi-encode "constructor(address,address)" $IMPL <FEE_RECEIVER>)
```

> Если BaseScan-эндпоинт ругается на устаревший API: Etherscan перешёл
> на единый V2 (`--verifier-url https://api.etherscan.io/v2/api` +
> `--chain 84532` + ключ Etherscan). Это known-issue инфраструктуры,
> на сами контракты не влияет.

---

## 8. (Опционально) Смоук-тест на тестнете

Создать реальный Vault на задеплоенной Factory:

```bash
# понадобится тестовый ERC-20 + approve на FACTORY; затем:
cast send $FACTORY \
  "createVault(address,uint256,uint256,bool,uint16)" \
  <token> <amount> <unlockTimestamp> true 2000 \
  --rpc-url base_sepolia --account dh-deployer
# unlockTimestamp = сейчас + ≥7 дней (>= now+604800)
```

---

## 9. Безопасность после деплоя

- На **mainnet** передай owner Factory на мультисиг (Ownable2Step,
  двухшаговый): `transferOwnership(multisig)` → затем `acceptOwnership()`
  с мультисига. `renounceOwnership()` заблокирован by design.
- `feeReceiver` фиксируется в каждом Vault на момент создания и не
  меняется задним числом — смена через `setFeeReceiver` влияет только
  на БУДУЩИЕ Vault'ы.

---

## Адреса деплоя

### Base Sepolia (chainId 84532)
- DiamondHandsVault implementation: НЕ ЗАДЕПЛОЕНО
- DiamondHandsFactory: НЕ ЗАДЕПЛОЕНО
- Fee receiver: НЕ ЗАДЕПЛОЕНО
- Deployer (Factory owner): НЕ ЗАДЕПЛОЕНО
- Block: -
- Tx hash impl: -
- Tx hash factory: -

### Base Mainnet (chainId 8453)
- НЕ ЗАДЕПЛОЕНО
