rule CyberForge_Office_Macro_Autoexec_Shell
{
    meta:
        title = "OLE Document With Auto-Execute Macro And Shell Object"
        description = "Matches legacy Office (OLE) files containing an auto-run macro entry point together with scripting-shell object creation."
        author = "CyberForge"
        severity = "high"
        status = "experimental"
        mitre_attack = "T1204.002"
        reference = "https://attack.mitre.org/techniques/T1204/002/"
        false_positives = "Business macros that legitimately automate other applications"

    strings:
        $auto1 = "AutoOpen" ascii wide nocase
        $auto2 = "Document_Open" ascii wide nocase
        $shell1 = "WScript.Shell" ascii wide nocase
        $shell2 = "Shell(" ascii wide nocase

    condition:
        uint32be(0) == 0xD0CF11E0 and any of ($auto*) and any of ($shell*)
}
