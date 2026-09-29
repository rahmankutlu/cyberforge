rule CyberForge_EICAR_Test_File
{
    meta:
        title = "EICAR Anti-Malware Test File"
        description = "Matches the industry-standard EICAR test string. Harmless by design: use it to verify that file scanning and alerting pipelines work end to end."
        author = "CyberForge"
        severity = "informational"
        status = "stable"
        reference = "https://www.eicar.org/download-anti-malware-testfile/"
        false_positives = "None expected outside of deliberate pipeline testing"

    strings:
        $eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*" ascii

    condition:
        filesize < 1KB and $eicar
}
