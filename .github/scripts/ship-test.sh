#!/usr/bin/env bash
# اختبار بوابة النشر (ship.sh) من غير شبكة ولا دفع — المرور الثاني للتدقيق الشامل ١٤ نوفمبر ٢٠٢٦.
# السكربت نفسه بيتشغّل زي ما هو، وcurl وgit push وsleep بدايل في PATH:
#   - git push مبيدفعش، بيتسجّل بس (عشان نعدّ: staging لوحده، ولا staging وmain) — وباقي أوامر git حقيقية
#   - curl بيرد مكان واجهة GitHub (تشغيل الاختبارات، وبناء Cloudflare) ومكان الموقع (ملفات Live/js من الإيداع نفسه)
#   - sleep فوري
# السبب: شحنة ١٣ نوفمبر وقفت ساكتة بعد «waiting for CI» — GitHub مكانتش سجّلت تشغيل الاختبارات في أول ٣٠ ثانية، فالرد جه من غير
# "status"، وgrep اللي بيقراه فشل، وset -e مع pipefail قفل السكربت من غير أي رسالة (main متحدّثش، ومفيش ما يقول كده).
# الاستخدام من جذر المستودع: bash .github/scripts/ship-test.sh [مسار سكربت تاني للاختبار]
set -uo pipefail
script="${1:-.github/scripts/ship.sh}"
REAL_GIT=$(command -v git)
export REAL_GIT
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

cat > "$work/bin/git" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "push" ]; then echo "$*" >> "$SHIP_TEST_DIR/pushes"; exit 0; fi
exec "$REAL_GIT" "$@"
EOF

cat > "$work/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

# الردود بشكل واجهة GitHub الحقيقية ("status": "completed" بمسافة بعد النقطتين). العدّاد لكل نوع طلب في ملف
cat > "$work/bin/curl" <<'EOF'
#!/usr/bin/env bash
url="${*: -1}"
# طلبات واجهة GitHub لازم يبقى ليها مهلة (طلب معلّق كان هيوقّف النشر للأبد)
case "$url" in *api.github.com*) case " $* " in *" --max-time "*) ;; *) echo "ship-test: a GitHub request without --max-time" >&2; exit 9 ;; esac ;; esac
count() { local f="$SHIP_TEST_DIR/state.$1" c=0; [ -f "$f" ] && c=$(cat "$f"); c=$((c + 1)); echo "$c" > "$f"; echo "$c"; }
case "$url" in
  *api.github.com*actions/runs*)
    k=$(count runs)
    case "$SHIP_TEST_CASE:$k" in
      ok:1) echo '{"total_count":0,"workflow_runs":[]}' ;;                               # التشغيل لسه متسجّلش
      ok:2) exit 6 ;;                                                                     # عطل شبكة عابر
      ok:3) echo '{"workflow_runs":[{"status": "in_progress","conclusion": null}]}' ;;
      limit:*) echo '{"message":"API rate limit exceeded for 203.0.113.1."}' ;;
      cifail:*) echo '{"workflow_runs":[{"status": "completed","conclusion": "failure"}]}' ;;
      *) echo '{"workflow_runs":[{"status": "completed","conclusion": "success"}]}' ;;
    esac ;;
  *api.github.com*check-runs*)
    k=$(count checks)
    case "$SHIP_TEST_CASE:$k" in
      ok:1) echo '{"total_count":0,"check_runs":[]}' ;;                                   # البناء لسه مبدأش
      ok:2) exit 28 ;;                                                                    # الطلب علّق لحد المهلة
      buildfail:*) echo '{"check_runs":[{"status": "completed","conclusion": "failure"}]}' ;;
      *) echo '{"check_runs":[{"status": "completed","conclusion": "success"}]}' ;;
    esac ;;
  https://adscenter.online/*)
    p="${url#https://adscenter.online/}"
    "$REAL_GIT" show "HEAD:Live/${p%%\?*}" ;;
  *) echo "ship-test: unexpected request $url" >&2; exit 7 ;;
esac
EOF
chmod +x "$work/bin/git" "$work/bin/sleep" "$work/bin/curl"

fail=0
# $1 = الحالة، $2 = كود الخروج المتوقع (رقم، أو nonzero)، $3 = عدد الدفعات، $4 = نص لازم يظهر في المخرجات
check() {
  rm -f "$work"/state.* "$work/pushes"
  local out code pushes=0
  out=$(SHIP_TEST_CASE="$1" SHIP_TEST_DIR="$work" PATH="$work/bin:$PATH" bash "$script" 2>&1)
  code=$?
  [ -f "$work/pushes" ] && pushes=$(wc -l < "$work/pushes" | tr -d ' ')
  local okc=1
  if [ "$2" = "nonzero" ]; then [ "$code" -ne 0 ] || okc=0; else [ "$code" -eq "$2" ] || okc=0; fi
  if [ "$okc" -eq 1 ] && [ "$pushes" -eq "$3" ] && printf '%s' "$out" | grep -qF -- "$4"; then
    echo "ok    $1: exit $code, $pushes push(es)"
  else
    echo "FAIL  $1: exit $code (wanted $2), $pushes push(es) (wanted $3), wanted the text: $4"
    printf '%s\n' "$out" | sed 's/^/      | /'
    fail=1
  fi
}

# المسار الناجح، وفيه أول رد من غير تشغيل، وعطل شبكة، وبناء لسه مبدأش، وطلب علّق: السكربت بيكمّل لحد ما ينشر ويتأكد من الملفات
check ok 0 2 'live: every Live/js file matches'
# الاختبارات فشلت: main مبيتحدّثش (دفعة staging بس) والسكربت بيقول كده
check cifail 1 1 'main NOT updated'
# حد طلبات GitHub خلص قبل ما نعرف النتيجة: main مبيتحدّثش والرسالة صريحة — وأي توقف مش مقصود بيقول سطره (مفيش وقوف ساكت)
check limit nonzero 1 'GitHub API limit reached'
check limit nonzero 1 'ship.sh stopped at line'
# main اتحدّث وبناء Cloudflare فشل: السكربت بيقول إن الموقع ممكن يكون على القديم
check buildfail 1 2 'Cloudflare build failure'

if [ "$fail" -eq 0 ]; then echo "ship.sh: all cases passed"; else echo "ship.sh: FAILED"; fi
exit "$fail"
