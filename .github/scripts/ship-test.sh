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
    # زي العامل (Live/cloudflare/worker.js): ملف صفحة الأداة بعنوانه = تحويل لـ /app من غير محتوى، والرابط النظيف ← ملفه (REWRITES)،
    # وتعليقات HTML بتتشال برّه script وstyle (stripHtmlComments) — فالسكربت لازم يطلب الرابط الصح ويشيل التعليقات من نسخته هو كمان
    p="${url#https://adscenter.online}"; p="${p%%\?*}"
    [ "$p" = /pauseproof-live.html ] && exit 0
    f=$(printf '%s\n' "$SHIP_TEST_REWRITES" | awk -v p="$p" '$1 == p { print $2; exit }')
    f="${f:-$p}"
    # stale: صفحة الأداة لسه النسخة القديمة على الحافة أول لفتين. never: فضلت قديمة
    if [ "$f" = /pauseproof-live.html ]; then
      case "$SHIP_TEST_CASE" in
        stale) [ "$(count stale)" -le 2 ] && { echo '<!doctype html><title>older page</title>'; exit 0; } ;;
        never) echo '<!doctype html><title>older page</title>'; exit 0 ;;
      esac
    fi
    if [ "${f##*.}" = html ]; then
      "$REAL_GIT" show "HEAD:Live$f" | perl -0777 -pe 's{(<(script|style)\b.*?</\2\s*>)|<!--.*?-->}{defined $1 ? $1 : ""}gsie'
    else
      "$REAL_GIT" show "HEAD:Live$f"
    fi ;;
  *) echo "ship-test: unexpected request $url" >&2; exit 7 ;;
esac
EOF
chmod +x "$work/bin/git" "$work/bin/sleep" "$work/bin/curl"

fail=0
# خريطة الروابط النظيفة من العامل نفسه (REWRITES) — الموقع المزيّف بيستخدمها زي العامل
SHIP_TEST_REWRITES=$(git show HEAD:Live/cloudflare/worker.js | tr -d '\r' | grep -oE "^ *'/[^']*': '/[^']*'" | sed -E "s/^ *'([^']*)': '([^']*)'/\1 \2/")
export SHIP_TEST_REWRITES
# $1 = الحالة، $2 = كود الخروج المتوقع (رقم، أو nonzero)، $3 = عدد الدفعات، والباقي = نصوص لازم تظهر كلها في المخرجات.
# فحص الموقع ٣ لفات بس (SHIP_SITE_TRIES) — الحقيقي ٤٨
check() {
  local name="$1" want_code="$2" want_push="$3"; shift 3
  rm -f "$work"/state.* "$work/pushes"
  local out code pushes=0 t okc=1
  out=$(SHIP_TEST_CASE="$name" SHIP_TEST_DIR="$work" SHIP_SITE_TRIES=3 PATH="$work/bin:$PATH" bash "$script" 2>&1)
  code=$?
  [ -f "$work/pushes" ] && pushes=$(wc -l < "$work/pushes" | tr -d ' ')
  if [ "$want_code" = "nonzero" ]; then [ "$code" -ne 0 ] || okc=0; else [ "$code" -eq "$want_code" ] || okc=0; fi
  [ "$pushes" -eq "$want_push" ] || okc=0
  for t in "$@"; do printf '%s' "$out" | grep -qF -- "$t" || okc=0; done
  if [ "$okc" -eq 1 ]; then
    echo "ok    $name: exit $code, $pushes push(es)"
  else
    echo "FAIL  $name: exit $code (wanted $want_code), $pushes push(es) (wanted $want_push), wanted the texts: $*"
    printf '%s\n' "$out" | sed 's/^/      | /'
    fail=1
  fi
}

# المسار الناجح، وفيه أول رد من غير تشغيل، وعطل شبكة، وبناء لسه مبدأش، وطلب علّق: السكربت بيكمّل لحد ما ينشر ويتأكد من الملفات
# المنشورة كلها (الصفحات بروابطها النظيفة ومن غير تعليقاتها، والأنماط، والسكربتات)
check ok 0 2 'live: all' 'published files'
# صفحة الأداة لسه قديمة على الحافة أول لفتين: السكربت بيقول كده وبيستنى لحد ما توصل — الفحص القديم (Live/js بس) كان بيقول «live» من أول لفة
check stale 0 2 'not live yet' 'live: all'
# وفضلت قديمة: main اتحدّث بس الموقع مش عليه، والسكربت بيفشل وبيقول كده
check never 1 2 'are not live yet after'
# الاختبارات فشلت: main مبيتحدّثش (دفعة staging بس) والسكربت بيقول كده
check cifail 1 1 'main NOT updated'
# حد طلبات GitHub خلص قبل ما نعرف النتيجة: main مبيتحدّثش والرسالة صريحة — وأي توقف مش مقصود بيقول سطره (مفيش وقوف ساكت)
check limit nonzero 1 'GitHub API limit reached' 'ship.sh stopped at line'
# main اتحدّث وبناء Cloudflare فشل: السكربت بيقول إن الموقع ممكن يكون على القديم
check buildfail 1 2 'Cloudflare build failure'

if [ "$fail" -eq 0 ]; then echo "ship.sh: all cases passed"; else echo "ship.sh: FAILED"; fi
exit "$fail"
