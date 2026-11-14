#!/usr/bin/env bash
# النشر بالبوابة (مراجعة المرحلة ٢ — Software Engineering at Google، فصل ٢٣: الاختبار قبل الدمج):
#   ١) الإيداع الحالي (HEAD) بيتدفع لـ staging، والتكامل المستمر بيشتغل عليه
#   ٢) لو نجح على نفس الإيداع بالظبط: بيتدفع لـ main، وCloudflare بينشر منه. لو فشل: main مبيتغيّرش
#   ٣) التحقق من الموقع نفسه: كل ملفات Live/js المنشورة لازم تطابق الإيداع بصمةً ببصمة
#      (قاعدة ٨ في audit/postmortem-2026-10-12-connect.md — مفيش «اتنشر» من غير دليل من الموقع)
# الاستخدام من جذر المستودع: bash .github/scripts/ship.sh
# بيستخدم واجهة GitHub العامة من غير دخول (حدها ٦٠ طلب في الساعة — الانتظار كل ٣٠ ثانية)
set -euo pipefail
# أي توقف مش مقصود بيقول سطره (المرور الثاني للتدقيق الشامل ١٤ نوفمبر ٢٠٢٦): شحنة ١٣ نوفمبر وقفت ساكتة بعد «waiting for CI»
# (السبب تحت عند قراءة حالة التشغيل)، فمكانش فيه ما يقول إن main متحدّثش. اختباره: .github/scripts/ship-test.sh
trap 'echo "ship.sh stopped at line $LINENO (exit $?) — if no line above says main was updated, it was NOT" >&2' ERR
repo=Wely-Elazab/Ads-Control-Center
site=https://adscenter.online
sha=$(git rev-parse HEAD)
# طلب لواجهة GitHub. لو الحد خلص بنوقف ونقول كده صراحة — قبل كده الرد كان بيتقري «لسه مخلصش» لحد آخر محاولة
# فالرسالة كانت بتقول غير اللي حصل (مراجعة ١٧ أكتوبر). الشحنة الواحدة ~١٢–١٦ طلب، فـ٣–٤ شحنات في الساعة بالكتير
# $2 = حالة main ساعتها، عشان الرسالة تقول هو اتغيّر ولا لأ
gh_api() {
  local j
  # --max-time: طلب معلّق ميوقّفش السكربت للأبد. طلب فشل أو خلصت مهلته = رد فاضي، واللفة اللي بتنادي بتقراه «لسه» وتسأل تاني
  j=$(curl -s --max-time 20 "https://api.github.com/repos/$repo/$1")
  if echo "$j" | grep -q 'API rate limit exceeded'; then
    echo "GitHub API limit reached (60 requests/hour without sign-in) — $2" >&2
    return 3
  fi
  printf '%s\n' "$j"
}

git push -q --force origin "HEAD:refs/heads/staging"
echo "staging -> ${sha:0:7}: waiting for CI"
ok=""
for i in $(seq 1 30); do
  sleep 30
  j=$(gh_api "actions/runs?head_sha=$sha&branch=staging&per_page=3" "main NOT updated; run ship.sh again within the hour")
  # || true: رد من غير "status" (GitHub لسه مسجّلتش التشغيل في أول ٣٠ ثانية، أو رد فاضي من عطل شبكة) بيخلّي grep يفشل، ومع
  # pipefail وset -e السكربت كان بيقف هنا من غير أي رسالة — دلوقتي بيتقري «none» واللفة بتكمّل
  st=$(echo "$j" | grep -oE '"status": *"[a-z_]+"' | head -1 | sed -E 's/.*"([a-z_]+)"$/\1/' || true)
  co=$(echo "$j" | grep -oE '"conclusion": *("[a-z_]+"|null)' | head -1 | sed -E 's/.*: *//; s/"//g' || true)
  echo "  $(date +%T) ${st:-none} ${co:-}"
  if [ "${st:-}" = "completed" ]; then ok="$co"; break; fi
done
if [ "$ok" != "success" ]; then echo "CI did not pass on ${sha:0:7} (${ok:-timeout}): main NOT updated"; exit 1; fi

git push -q origin "$sha:refs/heads/main"
# بناء Cloudflare نفسه (الدليل الأقوى): مقارنة الملفات لوحدها مبتثبتش حاجة لو الإيداع مغيّرش Live/js
# (اتلاحظ ١٧ أكتوبر في أول تشغيل). الفروع التانية مبتتبنيش (Preview Builds مقفولة)، فأي بناء على الإيداع ده هو النشر
# ٨ دقايق مش ٥: البناء يوم ٣ نوفمبر خلص بعد الحد فالسكربت قال «فشل» والنشر كان ماشي
echo "main -> ${sha:0:7}: waiting for the Cloudflare build (up to 8 min)"
build=""
for i in $(seq 1 32); do
  sleep 15
  cr=$(gh_api "commits/$sha/check-runs?filter=all&check_name=Workers%20Builds:%20ads-center" "main IS updated to ${sha:0:7}; confirm the Cloudflare build and the site by hand")
  if echo "$cr" | grep -qE '"conclusion": *"success"'; then build=success; break; fi
  if echo "$cr" | grep -qE '"conclusion": *"(failure|cancelled|timed_out)"'; then build=failure; break; fi
  echo "  $(date +%T) build not finished"
done
if [ "$build" != "success" ]; then echo "Cloudflare build ${build:-did not finish}: the site may still be on the previous commit"; exit 1; fi
echo "Cloudflare build succeeded; checking the site"
# الملفات اللي مبتتنشرش عن قصد (Live/.assetsignore — زي js/pricing.js) مبتتقارنش
skip=$(git show "$sha:Live/.assetsignore" | tr -d '\r' | grep -E '^js/' | sed 's#^#Live/#' || true)
# ٨ دقايق: توزيع Cloudflare على الحافة بياخد وقت أطول أحياناً، والنتيجة كانت «فشل» كاذب
for i in $(seq 1 48); do
  sleep 10
  diff=0
  for f in $(git ls-tree --name-only "$sha" Live/js/ | grep '\.js$'); do
    if echo "$skip" | grep -qx "$f"; then continue; fi
    l=$(git show "$sha:$f" | tr -d '\r' | md5sum | cut -c1-32)
    # عطل اتصال عابر (curl 35 يوم ٢٥ أكتوبر) يتحسب ملف مش مطابق ونعيد اللفة، بدل ما set -e يقفل السكربت
    r=$({ curl -s --retry 3 "$site/${f#Live/}?v=$RANDOM" || true; } | tr -d '\r' | md5sum | cut -c1-32)
    [ "$l" = "$r" ] || diff=$((diff + 1))
  done
  if [ "$diff" -eq 0 ]; then echo "live: every Live/js file matches ${sha:0:7}"; exit 0; fi
  echo "  $(date +%T) $diff file(s) not live yet"
done
# main اتحدّث والبناء نجح فعلاً — اللي مكملش هو وصول الملفات للحافة. التكرار مش محتاج دفع تاني:
# الفحص ده لوحده بيعيده (نفس اللفة فوق)، أو افتح الموقع وقارن
echo "main IS updated to ${sha:0:7} and the Cloudflare build succeeded, but $diff file(s) are not live yet after 8 minutes."
echo "nothing to push again — re-run this script to re-check, or compare the files on the site yourself."
exit 1
