#!/bin/bash
set -euo pipefail
if [ "$(uname -s)" != Darwin ]; then
  echo "Safari packaging requires macOS and Xcode." >&2
  exit 1
fi
cd "$(dirname "$0")/.."
root="$PWD"
version=$(node -p "require('./package.json').version")
npm run build
native="$root/dist/safari-native"
xcrun safari-web-extension-packager "$root/dist/safari" \
  --project-location "$native" --app-name PostField \
  --bundle-identifier ru.passfield.PostField --macos-only --swift \
  --copy-resources --no-open --no-prompt --force
xcodebuild -project "$native/PostField/PostField.xcodeproj" \
  -scheme PostField -configuration Debug -destination 'platform=macOS,arch=arm64' \
  -derivedDataPath "$root/dist/safari-derived-data" \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= \
  MARKETING_VERSION="$version" CURRENT_PROJECT_VERSION=1 \
  MACOSX_DEPLOYMENT_TARGET=14.4 build
app="$root/dist/safari-derived-data/Build/Products/Debug/PostField.app"
codesign --verify --deep --strict "$app"
printf '\nSafari development app: %s\n' "$app"
