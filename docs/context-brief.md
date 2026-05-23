# Diamond Hands — Context Brief (Фаза 0)

Документ-паспорт проекта. На этот файл опираются Фаза 1 (контракты),
Фаза 2 (бэкенд/индексация) и Фаза 3 (фронт).

---

## 1. Назначение проекта

Diamond Hands — Web3 миниаппка под Base App (Base L2), которая позволяет
пользователю заблокировать собственный актив (ETH или ERC-20) в персональном
on-chain хранилище на заданный срок. Цель — физически лишить себя возможности
продать раньше времени и победить «бумажные руки». Все блокировки персональные,
без custodial-риска: пользователь полностью контролирует свой Vault через
адрес, который указал при создании.

---

## 2. Целевой пользователь

**Кто:** держатели ETH и популярных ERC-20 на Base, которые хотят навязать
себе HODL-дисциплину.

**Боль:**
- Эмоциональные продажи на просадках.
- Слабая воля при волатильности.
- «Это последний раз» — и снова продал.
- Хочется пройти цикл, но руки тянутся к Sell.

**Два сегмента:**
- **Soft mode (Penalty-lock).** Для тех, кому нужна страховка, а не тюрьма.
  Готов потерять часть, чтобы быть психологически защищённым от себя самого.
  Знает что эмердженси-выход доступен, но платит за него штраф, который
  линейно убывает к нулю.
- **Hard mode (Time-lock).** Для тех, кто хочет реальный коммитмент.
  Никакой пощады, никаких «ну ладно один раз». Закрыл — забыл до анлока.
  Это режим настоящих Diamond Hands.

**Почему юзают:**
- 1 клик в Base App, нативная интеграция.
- On-chain, не custodial — никто не уведёт, команда не может конфисковать.
- Видимый прогресс лока в аппке — мини-геймификация без насилия.
- Дёшево: Base + EIP-1167 клоны = копеечный газ на каждый Vault.

---

## 3. Core user flow

1. **Первый заход в Base App.** Пользователь открывает Diamond Hands через
   каталог Base App.
2. **Выбор актива.** ETH или ERC-20 из его кошелька. Аппка показывает баланс.
3. **Выбор параметров.** `amount` (≥ MIN_*_AMOUNT), `unlockTimestamp`
   (в диапазоне MIN_LOCK_DURATION — MAX_LOCK_DURATION от now).
4. **Выбор режима.** Radio: Soft (с штрафом) / Hard (без выхода).
   Аппка наглядно показывает: для Soft — текущая кривая штрафа (max 20% при
   немедленном выходе, линейно к 0 на анлок); для Hard — «выйти нельзя
   до даты X».
5. **Создание Vault.** Одна транзакция: `Factory.createVault(...)` →
   деплой клона + перевод средств в клон + initialize + эмит `VaultCreated`.
   Аппка показывает адрес нового Vault и добавляет его в личный дашборд.
6. **Период ожидания.** В аппке: дашборд со списком всех Vault'ов
   пользователя, прогресс-бар каждого (elapsed / total), текущий `timeLeft`,
   текущий `currentPenaltyBps`. Доступные действия на каждом Vault:
   - `topUp` — добавить актив в существующий Vault.
   - `extendLock` — продлить срок.
   - `emergencyWithdraw` — только если Soft и до анлока.
   - (если оставляем) `checkIn` — no-op, эмитит событие.
7. **Сценарий A — withdraw после анлока.** Анлок наступил → кнопка
   «Withdraw» → транзакция → 100% возвращается на адрес владельца.
8. **Сценарий B — emergencyWithdraw до срока (только Soft).** Кнопка
   «Exit Early» → аппка показывает: «вы получите X, штраф Y» → подтверждение
   → транзакция → `(amount − penalty)` идёт пользователю, `penalty` идёт
   на `feeReceiver`.
9. **Повторное использование.** Старый Vault помечается `withdrawn = true`,
   в дашборде уезжает в архив. Пользователь свободно создаёт следующий
   Vault — каждый Vault независим.

---

## 4. On-chain объекты

**Factory (один на сеть):**
- Тип: обычный (не proxy) контракт, immutable код, владелец Ownable2Step.
- Назначение: единая точка создания Vault'ов через `Clones.clone()`.
- Состояние:
  - `implementation` (address) — текущий шаблон Vault'а для НОВЫХ клонов.
  - `feeReceiver` (address) — текущий получатель штрафов для НОВЫХ клонов.
  - `vaultCount` (uint256) — счётчик созданных Vault'ов.
  - `vaultsByOwner` (mapping address ⇒ address[]) — список Vault'ов
    каждого пользователя. См. секцию 5 и open question об индексации.
