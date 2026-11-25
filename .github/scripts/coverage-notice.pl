#!/usr/bin/perl
# ملخص تغطية اختبارات الدالة من ملف lcov (deno coverage --lcov) كملاحظة CI عامة (annotation) — بتتقري من check-runs/<job>/annotations
# من غير صلاحية السجل: نسبة السطور والفروع لكل ملف، والسطور اللي متنفّذتش في أي اختبار (مضغوطة لمدى). للتقرير بس، مش بوابة.
# التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦): تغطية الدوال اتقاست من المتصفح، والفروع جوه الدوال محتاجة ملفات TypeScript نفسها
use strict;
use warnings;
my ($file) = @ARGV;
die "usage: coverage-notice.pl cov.lcov\n" unless defined $file;
open my $h, '<', $file or die "$file: $!\n";
my (%f, $cur);
while (my $l = <$h>) {
  $l =~ s/\r?\n\z//;
  if ($l =~ /^SF:(.*)$/) {
    ($cur = $1) =~ s{^.*?/supabase/functions/}{};
    $f{$cur} ||= { lf => 0, lh => 0, brf => 0, brh => 0, miss => [] };
  } elsif (!defined $cur) {
    next;
  } elsif ($l =~ /^DA:(\d+),(\d+)/) {
    push @{ $f{$cur}{miss} }, $1 if $2 == 0;
  } elsif ($l =~ /^(LF|LH|BRF|BRH):(\d+)$/) {
    $f{$cur}{ lc $1 } += $2;
  } elsif ($l eq 'end_of_record') {
    undef $cur;
  }
}
close $h;
die "no coverage records in $file\n" unless %f;
sub pct { my ($a, $b) = @_; return $b ? sprintf('%.1f%%', 100 * $a / $b) : '-'; }
sub ranges {
  my @n = sort { $a <=> $b } @_;
  my @r;
  while (@n) {
    my $s = shift @n;
    my $e = $s;
    $e = shift @n while @n && $n[0] == $e + 1;
    push @r, $s == $e ? $s : "$s-$e";
  }
  return join(', ', @r);
}
my ($LF, $LH, $BF, $BH) = (0, 0, 0, 0);
my @lines;
for my $k (sort keys %f) {
  my $x = $f{$k};
  $LF += $x->{lf}; $LH += $x->{lh}; $BF += $x->{brf}; $BH += $x->{brh};
  push @lines, $k . ': lines ' . pct($x->{lh}, $x->{lf}) . ', branches ' . pct($x->{brh}, $x->{brf}) .
    (@{ $x->{miss} } ? ' - not run: ' . ranges(@{ $x->{miss} }) : '');
}
my $msg = 'lines ' . pct($LH, $LF) . " ($LH/$LF), branches " . pct($BH, $BF) . " ($BH/$BF)\n" . join("\n", @lines);
$msg = substr($msg, 0, 6000);
# أوامر GitHub: ٪ والسطر الجديد بيتكتبوا بالترميز
$msg =~ s/%/%25/g;
$msg =~ s/\r/%0D/g;
$msg =~ s/\n/%0A/g;
print "::notice title=sync coverage::$msg\n";
