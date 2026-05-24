# Diamond Hands — Architecture Draft (Фаза 0)

Верхнеуровневая архитектура контрактов. Без Solidity-кода — только
сигнатуры, проверки и потоки.

---

## Верхнеуровневая ASCII-схема

```
                         +-------------------------+
                         |  DiamondHandsFactory    |
                         |  (один на сеть)         |
                         |                         |
                         |  наследует:             |
                         |   Ownable2Step,         |
                         |   Pausable,             |
                         |   ReentrancyGuard       |
                         |                         |
                         |  state:                 |
                         |   - implementation      |
                         |   - feeReceiver         |
                         |   - vaultCount          |
                         |   - vaultsByOwner       |
                         |   - owner (Ownable2Step)|
                         |   - paused (Pausable)   |
                         +------------+------------+
                                      |
                                      | createVault(asset, amount,
                                      |             unlockTimestamp,
                                      |             allowEarlyExit,
                                      |             maxPenaltyBps)
                                      v
                       +------------------------------+
                       | Clones.clone(implementation) |
                       +------------------------------+
                                      |
                                      v
              +---------------------------------------------+
              |        Vault clone (EIP-1167 proxy)         |
              |                                             |
              |  delegatecall  ----> implementation code    |
              |  но storage у клона ПЕРСОНАЛЬНЫЙ.           |
              |                                             |
              |  state:                                     |
              |    owner, asset, amount,                    |
              |    createdAt, lockStartedAt,                |
              |    unlockTimestamp, allowEarlyExit,         |
              |    withdrawn, feeReceiver,                  |
              |    maxPenaltyBps                            |
              +----+----+----+----+--------+---------+------+
                   ^    ^    ^    ^        ^         |
       withdraw  / |    |    |    |        | payout to owner
       emergencyW. |    |    | extendLock  v
       topUp ------/    |    |        +----+-----+
                        |    |        |   User   |
                     checkIn |        +----+-----+
                             |             ^
                             |             | penalty
                             v             v
                       +-----+--------+----+----+
                       |      User (owner)      |
                       +------------------------+

                              +------------------+
                              |   feeReceiver    |
                              |   (зафиксирован  |
                              |    в clone на    |
                              |    initialize)   |
                              +------------------+

                       +---------------------------+
                       |  DiamondHandsVault        |
                       |  (implementation)         |
                       |                           |
                       |  IMMUTABLE.               |
                       |  _disableInitializers()   |
                       |  в конструкторе.          |
                       |                           |
                       |  Не хранит средств.       |
                       |  Только код-шаблон для    |
                       |  delegatecall из клонов.  |
                       +---------------------------+
```

### Поток создания одного Vault

1. User делает ERC-20 `approve(Factory, amount)` на токене `asset`
   (отдельная транзакция или часть UX-цепочки).
2. User → `Factory.createVault(asset, amount, unlockTs, allowEarlyExit, maxPenaltyBps)`.
   Функция non-payable: попытка отправить нативный токен реверится.
3. Factory проверяет параметры (MIN/MAX, mode, paused, диапазон
   `maxPenaltyBps` для выбранного mode, `asset != address(0)`,
   `asset.code.length > 0`). `nonReentrant` modifier на этом этапе
   ставит guard.
4. Factory → `Clones.clone(implementation)` → новый адрес `vault`.
5. Factory → `vaultCount++`, `vaultsByOwner[user].push(vault)`.
6. Factory переводит средства в `vault`:
   - Измеряет `balanceBefore = IERC20(asset).balanceOf(vault)`.
   - Делает `safeTransferFrom(user → vault, amount)`.
   - Измеряет `balanceAfter`.
   - Считает `actualAmount = balanceAfter − balanceBefore`.
7. Factory → `IDiamondHandsVault(vault).initialize(user, asset, actualAmount, unlockTs, allowEarlyExit, currentFeeReceiver, maxPenaltyBps)`.
8. Vault.initialize сохраняет state.
9. Factory эмитит `VaultCreated(user, vault, asset, actualAmount, unlockTs, allowEarlyExit, currentFeeReceiver, maxPenaltyBps)`.

### Поток withdraw

1. User (== `Vault.owner`) → `vault.withdraw()`.
2. Checks (owner, время, !withdrawn) → Effects (`withdrawn = true`, обнулить amount) → Interactions (send to user).
3. Event `Withdrawn(owner, payout)`.

### Поток emergencyWithdraw

1. User (== `Vault.owner`) → `vault.emergencyWithdraw()`.
2. Checks (`allowEarlyExit`, `!withdrawn`, до анлока).
3. Effects: расчёт penalty, `withdrawn = true`, обнулить amount.
4. Interactions:
   - `(amount − penalty)` → user (всегда).
   - `penalty` → feeReceiver **только если `penaltyAmt > 0`** (защита
     от старых ERC-20, реверящих на transfer 0).
5. Event `EmergencyWithdrawn(owner, amountToOwner, penaltyAmount)`.

---

## DiamondHandsFactory — функции

**Наследование:** `Ownable2Step`, `Pausable`, `ReentrancyGuard`.

