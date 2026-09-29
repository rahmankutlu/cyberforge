"""Lab execution: replay a lab's scenario as telemetry and run detections over it."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from cyberforge.content.schemas import ScenarioEvent
from cyberforge.db import utcnow
from cyberforge.models import Event, Lab, LabRun
from cyberforge.services import guardrails, simulation
from cyberforge.services.detection_engine import run_detections


def run_lab(
    session: Session,
    lab: Lab,
    *,
    target: str | None = None,
    end_at: datetime | None = None,
    notes: str = "",
) -> LabRun:
    """Replay `lab`'s scenario ending at `end_at` (default: now).

    Raises guardrails.TargetRejected if `target` is not an approved lab destination.
    """
    allowed = list(lab.document.get("safety", {}).get("allowed_targets", []))
    checked_target = guardrails.validate_target(target, allowed)

    scenario = [ScenarioEvent.model_validate(e) for e in lab.scenario_events]
    span = simulation.span_seconds(scenario)
    finished = end_at or utcnow()
    start = finished - timedelta(seconds=span + 2)

    run = LabRun(
        lab_id=lab.id, status="running", mode="simulation", target=checked_target,
        started_at=start, notes=notes, synthetic=True,
    )  # fmt: skip
    session.add(run)
    session.flush()

    events = [
        Event(**row, lab_run_id=run.id, synthetic=True, dataset=None)
        for row in simulation.materialize(scenario, start)
    ]
    session.add_all(events)
    session.flush()

    alerts = run_detections(session, events, lab_run_id=run.id, synthetic=True)
    run.events_generated = len(events)
    run.alerts_generated = len(alerts)
    run.finished_at = finished
    run.status = "completed"
    session.flush()
    return run
