# PostField — профиль выпуска

## Решение о выпуске 0.4.0 — 22.10.2026

Сохранены текущие правила автоподстановки с явным предупреждением о возможной ошибке. По решению владельца показатели живого benchmark публикуются, но больше не блокируют stable release и доставку. Обязательные CI, соответствие версии и SHA, неизменяемость пакетов и проверка магазинов сохранены.

Избранные адреса добавляются вручную в настройках: полный адрес и индекс хранятся локально, используются до HTTP-запроса и не попадают в общий каталог. Подтверждение при повторной подстановке включается отдельно для каждой записи; по умолчанию выключено. Сохранение, изменение и удаление списка доступны только страницам расширения. Ручное значение в форме и защита от устаревшего ответа сохранены.

Живой замер исходников 0.3.0 (`f0677eb27e444a740f105c9c4c0ae393a1e3fc3b`) на независимых 100 адресах ФНС, 40 регионов, максимум 9%:

| Источник | Верно автоматически | Ошибочно автоматически | Без подтверждения | Ошибки запросов |
|---|---:|---:|---:|---:|
| Photon | 24 | 17 | 59 | 10 timeout |
| Geoapify | 1 | 2 | 97 | 79 timeout, 4 offline |

Ошибки запросов входят в число неподтверждённых, а не прибавляются к нему. Это оценка конкретного кода и условий исполнения на ADLER-WHITE-W1; множество timeout не доказывает общую доступность или точность сервиса. Избранное не использовалось в измерении. DaData Clean не измерена: в доступном окружении и сейфе не найдены API token + secret. Непроверенный источник не объявляется точным.

Агрегаты: [Photon](docs/evidence/russia-photon-0.3.0.json), [Geoapify](docs/evidence/russia-geoapify-0.3.0.json). Корпус не переносился в исправления и не использовался для подгонки политики источников.

PostField определяет почтовый индекс по введённому адресу. Издатель Kreout, правообладатель Andrei Ovcharenko; поддержка mail@krot.name. Покрытие — Россия. Новая установка 0.3.0 использует Photon без ключа, режим «Авто» и включённую передачу адреса. Другие источники — Geoapify BYOK и платный DaData Clean с токеном и секретом. Доступны глобальный режим, ручные исключения сайтов и отключение передачи.

## Источник, версия и проверки

- Репозиторий: https://github.com/krotname/PostField; основная ветка main.
- Версия: package.json, semver без суффикса в четырёх manifest. Отдельный build number не применяется: магазины используют version.
- Tag: v{version}; preview имеет признак prerelease в GitHub и не запускает доставку.
- Команды: npm ci, npm run typecheck, npm run check:boundaries, npm run test:coverage, npm run build, npm run check:packages, npm run test:e2e; Firefox addons-linter и npm audit в CI.
- Обязательный CI: PostField CI / verify на том же source SHA main. Pull request не получает credentials публикации.
- Совместимость: Chrome/Opera/Edge Chromium ≥120, Firefox ≥142. MV3; Firefox использует background scripts.
- Smoke: новая установка Photon, настройка трёх источников, клавиатура и масштаб, глобальный режим, ручной запуск, известная коррекция индекса, сохранение ручного индекса, ключей и режима после перезапуска, отсутствие отправки формы и передачи ключей странице. Chromium запускается в изолированном тестовом профиле; заменяется только внешний HTTP-порт.

## Артефакты и доверие

Сборка: npm run build; Node.js 24, npm lockfile, точные devDependency версии. GitHub-hosted runner создаёт пакеты из проверенного main SHA; npm run check:packages сверяет состав и manifest.

| Роль | Формат | Имя | Количество |
|---|---|---|---|
| Браузер | ZIP | postfield-{chrome,opera,edge,firefox}-{version}.zip | 4 |
| Исходники модератору | ZIP | postfield-sources-{version}.zip | 1 |
| Manifest релиза | JSON | release-manifest.json | 1 |

Manifest содержит source SHA, version и digest каждого ZIP. GitHub Release неизменяемый; provenance — GitHub build attestations того же workflow. Перед внешней отправкой проверяется именно asset релиза. Выпущенный ZIP не заменяется: исправление требует новой версии.

GitHub ZIP не подписан магазином. CWS, Opera, Edge и AMO подписывают свои дистрибутивы и назначают собственные extension IDs. Firefox GUID: postfield@krot.name. Общая подпись происхождения — издатель Kreout и GitHub attestation. Новые ключи и IDs PostField не копируются из PassField; ротация ключа/ID требует отдельной проверки возможности обновления установленной версии. Store fingerprints пока отсутствуют и не выдаются за проверенные.

## Площадки