- Pausable: пауза останавливает только `createVault`. Существующие Vault'ы
  паузой Factory НЕ затрагиваются — пользователь всегда может вывести
  свои средства.

**Vault implementation (один на сеть, immutable):**
- Деплоится один раз, неинициализированный, защищён
  `_disableInitializers()` в конструкторе.
- Используется как шаблон для `Clones.clone()`.
- НЕ хранит ничьих средств, никогда не вызывается напрямую.

**Vault clones (по одному на блокировку):**
- Деплоятся через `Clones.clone()` из Factory.
- Один Vault = один актив + один период лока + один пользователь.
- Один пользователь может иметь сколько угодно Vault'ов параллельно.
- Vault clone полностью изолирован: даже если в Factory сменится
  `implementation` или `feeReceiver`, существующие клоны привязаны к своим.

**Состояние каждого Vault clone:**
- `owner` (address) — владелец позиции (тот, кто создал).
- `asset` (address) — `address(0)` для ETH, иначе адрес ERC-20.
- `amount` (uint256) — ТЕКУЩАЯ суммарная сумма (с учётом всех topUp).
- `createdAt` (uint256) — timestamp создания (метаинформация для UI).
- `lockStartedAt` (uint256) — точка отсчёта текущей penalty-кривой.
  Обновляется при `extendLock`. На момент создания равна `createdAt`.
  См. секцию про penalty и open question.
- `unlockTimestamp` (uint256) — момент анлока.
- `allowEarlyExit` (bool) — режим (Soft / Hard). Фиксируется навсегда.
- `withdrawn` (bool) — финальный статус.
- `feeReceiver` (address) — зафиксирован при `initialize`. См. защиту 6
  в architecture-draft.md.

**Events:**
- `VaultCreated(address indexed owner, address indexed vault, address indexed asset, uint256 amount, uint256 unlockTimestamp, bool allowEarlyExit)`
- `Withdrawn(address indexed owner, uint256 amount)`
- `EmergencyWithdrawn(address indexed owner, uint256 amountToOwner, uint256 penaltyAmount)`
- `ToppedUp(address indexed owner, uint256 addedAmount, uint256 newTotalAmount)`
- `LockExtended(uint256 oldUnlockTimestamp, uint256 newUnlockTimestamp)`
- `ImplementationUpdated(address indexed oldImpl, address indexed newImpl)` — на Factory
- `FeeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver)` — на Factory
- (опционально) `CheckedIn(address indexed owner, uint256 timestamp)`

---

## 5. Off-chain TBD

Не проектируем сейчас, только список:
- **Индексация Vault'ов по owner** — либо `vaultsByOwner` mapping в Factory
  (предлагаю), либо The Graph / Goldsky / Envio. См. open question 2.
- **Уведомления** — «анлок через 24 часа», «штраф упал ниже 10%». Канал
  TBD (push Base App, Farcaster cast, email).
- **Продуктовая аналитика** — создания, withdraw vs emergency, средний
  lock, retention по weeks, конверсия Soft→Hard.
- **Backend stack** — TBD. Для V1, возможно, не нужен вовсе: фронт может
  работать на RPC + indexer.
- **Anti-fraud / wash check** — не нужен в V1, это не казино и не торговая
  площадка. Опционально проверять что owner-адрес не контракт (защита
  от случайных «потерянных» вкладов на адрес без приватного ключа), но
  это ломает кейс с Safe-кошельками. **Решение: НЕ проверять.**

---

## 6. Роли и права

**Factory owner (Ownable2Step):**
- `pause()` / `unpause()` — глобальная пауза `createVault`. Существующие
  Vault'ы НЕ пауз ятся.
- `setImplementation(address)` — ставит шаблон для БУДУЩИХ клонов.
  Старые клоны навсегда привязаны к своей версии (EIP-1167 хардкодит
  адрес implementation в bytecode каждого клона).
- `setFeeReceiver(address)` — ставит получателя штрафов для БУДУЩИХ
  Vault'ов. Существующие Vault'ы хранят свой `feeReceiver` зафиксированным
  на момент `initialize`.
- `transferOwnership(address)` — Ownable2Step, двухшаговый.
- `renounceOwnership()` — **ЗАБЛОКИРОВАН** через override + revert.

**Vault owner (пользователь):**
- `withdraw()` — после анлока, 100% от текущего `amount`.
- `emergencyWithdraw()` — только если `allowEarlyExit == true` и
  `block.timestamp < unlockTimestamp`.