**Константы (immutable / constant в контракте):**
- `MIN_LOCK_DURATION = 7 days`.
- `MAX_LOCK_DURATION = 1825 days` (5 лет).
- `MIN_USER_PENALTY_BPS = 500` (5%).
- `ABS_MAX_PENALTY_BPS = 3000` (30%).
- `BPS_DENOMINATOR = 10000`.

Минимума по `amount` нет: для ERC-20 без price-oracle нельзя задать
осмысленный порог. На уровне контракта только `amount > 0`.

### `constructor(address _implementation, address _feeReceiver)`
- **Visibility:** public (вызывается deployer'ом).
- **Кто может вызвать:** deployer (один раз).
- **Checks:**
  1. `_implementation != address(0)`.
  2. `_implementation.code.length > 0`.
  3. `_feeReceiver != address(0)`.
- **State changes:**
  - `implementation = _implementation`.
  - `feeReceiver = _feeReceiver`.
  - `_transferOwnership(msg.sender)` (Ownable2Step стартовый owner).
- **Events:**
  - `ImplementationUpdated(address(0), _implementation)`.
  - `FeeReceiverUpdated(address(0), _feeReceiver)`.
- **Interactions:** нет.

### `createVault(address asset, uint256 amount, uint256 unlockTimestamp, bool allowEarlyExit, uint16 maxPenaltyBps) external returns (address vault)`
- **Visibility:** external. **NON-payable** — попытка отправить
  нативный токен сети реверится автоматически на уровне Solidity.
- **Modifiers:** `whenNotPaused`, **`nonReentrant`** (обязательно — см. защиту 7).
- **Кто может вызвать:** anyone.
- **Checks (в порядке CEI):**
  1. `!paused()` (через modifier).
  2. `amount > 0`.
  3. `unlockTimestamp >= block.timestamp + MIN_LOCK_DURATION`.
  4. `unlockTimestamp <= block.timestamp + MAX_LOCK_DURATION`.
  5. `asset != address(0)` → иначе revert `InvalidAsset()`
     (нативный токен не поддерживается — для ETH использовать WETH).
  6. `asset.code.length > 0` (защита от опечаток / самоуничтоженных
     контрактов).
  7. **Валидация `maxPenaltyBps`:**
     - Если `allowEarlyExit == true` (soft mode):
       - `maxPenaltyBps >= MIN_USER_PENALTY_BPS` (500).
       - `maxPenaltyBps <= ABS_MAX_PENALTY_BPS` (3000).
     - Если `allowEarlyExit == false` (hard mode):
       - `maxPenaltyBps == 0` (строгий нуль — защита от UX-ошибки
         на фронте).
- **Effects:**
  1. `vault = Clones.clone(implementation)`.
  2. `vaultCount++`.
  3. `vaultsByOwner[msg.sender].push(vault)` (решение open question 2:
     mapping в Factory).
- **Interactions:**
  1. `balanceBefore = IERC20(asset).balanceOf(vault)`.
  2. `IERC20(asset).safeTransferFrom(msg.sender, vault, amount)`
     (требует, чтобы пользователь предварительно сделал `approve`
     на адрес Factory).
  3. `balanceAfter = IERC20(asset).balanceOf(vault)`.
  4. `actualAmount = balanceAfter − balanceBefore`.
  5. require `actualAmount > 0`.
  6. `IDiamondHandsVault(vault).initialize(msg.sender, asset, actualAmount, unlockTimestamp, allowEarlyExit, feeReceiver, maxPenaltyBps)`.
- **Events:**
  - `VaultCreated(msg.sender, vault, asset, actualAmount, unlockTimestamp, allowEarlyExit, feeReceiver, maxPenaltyBps)` — 8 полей.
- **External interactions с untrusted кодом:** да (ERC-20 `transferFrom`).
  Поэтому Effects (clone + counter + mapping) идут ДО `transferFrom`.
  После `transferFrom` вызывается `initialize` — это вызов нашего же
  клон-кода, не untrusted, но всё равно строго после Effects на Factory.
  `nonReentrant` закрывает целый класс атак через злонамеренный
  или баг-имеющий токен, делающий reentry в `createVault`.

### `setImplementation(address newImpl) external onlyOwner`
- **Visibility:** external.
- **Modifiers:** `onlyOwner`.
- **Checks:**
  1. `newImpl != address(0)`.
  2. `newImpl.code.length > 0`.
  3. `newImpl != implementation` (необязательно, но защита от noop).
- **State changes:** `implementation = newImpl`.
- **Events:** `ImplementationUpdated(old, newImpl)`.
- **Interactions:** нет.
- ⚠️ Влияет только на будущие клоны. EIP-1167 хардкодит адрес
  implementation в bytecode каждого клона, существующие клоны
  переключиться не могут.

### `setFeeReceiver(address newReceiver) external onlyOwner`
- **Visibility:** external.
- **Modifiers:** `onlyOwner`.
- **Checks:** `newReceiver != address(0)`.
- **State changes:** `feeReceiver = newReceiver`.
- **Events:** `FeeReceiverUpdated(old, newReceiver)`.
- **Interactions:** нет.
- ⚠️ Влияет только на будущие Vault'ы. Существующие хранят свой
  `feeReceiver` зафиксированным с момента `initialize`. См. защиту 6.

### `pause() external onlyOwner` / `unpause() external onlyOwner`
- Стандартный OpenZeppelin Pausable.
- Останавливает только `createVault`.
- Существующие Vault'ы НЕ затрагиваются: пользователь всегда может
  вывести свои средства (withdraw / emergencyWithdraw / topUp /
  extendLock работают независимо от паузы Factory).

### `renounceOwnership() public override`
- **ЗАБЛОКИРОВАНО.** Реверт с custom error `RenounceOwnershipDisabled()`.
- См. защиту 5.

### View-функции
- `implementation() view returns (address)`.
- `feeReceiver() view returns (address)`.
- `vaultCount() view returns (uint256)`.
- `getVaultsByOwner(address user) view returns (address[] memory)` —
  штатно (решение open question 2: mapping в Factory).
- `paused() view returns (bool)` (из Pausable).
- `owner() view returns (address)` / `pendingOwner() view returns (address)` (из Ownable2Step).

---

## DiamondHandsVault — функции

Implementation и clone используют один и тот же байт-код через
delegatecall. Различие только в том, что в implementation
`_disableInitializers()` сразу заблокировал инициализацию своего же
(никем не используемого) storage.

### `constructor()`
- **Visibility:** public (вызывается один раз при деплое implementation).
- **Тело:** только `_disableInitializers()`. Никакого state.
- **Цель:** защитить implementation от прямой инициализации.

### `initialize(address _owner, address _asset, uint256 _amount, uint256 _unlockTimestamp, bool _allowEarlyExit, address _feeReceiver, uint16 _maxPenaltyBps) external initializer`
- **Visibility:** external. **7 аргументов.**
- **Modifiers:** `initializer` (OpenZeppelin Initializable).
- **Кто может вызвать:** anyone — но по факту только Factory в той же
  транзакции, что и clone. `initializer` modifier гарантирует
  однократность, а атомарность createVault защищает от frontrun-а
  с чужими параметрами.
- **Checks:**
  1. `_owner != address(0)`.
  2. `_asset != address(0)` (двойная страховка: Factory уже проверил;
     Vault фиксирует инвариант «актив всегда ERC-20»).
  3. `_amount > 0`.
  4. `_unlockTimestamp > block.timestamp`.
  5. `_feeReceiver != address(0)`.
  6. Страховка совместимости `_allowEarlyExit` и `_maxPenaltyBps`:
     - Если `_allowEarlyExit == false` → require `_maxPenaltyBps == 0`.
     - Если `_allowEarlyExit == true` → require `_maxPenaltyBps != 0`
       (Factory уже проверил полный диапазон; Vault проверяет инвариант
       «soft mode имеет ненулевой штраф» как двойную страховку).
- **Effects:**
  - `owner = _owner`.
  - `asset = _asset`.
  - `amount = _amount`.
  - `createdAt = block.timestamp`.
  - `lockStartedAt = block.timestamp`.
  - `unlockTimestamp = _unlockTimestamp`.
  - `allowEarlyExit = _allowEarlyExit`.
  - `withdrawn = false`.
  - `feeReceiver = _feeReceiver`.
  - `maxPenaltyBps = _maxPenaltyBps`.
- **Events:** нет (Factory эмитит `VaultCreated` после initialize).
- **Interactions:** нет.

### `withdraw() external nonReentrant`
- **Visibility:** external.
- **Modifiers:** `nonReentrant`.
- **Кто может вызвать:** vaultOwner (проверка через `msg.sender == owner`).
- **Checks:**
  1. `msg.sender == owner`.
  2. `block.timestamp >= unlockTimestamp`.
  3. `!withdrawn`.
- **Effects:**
  1. `withdrawn = true`.
  2. `uint256 payout = amount`.
  3. `amount = 0`.
- **Interactions:**
  - `IERC20(asset).safeTransfer(owner, payout)`.
- **Events:** `Withdrawn(owner, payout)`.

### `emergencyWithdraw() external nonReentrant`
- **Visibility:** external.
- **Modifiers:** `nonReentrant`.
- **Кто может вызвать:** vaultOwner.
- **Checks:**
  1. `msg.sender == owner`.
  2. `allowEarlyExit == true` (иначе revert `HardLockNoExit()`).
  3. `!withdrawn`.
  4. `block.timestamp < unlockTimestamp` (иначе revert
     `UseWithdrawInstead()`).
- **Effects:**
  1. `penaltyAmt = currentPenaltyAmount()`.
  2. `payout = amount − penaltyAmt`.
  3. `withdrawn = true`.
  4. `amount = 0`.
- **Interactions:**
  - `IERC20(asset).safeTransfer(owner, payout)` (всегда).
  - `if (penaltyAmt > 0)` then `IERC20(asset).safeTransfer(feeReceiver, penaltyAmt)`.
  - **Защита transfer 0:** некоторые ERC-20 реверят на `transfer(_, 0)`,
    также по принципу безопасности избегаем лишнего внешнего вызова
    при нулевом значении. Когда `penaltyAmt == 0` (например, в последние
    секунды до анлока — `penaltyBps` округляется в 0), отправка на
    `feeReceiver` пропускается. Пользователь получает 100% от `amount`.
    Это согласуется с инвариантом penalty-кривой: на `unlockTimestamp`
    штраф = 0.
- **Events:** `EmergencyWithdrawn(owner, payout, penaltyAmt)`.

### `topUp(uint256 addAmount) external nonReentrant`
- **Visibility:** external. **NON-payable** — попытка отправить
  нативный токен реверится автоматически.
- **Modifiers:** `nonReentrant`.
- **Кто может вызвать:** vaultOwner.
- **Checks:**
  1. `msg.sender == owner`.
  2. `!withdrawn`.
  3. `block.timestamp < unlockTimestamp`.
  4. `addAmount > 0`.
- **Effects + Interactions (Interactions частично перед Effects, см. ниже):**
  1. `balanceBefore = IERC20(asset).balanceOf(address(this))`.
  2. `IERC20(asset).safeTransferFrom(msg.sender, address(this), addAmount)`
     (требует, чтобы пользователь предварительно сделал `approve`
     на адрес этого Vault).
  3. `balanceAfter = IERC20(asset).balanceOf(address(this))`.
  4. `delta = balanceAfter − balanceBefore`.
  5. require `delta > 0`.
  6. `amount += delta`.
  - Здесь Interactions частично идут перед Effects (мы должны узнать
    фактически полученное), но это безопасно благодаря `nonReentrant`:
    повторный вход с любой функции Vault невозможен.
- **Events:** `ToppedUp(owner, delta, amount)` — `delta` это actual
  received после `balanceOf`-измерения (для fee-on-transfer токенов
  будет меньше, чем заявленный `addAmount`).

### `extendLock(uint256 newUnlockTimestamp) external`
- **Visibility:** external.
- **Modifiers:** нет (нет переводов средств).
- **Кто может вызвать:** vaultOwner.
- **Checks:**
  1. `msg.sender == owner`.
  2. `!withdrawn`.
  3. `block.timestamp < unlockTimestamp` (нельзя продлевать истёкший лок).
  4. `newUnlockTimestamp > unlockTimestamp`.
  5. `newUnlockTimestamp - block.timestamp <= MAX_LOCK_DURATION`
     (лимит считаем от текущего момента — см. open question 10).
- **Effects:**
  - Сохраняем `oldUnlockTimestamp = unlockTimestamp` для event.
  - `unlockTimestamp = newUnlockTimestamp`.
  - **`lockStartedAt = block.timestamp`** (penalty-кривая перезапускается
    — см. секцию про penalty и open question 4).
- **Interactions:** нет.
- **Events:** `LockExtended(oldUnlockTimestamp, newUnlockTimestamp)`.

### `checkIn() external`
- **Visibility:** external.
- **Modifiers:** нет.
- **Кто может вызвать:** vaultOwner.
- **Checks:**
  1. `msg.sender == owner`.
  2. `!withdrawn`.
- **Effects:** нет.
- **Interactions:** нет.
- **Events:** `CheckedIn(owner, block.timestamp)`.
- Решение open question 1: функция штатная, не опциональная.

### View-функции
- `owner() view returns (address)`.
- `asset() view returns (address)`.
- `amount() view returns (uint256)`.
- `createdAt() view returns (uint256)`.
- `lockStartedAt() view returns (uint256)`.
- `unlockTimestamp() view returns (uint256)`.
- `allowEarlyExit() view returns (bool)`.
- `withdrawn() view returns (bool)`.
- `feeReceiver() view returns (address)`.
- `maxPenaltyBps() view returns (uint16)`.
- `timeLeft() view returns (uint256)` — 0, если `block.timestamp >= unlockTimestamp`.
- `currentPenaltyBps() view returns (uint256)` — см. псевдокод ниже.
- `currentPenaltyAmount() view returns (uint256)` — см. псевдокод ниже.

---

## Критические защиты

### 1. Initializable guard на implementation

- В `constructor` implementation вызывается `_disableInitializers()`.
  Это устанавливает версию initializer в `type(uint64).max` на storage
  самой implementation, что блокирует любой будущий вызов `initialize`
  напрямую на её адресе.
- Каждый clone — это EIP-1167 proxy с СОБСТВЕННЫМ storage. У клона
  `_initialized = 0` на старте, modifier `initializer` пройдёт первый
  раз, поставит в 1, заблокирует повторные вызовы.
- **Сценарии, которые отбрасываются:**
  - Прямой вызов `initialize` на implementation → revert (initializers disabled).
  - Повторный вызов `initialize` на clone → revert (initializer modifier).
  - Frontrun-инициализация clone с чужими параметрами: невозможна,
    потому что Factory делает `Clones.clone` и `initialize` атомарно
    в одной транзакции. Между ними никто не успеет встрять.

### 2. ERC-20 режим (единственный)

Контракт поддерживает только ERC-20 активы. Параметр `asset`
в `createVault` обязан быть ненулевым адресом, по которому существует
контракт (`code.length > 0`). Адрес `address(0)` явно реверится
с custom error `InvalidAsset()`.

- `createVault`: функция **non-payable**. `safeTransferFrom(msg.sender, vault, amount)`.
- `topUp`: функция **non-payable**. `safeTransferFrom(msg.sender, address(this), addAmount)`.
- `withdraw`: `safeTransfer(owner, payout)`.
- `emergencyWithdraw`: `safeTransfer(owner, payout)`, и
  `if (penaltyAmt > 0)` то `safeTransfer(feeReceiver, penaltyAmt)`.
- В контракте `amount > 0` всегда.

Нативный токен сети (ETH) в контракте не используется. Если пользователь
хочет залочить ETH — он оборачивает в WETH вне контракта (UI задача
Фазы 3) и передаёт адрес WETH (на Base:
`0x4200000000000000000000000000000000000006`).

Все функции с переводами объявлены non-payable: любая попытка
отправить нативный токен реверится автоматически на уровне Solidity
без необходимости явных проверок.

### 3. Защита от fee-on-transfer токенов

- На стороне `Factory.createVault`:
  1. `balanceBefore = IERC20(asset).balanceOf(vault)`.
  2. `IERC20(asset).safeTransferFrom(msg.sender, vault, amount)`.
  3. `balanceAfter = IERC20(asset).balanceOf(vault)`.
  4. `actualAmount = balanceAfter − balanceBefore`.
  5. require `actualAmount > 0`.
  6. Передаём `actualAmount`, а НЕ заявленный `amount`, в
     `Vault.initialize`.
- На стороне `Vault.topUp` — то же самое, но `balanceOf`
  меряется на `address(this)`:
  1. `balanceBefore = IERC20(asset).balanceOf(address(this))`.
  2. `safeTransferFrom(msg.sender, address(this), addAmount)`.
  3. `balanceAfter = IERC20(asset).balanceOf(address(this))`.
  4. `delta = balanceAfter − balanceBefore`.
  5. require `delta > 0`.
  6. `amount += delta`.

**Архитектурное замечание.** Есть два возможных потока ERC-20 при
createVault:
- **Вариант А (выбран).** `Factory.safeTransferFrom(user → vault)`.
  Factory меряет balance на vault до/после. Передаёт `actualAmount`
  в `initialize`.
- **Вариант Б (отвергнут).** `Vault.initialize` сам вызывает
  `safeTransferFrom(user → this)`. **Не работает:** пользователь
  сделал approve на адрес Factory, а адрес нового Vault он не знает
  заранее, и approve'а на Vault у него нет.

См. open question 12.

### 4. CEI Pattern в каждой функции с переводом средств

| Функция | Checks | Effects | Interactions |
|---|---|---|---|
| `Factory.createVault` | params, `asset != 0`, диапазоны | clone + counters | safeTransferFrom user → vault + balanceOf delta, initialize |
| `Vault.withdraw` | owner, time, !withdrawn | `withdrawn=true`, `amount=0` | safeTransfer to owner |
| `Vault.emergencyWithdraw` | owner, allowEarlyExit, !withdrawn, до анлока | penalty calc, `withdrawn=true`, `amount=0` | safeTransfer to owner, safeTransfer to feeReceiver **только если penaltyAmt > 0** |
| `Vault.topUp` | owner, !withdrawn, до анлока, addAmount>0 | (после Interactions) `amount += delta` | safeTransferFrom + balanceOf delta |
| `Vault.extendLock` | owner, !withdrawn, до анлока, newTs > oldTs, лимит | `unlockTimestamp`, `lockStartedAt` | — |
| `Vault.checkIn` | owner, !withdrawn | — | — |

**`ReentrancyGuard.nonReentrant`** ставим на:
- `Vault.withdraw` — обязательно.
- `Vault.emergencyWithdraw` — обязательно.
- `Vault.topUp` — обязательно.
- `Factory.createVault` — **обязательно** (см. защиту 7 ниже).

На `extendLock` и `checkIn` не нужно (нет внешних вызовов).

### 5. renounceOwnership заблокирован на Factory

```
function renounceOwnership() public override {
    revert RenounceOwnershipDisabled();
}
```

**Причина:** если Factory лишится owner'а, нельзя будет:
- обновить `implementation` для будущих клонов;
- обновить `feeReceiver` для будущих Vault'ов;
- поставить на паузу при инциденте.

Существующие Vault'ы это не сломает (они полностью immutable и
независимы от Factory.owner после initialize), но эволюция протокола
встанет навсегда.

