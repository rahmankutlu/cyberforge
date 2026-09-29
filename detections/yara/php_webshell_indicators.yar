rule CyberForge_PHP_Webshell_Indicators
{
    meta:
        title = "PHP Script Evaluating Request Input"
        description = "Flags PHP files that pass request parameters to code-execution functions. Generic heuristics for triage; expect to review matches by hand."
        author = "CyberForge"
        severity = "high"
        status = "experimental"
        mitre_attack = "T1505.003"
        reference = "https://attack.mitre.org/techniques/T1505/003/"
        false_positives = "Admin panels and template engines that intentionally evaluate input"

    strings:
        $php = "<?php" nocase
        $eval_post = /eval\s*\(\s*\$_(POST|REQUEST|GET)\s*\[/ nocase
        $sys_get = /(system|shell_exec|passthru|exec)\s*\(\s*\$_(POST|REQUEST|GET)\s*\[/ nocase
        $b64_eval = /eval\s*\(\s*base64_decode\s*\(/ nocase

    condition:
        filesize < 200KB and $php and any of ($eval_post, $sys_get, $b64_eval)
}