- `topUp(uint256)` — добавить тот же актив. Для ETH — через `msg.value`,
  для ERC-20 — через `safeTransferFrom`.
- `extendLock(uint256)` — продлить срок (только в большую сторону).
- (опционально) `checkIn()` — no-op + event. См. open question 1.

**Anyone:**
- Все view-функции Vault и Factory (read-only).
- Чтение events.

---

## 7. Денежный поток

| Операция | Из | В | Где CEI критичен |
|---|---|---|---|
| `createVault` (ETH) | User | Vault clone (через Factory.forward) | Да: отправка ETH в новый адрес после деплоя клона. |
| `createVault` (ERC-20) | User | Vault clone (через `safeTransferFrom`) | Да: внешний вызов токена. |
| `withdraw` | Vault clone | owner | Да: отправка ETH или ERC-20. |
| `emergencyWithdraw` | Vault clone | owner + feeReceiver | Да: два внешних вызова. |
| `topUp` (ETH) | User | Vault clone (через `msg.value`) | Receive, не send. nonReentrant всё равно. |
| `topUp` (ERC-20) | User | Vault clone (через `safeTransferFrom`) | Внешний токен-вызов, nonReentrant. |
| `extendLock` | — | — | Только state change. |
| `checkIn` | — | — | Только event. |

**Где есть отправка ETH (требует CEI):** `withdraw`, `emergencyWithdraw`,
а также сам `createVault` на стороне Factory (forward msg.value в свежий клон).

**Где есть отправка ERC-20 (требует CEI):** `withdraw`, `emergencyWithdraw`.

**Reentrancy guard:** на `withdraw`, `emergencyWithdraw`, `topUp` в Vault.
На Factory.createVault — guard не строго обязателен (нет внешних untrusted
callback'ов после Effects, потому что initialize вызывается на нашем же
клон-коде), но мы можем поставить для парадигмы.

---

## 8. Сценарии провала и edge cases

**Параметры createVault:**
- `amount == 0` → revert.
- `unlockTimestamp <= block.timestamp` → revert.
- `unlockTimestamp - block.timestamp < MIN_LOCK_DURATION` (7 дней) → revert.
- `unlockTimestamp - block.timestamp > MAX_LOCK_DURATION` (1825 дней) → revert.
- ETH-режим (`asset == address(0)`): `msg.value != amount` → revert;
  `amount < MIN_ETH_AMOUNT` (0.001 ETH) → revert.
- ERC-20 режим: `msg.value != 0` → revert (защита от случайной отправки
  ETH вместе с ERC-20).
- `asset != address(0)` но по адресу нет кода → revert (предлагаю
  проверять `asset.code.length > 0` для защиты от опечаток).

**ERC-20 особенности:**
- **Fee-on-transfer:** фиксируем `actualAmount` через `balanceOf` до/после
  на адресе клона (см. защиту 3 в architecture-draft.md). Если
  `actualAmount == 0` → revert.
- **Rebasing-токены (aave aTokens, stETH-like):** НЕ поддерживаем явно в V1.
  Документируем риск в UI: «позиция может вырасти или уменьшиться без
  вашего участия». Whitelist токенов — кандидат для Фазы 2.
- **USDT-like (no return value):** покрывается `SafeERC20.safeTransferFrom`.
- **Token с blacklist (USDC и т.п.) для feeReceiver:** если адрес
  feeReceiver попал в blacklist токена, `safeTransfer(feeReceiver, penalty)`
  упадёт и весь `emergencyWithdraw` ревертнется. Это известный риск —
  пользователь не сможет выйти раньше срока. **Решение:** Factory owner
  следит чтобы `feeReceiver` был чистым адресом (например, мульти-сиг
  без истории).

**withdraw / emergencyWithdraw:**
- `withdraw()` до `unlockTimestamp` → revert.
- `withdraw()` повторный (`withdrawn == true`) → revert.
- `withdraw()` не-owner'ом → revert.
- `emergencyWithdraw()` на hard-lock Vault (`allowEarlyExit == false`) →
  revert.
- `emergencyWithdraw()` не-owner'ом → revert.
- `emergencyWithdraw()` после `unlockTimestamp` → revert с понятным
  сообщением `UseWithdrawInstead()`. Фронт должен сам подменить кнопку.
  **Обоснование:** если автоматически перенаправлять на `withdraw` без
  штрафа, контракт становится сложнее и появляется неявное поведение.
  Простой revert + клиент-сайд проверка — чище. См. open question 8.

**initialize:**
- Повторный вызов `initialize()` на том же клоне → revert (Initializable).
- Прямой вызов `initialize()` на самой implementation → revert
  (`_disableInitializers()` в конструкторе).
