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

## 10. Редеплой Sepolia v2 — минимальный лок 1 день

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

## 11. Mainnet-деплой (Base mainnet, chainId 8453)

Полный гайд для боевого деплоя. Использует `script/DeployMainnet.s.sol`
(юнит-тесты: `forge test --match-contract DeployMainnetTest`). 8 тестов
покрывают: preconditions, передачу владения без timelock, передачу через
timelock, и невозможность обойти timelock при `setImplementation`.

> ### 🅰️ Выбранный профиль запуска (soft-launch)
> - **Owner = multisig напрямую** (`USE_TIMELOCK=false`). Причина: для
>   unaudited-старта критичен **мгновенный** `pause()` (стоп-кран). Если бы
>   Factory принадлежал таймлоку, `pause()` (он `onlyOwner`) тоже уходил бы
>   в задержку 48ч — недопустимо в аварии. Таймлок добавим позже (после
>   аудита/роста) — переносом владения на TimelockController.
> - **TVL-кап $1M = off-chain мониторинг + `pause()`** (см. `monitoring/` и
>   §11.8). On-chain капа нет: вольты принимают любой ERC-20, а универсального
>   USD-оракула on-chain не существует.
> - **Без bug bounty, без внешнего аудита** — осознанный выбор. Кап $1M
>   ограничивает blast-radius на время soft-launch.
>
> Заданные адреса (Base mainnet, chainId 8453):
> - `OWNER_MULTISIG` (env при деплое) = `0xADAa78db09f0f38ca68FF357ba5968c96B2d6D8F`
> - `FEE_RECEIVER` = `0x1Cc4CB5192095E859cFF3fc1C0505Cbe210959De`
>
> 🔧 **Итоговый владелец — `0x1Cc4…59De`** (не `0xADAa…`): адрес `0xADAa…`
> оказался не Safe на Base, владение переназначено на рабочий 2/2-Safe
> `0x1Cc4…59De` (= fee receiver). Подробности — раздел «Адреса деплоя».

### 11.1. Предусловия (один раз перед mainnet-деплоем)

1. **Mainnet Safe (multisig)** `0xADAa…6D8F` — будущий **владелец Factory**.
   ⚠️ Перед деплоем **проверь, что этот Safe реально задеплоен именно на Base
   mainnet** (Safe-адреса привязаны к сети): открой
   `https://basescan.org/address/0xADAa78db09f0f38ca68FF357ba5968c96B2d6D8F` —
   должен быть контракт (вкладка Contract). Скрипт реверится с
   `OWNER_MULTISIG must be a contract`, если кода там нет. Рекомендую
   threshold ≥ 2/3 и держать подписантов «на низком старте» во время
   soft-launch (быстрый `pause`).
2. **`feeReceiver`** `0x1Cc4…59De` — адрес штрафов soft-режима. Снапшотится
   в каждый Vault при создании — **необратимо**. Если это EOA, рассмотри
   замену на treasury-multisig до запуска (для будущих вольтов меняется
   `setFeeReceiver`, но уже созданные хранят старый).
3. **Аппаратный кошелёк** (Ledger) для deployer-роли — нужна только для газа
   и сразу отдаёт владение через `transferOwnership`. Плюс mainnet-RPC
   деплоера (Alchemy / Infura / QuickNode).
4. *(Опционально, на потом)* Внешний аудит (Spearbit / Cantina / Code4rena /
   Sherlock). Не входит в этот soft-launch по твоему решению; внутренний
   обзор — в `docs/security-audit.md`.

### 11.2. Подготовка `.env`

```bash
# contracts/.env (НЕ коммитить)
FEE_RECEIVER=0x1Cc4CB5192095E859cFF3fc1C0505Cbe210959De
OWNER_MULTISIG=0xADAa78db09f0f38ca68FF357ba5968c96B2d6D8F
USE_TIMELOCK=false           # выбранный профиль: multisig владеет напрямую
# TIMELOCK_DELAY_SEC=...      # не используется при USE_TIMELOCK=false
```

> **Почему `false`:** см. callout «Выбранный профиль» выше — мгновенный
> `pause()` важнее задержки на смену логики для unaudited soft-launch.
> Компромисс: смена `implementation`/`feeReceiver` для будущих вольтов
> применяется мгновенно по подписи multisig (без 48ч-окна для юзеров).
> Когда захочешь добавить таймлок позже — задеплой `TimelockController`
> и сделай `transferOwnership(timelock)` → `acceptOwnership` (см. §11.5,
> вариант «С timelock»).

### 11.3. Симуляция (без broadcast)

```bash
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url base_mainnet -vvv
```

Покажет, какие адреса задеплоятся, и проверит preconditions. **Никаких
транзакций не отправляется.**

### 11.4. Деплой (broadcast + Ledger)

```bash
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url base_mainnet \
  --ledger \
  --sender 0xYOUR_LEDGER_ADDRESS \
  --broadcast \
  -vvv
```

Если используешь зашифрованный keystore вместо Ledger — `--account <name>
--sender 0x...` (как при тестнет-деплое).