### 6. feeReceiver зафиксирован в Vault clone

- Vault clone хранит свой собственный `feeReceiver` в storage,
  полученный на `initialize`.
- Vault clone НЕ читает `feeReceiver` динамически из Factory.
- Иначе Factory owner мог бы менять получателя penalty для уже
  существующих Vault'ов задним числом. Это нарушило бы явное
  обещание пользователю: «штраф уйдёт по адресу X, который ты
  видел на момент создания».
- **Trade-off:** команда не может переадресовать penalty для старых
  Vault'ов, например, при потере доступа к feeReceiver. Решение:
  Factory.setFeeReceiver обновит адрес для всех БУДУЩИХ Vault'ов;
  старые останутся со старым адресом. Это правильное поведение
  для V1.

### 7. nonReentrant на Factory.createVault — обязательно

- Factory наследует `ReentrancyGuard` (см. секцию «Наследование»
  в спецификации Factory).
- `createVault` помечен `nonReentrant`.
- **Обоснование:**
  - `IERC20.safeTransferFrom(user, vault, amount)` передаёт управление
    в код самого ERC-20 токена. Это **untrusted external call**.
    Злонамеренный или баг-имеющий токен может попытаться сделать
    reentry в `createVault` до того, как первоначальный вызов завершил
    `initialize`.
  - Между Effects (clone + counter + push в mapping) и Interactions
    (transferFrom + initialize) проходит несколько внешних вызовов.
    Без guard'а возможны сценарии вида «токен делает reentry,
    мейнтейнер пушит фантомный Vault в mapping, и т. п.».
  - ReentrancyGuard стоит ~2k газа на вызов — дешёвая страховка
    от целого класса атак, плюс стандартная best practice для функций
    с external calls и state changes.

