# Diamond Hands — Context Brief (Фаза 0)

Документ-паспорт проекта. На этот файл опираются Фаза 1 (контракты),
Фаза 2 (бэкенд/индексация) и Фаза 3 (фронт).

---

## 1. Назначение проекта

Diamond Hands — Web3 миниаппка под Base App (Base L2), которая позволяет
пользователю заблокировать собственный ERC-20 актив (мем-коины, токены
экосистемы Base, токены инфраструктурных проектов) в персональном
on-chain хранилище на заданный срок. Цель — физически лишить себя возможности
продать раньше времени и победить «бумажные руки». Все блокировки персональные,
без custodial-риска: пользователь полностью контролирует свой Vault через
адрес, который указал при создании.

---

## 2. Целевой пользователь

**Кто:** держатели ERC-20 на Base (токены экосистемы Base, мем-коины,
токены инфраструктурных проектов — $VVV, $AVNT, $UP, $MORPHO, $ZORA
и подобные), которые хотят навязать себе HODL-дисциплину.

**Боль:**
- Эмоциональные продажи на просадках.
- Слабая воля при волатильности.
- «Это последний раз» — и снова продал.
- Хочется пройти цикл, но руки тянутся к Sell.
- Спекулятивная позиция кричит «продай на +30%», хотя тезис был на 10x.

**Два сегмента:**
- **Soft mode (Penalty-lock).** Для тех, кому нужна страховка, а не тюрьма.
  Готов потерять часть, чтобы быть психологически защищённым от себя самого.
  Знает что эмердженси-выход доступен, но платит за него штраф, который
  линейно убывает к нулю. **Пользователь сам выбирает жёсткость штрафа
  (5–30%), балансируя комфорт и коммитмент.**
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
2. **Выбор актива.** ERC-20 токен из кошелька (для ETH — заверни
   в WETH, на Base это `0x4200000000000000000000000000000000000006`,
   и используй WETH как актив). Аппка показывает баланс выбранного
   токена. Перед созданием Vault аппка проверяет ERC-20 allowance
   на Factory и при необходимости предлагает approve-транзакцию.
3. **Выбор параметров.** `amount` (> 0), `unlockTimestamp`
   (в диапазоне MIN_LOCK_DURATION — MAX_LOCK_DURATION от now).
4. **Выбор режима.** Radio: Soft (с штрафом) / Hard (без выхода).
   - Для **Soft**: дополнительный slider/radio «Жёсткость штрафа»
     с предустановками 10% / 20% / 30% (или slider 5–30%). Аппка
     показывает превью кривой штрафа для выбранного `maxPenaltyBps`:
     стартует на этом значении в момент создания, линейно убывает
     до 0 на `unlockTimestamp`.
   - Для **Hard**: `maxPenaltyBps` принудительно = 0, экран показывает
     «выйти нельзя до даты X».
5. **Создание Vault.** Одна транзакция: `Factory.createVault(...)` →
   деплой клона + перевод средств в клон + initialize + эмит `VaultCreated`.
   Аппка показывает адрес нового Vault и добавляет его в личный дашборд.
6. **Период ожидания.** В аппке: дашборд со списком всех Vault'ов
   пользователя, прогресс-бар каждого (elapsed / total), текущий `timeLeft`,
   текущий `currentPenaltyBps`. Доступные действия на каждом Vault:
   - `topUp` — добавить актив в существующий Vault.
   - `extendLock` — продлить срок.
   - `emergencyWithdraw` — только если Soft и до анлока.
   - `checkIn` — no-op, эмитит событие (для будущих бэйджей стрика).
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
- `asset` (address) — адрес ERC-20 токена. Не может быть `address(0)`.
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
- `maxPenaltyBps` (uint16) — стартовое значение penalty-кривой, выбрано
  пользователем при создании. Фиксируется навсегда. В hard-mode = 0,
  в soft-mode ∈ [MIN_USER_PENALTY_BPS, ABS_MAX_PENALTY_BPS] = [500, 3000].

**Events:**
- `VaultCreated(address indexed owner, address indexed vault, address indexed asset, uint256 amount, uint256 unlockTimestamp, bool allowEarlyExit, address feeReceiver, uint16 maxPenaltyBps)`
  — 8 полей. `feeReceiver` и `maxPenaltyBps` добавлены, чтобы индексаторы
  и фронт могли отобразить параметры Vault'а без дополнительного
  RPC-вызова к самому клону.
