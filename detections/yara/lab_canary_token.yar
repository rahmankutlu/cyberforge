rule CyberForge_Lab_Canary_Token
{
    meta:
        title = "CyberForge Lab Canary Token Present In File"
        description = "Finds the synthetic canary strings that CyberForge labs plant in fake secrets and system prompts. A hit outside the lab directories means lab data has leaked."
        author = "CyberForge"
        severity = "medium"
        status = "stable"
        reference = "https://github.com/rahmankutlu/cyberforge"
        false_positives = "Documentation and tests inside the CyberForge repository itself"

    strings:
        $canary = /CF-CANARY-[A-Z0-9]{8}/ ascii

    condition:
        $canary
}