### 8. Защита от revert на transfer 0 в emergencyWithdraw

- Некоторые старые / нестандартные ERC-20 реверят на `transfer(_, 0)`.
- Если `penaltyAmt == 0` (последние секунды до анлока, когда
  `(maxPenaltyBps * timeLeft) / totalDuration` округляется в 0),
  отправка нулевой суммы на `feeReceiver` могла бы заблокировать весь
  `emergencyWithdraw`.
- **Решение:** в `emergencyWithdraw` обёрнуть отправку penalty
  в `if (penaltyAmt > 0)`. При нулевом штрафе пользователь получает
  100% от `amount`, отправка на `feeReceiver` пропускается.
- Это согласуется с инвариантом penalty-кривой: на момент
  `unlockTimestamp` штраф = 0, и пользователь и так получил бы 100%
  через обычный `withdraw`. `emergencyWithdraw` с `penaltyAmt == 0`
  выдаёт тот же результат, не упирается в нестандартный токен.

---

## Расчёт penalty — псевдокод

```
function currentPenaltyBps() returns uint256:
    if block.timestamp >= unlockTimestamp:
        return 0
    if !allowEarlyExit:
        return 0   # hard-mode: penalty формально не применим
                   # (emergencyWithdraw всё равно ревертится),
                   # но из view-функции отдаём 0 для UI.
    timeLeft = unlockTimestamp - block.timestamp
    totalDuration = unlockTimestamp - lockStartedAt
    # ВНИМАНИЕ: используется lockStartedAt, не createdAt.
    # lockStartedAt сбрасывается в block.timestamp при extendLock.
    # createdAt сохраняется навсегда для аналитики "когда позиция
    # создана впервые".
    # maxPenaltyBps — поле Vault, зафиксированное при initialize,
    # из диапазона [MIN_USER_PENALTY_BPS=500, ABS_MAX_PENALTY_BPS=3000]
    # для soft-mode и == 0 для hard-mode.
    return (maxPenaltyBps * timeLeft) / totalDuration

function currentPenaltyAmount() returns uint256:
    return (amount * currentPenaltyBps()) / BPS_DENOMINATOR

Свойства:
  - penaltyBps ∈ [0, maxPenaltyBps].
  - Для soft-mode: maxPenaltyBps ∈ [500, 3000].
  - Для hard-mode: maxPenaltyBps == 0, penaltyBps всегда == 0.
  - Строго убывает по времени между lockStartedAt и unlockTimestamp.
  - = maxPenaltyBps на lockStartedAt.
  - = 0 на unlockTimestamp.
  - Целочисленное деление безопасно: timeLeft <= totalDuration,
    maxPenaltyBps * timeLeft не переполняет uint256 при реалистичных
    лимитах (MAX_LOCK_DURATION = 5 лет ≈ 1.58e8 секунд;
    1.58e8 * 3000 ≈ 4.74e11 — далеко от 2^256).
```