- `Withdrawn(address indexed owner, uint256 amount)`
- `EmergencyWithdrawn(address indexed owner, uint256 amountToOwner, uint256 penaltyAmount)`
- `ToppedUp(address indexed owner, uint256 addedAmount, uint256 newTotalAmount)`
- `LockExtended(uint256 oldUnlockTimestamp, uint256 newUnlockTimestamp)`
- `ImplementationUpdated(address indexed oldImpl, address indexed newImpl)` — на Factory
- `FeeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver)` — на Factory
- `CheckedIn(address indexed owner, uint256 timestamp)`

**Константы Factory (Фаза 1):**
- `MIN_LOCK_DURATION = 7 days` (604_800 секунд).
- `MAX_LOCK_DURATION = 1825 days` (≈ 5 лет, 157_680_000 секунд).
- `MIN_USER_PENALTY_BPS = 500` (5%). Нижняя граница `maxPenaltyBps`
  для soft-mode Vault'ов.
- `ABS_MAX_PENALTY_BPS = 3000` (30%). Верхняя граница `maxPenaltyBps`.
  Защита от случайно-разрушительных значений.
- `BPS_DENOMINATOR = 10000`.

Минимума по amount нет (для ERC-20 без price-oracle нельзя задать
осмысленный порог, MIN-проверка отдаётся UX-слою и/или whitelist'у
в Фазе 2). На уровне контракта только `amount > 0`.

Прежняя константа `MAX_PENALTY_BPS = 2000` (20%) убрана из контракта —
теперь это значение фигурирует только как UI-default в аппке. На уровне
контракта актуальный «верх кривой» хранится в `Vault.maxPenaltyBps`.

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
  работать на RPC + `vaultsByOwner` mapping в Factory (решение open
  question 2).
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
- `topUp(uint256)` — добавить тот же ERC-20 актив через
  `safeTransferFrom` (требуется allowance на Vault).
- `extendLock(uint256)` — продлить срок (только в большую сторону).
- `checkIn()` — no-op + event. Решение по open question 1: оставляем
  в V1 как WTU-friendly «штамп присутствия».

**Anyone:**
- Все view-функции Vault и Factory (read-only).
- Чтение events.

---

## 6.5. Гарантии пользователю

Контракт даёт следующие гарантии, которые не могут быть нарушены даже
Factory owner'ом:

1. **Изоляция средств.** Vault clone полностью изолирован от Factory
   и других Vault'ов. Factory owner НЕ имеет доступа к средствам
   в Vault'ах — ни `pause`, ни `setImplementation`, ни `setFeeReceiver`
   не затрагивают существующие Vault'ы.

2. **Фиксация feeReceiver.** Адрес `feeReceiver`, который пользователь
   видит на момент создания Vault, фиксируется в clone навсегда.
   Команда не может переадресовать штрафы существующих Vault'ов
   на другой адрес — даже если потеряет доступ к исходному
   `feeReceiver`. Это сознательный trade-off безопасности.

3. **Фиксация режима.** Параметр `allowEarlyExit` фиксируется при
   создании и не может быть изменён. Hard-mode Vault невозможно
   «разморозить» — это идеологическое ядро продукта.

4. **Фиксация `maxPenaltyBps`.** Выбранная пользователем жёсткость
   штрафа фиксируется на момент создания. Команда не может задним
   числом увеличить штраф существующих Vault'ов.

5. **Иммутабельность кода Vault.** Implementation Vault'а immutable.
   Factory может задать новый implementation, но это затронет только
   БУДУЩИЕ клоны. Существующие клоны навечно привязаны к версии
   implementation, которая была активна на момент их создания
   (EIP-1167 хардкодит адрес implementation в bytecode клона).

6. **Независимость от паузы Factory.** Пауза Factory останавливает
   только `createVault`. Все функции существующих Vault'ов
   (`withdraw`, `emergencyWithdraw`, `topUp`, `extendLock`, `checkIn`)
   продолжают работать.

---

## 7. Денежный поток

Все операции идут в ERC-20. Нативный токен сети (ETH) в контракте
не используется — функции `createVault` и `topUp` не `payable`,
любая попытка отправить нативный токен реверится автоматически
на уровне Solidity.

| Операция | Из | В | Где CEI критичен |
|---|---|---|---|
| `createVault` | User | Vault clone (через `safeTransferFrom`) | Да: внешний вызов токена. |
| `withdraw` | Vault clone | owner | Да: внешний `safeTransfer`. |
| `emergencyWithdraw` | Vault clone | owner + feeReceiver | Да: два внешних вызова. Отправка на `feeReceiver` пропускается, если `penaltyAmt == 0`. |
| `topUp` | User | Vault clone (через `safeTransferFrom`) | Внешний токен-вызов, nonReentrant. |
| `extendLock` | — | — | Только state change. |
| `checkIn` | — | — | Только event. |