После успешного `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL` запиши из
вывода:
- `Vault implementation` (immutable, нужен для будущих вольтов);
- `Factory` (твой ACTIVE mainnet-факторий);
- `Pending owner` — должен совпадать с `OWNER_MULTISIG` (`0xADAa…6D8F`).

(При `USE_TIMELOCK=false` контракт `Timelock` не создаётся — в выводе
будет `Multisig (pending owner)`.)

### 11.5. Принятие владения (acceptOwnership)

Owner Factory сейчас — **deployer EOA** (Ledger). Pending owner — Multisig.
До приёма владения deployer формально ещё owner, но **уже не может сменить
владельца на другой адрес** (повторный `transferOwnership` он бы мог, но в
штатном потоке этого не делаем).

**Выбранный профиль — без timelock** (`USE_TIMELOCK=false`):

Из Safe-владельца `0x1Cc4…59De` → New transaction → Contract interaction →
адрес **Factory** → метод `acceptOwnership()` → подписать threshold'ом.
После этого `Factory.owner() == Safe`. Одна транзакция, без задержки.

> 🔧 Изначально `pendingOwner` был выставлен на `0xADAa…6D8F`, но он оказался
> не Safe на Base. Деплоер (ещё owner) переназначил владение на `0x1Cc4…59De`
> через `transferOwnership(0x1Cc4…)`, после чего принимаем отсюда. Деталь:
> повторный `transferOwnership` просто перезаписывает `pendingOwner`.

<details>
<summary><b>На будущее — добавление timelock</b> (когда протокол вырастет)</summary>

1. Задеплой `TimelockController` (proposers/executors = `[multisig]`,
   admin = `0x0`, delay ≥ 24h).
2. Из Safe: `Factory.transferOwnership(timelock)`.
3. Из Safe → `timelock.schedule(...)` с `data = 0x79ba5097`
   (`acceptOwnership()`), `target = Factory`, ждёшь `delay`, затем
   `timelock.execute(...)`. После этого owner = Timelock, и любые
   `setImplementation`/`setFeeReceiver`/`pause` идут через задержку.
   (Если хочешь сохранить мгновенный `pause` — сначала добавь отдельную
   guardian-роль в контракт; это уже изменение кода.)
</details>

### 11.6. Верификация исходников

```bash
IMPL=0x...    # из вывода 11.4
FACTORY=0x...
FEE=0x1Cc4CB5192095E859cFF3fc1C0505Cbe210959De

# Sourcify (keyless)
forge verify-contract "$IMPL" src/DiamondHandsVault.sol:DiamondHandsVault \
  --chain 8453 --verifier sourcify

forge verify-contract "$FACTORY" src/DiamondHandsFactory.sol:DiamondHandsFactory \
  --chain 8453 --verifier sourcify \
  --constructor-args $(cast abi-encode "constructor(address,address)" "$IMPL" "$FEE")
```

*(При `USE_TIMELOCK=false` таймлок-контракта нет — верифицировать нечего.
Команда для `TimelockController` понадобится, только когда добавишь таймлок
позже.)*

### 11.7. Включение фронта на mainnet

В Vercel → Settings → Environment Variables:

| Key | Value |
| --- | --- |
| `VITE_USE_TESTNET` | **удалить или не задавать** (mainnet — default) |
| `VITE_FACTORY_ADDRESS` | удалить (дефолт берётся из кода после правки `contracts.ts`) |
| `VITE_LEGACY_FACTORY_ADDRESSES` | удалить (по умолчанию у mainnet `[]`) |
| `VITE_BASE_RPC_URL` | приватный mainnet-RPC (Alchemy / Infura) |
| `VITE_BASE_SEPOLIA_RPC_URL` | можно удалить |

Затем впиши новые адреса в `MAINNET` в `frontend/src/web3/contracts.ts`
(см. TODO там), закоммить, мерж → Vercel автоматом передеплоит на чистый
mainnet-билд. **Обязательно проверь манифест после редеплоя:**
`/.well-known/farcaster.json` — `homeUrl` должен указывать на твой домен.

### 11.8. TVL-кап $1M: мониторинг + пауза

Кап реализован off-chain (пакет `monitoring/`, см. его README). Логика:
монитор суммирует **текущие** балансы всех вольтов, оценивает в USD
(DefiLlama) и алертит на **$800k (80%, WARN)** и **$1M (CRITICAL)** — чтобы
multisig успел поставить `pause()`.

**Настройка после деплоя:**

1. В `monitoring/` задай env (или GitHub-секреты): `BASE_RPC_URL`,
   `FACTORY_ADDRESSES` (новый mainnet-factory + legacy при наличии),
   `START_BLOCK` (блок создания factory из §11.4), опц. `ALERT_WEBHOOK_URL`.
2. Локально/на воркере: `cd monitoring && npm ci && npm run monitor`.
   Для непрерывного контроля — cron раз в 1 мин на маленьком VPS.