### Проблема 1: topUp близко к анлоку

**Сценарий.** Lock 100 дней, прошло 99. timeLeft=1, totalDuration=100,
`currentPenaltyBps` = 2000 × 1 / 100 = 20 (= 0.2%). Пользователь делает
`topUp +10` единиц токена. Теперь `amount = старая + 10`. Если он сразу
же вызовет `emergencyWithdraw`, штраф будет 0.2% от ВСЕЙ суммы, включая
только что добавленные 10 единиц. То есть свежий депозит залочен
с почти нулевым штрафом.

**Это эксплойт?** Технически нет — пользователь не выкачивает протокол,
он лишь «недоплачивает» штраф на свежие средства. Это потеря revenue,
не потеря средств других пользователей.

**Варианты решения:**
- **A. Игнорируем.** Простой контракт, документируем как known soft
  edge case в UI («штраф рассчитывается от ОБЩЕЙ суммы по текущей
  кривой»). Penalty всё ещё имеет смысл — если пользователь часто
  топапит близко к анлоку, он по сути просто покупает право на
  отложенную ликвидность с малым штрафом.
- **B. Запретить topUp в последние X% срока.** Например, требовать
  `block.timestamp − lockStartedAt < 80% × totalDuration`. Блокирует
  «арбитраж» штрафа, но создаёт UX-edge: «почему я не могу пополнить?».
