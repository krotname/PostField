# PostField — профиль выпуска

PostField определяет почтовый индекс по введённому адресу. Издатель Kreout, правообладатель Andrei Ovcharenko; поддержка mail@krot.name. Первое покрытие — Россия, BYOK Geoapify, явное согласие и отдельные разрешения сайтов.

## Источник, версия и проверки

- Репозиторий: https://github.com/krotname/PostField; основная ветка main.
- Версия: package.json, semver без суффикса в четырёх manifest. Отдельный build number не применяется: магазины используют version.
- Tag: v{version}; preview имеет признак prerelease в GitHub и не запускает доставку.
- Команды: npm ci, npm run typecheck, npm run check:boundaries, npm run test:coverage, npm run build, npm run check:packages, npm run test:e2e; Firefox addons-linter и npm audit в CI.
- Обязательный CI: PostField CI / verify на том же source SHA main. Pull request не получает credentials публикации.
- Совместимость: Chrome/Opera/Edge Chromium ≥120, Firefox ≥142. MV3; Firefox использует background scripts.
- Smoke: согласие и запись ключа, заполнение точного дома, сохранение ручного индекса, отсутствие отправки формы и передачи ключа странице. Chromium запускается в отдельном временном тестовом профиле; Geoapify заменён только на HTTP-порту тестовой копии.

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
| Chrome | src/delivery/stores.ts / ChromeStore | Новый CWS item, ещё не назначен | OAuth и карточка требуются |
| Opera | src/delivery/stores.ts / OperaStore | Новый package, ещё не назначен | HTTP auth и ответы загрузки требуют проверки |
| Edge | src/delivery/stores.ts / EdgeStore | Новый product, ещё не назначен | Первая публикация Partner Center и API 1.1 |
| Mozilla | src/delivery/stores.ts / MozillaStore | postfield@krot.name | Listed карточка, JWT и custom license |

Аккаунт/публичный издатель — Kreout, но перед настройкой каждой площадки проверяется реальная учётная запись. Production доставка стабильного релиза; первоначальное языковое покрытие ru/en, функция РФ. Неизвестный ID блокирует доставку; публичные URL карточек до создания не придумываются.

Источники сохранённого состояния: CWS fetchStatus, Edge operations, AMO versions, Opera HTTP кабинета. Публичный источник — точная карточка/версия магазина после одобрения. Uploaded, submitted и published различаются. У Edge Succeeded operation не доказывает публичную публикацию.

## Метаданные и ограничения

Канонический текст: README.md, docs/PRIVACY.md, docs/DELIVERY.md, site/ и docs/releases/0.1.0.md. Лицензия: LICENSE; сторонние лицензии сохраняются. Screenshots smoke доступны как CI artifacts и перед карточкой требуют соответствия окончательному интерфейсу.

Разрешённые заявления: индекс по адресу, сохранение ручного значения, ручной выбор и назначение полей, отдельное согласие/разрешение сайта. Запрещены неподтверждённые заявления о точности на всей РФ, международном автозаполнении, публикации во всех магазинах, общей магазинной криптографической подписи и постоянном подписанном Firefox XPI.

Privacy URL после deployment: https://krotname.github.io/PostField/privacy.html. Адрес получает Geoapify; общий API key не включается в пакет. Страны US/CA/GB/DE остаются выключены до собственных контрольных корпусов.

## Gates и доказательства

Стабильный релиз требует docs/evidence/russia-quality.json из того же SHA: ≥100 разных адресов, ≥10 регионов, доля региона ≤20%, wrongAutomatic=0, errors=0, confirmedRate≥0.9. Источники ожидаемых индексов должны быть независимы от Geoapify; дубликаты не увеличивают покрытие.

Credentials — только GitHub environment соответствующего магазина. Cookie браузера не экспортируется в CI. Платежи и пользовательские факторы не выполнены и не заменяются программной имитацией; бесплатный предварительный GitHub Release их не требует.

Checkpoint: docs/release/CHECKPOINT.md. Отдельная попытка доставки хранит tag/version/source SHA/digest, состояние, upload/submission ID и checkedAt в GitHub issue. Потерянный ответ POST требует readback до повтора. Изменение SHA, ZIP, версии, деклараций или лицензии аннулирует зависящую оценку; изменение credentials не удаляет ранее сохранённый operation ID.
