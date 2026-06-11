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
- `ETHERSCAN_API_KEY=...` — опционально, для `--verify` (Etherscan V2,
  бесплатно на etherscan.io; один ключ на все сети, вкл. Base).
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

## 7. Верификация

Адреса:

```bash
IMPL=0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e
FACTORY=0x89de426deF37Aa34c17f72d6a73229E64dd93e11
FEE=0x51eEE5409d3126505adF87F7EE5B96ae3e468e30
```

### 7a. Sourcify (keyless — самый надёжный путь)

Не требует API-ключа и обходит всю etherscan-конфигурацию. BaseScan
подтягивает Sourcify-матчи и показывает исходники.

```bash
forge verify-contract "$IMPL" src/DiamondHandsVault.sol:DiamondHandsVault \
  --chain 84532 --verifier sourcify

forge verify-contract "$FACTORY" src/DiamondHandsFactory.sol:DiamondHandsFactory \
  --chain 84532 --verifier sourcify \
  --constructor-args $(cast abi-encode "constructor(address,address)" "$IMPL" "$FEE")
```

### 7b. Etherscan V2 (для «зелёной галочки» на самой странице BaseScan)

Etherscan отключил V1 per-chain эндпоинты; нужен **ключ Etherscan**
(etherscan.io, один ключ на все сети). ⚠️ НЕ передавай `--verifier-url`
и НЕ указывай `url` в `foundry.toml`: V2 требует `?chainid=`, который
forge добавляет только когда сам строит URL из поля `chain`. Явный url
ломает запрос («Missing chainid parameter»). `foundry.toml` уже
настроен правильно (key + chain, без url).

```bash
export ETHERSCAN_API_KEY=ВСТАВЬ_КЛЮЧ   # с https://etherscan.io/myapikey

forge verify-contract "$IMPL" src/DiamondHandsVault.sol:DiamondHandsVault \
  --chain 84532 --watch --etherscan-api-key "$ETHERSCAN_API_KEY"

forge verify-contract "$FACTORY" src/DiamondHandsFactory.sol:DiamondHandsFactory \
  --chain 84532 --watch --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --constructor-args $(cast abi-encode "constructor(address,address)" "$IMPL" "$FEE")
```

---

## 8. (Опционально) Смоук-тест на тестнете

**8a. Тестовый ERC-20** (чтобы было что лочить):

```bash
forge script script/DeployMockToken.s.sol:DeployMockToken \
  --rpc-url base_sepolia --account dh-deployer --broadcast -vvv
# → задеплоит "Diamond Test Token" (DHT) и намонетит 1,000,000 тебе.
# Скопируй адрес токена из вывода (TOKEN).
```

**8b. Создать Vault** напрямую через cast (или просто через фронт):

```bash
TOKEN=0x...                       # из шага 8a
AMOUNT=100000000000000000000      # 100 DHT (18 dec)
UNLOCK=$(( $(date +%s) + 8*86400 ))   # now + 8 дней (≥ MIN_LOCK_DURATION)

# approve фабрике, затем createVault (soft, 20%)
cast send $TOKEN "approve(address,uint256)" $FACTORY $AMOUNT \
  --rpc-url base_sepolia --account dh-deployer
cast send $FACTORY \
  "createVault(address,uint256,uint256,bool,uint16)" \
  $TOKEN $AMOUNT $UNLOCK true 2000 \
  --rpc-url base_sepolia --account dh-deployer

cast call $FACTORY "vaultCount()(uint256)" --rpc-url base_sepolia   # → 1
```

Либо просто открой фронт (`frontend/`), подключи кошелёк и создай Vault
с адресом DHT — весь flow approve → create → manage в UI.

---

## 9. Безопасность после деплоя

- На **mainnet** передай owner Factory на мультисиг (Ownable2Step,
  двухшаговый): `transferOwnership(multisig)` → затем `acceptOwnership()`
  с мультисига. `renounceOwnership()` заблокирован by design.