- **C. Хранить массив депозитов с индивидуальными `lockStartedAt`.**
  Каждый депозит имеет свою penalty-кривую. Точно и справедливо, но
  сильно усложняет storage, расчёт, газ. Возможно через хеш-агрегацию,
  но не для V1.

**Предлагаю Вариант A для V1.** Простота контракта важнее идеальной
penalty-модели. Edge case задокументирован. См. open question 3.

### Проблема 2: extendLock и penalty curve

**Сценарий.** Lock 100 дней, прошло 50. `lockStartedAt=t0`,
`unlockTimestamp=t0+100`, `currentPenaltyBps` = 2000 × 50 / 100 = 1000
(= 10%). Пользователь продлевает: `extendLock(t0+200)`.

**Если `lockStartedAt` НЕ меняется (createdAt = lockStartedAt):**
- `totalDuration = 200`, `timeLeft = 150`.
- `currentPenaltyBps = 2000 × 150 / 200 = 1500 (= 15%)`.
- **Парадокс: пользователь продлил коммитмент → штраф вырос.**
  Контринтуитивно.

**Если `lockStartedAt = block.timestamp` при extend (предлагаемое
решение):**
- `lockStartedAt = t0 + 50`, `unlockTimestamp = t0 + 200`,
  `totalDuration = 150`, `timeLeft = 150`.
