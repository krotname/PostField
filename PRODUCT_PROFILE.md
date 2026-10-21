# PostField — профиль выпуска

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
| Chrome | src/delivery/stores.ts / ChromeStore | CWS item не назначен | OAuth настроен; регистрация издателя не завершена |
| Opera | src/delivery/stores.ts / OperaStore | Новый package, ещё не назначен | HTTP auth и ответы загрузки требуют проверки |
| Edge | src/delivery/stores.ts / EdgeStore | a8f939c3-649a-476d-a638-660e09c8b742 | InDraft; API 1.1 настроен, первая публикация не выполнена |
| Mozilla | src/delivery/stores.ts / MozillaStore | postfield@krot.name | JWT настроен; listed карточка и custom license отсутствуют |

Целевой публичный издатель — Kreout. Подтверждённая 14.10.2026 настройка: CWS v2 OAuth refresh проверен HTTP200; неоплаченная регистрация Chrome требует $5, поэтому publisher/item IDs отсутствуют. Edge — Kreout, publisher13844550, ровно один [новый draft](https://partner.microsoft.com/en-us/dashboard/microsoftedge/a8f939c3-649a-476d-a638-660e09c8b742/packages/dashboard), store ID0RDCKDVTJVP6, extension IDlbeapkbfgkokedeepphbphjahopnlaok. API key API1.1 истекает 25.12.2026; последующий Update API требует первой публикации через Partner Center. AMO — текущее публичное имя krotname; JWT60s проверен HTTP200, PostField GUID отсутствует (404). Переименование общего профиля меняет автора существующего дополнения и требует решения владельца. Opera HTTP auth остаётся неподтверждённой; старый продукт не изменяется.

Environments chrome/edge/firefox/opera созданы с main и v*; соответствующие OAuth/API/JWT secrets сохранены без публикации значений. Это настройка доступа, не upload/submission. [Журнал настройки](https://github.com/krotname/PostField/issues/5). Production доставка предназначена для стабильного релиза; первоначальное языковое покрытие ru/en, функция РФ. Неизвестный ID блокирует доставку; публичные URL карточек до создания не придумываются.

Источники сохранённого состояния: CWS fetchStatus, Edge operations, AMO versions, Opera HTTP кабинета. Публичный источник — точная карточка/версия магазина после одобрения. Uploaded, submitted и published различаются. У Edge Succeeded operation не доказывает публичную публикацию.

## Метаданные и ограничения

Канонический текст: README.md, docs/PRIVACY.md, docs/DELIVERY.md, site/ и docs/releases/0.3.0.md. Последний опубликованный preview — v0.1.3; исходники 0.3.0 не означают новый опубликованный релиз. Лицензия: LICENSE; сторонние лицензии сохраняются. Screenshots smoke доступны как CI artifacts и перед карточкой требуют соответствия окончательному интерфейсу.

Разрешённые заявления: поиск индекса по адресу, сохранение ручного значения, ручной выбор и назначение полей, отдельное согласие и режим сайта. В 0.2.0 единственное точное совпадение города, улицы и дома с confidence=1 и result_type=building разрешает вставку; это выбранная политика доверия Geoapify, а не независимое доказательство индекса. 48 адресных исправлений и неоднозначные результаты остаются под защитой каталога. Распознавание подписей на 12 языках не расширяет географию. Запрещены неподтверждённые заявления о точности на всей РФ, международном автозаполнении, публикации во всех магазинах, общей магазинной криптографической подписи и постоянном подписанном Firefox XPI.

Privacy URL после deployment: https://krotname.github.io/PostField/privacy.html. Адрес получает только выбранный Photon, Geoapify или DaData; ключи не включаются в пакет. Для Photon проверяются явные компоненты дома, для DaData — коды качества, актуальность и идентификатор дома. Ручные и устаревшие значения защищены. Страны US/CA/GB/DE остаются выключены до собственных контрольных корпусов.

## Gates и доказательства

Стабильный релиз требует docs/evidence/russia-quality.json из того же SHA: ≥100 разных адресов, ≥10 регионов, доля региона ≤20%, wrongAutomatic=0, errors=0, confirmedRate≥0.9. Источники ожидаемых индексов должны быть независимы от Geoapify; дубликаты, прежние 117 адресов, их страницы источников и каталог исправлений исключены из независимой проверки. Новый корпус содержит 100 адресов из 40 регионов, максимум 9%; живая проверка 0.2.0 не запускалась. [Предел прежней политики](docs/evidence/russia-independent-policy.json) — исторический результат до 0.2.0, не оценка точности Geoapify и не разрешение stable delivery. Изменение правила автовставки требует нового измерения для стабильной публикации.

Credentials — только GitHub environment соответствующего магазина. Cookie браузера не экспортируется в CI. Платежи и пользовательские факторы не выполнены и не заменяются программной имитацией; бесплатный предварительный GitHub Release их не требует.

Checkpoint: docs/release/CHECKPOINT.md. Отдельная попытка доставки хранит tag/version/source SHA/digest, состояние, upload/submission ID и checkedAt в GitHub issue. Потерянный ответ POST требует readback до повтора. Изменение SHA, ZIP, версии, деклараций или лицензии аннулирует зависящую оценку; изменение credentials не удаляет ранее сохранённый operation ID.