| Площадка | Адаптер | Identity продукта | Состояние настройки |
|---|---|---|---|
| Chrome | src/delivery/stores.ts / ChromeStore | ekdhmojbkpdgpgeipchaifhoedkgpjgo | 0.5.0 — опубликована; [публичная карточка](https://chromewebstore.google.com/detail/ekdhmojbkpdgpgeipchaifhoedkgpjgo), проверена 28.10.2026 |
| Opera | src/delivery/stores.ts / OperaStore | package 307854, postfield-pochtovyi-indeks | Публичная карточка не найдена 28.10.2026; последнее чтение кабинета 25.10.2026: 0.4.1 — Awaiting moderation; [журнал #23](https://github.com/krotname/PostField/issues/23) |
| Edge | src/delivery/stores.ts / EdgeStore | a8f939c3-649a-476d-a638-660e09c8b742 | 0.4.1 — опубликована; [публичная карточка](https://microsoftedge.microsoft.com/addons/detail/lbeapkbfgkokedeepphbphjahopnlaok), проверена 28.10.2026. 0.5.0 остаётся отдельным черновиком |
| Mozilla | src/delivery/stores.ts / MozillaStore | postfield@krot.name, submission 6610083, file 5154202 | 0.5.0 desktop / Android — опубликована; [публичная карточка](https://addons.mozilla.org/ru/firefox/addon/postfield/) и подписанный XPI проверены 28.10.2026 |

Identity, подтверждённая 22.10.2026: Chrome — аккаунт Kreout@gmail.com, publisher 1d5e12f2-4a39-43f1-ae0e-855c4ae6fd07; повторный взнос не потребовался. Edge — аккаунт kreout@live.com, издатель Kreout, store ID 0RDCKDVTJVP6, extension ID lbeapkbfgkokedeepphbphjahopnlaok. AMO — аккаунт sex@krot.name, публичный автор krotname, slug postfield. Opera — package 307854, extension ID dgnekoeonfoimmialapdahohhoieeedb; логин и публичное имя отдельно не подтверждены. Публичное чтение 28.10.2026 подтвердило Chrome 0.5.0, Edge 0.4.1 и Firefox 0.5.0 с Android; установка в этой проверке не выполнялась. У Opera публичная карточка возвращает «The page you're looking for could not be found»; последнее чтение кабинета 25.10.2026 показывало Awaiting moderation для 0.4.1.

Environments chrome/edge/firefox/opera созданы с main и v*; соответствующие OAuth/API/JWT secrets сохранены без публикации значений. Это настройка доступа, не upload/submission. [Журнал настройки](https://github.com/krotname/PostField/issues/5). Production доставка предназначена для стабильного релиза; первоначальное языковое покрытие ru/en, функция РФ. Неизвестный ID блокирует доставку; публичные URL карточек до создания не придумываются.

Источники сохранённого состояния: CWS fetchStatus, Edge operations, AMO versions, Opera HTTP кабинета. Публичный источник — точная карточка/версия магазина после одобрения. Uploaded, submitted и published различаются. У Edge Succeeded operation не доказывает публичную публикацию.

## Метаданные и ограничения

Канонический текст: README.md, docs/PRIVACY.md, docs/DELIVERY.md, site/ и docs/releases/0.5.0.md. Стабильный GitHub Release 0.5.0 опубликован 22.10.2026; текущие состояния магазинов находятся в docs/release/CHECKPOINT.md. Лицензия: LICENSE; сторонние лицензии сохраняются. Screenshots smoke доступны как CI artifacts и перед карточкой требуют соответствия окончательному интерфейсу.

Разрешённые заявления: поиск индекса по адресу, сохранение ручного значения, ручной выбор и назначение полей, отдельное согласие и режим сайта. В 0.2.0 единственное точное совпадение города, улицы и дома с confidence=1 и result_type=building разрешает вставку; это выбранная политика доверия Geoapify, а не независимое доказательство индекса. 48 адресных исправлений и неоднозначные результаты остаются под защитой каталога. Распознавание подписей на 12 языках не расширяет географию. Запрещены неподтверждённые заявления о точности на всей РФ, международном автозаполнении, публикации во всех магазинах и общей магазинной криптографической подписи. Подписанный Firefox XPI 0.5.0 доступен по ссылке из AMO; GitHub ZIP остаётся отдельным неподписанным пакетом.

Privacy URL после deployment: https://krotname.github.io/PostField/privacy.html. Адрес получает только выбранный Photon, Geoapify или DaData; ключи не включаются в пакет. Для Photon проверяются явные компоненты дома, для DaData — коды качества, актуальность и идентификатор дома. Ручные и устаревшие значения защищены. Страны US/CA/GB/DE остаются выключены до собственных контрольных корпусов.

## Gates и доказательства

С 22.10.2026 по решению владельца стабильный выпуск допускает текущую автоподстановку с предупреждением. Независимые живые метрики публикуются как информация и не блокируют выпуск. Прежний целевой показатель ≥90% без ошибочных автоматических ответов остаётся диагностической целью; `quality-report.mjs` оценивает именно её. Обязательны целевые тесты, CI точного SHA, согласованная SemVer-версия и неизменность пакетов. Избранные адреса сохраняются явно пользователем только локально; подтверждение настраивается отдельно для каждого адреса.

Credentials — только GitHub environment соответствующего магазина. Cookie браузера не экспортируется в CI. Платежи и пользовательские факторы не выполнены и не заменяются программной имитацией; бесплатный предварительный GitHub Release их не требует.

Checkpoint: docs/release/CHECKPOINT.md. Отдельная попытка доставки хранит tag/version/source SHA/digest, состояние, upload/submission ID и checkedAt в GitHub issue. Потерянный ответ POST требует readback до повтора. Изменение SHA, ZIP, версии, деклараций или лицензии аннулирует зависящую оценку; изменение credentials не удаляет ранее сохранённый operation ID.

Firefox Android 0.5.0: подача 6610083 завершена с исходниками; AMO публикует подписанный [XPI 0.5.0](https://addons.mozilla.org/firefox/downloads/file/5154202/postfield-0.5.0.xpi). Chrome публикует 0.5.0, Edge — 0.4.1. Данные публичных карточек проверены 28.10.2026; новых правил выпуска нет.