- `currentPenaltyBps = 2000` (= MAX).
- **Penalty-кривая «перезапускается» с максимума.** Жёстко в моменте,
  но честно: расширение лока = новый коммитмент.

**Варианты:**
- **A. Не меняем lockStartedAt.** Штраф растёт после extend. Плохой UX.
- **B. lockStartedAt = block.timestamp на extend (выбран).**
  Penalty curve перезапускается с MAX. Реализационно — одна строка.
  Семантически чисто.
- **C. Хранить отдельно `originalCreatedAt` и пересчитывать
  `lockStartedAt` так, чтобы текущий `currentPenaltyBps` остался
  тем же при extend.** Математически возможно, но сложнее и хуже
  тестируется.
- **D. Убрать extendLock из V1.** Лишимся одного WTU-friendly действия.

**Предлагаю Вариант B.** В аппке предупреждение: «после продления штраф
вернётся к 20% и снова будет линейно убывать по новой кривой».
Пользователь явно соглашается с условием. См. open question 4.

**Decision impact:** в storage Vault'а ВВОДИМ отдельное поле
`lockStartedAt`. Поле `createdAt` сохраняется для аналитики «когда
Vault создан впервые» и не меняется никогда. `currentPenaltyBps`
использует `lockStartedAt`.

---

## Открытые вопросы для Фазы 1

Перед написанием Solidity нужно подтвердить или поправить:

1. **`checkIn()` — оставляем или убираем из V1?**
   - **За:** регулярные WTU без затрат на topUp/extend, лёгкое
     UX-действие, базис для бэйджей стрика в Фазе 2.
   - **Против:** пользователь платит газ за no-op, +bytecode на Vault,
     бэйджи можно считать off-chain от VaultCreated event'а и времени.
   - **Моё предложение: УБРАТЬ из V1.** WTU будет двигаться через
     create / withdraw / emergency / topUp / extendLock — этих
     действий достаточно. `checkIn` — кандидат в Фазу 2 вместе с
     бэйджами.

2. **Индексация Vault'ов по owner — mapping в Factory или только events?**
   - **A. `mapping(address ⇒ address[]) vaultsByOwner` в Factory.**
     Простота фронта (один call `getVaultsByOwner`). Газ overhead на
     `createVault` ≈ 20k газа на SSTORE — это ~$0.001 на Base.
   - **B. Только events.** Дешевле `createVault`. Требует индексатора
     (своя нода / The Graph / Goldsky / Envio) уже в V1.
   - **Моё предложение: A (mapping).** Газ дёшев, фронту проще,
     индексатор подключим в Фазе 2.

3. **Penalty при topUp.**
   - Вариант A: игнорируем edge case (свежий депозит штрафуется по
     текущей кривой, в конце лока штраф почти 0).
   - Вариант B: запретить `topUp` в последние X% срока.
   - **Моё предложение: A.** Простой контракт, edge case в доке.

4. **Penalty при extendLock.**
   - Вариант A: `lockStartedAt` не трогаем, штраф растёт после extend.
   - Вариант B: `lockStartedAt = block.timestamp` при extend,
     penalty-кривая рестартится с MAX (= 20%).
   - Вариант C: сложная формула сохранения текущего штрафа.
   - **Моё предложение: B.** В storage добавляется поле
     `lockStartedAt` (отдельно от `createdAt`).

5. **Поддержка fee-on-transfer токенов.**
   - Через `balanceOf` delta (поддерживаем) или явный блок через
     whitelist (Фаза 2)?
   - **Моё предложение: поддерживаем через delta.** Стандартная
     защита, не блокирует легитимные токены. Whitelist — кандидат
     в Фазу 2.

6. **rebasing-токены.**
   - Документируем риск и не поддерживаем явно;
   - блокируем через whitelist в Фазе 2;
   - просто игнорируем.
   - **Моё предложение: документируем риск в UI + README, технически
     не блокируем в V1, whitelist в Фазе 2.**

7. **Передача владения Vault другому адресу.**
   - Ты сказал «НЕТ для V1». **Подтверждаю что это решение учтено:**
     `transferOwnership` на Vault нет, `owner` фиксируется на
     `initialize` и не меняется. Подтверди что решение не изменилось.

