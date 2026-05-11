#!/usr/bin/env bash
set -euo pipefail

report_dir="apps/android/build/reports"
mkdir -p "$report_dir"

capture_diagnostics() {
  adb logcat -d -t 3000 > "$report_dir/release-launch-logcat.txt" || true
  adb shell dumpsys activity activities > "$report_dir/release-launch-activity.txt" || true
}
trap capture_diagnostics EXIT

version="$(sed -n 's/.*versionName = "\(.*\)".*/\1/p' apps/android/app/build.gradle.kts)"
test -n "$version"

wait_for_launch() {
  local deadline=$((SECONDS + 90))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local pid=""
    pid="$(adb shell pidof dev.tmuapp.mobile 2>/dev/null | tr -d '\r' || true)"
    adb shell dumpsys activity activities > "$report_dir/release-launch-activity.txt" || true

    if [ -n "$pid" ] && grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' "$report_dir/release-launch-activity.txt" | grep -q dev.tmuapp.mobile; then
      echo "$pid"
      return 0
    fi

    sleep 2
  done

  echo "Timed out waiting for dev.tmuapp.mobile to resume" >&2
  return 1
}

for apk in "apps/android/release-apks/tmuapp-v$version.apk" "apps/android/release-apks/tmuapp-x86_64-v$version.apk"; do
  echo "Testing $apk"
  test -f "$apk"

  adb wait-for-device
  adb logcat -c || true
  adb install -r "$apk"
  adb shell am force-stop dev.tmuapp.mobile || true

  adb shell am start -n dev.tmuapp.mobile/.MainActivity > "$report_dir/release-launch-start.txt"
  cat "$report_dir/release-launch-start.txt"

  wait_for_launch
  adb uninstall dev.tmuapp.mobile
  echo "Smoke test passed for $apk"
done
