#!/usr/bin/env bash
set -euo pipefail

report_dir="apps/android/build/reports"
mkdir -p "$report_dir"

capture_diagnostics() {
  adb logcat -d -t 2000 > "$report_dir/release-launch-logcat.txt" || true
  adb shell dumpsys activity activities > "$report_dir/release-launch-activity.txt" || true
}
trap capture_diagnostics EXIT

version="$(sed -n 's/.*versionName = "\(.*\)".*/\1/p' apps/android/app/build.gradle.kts)"
test -n "$version"

for apk in "apps/android/release-apks/tmuapp-v$version.apk" "apps/android/release-apks/tmuapp-x86_64-v$version.apk"; do
  echo "Testing $apk"
  test -f "$apk"

  adb wait-for-device
  adb logcat -c || true
  adb install -r "$apk"
  adb shell am force-stop dev.tmuapp.mobile || true

  start_output="$(adb shell am start -W -n dev.tmuapp.mobile/.MainActivity)"
  printf '%s
' "$start_output"
  printf '%s
' "$start_output" > "$report_dir/release-launch-start.txt"
  printf '%s
' "$start_output" | grep -E 'Status: ok|Status: Warning'

  sleep 4
  adb shell pidof dev.tmuapp.mobile | tr -d '\r' | grep -E '^[0-9]+'
  adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' | grep dev.tmuapp.mobile
  adb uninstall dev.tmuapp.mobile
  echo "Smoke test passed for $apk"
done
