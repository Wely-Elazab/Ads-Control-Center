# خادم محلي للاختبارات (ويندوز، من غير Node ولا Python): بيقدّم مجلد Live على http://localhost:8765/
# و/__repo/... من جذر المستودع (قراءة بس) — اختبار «عقد المُشغّل» بيقرا supabase/functions/sync/runner.ts منه.
# نفس اللي بيعمله .github/scripts/serve_tests.py في التكامل المستمر. التشغيل:
#   powershell -NoProfile -ExecutionPolicy Bypass -File Live\tests\serve.ps1
# وبعدين افتح http://localhost:8765/tests/index.html
$live = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path (Join-Path $live '..')).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8765/')
$listener.Start()
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.svg'='image/svg+xml'; '.json'='application/json'; '.png'='image/png'; '.webmanifest'='application/manifest+json'; '.ts'='text/plain; charset=utf-8'; '.sql'='text/plain; charset=utf-8' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    $root = $live
    # من جذر المستودع مجلد supabase بس (مش .git ولا غيره)
    if ($path.StartsWith('__repo/supabase/')) { $root = $repo; $path = $path.Substring(7) }
    if ($path -eq '') { $path = 'home.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    # مفيش خروج برّه المجلد (../)
    if ((Test-Path $file -PathType Leaf) -and $file.StartsWith($root + [IO.Path]::DirectorySeparatorChar)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
