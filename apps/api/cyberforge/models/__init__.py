"""ORM models. Importing this package registers every table on Base.metadata."""

from cyberforge.models.detection import DetectionRule, rule_techniques
from cyberforge.models.event import Event
from cyberforge.models.intel import Indicator
from cyberforge.models.lab import Lab, LabRun, lab_rules, lab_techniques
from cyberforge.models.learning import LearningModule, LearningProgress
from cyberforge.models.mitre import MitreTactic, MitreTechnique, technique_tactics
from cyberforge.models.soc import (
    AIAnalysis,
    Alert,
    Analyst,
    IncidentReport,
    Investigation,
    InvestigationNote,
    TimelineEntry,
    alert_events,
)

__all__ = [
    "AIAnalysis",
    "Alert",
    "Analyst",
    "DetectionRule",
    "Event",
    "IncidentReport",
    "Indicator",
    "Investigation",
    "InvestigationNote",
    "Lab",
    "LabRun",
    "LearningModule",
    "LearningProgress",
    "MitreTactic",
    "MitreTechnique",
    "TimelineEntry",
    "alert_events",
    "lab_rules",
    "lab_techniques",
    "rule_techniques",
    "technique_tactics",
]
