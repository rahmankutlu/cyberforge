rule CyberForge_PowerShell_Download_Cradle_Script
{
    meta:
        title = "PowerShell Script With Download-And-Execute Cradle"
        description = "Matches PowerShell script files that fetch remote text and evaluate it. Complements the process-creation and script-block Sigma rules for files at rest."
        author = "CyberForge"
        severity = "medium"
        status = "experimental"
        mitre_attack = "T1059.001"
        reference = "https://attack.mitre.org/techniques/T1059/001/"
        false_positives = "Installer bootstrap scripts from package managers and developer tools"

    strings:
        $dl1 = "DownloadString(" nocase
        $dl2 = "Invoke-WebRequest" nocase
        $dl3 = "Net.WebClient" nocase
        $exec1 = "Invoke-Expression" nocase
        $exec2 = /\biex\b/ nocase

    condition:
        filesize < 500KB and any of ($dl*) and any of ($exec*)
}
