# Выпуск и доставка

GitHub-hosted CI проверяет код и собирает четыре ZIP и исходники. Workflow GitHub Release выпускает неизменяемые assets с аттестацией только из main с успешным CI на том же SHA. Стабильный релиз вызывает Store delivery напрямую: события, созданные GITHUB_TOKEN, могут не запустить второй workflow. Независимый release.published и ручной запуск также поддерживаются. Повторный запуск читает журнал и не создаёт дубли.

| Магазин | API | Первый продукт | Готовность адаптера |
|---|---|---|---|
| Chrome | CWS v2, OAuth refresh | Регистрация, затем новый item | OAuth refresh HTTP200; item отсутствует |
| Edge | Update API 1.1, ApiKey | Новый InDraft product | Credentials настроены; первый release не выполнен |
| Mozilla | AMO v5, короткий JWT | Новый listed addon и custom license | JWT HTTP200; карточка отсутствует |
| Opera | HTTP кабинета | Новый package | Заблокирован до проверки контракта |

Документация: [Chrome v2](https://developer.chrome.com/docs/webstore/api), [Edge API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api), [AMO API](https://mozilla.github.io/addons-server/topics/api/addons.html), [Opera developer](https://dev.opera.com/extensions/). У Opera публичный opr.addons не является API публикации. Проверены маршруты официального клиента: `/api/file-upload/`, `/api/developer/packages/`, `/api/developer/package-versions/` и `submit_for_moderation/`, Accept `application/json; version=1.0`. OPTIONS подтверждает доступные методы. Новая HTTP-аутентификация и контракт ответов после загрузки ещё не проверены, поэтому OperaStore.ready() возвращает false. UI вместо API не запускается.

## Настройка один раз

1. Создать новые карточки PostField от Kreout; не использовать IDs и ключ PassField. Сохранить публикации, лицензию, privacy URL, скриншоты и инструкции модератору.
2. В GitHub Settings → Environments создать `chrome`, `edge`, `firefox`, `opera`, ограничить deployment основной веткой и новыми release tags. Секреты держать только в соответствующем environment.
3. Chrome vars: `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`; secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` (scope chromewebstore).
4. Edge vars: `EDGE_PRODUCT_ID`; secrets: `EDGE_CLIENT_ID`, `EDGE_API_KEY` API 1.1. Первая версия должна быть опубликована через Partner Center: создание продукта этим API не поддерживается.
5. Firefox vars: `AMO_ADDON_ID=postfield@krot.name`, `AMO_LICENSE_CONFIGURED=true` после настройки custom license из LICENSE; secrets: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`. Метаданные первой listed карточки обязательны; последующие версии наследуют лицензию.
6. Для Opera сначала подтвердить фактический HTTP-контракт загрузки, отправки и readback в собственном авторизованном окне, реализовать адаптер и contract tests. До этого доставка сообщает requires_setup.

Ключ Geoapify пользователя не является секретом магазина. Общий ключ в пакеты не встраивается. PR CI секретов доставки не получает. Недостаточная настройка заканчивается requires_setup и ненулевым кодом, а не фиктивной публикацией.

Подтверждено 14.10.2026: все четыре environment созданы, Chrome OAuth и AMO JWT проверены настоящими HTTP-запросами. Новый Edge product a8f939c3-649a-476d-a638-660e09c8b742 существует в InDraft; privacy/support/homepage и single purpose сохранены и перечитаны. Не создавать второй draft. API1.1 ещё не прошёл update/upload с пакетом: сначала требуется первая публикация Partner Center. Непреодолённые условия: разрешённая регистрация Chrome ($5), выбор публичного имени общего AMO профиля krotname, первая listed карточка и custom license, свежая native HTTP auth Opera. Платежи и переименование не выполнялись. [Точный журнал настройки](https://github.com/krotname/PostField/issues/5) и [профиль](../PRODUCT_PROFILE.md). Изменение credentials не разрешает повтор неизвестного POST.

## Состояния и восстановление

Журнал — отдельная GitHub issue на магазин и tag, связанная с неизменяемыми version/SHA/digest. Перед POST сохраняется uploading/submitting. Потерянный ответ или сбой записи после POST переводит операцию в needs_readback: автоповтор запрещён. Полученный operation ID сохраняется; незавершённая проверка продолжается через API по расписанию 08:15/20:15 МСК. Создание следующей submission разрешено только после подтверждённой загрузки. Разные магазины работают независимо.

pending_review означает ожидание решения. Chrome published проверяется по точной версии и 100% rollout; AMO — по listed версии со статусом public. У Edge успешный operation подтверждает только создание submission: до проверки публичной карточки сохраняется pending_review. Временная утрата credentials не сбрасывает uploaded/pending_review и не удаляет operation IDs. Официальный подписанный Firefox XPI и его постоянная установка ещё не подтверждены; GitHub ZIP его не заменяет. После одобрения магазинов требуется отдельный install/readback всех четырёх браузеров.

При needs_readback сопоставить конкретный package/version/operation в кабинете и API. Внести подтверждённый ID и этап в существующий журнал; не очищать журнал для обхода защиты. Отклонение исправлять новой версией, не заменять ZIP выпущенного релиза.

## Качество РФ

Стабильный выпуск закрыт до корпуса ≥100 разных публичных адресов с подтверждёнными индексами из ≥10 регионов, доли каждого региона ≤20%, нуля ошибочных автоматических заполнений и ≥90% правильных подтверждений. Повторы после нормализации и повреждённые записи отклоняются до запроса к провайдеру. `docs/evidence/russia-quality.json` содержит живую оценку baseline 0.1.0: 117 адресов, 26 регионов, 13 неверных автоматических вставок, 5 ошибок, 5,98% правильных автоматических результатов; status=insufficient. Источники и пределы измерения: [RUSSIA_QUALITY.md](evidence/RUSSIA_QUALITY.md). С версии 0.1.1 Geoapify для РФ требует проверки и явного выбора; актуальная реализация не прошла порог автоматического заполнения. Live benchmark читает GEOAPIFY_API_KEY из окружения и выводит только агрегаты. Предварительный выпуск не запускает доставку в магазины.

С 0.1.4 benchmark до чтения ключа отклоняет все 117 исторических адресов (`historical_corpus_overlap`), а не только 48 адресов каталога (`catalogue_corpus_overlap`); прежняя ошибка каталога имеет приоритет. Для защиты от иных названий улиц исключены и ранее использованные страницы источников (query, fragment и завершающий слеш не учитываются). Отдельный `tests/fixtures/russia-independent-corpus.json` содержит 100 новых адресов, 40 регионов, максимум 9%. Корпус не входит в исправления. Live-запросы на нём не выполнялись: при текущей политике даже идеальные ответы дают 100 ручных вариантов и 0 автоматических подтверждений. [Offline-отчёт](evidence/russia-independent-policy.json) не является живым измерением и не открывает stable gate. До нового поведения, подтверждающего индекс дома вне каталога, повторные Geoapify-запросы не смогут выполнить порог ≥90%.