- `feeReceiver` фиксируется в каждом Vault на момент создания и не
  меняется задним числом — смена через `setFeeReceiver` влияет только
  на БУДУЩИЕ Vault'ы.

---

## 9. Редеплой v2 — минимальный лок 1 день

`MIN_LOCK_DURATION` снижен с 7 дней до 1 дня (constant → нужен новый
Factory; Vault implementation не менялся, но скрипт деплоит свежую пару —
это нормально). Существующие Vault'ы не затрагиваются: клоны автономны.

```bash
# тот же скрипт, что и в шаге 5 (Sourcify-верификация — как в шаге 7)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_sepolia \
  --account dh-deployer \
  --broadcast \
  -vvv
```

После деплоя:
1. Запиши новые адреса в таблицу ниже (секция «v2»).
2. **Vercel → Environment Variables:**
   - `VITE_FACTORY_ADDRESS` = НОВЫЙ Factory (сюда идут createVault);
   - `VITE_LEGACY_FACTORY_ADDRESSES` = `0x89de426deF37Aa34c17f72d6a73229E64dd93e11`
     (старый — дашборд продолжит показывать созданные там Vault'ы).
3. Redeploy фронтенда (env вшивается при сборке).

Фронтенд читает `MIN_LOCK_DURATION` прямо с активной фабрики, так что
копи/валидация («Min 1 day») подстроятся автоматически.

---

## Адреса деплоя

### Base Sepolia (chainId 84532) — задеплоено 2026-06-04
- DiamondHandsVault implementation: `0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e`
- DiamondHandsFactory: `0x89de426deF37Aa34c17f72d6a73229E64dd93e11`
- Fee receiver: `0x51eEE5409d3126505adF87F7EE5B96ae3e468e30`
- Deployer (Factory owner): `0x51eEE5409d3126505adF87F7EE5B96ae3e468e30`
- Block: 42396935
- Tx hash impl: `0x0744e39c67a4e3dacccfa325dc419c6944354888ec461e54302f2eaf7c2a3745`
- Tx hash factory: `0xee2f2b8dae837e0f84702204d9e72c877cae36083cbb3aecf1451258d7aa1ce4`
- Explorer:
  - https://sepolia.basescan.org/address/0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e
  - https://sepolia.basescan.org/address/0x89de426deF37Aa34c17f72d6a73229E64dd93e11
- Верификация: ✅ Sourcify (2026-06-04), оба контракта `Response: OK`.
  BaseScan отображает исходники по Sourcify-матчу.

### Base Sepolia v2 (chainId 84532) — min lock 1 день, задеплоено 2026-06-11
- DiamondHandsVault implementation: `0xD41FA9D180187C79E220A1C5968Da8E145646f07`
- DiamondHandsFactory v2: `0xE0a0836f19d604e3aEEf1c55a59e50e1cE806cC3`
- Fee receiver: `0x51eEE5409d3126505adF87F7EE5B96ae3e468e30`
- Deployer (Factory owner): `0x51eEE5409d3126505adF87F7EE5B96ae3e468e30`
- Block: 42704674
- Tx hash impl: `0x43bf9625e8361f620103620c69d3b7bfa4040525cd32e548d96014f0e827b1a8`
- Tx hash factory: `0xe3528231037ea47e6c5eece534f770afb47546801db98c44f1385e5c38dfc54b`
- Explorer:
  - https://sepolia.basescan.org/address/0xD41FA9D180187C79E220A1C5968Da8E145646f07
  - https://sepolia.basescan.org/address/0xE0a0836f19d604e3aEEf1c55a59e50e1cE806cC3
- Верификация: ⏳ Sourcify (шаг 7: `forge verify-contract <addr> <contract> --verifier sourcify`)

### Base Mainnet (chainId 8453)
- НЕ ЗАДЕПЛОЕНО