**Где есть внешние вызовы ERC-20 (требует CEI):**
- Приём: `Factory.createVault`, `Vault.topUp` (`safeTransferFrom`).
- Отправка: `Vault.withdraw`, `Vault.emergencyWithdraw` (`safeTransfer`).

**Reentrancy guard:**
- `Vault.withdraw`, `Vault.emergencyWithdraw`, `Vault.topUp` — `nonReentrant` (обязательно).
- `Factory.createVault` — `nonReentrant` **обязательно**. `safeTransferFrom`
  передаёт управление в код ERC-20 токена (untrusted external call),
  что открывает теоретическую возможность reentry в `createVault`
  до завершения initialize-фазы. ReentrancyGuard ~2k газа — дешёвая
  страховка от целого класса атак. Factory наследует `ReentrancyGuard`.

---

## 8. Сценарии провала и edge cases

**Параметры createVault:**
- `amount == 0` → revert.
- `unlockTimestamp <= block.timestamp` → revert.
- `unlockTimestamp - block.timestamp < MIN_LOCK_DURATION` (7 дней) → revert.
- `unlockTimestamp - block.timestamp > MAX_LOCK_DURATION` (1825 дней) → revert.
- `asset == address(0)` → revert `InvalidAsset()`. Нативный токен сети
  не поддерживается; для блокировки ETH пользователь оборачивает
  его в WETH на фронте.
- `asset` есть, но по адресу нет кода (`asset.code.length == 0`) →
  revert (защита от опечаток / самоуничтоженных контрактов).
- Попытка отправить нативный токен с createVault (любой `value > 0`) →
  автоматический revert: функция non-payable.
- **Параметр `maxPenaltyBps`:**
  - Soft-mode (`allowEarlyExit == true`):
    - `maxPenaltyBps < MIN_USER_PENALTY_BPS` (500) → revert.
    - `maxPenaltyBps > ABS_MAX_PENALTY_BPS` (3000) → revert.
  - Hard-mode (`allowEarlyExit == false`):
    - `maxPenaltyBps != 0` → revert. В hard-mode penalty неприменим,
      строгий нуль на параметре — защита от UX-ошибки на фронте
      (юзер случайно протащил soft-настройки в hard-Vault).

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
- **Transfer 0 на старых ERC-20:** некоторые старые / нестандартные
  ERC-20 реверят на `transfer(_, 0)`. Если `penaltyAmt == 0`
  (например, в последние секунды лока, когда `penaltyBps` округляется
  в 0), отправка нулевой суммы на `feeReceiver` могла бы блокировать
  весь `emergencyWithdraw`. **Решение:** в `emergencyWithdraw` отправка
  на `feeReceiver` идёт под условием `if (penaltyAmt > 0)`. При нулевом
  штрафе пользователь получает 100%, отправка на `feeReceiver`
  пропускается. См. раздел про `emergencyWithdraw` ниже.

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
- `emergencyWithdraw()` с `penaltyAmt == 0`: отправка `0` на
  `feeReceiver` пропускается (защита от старых ERC-20, реверящих
  на transfer 0). Пользователь получает полную сумму. См. также
  edge case «Transfer 0 на старых ERC-20» выше.

**initialize:**
- Повторный вызов `initialize()` на том же клоне → revert (Initializable).
- Прямой вызов `initialize()` на самой implementation → revert
  (`_disableInitializers()` в конструкторе).
- Frontrun-инициализация чужим параметрами: невозможна, потому что
  Factory делает clone + initialize атомарно в одной транзакции.

**Reentrancy:**
- ERC-20 callback при `safeTransferFrom` / `safeTransfer` (злонамеренный
  или баг-имеющий токен может попытаться войти в Vault или Factory
  повторно) → защита: `ReentrancyGuard.nonReentrant` на
  `Factory.createVault`, `Vault.withdraw`, `Vault.emergencyWithdraw`,
  `Vault.topUp` + строгий CEI-порядок.

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
- Попытка отправить нативный токен с topUp (любой `value > 0`) →
  автоматический revert: функция non-payable.
- Требуется ERC-20 allowance от пользователя на Vault. Без allowance
  `safeTransferFrom` упадёт.
- `topUp` после `unlockTimestamp` → revert.
  **Обоснование:** лок истёк, добавление средств в «разлоченный» Vault
  бессмысленно — это просто отложенный депозит без блокировки.
- `topUp` после `withdrawn == true` → revert.
- `topUp` близко к анлоку (потенциальный «арбитраж» штрафа): edge case
  задокументирован. См. open question 3.

**checkIn:**
- Только проверка `owner` + `!withdrawn`. Без эффектов, только event.

---

## 9. Что НЕ делаем в V1