8. **Поведение `emergencyWithdraw` после `unlockTimestamp`.**
   - revert с `UseWithdrawInstead()` (фронт сам подменяет кнопку);
   - автоматический фолбэк в обычный `withdraw` без штрафа.
   - **Моё предложение: revert.** Простота кода + однозначность UX.
     Защита от ошибки пользователя реализуется на фронте.

9. **Топап после анлока.**
   - Запрещаем (revert)?
   - **Моё предложение: запрещаем.** Топап в незалоченную позицию
     бессмыслен.

10. **`MAX_LOCK_DURATION` при extendLock — от `createdAt` или от `now`?**
    - **Моё предложение: от `now`.** То есть
      `newUnlockTimestamp − block.timestamp <= MAX_LOCK_DURATION`.
      Иначе после нескольких extend'ов пользователь упрётся в потолок
      «5 лет от далёкого прошлого» и не сможет дальше продлевать.

11. **Интерфейс `IDiamondHandsVault`.**
    - Использовать ли отдельный interface-файл для типобезопасного
      вызова `Factory → Vault.initialize`?
    - **Моё предложение: ввести.** ~10 строк кода. Бонус читаемости и
      типобезопасности.

12. **Архитектура `createVault` — `initialize` ДО или ПОСЛЕ перевода
    средств в clone?**
    - ДО: `initialize` не может опираться на actual balance.
      Сохраняем заявленный `amount`. Не корректно для
      fee-on-transfer токенов.
    - ПОСЛЕ: Factory знает `actualAmount`, передаёт в `initialize`.
      Корректно для fee-on-transfer.
    - **Моё предложение: ПОСЛЕ.** Это согласуется с защитой 3.

---

## Зафиксированные решения по open questions (Фаза 0 закрыта)

| # | Вопрос | Решение | Что меняет в архитектуре |
|---|---|---|---|
| 1 | `checkIn()` в V1 | **Оставить.** | Штатная функция Vault + event `CheckedIn`. |
| 2 | Индексация Vault'ов | **Mapping `vaultsByOwner` в Factory.** | `vaultsByOwner` mapping и `getVaultsByOwner` view — обязательны. |
| 3 | Penalty при `topUp` | **Игнорируем edge case** (вариант A). | Простая формула на основе `amount` и `lockStartedAt`, без массива депозитов. |
| 4 | Penalty при `extendLock` | **`lockStartedAt = block.timestamp`** при extend (вариант B). | В storage Vault'а есть поле `lockStartedAt`, обновляется в `extendLock`. |
| 5 | Fee-on-transfer | **Поддерживаем через `balanceOf` delta.** | `balanceOf` до/после в `Factory.createVault` и `Vault.topUp`. |
| 6 | Rebasing-токены | **Документируем риск,** не блокируем технически. | Без изменений в контрактах. Whitelist — Фаза 2. |
| 7 | Transfer Vault ownership | **НЕТ в V1.** | На Vault нет `transferOwnership`. `owner` зафиксирован в `initialize`. |
| 8 | `emergencyWithdraw` после `unlockTimestamp` | **Revert `UseWithdrawInstead()`.** | Дополнительный check в `emergencyWithdraw`. |
| 9 | `topUp` после `unlockTimestamp` | **Revert.** | Дополнительный check в `topUp`. |
| 10 | `MAX_LOCK_DURATION` при `extendLock` | **От `now`.** | `extendLock` проверяет `newUnlockTimestamp − block.timestamp ≤ MAX_LOCK_DURATION`. |
| 11 | Интерфейс `IDiamondHandsVault` | **Ввести.** | Отдельный interface-файл, Factory вызывает Vault через него. |
| 12 | Порядок `createVault`: initialize ДО/ПОСЛЕ | **ПОСЛЕ перевода.** | Factory сначала переводит средства, потом вызывает `initialize(..., actualAmount, ...)`. |
| 13 | `MAX_PENALTY_BPS` | **Параметризован на уровне Vault**, выбирается пользователем в диапазоне `[500, 3000]` bps в soft mode; принудительно `0` в hard mode. Прежняя константа удалена из контракта. | В storage Vault'а есть поле `uint16 maxPenaltyBps`. `Factory.createVault` и `Vault.initialize` получают параметр `maxPenaltyBps`. `currentPenaltyBps` использует поле, а не константу. Event `VaultCreated` включает `maxPenaltyBps`. В Factory добавлены константы `MIN_USER_PENALTY_BPS=500` и `ABS_MAX_PENALTY_BPS=3000`. |
| 14 | Поддержка нативного ETH | **УБРАНА из V1.** Контракт работает только с ERC-20. ETH блокируется через WETH (обёртка на фронте, на Base: `0x4200000000000000000000000000000000000006`). Кандидат на Фазу 2 при наличии пользовательского запроса. | `createVault` и `topUp` non-payable. Убрана отдельная ветка для нулевого `asset` во всех функциях. Убрана минимальная-сумма-в-нативном-токене (бывшая константа Factory). В `Factory.createVault` явный revert `InvalidAsset()` при `asset == address(0)`. Низкоуровневая отправка нативного токена больше не нужна. |

Эти решения фиксируют публичный API контрактов и storage layout для
Фазы 1. Можно переходить к написанию Solidity.
