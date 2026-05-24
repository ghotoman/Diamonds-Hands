# Claude Code Rules — Diamond Hands

## Контекст проекта

Diamond Hands — Web3 миниаппка под Base App. Контракты в contracts/.
Полная спецификация: docs/context-brief.md и docs/architecture-draft.md.

## Правила автоверификации

После КАЖДОЙ задачи изменения кода или конфигурации:
1. Прогони `forge build` (если меняли .sol) или `forge test`
   (если меняли тесты). Из contracts/.
2. Если упало — НЕ продолжай. Сначала чини.
3. После создания файла — прочитай его обратно через `cat` или `view`.
   Убедись что содержимое корректное.
4. Никогда не говори "готово" без проверки.

## Запреты

- НЕ коммить .env (только .env.example)
- НЕ записывай приватные ключи или реальные API-ключи никуда
- НЕ деплой без явной команды от пользователя
- НЕ меняй Solidity-версию (0.8.24 фиксированная)
- НЕ добавляй upgradeable patterns на Vault. Vault immutable
- НЕ используй tx.origin
- НЕ используй transfer()/send() для ETH (только call{value:})
- НЕ меняй структуру docs/ без явной команды

## Спецификация контрактов

Источник правды — docs/architecture-draft.md, секция "Зафиксированные
решения по open questions (Фаза 0 закрыта)", таблица #1–#14.

Ключевые инварианты:
- Vault clone IMMUTABLE после initialize
- feeReceiver зафиксирован в clone при initialize, не читается
  динамически из Factory
- allowEarlyExit фиксируется при создании, не меняется
- maxPenaltyBps фиксируется при создании, не меняется
- ETH не поддерживается, только ERC-20 (createVault non-payable)
- _disableInitializers() в конструкторе implementation
- nonReentrant на withdraw, emergencyWithdraw, topUp, createVault
- CEI Pattern строго во всех функциях с переводом средств
- emergencyWithdraw: if (penaltyAmt > 0) для отправки на feeReceiver
- renounceOwnership на Factory заблокирован

## Адреса (заполняются после деплоя)

См. docs/deploy.md.