- **Нативный ETH как актив для лока.** Контракт работает только
  с ERC-20. Для блокировки ETH пользователь оборачивает его в WETH
  на фронте перед созданием Vault. Функции `createVault` и `topUp`
  объявлены non-payable, любая попытка отправить нативный токен
  реверится автоматически на уровне Solidity. Это сознательное
  упрощение: уходит отдельная ветка для нулевого `asset` во всех
  функциях, уходит низкоуровневая отправка нативного токена,
  уходит обработка прикреплённого к транзакции значения.
- Yield-стратегии (Aave / Morpho / Compound).
- NFT-receipt позиции (transferable ERC-721).
- Лидерборд / social proof.
- Cross-chain функционал.
- Whitelist токенов в Factory.
- Upgradeable Vault (Vault implementation immutable; upgrade только
  через `setImplementation` для БУДУЩИХ клонов).
- Изменение `allowEarlyExit` после создания.
- Изменение `maxPenaltyBps` после создания.
- Перевод владения Vault другому пользователю.
- **Создание Vault для другого адреса.** `msg.sender` в
  `Factory.createVault` всегда становится `owner`'ом Vault'а.
  Подарочные Vault'ы (создать для другого пользователя) — кандидат
  на Фазу 2 через NFT-receipt.
- **Пагинация в `getVaultsByOwner`.** Функция возвращает полный
  массив адресов. Известное ограничение: для пользователей с
  >100 Vault'ов может упереться в газовый лимит RPC. На практике
  типичный пользователь будет иметь 1–10 Vault'ов. Пагинация или
  внешняя индексация (The Graph / Goldsky / Envio) — кандидат
  на Фазу 2.
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
- **`checkIn` + бэйджи стрика** — расширение существующего `checkIn` системой
  бэйджей за длительные серии (off-chain индексация event'а).
- **Частичный withdraw / partial extend.**
- **Social-проф** — Farcaster cast при создании и при успешном завершении.
- **Нативная поддержка ETH без обёртки в WETH.** Возможна через
  добавление обратно ветки `asset == address(0)` в `createVault` /
  `topUp` / `withdraw` / `emergencyWithdraw`. Решение зависит от того,
  насколько часто пользователи запрашивают эту фичу после релиза V1.

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
- **TBD.** Для V1, скорее всего, не нужен: фронт работает на
  RPC + `vaultsByOwner` mapping в Factory (см. решение open question 2).

---

## 12. Зафиксированные решения по open questions (Фаза 0 закрыта)

| # | Вопрос | Решение |
|---|---|---|
| 1 | `checkIn()` в V1 | **Оставить** (штатная функция Vault). |
| 2 | Индексация Vault'ов по owner | **Mapping `vaultsByOwner` в Factory.** |
| 3 | Penalty при `topUp` | **Игнорируем edge case** (вариант A). |
| 4 | Penalty при `extendLock` | **`lockStartedAt = block.timestamp`** на extend (вариант B). |
| 5 | Fee-on-transfer токены | **Поддерживаем через `balanceOf` delta.** |
| 6 | Rebasing-токены | **Документируем риск в UI + README,** не блокируем технически. Whitelist — кандидат в Фазу 2. |
| 7 | Transfer Vault ownership | **НЕТ в V1.** Кандидат на Фазу 2 через NFT-receipt. |
| 8 | `emergencyWithdraw` после `unlockTimestamp` | **Revert `UseWithdrawInstead()`.** Фронт сам подменяет кнопку. |
| 9 | `topUp` после `unlockTimestamp` | **Запрещаем (revert).** |
| 10 | `MAX_LOCK_DURATION` при `extendLock` | **От `now`** (`newUnlockTimestamp − block.timestamp ≤ MAX_LOCK_DURATION`). |
| 11 | Интерфейс `IDiamondHandsVault` | **Вводим.** Используется для типобезопасного вызова `Factory → Vault.initialize`. |
| 12 | Порядок `createVault`: `initialize` ДО/ПОСЛЕ перевода | **ПОСЛЕ.** Factory знает `actualAmount`, передаёт его в `initialize`. Корректно для fee-on-transfer. |
| 13 | `MAX_PENALTY_BPS` | **Параметризован на уровне Vault**, выбирается пользователем в диапазоне `[500, 3000]` bps в soft mode; принудительно `0` в hard mode. Прежняя константа удалена из контракта, остаётся только UI-default. |
| 14 | Поддержка нативного ETH | **УБРАНА из V1.** Контракт работает только с ERC-20. ETH блокируется через WETH (обёртка на фронте, на Base: `0x4200000000000000000000000000000000000006`). Кандидат на Фазу 2 при наличии пользовательского запроса. |

Эти решения фиксируют публичный API контрактов и storage layout для
Фазы 1.