3. *(Опц.)* GitHub Actions: задай repo-переменную `TVL_MONITOR_ENABLED=true`
   и секреты выше → workflow `.github/workflows/tvl-monitor.yml` будет
   проверять TVL по расписанию. ⚠️ cron в GHA не realtime (задержки 5–30 мин)
   — для жёсткого контроля используй выделенный воркер.

**Стоп-кран (multisig `pause()`):** при WARN/CRITICAL из Safe `0x1Cc4…59De`
→ Contract interaction → адрес **Factory** → `pause()` → подписать
threshold'ом. После паузы новые вольты создавать нельзя; **существующие НЕ
затронуты** — юзеры всегда могут вывести средства. Снять — `unpause()`.

> **Важно:** `pause()` останавливает только **новые** депозиты. Это
> «мягкий» кап — TVL может на короткое время превысить $1M между проверками
> монитора. Держи буфер (WARN на 80%) и подписантов наготове. Жёсткого
> on-chain капа в этом профиле нет (осознанный выбор — без нового
> неаудированного кода).

### 11.9. Постдеплой-чеклист

- [ ] Owner Safe (`0x1Cc4…59De`) — **реальный Safe на Base mainnet**
      (0xADAa…6D8F оказался не Safe — см. коррекцию в разделе «Адреса»).
- [ ] `Factory.owner()` == Safe `0x1Cc4…59De` (после `acceptOwnership`).
- [ ] `Factory.pendingOwner()` == `0x0`.
- [ ] `Factory.implementation()` == адрес impl из вывода §11.4.
- [ ] `Factory.feeReceiver()` == `0x1Cc4…59De`.
- [ ] Тестовая транзакция: создай вольт на минимальную сумму через фронт.
- [ ] `monitoring/` настроен и запущен; тестовый прогон `npm run monitor`
      показывает TVL и уровень `OK`.
- [ ] Подписанты multisig знают runbook паузы (§11.8) и на связи.
- [ ] Builder Code dataSuffix виден в calldata (последние 16 байт;
      на BaseScan вкладка Input Data).
- [ ] Алерты на события: `VaultCreated`, `Paused`, `ImplementationUpdated`,
      `OwnershipTransferStarted`, `OwnershipTransferred` — Tenderly Alerts
      или OpenZeppelin Defender.

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
- Верификация: ✅ Sourcify (2026-06-11), оба контракта верифицированы.
  BaseScan отображает исходники по Sourcify-матчу.

### Base Mainnet (chainId 8453) — задеплоено 2026-06-14
Профиль: `USE_TIMELOCK=false` (multisig владеет напрямую), TVL-кап $1M
через `monitoring/`.
- DiamondHandsVault implementation: `0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e`
- DiamondHandsFactory: `0x89de426deF37Aa34c17f72d6a73229E64dd93e11`
- Fee receiver: `0x1Cc4CB5192095E859cFF3fc1C0505Cbe210959De`
- Owner (Safe, 2/2): `0x1Cc4CB5192095E859cFF3fc1C0505Cbe210959De`
  - 🔧 **Коррекция (2026-06-14):** деплой задал `OWNER_MULTISIG=0xADAa…6D8F`,
    но этот адрес оказался **не Safe на Base** (Safe-апп: «not a valid Safe
    Account»). Владение переназначено деплоером на рабочий 2/2-Safe
    `0x1Cc4…59De` (он же fee receiver). Т.е. owner == feeReceiver.
- Block: 47318595 · газ всего ≈ 0.0000121 ETH
- Tx hash impl deploy: `0x40cd757e44a5ba4fd5dae22888796b1bfec8a0547f05ff340c50c37cd1131dc8`
- Tx hash factory deploy: `0xb906daf5955c3cd41576f1b687a17e27dc94550ee19736ba91f0548eb8b0b0fb`
- Tx hash transferOwnership→multisig: `0x76a112513234cb98b623cc2b5203dd09ef2072ab3133f8d976ca6d9eb0dfbe6c`
- Верификация: ✅ BaseScan (Etherscan V2), оба контракта `Pass - Verified`.
- Explorer:
  - https://basescan.org/address/0x2391CDBAC7Be38FC72E7bA7609157a3e2e6B823e
  - https://basescan.org/address/0x89de426deF37Aa34c17f72d6a73229E64dd93e11
- ⚠️ Адреса совпадают с Base Sepolia v1 — это детерминированный CREATE
  (тот же деплоер-ключ, nonce 0/1), разные сети, коллизии нет.
- ✅ **Владение принято (2026-06-14):** `owner()` == `0x1Cc4…59De`,
  `pendingOwner()` == `0x0`. Factory под контролем 2/2-Safe.
- Мониторинг: `FACTORY_ADDRESSES=0x89de426deF37Aa34c17f72d6a73229E64dd93e11`,
  `START_BLOCK=47318595`.
- ✅ **Фронт (mainnet):** <https://diamonds-hands.vercel.app> · COOP-заголовок
  `same-origin-allow-popups` выставлен (vercel.json/netlify.toml).
- ✅ **Mini App опубликован, домен verified** (FID 328804). Universal-link для
  шеринга в X/Telegram: <https://farcaster.xyz/miniapps/eAC5uX9rFXVs/diamond-hands>