- Frontrun-инициализация чужим параметрами: невозможна, потому что
  Factory делает clone + initialize атомарно в одной транзакции.

**Reentrancy:**
- ETH callback при отправке через `call{value:}` → защита: ReentrancyGuard
  на withdraw/emergencyWithdraw/topUp + CEI порядок.

**extendLock:**
- `newUnlockTimestamp <= unlockTimestamp` → revert.
- `extendLock` после анлока (`block.timestamp >= unlockTimestamp`) →
  revert (нельзя «оживить» истёкший лок).
- `extendLock` после `withdrawn == true` → revert.
- `newUnlockTimestamp - block.timestamp > MAX_LOCK_DURATION` → revert
  (лимит максимума считаем от текущего момента, не от createdAt; иначе
  через несколько extend'ов пользователь упрётся в потолок 5 лет от
  далёкого прошлого).

**topUp:**
- `addAmount == 0` → revert.
- `topUp` с `msg.value != addAmount` для ETH-vault → revert.
- `topUp` с `msg.value != 0` для ERC-20-vault → revert.
- `topUp` после `unlockTimestamp` → revert.
  **Обоснование:** лок истёк, добавление средств в «разлоченный» Vault
  бессмысленно — это просто отложенный депозит без блокировки.
- `topUp` после `withdrawn == true` → revert.
- `topUp` близко к анлоку (потенциальный «арбитраж» штрафа): edge case
  задокументирован. См. open question 3.

**checkIn (если оставляем):**
- Только проверка `owner` + `!withdrawn`. Без эффектов.

---

## 9. Что НЕ делаем в V1

- Yield-стратегии (Aave / Morpho / Compound).
- NFT-receipt позиции (transferable ERC-721).
- Лидерборд / social proof.
- Cross-chain функционал.
- Whitelist токенов в Factory.
- Upgradeable Vault (Vault implementation immutable; upgrade только
  через `setImplementation` для БУДУЩИХ клонов).
- Изменение `allowEarlyExit` после создания.
- Перевод владения Vault другому пользователю.
- Частичный withdraw.
- Множественные lock-периоды внутри одного Vault.
- Penalty pool (штрафы идут на единый `feeReceiver`, не распределяются
  победителям).
- Anti-flash-loan защита (Vault односторонний, нет шансов на атаку).

---

## 10. Кандидаты на Фазу 2

- **NFT-receipt** (ERC-721 на позицию). При создании Vault минтится NFT,
  владелец NFT == владелец позиции. Transferable. Откроет вторичный рынок
  залоченных позиций.
- **Публичный лидерборд** — топ по `amount × lockDurationSeconds`,
  с фильтром по asset.
- **Whitelist токенов через Factory** — защита от fee-on-transfer,
  rebasing, blacklist-токенов.
- **Badge-система за достижения** — «выдержал 30/90/365 дней без
  emergencyWithdraw», «5 завершённых Vault'ов подряд». Опирается на
  events, может считаться off-chain.
- **Penalty pool вместо feeReceiver** — штрафы идут «победителям»
  (тем, кто додержал свой Vault до анлока), а не команде. Сильный
  мотиватор.
- **Yield-стратегии** — во время лока средства идут в Aave / Morpho,
  доходность накапливается пользователю.
- **`checkIn` + бэйджи стрика** — если решим вернуть этот метод.
- **Частичный withdraw / partial extend.**
- **Social-проф** — Farcaster cast при создании и при успешном завершении.
- **Параметризация MAX_PENALTY_BPS на Vault** — пользователь сам выбирает
  «жёсткость» штрафа (например, 10% / 20% / 30%). Больше штраф = больше
  коммитмент.

---

## 11. Tech stack final list

**Контракты (Фаза 1):**
- Solidity `^0.8.24`.
- Foundry (forge, cast, anvil).
- OpenZeppelin Contracts:
  - `Clones` (EIP-1167)
  - `SafeERC20`
  - `ReentrancyGuard`
  - `Ownable2Step`
  - `Pausable`
  - `Initializable`

**Сеть:**
- Base Sepolia (тестнет) → Base Mainnet (после полного цикла).

**Фронт (Фаза 3):**
- React + Vite + TypeScript
- TailwindCSS
- wagmi + viem

**Бэкенд (Фаза 2):**
- **TBD.** Возможно вообще не нужен в V1: фронт может работать на
  RPC + indexer. Окончательное решение по индексации (mapping в Factory
  vs The Graph) определит, нужен ли отдельный бэк-сервис.
