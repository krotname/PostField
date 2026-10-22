# Firefox Android

Один Firefox-пакет сохраняет прежний GUID и настройки на компьютере и Android 142+.

Сборка выполняется на сервере: Node.js 24+, npm ci. Для PassField: npm run build:firefox и npm run lint:firefox:built. Для PostField: npm run build и node node_modules/addons-linter/bin/addons-linter dist/firefox --warnings-as-errors.

Для временной установки используйте web-ext run -t firefox-android --adb-device <serial> --firefox-apk org.mozilla.firefox с каталогом Firefox-сборки. Временная установка не заменяет постоянную подписанную установку из Mozilla Add-ons.

Проверьте ширину 320, 360 и 430 px, касания, исходную вкладку, выдачу и отказ в разрешениях, экранную клавиатуру, открытие настроек и повторный запуск браузера. Для PassField: показ, скрытие и динамические поля. Для PostField: ручной индекс, несколько форм, ручное сопоставление и отказ провайдера. Используйте синтетические данные.
