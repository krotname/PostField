# Выпуск и доставка

GitHub-hosted CI проверяет код и собирает четыре ZIP и исходники. Workflow GitHub Release выпускает неизменяемые assets с аттестацией только из main с успешным CI на том же SHA. Стабильный релиз вызывает Store delivery напрямую: события, созданные GITHUB_TOKEN, могут не запустить второй workflow. Независимый release.published и ручной запуск также поддерживаются. Повторный запуск читает журнал и не создаёт дубли.

| Магазин | API | Первый продукт | Готовность адаптера |
|---|---|---|---|
| Chrome | CWS v2, OAuth refresh | Новый item в кабинете | Contract tests; live setup отсутствует |
| Edge | Update API 1.1, ApiKey | Первичная публикация Partner Center | Contract tests; live setup отсутствует |
| Mozilla | AMO v5, короткий JWT | Новый listed addon и custom license | Contract tests; live setup отсутствует |
| Opera | HTTP кабинета | Новый package | Заблокирован до проверки контракта |

Документация: [Chrome v2](https://developer.chrome.com/docs/webstore/api), [Edge API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api), [AMO API](https://mozilla.github.io/addons-server/topics/api/addons.html), [Opera developer](https://dev.opera.com/extensions/). У Opera публичный opr.addons не является API публикации. Реальные endpoints, cookie/CSRF и правила аутентификации не подтверждены, поэтому OperaStore.ready() возвращает false. UI вместо API не запускается.

## Настройка один раз

1. Создать новые карточки PostField от Kreout; не использовать IDs и ключ PassField. Сохранить публикации, лицензию, privacy URL, скриншоты и инструкции модератору.
2. В GitHub Settings → Environments создать `chrome`, `edge`, `firefox`, `opera`, ограничить deployment основной веткой и новыми release tags. Секреты держать только в соответствующем environment.
3. Chrome vars: `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`; secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` (scope chromewebstore).
4. Edge vars: `EDGE_PRODUCT_ID`; secrets: `EDGE_CLIENT_ID`, `EDGE_API_KEY` API 1.1. Первая версия должна быть опубликована через Partner Center: создание продукта этим API не поддерживается.
5. Firefox vars: `AMO_ADDON_ID=postfield@krot.name`, `AMO_LICENSE_CONFIGURED=true` после настройки custom license из LICENSE; secrets: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`. Метаданные первой listed карточки обязательны; последующие версии наследуют лицензию.
6. Для Opera сначала подтвердить фактический HTTP-контракт загрузки, отправки и readback в собственном авторизованном окне, реализовать адаптер и contract tests. До этого доставка сообщает requires_setup.

Ключ Geoapify пользователя не является секретом магазина. Общий ключ в пакеты не встраивается. PR CI секретов доставки не получает. Недостаточная настройка заканчивается requires_setup и ненулевым кодом, а не фиктивной публикацией.

## Состояния и восстановление

Журнал — отдельная GitHub issue на магазин и tag, связанная с неизменяемыми version/SHA/digest. Перед POST сохраняется uploading/submitting. Потерянный ответ или сбой записи после POST переводит операцию в needs_readback: автоповтор запрещён. Полученный operation ID сохраняется; незавершённая проверка продолжается через API по расписанию 08:15/20:15 МСК. Создание следующей submission разрешено только после подтверждённой загрузки. Разные магазины работают независимо.

pending_review означает ожидание решения. Chrome published проверяется по точной версии и 100% rollout; AMO — по listed версии со статусом public. У Edge успешный operation подтверждает только создание submission: до проверки публичной карточки сохраняется pending_review. Официальный подписанный Firefox XPI и его постоянная установка ещё не подтверждены; GitHub ZIP его не заменяет. После одобрения магазинов требуется отдельный install/readback всех четырёх браузеров.

При needs_readback сопоставить конкретный package/version/operation в кабинете и API. Внести подтверждённый ID и этап в существующий журнал; не очищать журнал для обхода защиты. Отклонение исправлять новой версией, не заменять ZIP выпущенного релиза.

## Качество РФ

Стабильный выпуск закрыт до корпуса не менее 100 независимых публичных адресов из разных регионов, нуля ошибочных автоматических заполнений и ≥90% подтверждённых правильных результатов. `docs/evidence/russia-quality.json` содержит реальную оценку, сейчас not_run. Три адреса в tests/fixtures — стартовая выборка, не доказательство покрытия РФ. Live benchmark читает GEOAPIFY_API_KEY из окружения и выводит только агрегаты. Версия 0.1.0 предназначена для предварительного знакомства.
