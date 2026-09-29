"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-29 10:44:51.474529
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import cyberforge.db

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analysts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("handle", sa.String(length=48), nullable=False),
        sa.Column("name", sa.String(length=96), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("handle"),
    )
    op.create_table(
        "detection_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("format", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("logsource", sa.JSON(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("false_positives", sa.JSON(), nullable=False),
        sa.Column("references", sa.JSON(), nullable=False),
        sa.Column("author", sa.String(length=128), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("is_correlation", sa.Boolean(), nullable=False),
        sa.Column("origin", sa.String(length=16), nullable=False),
        sa.Column("source_path", sa.String(length=256), nullable=False),
        sa.Column("created_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("detection_rules", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_detection_rules_format"), ["format"], unique=False)
        batch_op.create_index(batch_op.f("ix_detection_rules_level"), ["level"], unique=False)
        batch_op.create_index(batch_op.f("ix_detection_rules_slug"), ["slug"], unique=True)

    op.create_table(
        "indicators",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("value", sa.String(length=512), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=128), nullable=False),
        sa.Column("tlp", sa.String(length=16), nullable=False),
        sa.Column("first_seen", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("last_seen", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("synthetic", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("type", "value", name="uq_indicator_type_value"),
    )
    with op.batch_alter_table("indicators", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_indicators_type"), ["type"], unique=False)
        batch_op.create_index(batch_op.f("ix_indicators_value"), ["value"], unique=False)

    op.create_table(
        "labs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=96), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("difficulty", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("domain", sa.String(length=32), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("scenario_events", sa.JSON(), nullable=False),
        sa.Column("source_path", sa.String(length=256), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("labs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_labs_category"), ["category"], unique=False)
        batch_op.create_index(batch_op.f("ix_labs_difficulty"), ["difficulty"], unique=False)
        batch_op.create_index(batch_op.f("ix_labs_domain"), ["domain"], unique=False)
        batch_op.create_index(batch_op.f("ix_labs_number"), ["number"], unique=False)
        batch_op.create_index(batch_op.f("ix_labs_slug"), ["slug"], unique=True)

    op.create_table(
        "learning_modules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=96), nullable=False),
        sa.Column("track", sa.String(length=64), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=True),
        sa.Column("lab_slugs", sa.JSON(), nullable=False),
        sa.Column("rule_slugs", sa.JSON(), nullable=False),
        sa.Column("technique_ids", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("learning_modules", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_learning_modules_slug"), ["slug"], unique=True)
        batch_op.create_index(batch_op.f("ix_learning_modules_track"), ["track"], unique=False)

    op.create_table(
        "learning_progress",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.String(length=64), nullable=False),
        sa.Column("module_slug", sa.String(length=96), nullable=False),
        sa.Column("completed_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id", "module_slug", name="uq_progress"),
    )
    with op.batch_alter_table("learning_progress", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_learning_progress_profile_id"), ["profile_id"], unique=False
        )

    op.create_table(
        "mitre_tactics",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("framework", sa.String(length=16), nullable=False),
        sa.Column("shortname", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("url", sa.String(length=256), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("mitre_tactics", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_mitre_tactics_framework"), ["framework"], unique=False)

    op.create_table(
        "mitre_techniques",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("framework", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("url", sa.String(length=256), nullable=False),
        sa.Column("is_subtechnique", sa.Boolean(), nullable=False),
        sa.Column("parent_id", sa.String(length=32), nullable=True),
        sa.Column("platforms", sa.JSON(), nullable=False),
        sa.Column("mitigations", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["mitre_techniques.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("mitre_techniques", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_mitre_techniques_framework"), ["framework"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_mitre_techniques_parent_id"), ["parent_id"], unique=False
        )

    op.create_table(
        "investigations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=True),
        sa.Column("lab_slug", sa.String(length=96), nullable=True),
        sa.Column("created_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("synthetic", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["lead_id"],
            ["analysts.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("investigations", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_investigations_status"), ["status"], unique=False)

    op.create_table(
        "lab_rules",
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["lab_id"], ["labs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rule_id"], ["detection_rules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("lab_id", "rule_id"),
    )
    op.create_table(
        "lab_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("target", sa.String(length=128), nullable=True),
        sa.Column("started_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("finished_at", cyberforge.db.UTCDateTime(timezone=True), nullable=True),
        sa.Column("events_generated", sa.Integer(), nullable=False),
        sa.Column("alerts_generated", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("synthetic", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["lab_id"], ["labs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("lab_runs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_lab_runs_lab_id"), ["lab_id"], unique=False)

    op.create_table(
        "lab_techniques",
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("technique_id", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["lab_id"], ["labs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technique_id"], ["mitre_techniques.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("lab_id", "technique_id"),
    )
    op.create_table(
        "rule_techniques",
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("technique_id", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["rule_id"], ["detection_rules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technique_id"], ["mitre_techniques.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("rule_id", "technique_id"),
    )
    op.create_table(
        "technique_tactics",
        sa.Column("technique_id", sa.String(length=32), nullable=False),
        sa.Column("tactic_id", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["tactic_id"], ["mitre_tactics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technique_id"], ["mitre_techniques.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("technique_id", "tactic_id"),
    )
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("timestamp", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("host", sa.String(length=128), nullable=True),
        sa.Column("user", sa.String(length=128), nullable=True),
        sa.Column("rule_id", sa.Integer(), nullable=True),
        sa.Column("technique_id", sa.String(length=32), nullable=True),
        sa.Column("tactic", sa.String(length=96), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("assignee_id", sa.Integer(), nullable=True),
        sa.Column("lab_run_id", sa.Integer(), nullable=True),
        sa.Column("investigation_id", sa.Integer(), nullable=True),
        sa.Column("dedup_key", sa.String(length=200), nullable=True),
        sa.Column("synthetic", sa.Boolean(), nullable=False),
        sa.Column("created_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignee_id"],
            ["analysts.id"],
        ),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lab_run_id"], ["lab_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["rule_id"], ["detection_rules.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["technique_id"], ["mitre_techniques.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedup_key"),
    )
    with op.batch_alter_table("alerts", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_alerts_host"), ["host"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_alerts_investigation_id"), ["investigation_id"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_alerts_lab_run_id"), ["lab_run_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_alerts_rule_id"), ["rule_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_alerts_severity"), ["severity"], unique=False)
        batch_op.create_index(batch_op.f("ix_alerts_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_alerts_technique_id"), ["technique_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_alerts_timestamp"), ["timestamp"], unique=False)

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("timestamp", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=48), nullable=False),
        sa.Column("category", sa.String(length=48), nullable=False),
        sa.Column("logsource", sa.JSON(), nullable=False),
        sa.Column("host", sa.String(length=128), nullable=True),
        sa.Column("user", sa.String(length=128), nullable=True),
        sa.Column("action", sa.String(length=96), nullable=True),
        sa.Column("outcome", sa.String(length=24), nullable=True),
        sa.Column("src_ip", sa.String(length=64), nullable=True),
        sa.Column("dst_ip", sa.String(length=64), nullable=True),
        sa.Column("dst_port", sa.Integer(), nullable=True),
        sa.Column("process", sa.String(length=512), nullable=True),
        sa.Column("parent_process", sa.String(length=512), nullable=True),
        sa.Column("command_line", sa.Text(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("raw", sa.Text(), nullable=False),
        sa.Column("fields", sa.JSON(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("synthetic", sa.Boolean(), nullable=False),
        sa.Column("dataset", sa.String(length=96), nullable=True),
        sa.Column("lab_run_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["lab_run_id"], ["lab_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_events_category"), ["category"], unique=False)
        batch_op.create_index(batch_op.f("ix_events_host"), ["host"], unique=False)
        batch_op.create_index(batch_op.f("ix_events_lab_run_id"), ["lab_run_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_events_source"), ["source"], unique=False)
        batch_op.create_index(batch_op.f("ix_events_timestamp"), ["timestamp"], unique=False)
        batch_op.create_index("ix_events_ts_cat", ["timestamp", "category"], unique=False)
        batch_op.create_index(batch_op.f("ix_events_user"), ["user"], unique=False)

    op.create_table(
        "incident_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("investigation_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("executive_summary", sa.Text(), nullable=False),
        sa.Column("timeline", sa.JSON(), nullable=False),
        sa.Column("affected_assets", sa.JSON(), nullable=False),
        sa.Column("indicators", sa.JSON(), nullable=False),
        sa.Column("mitre_techniques", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("root_cause", sa.Text(), nullable=False),
        sa.Column("containment", sa.Text(), nullable=False),
        sa.Column("remediation", sa.Text(), nullable=False),
        sa.Column("lessons_learned", sa.Text(), nullable=False),
        sa.Column("updated_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investigation_id"),
    )
    op.create_table(
        "ai_analyses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=96), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("created_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("ai_analyses", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_ai_analyses_alert_id"), ["alert_id"], unique=False)

    op.create_table(
        "alert_events",
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("alert_id", "event_id"),
    )
    op.create_table(
        "investigation_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("investigation_id", sa.Integer(), nullable=True),
        sa.Column("alert_id", sa.Integer(), nullable=True),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "alert_id IS NOT NULL OR investigation_id IS NOT NULL", name="ck_note_has_parent"
        ),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["analysts.id"],
        ),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("investigation_notes", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_investigation_notes_alert_id"), ["alert_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_investigation_notes_investigation_id"),
            ["investigation_id"],
            unique=False,
        )

    op.create_table(
        "investigation_timeline",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("investigation_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", cyberforge.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("investigation_timeline", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_investigation_timeline_investigation_id"),
            ["investigation_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("investigation_timeline", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_investigation_timeline_investigation_id"))

    op.drop_table("investigation_timeline")
    with op.batch_alter_table("investigation_notes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_investigation_notes_investigation_id"))
        batch_op.drop_index(batch_op.f("ix_investigation_notes_alert_id"))

    op.drop_table("investigation_notes")
    op.drop_table("alert_events")
    with op.batch_alter_table("ai_analyses", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_ai_analyses_alert_id"))

    op.drop_table("ai_analyses")
    op.drop_table("incident_reports")
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_events_user"))
        batch_op.drop_index("ix_events_ts_cat")
        batch_op.drop_index(batch_op.f("ix_events_timestamp"))
        batch_op.drop_index(batch_op.f("ix_events_source"))
        batch_op.drop_index(batch_op.f("ix_events_lab_run_id"))
        batch_op.drop_index(batch_op.f("ix_events_host"))
        batch_op.drop_index(batch_op.f("ix_events_category"))

    op.drop_table("events")
    with op.batch_alter_table("alerts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_alerts_timestamp"))
        batch_op.drop_index(batch_op.f("ix_alerts_technique_id"))
        batch_op.drop_index(batch_op.f("ix_alerts_status"))
        batch_op.drop_index(batch_op.f("ix_alerts_severity"))
        batch_op.drop_index(batch_op.f("ix_alerts_rule_id"))
        batch_op.drop_index(batch_op.f("ix_alerts_lab_run_id"))
        batch_op.drop_index(batch_op.f("ix_alerts_investigation_id"))
        batch_op.drop_index(batch_op.f("ix_alerts_host"))

    op.drop_table("alerts")
    op.drop_table("technique_tactics")
    op.drop_table("rule_techniques")
    op.drop_table("lab_techniques")
    with op.batch_alter_table("lab_runs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_lab_runs_lab_id"))

    op.drop_table("lab_runs")
    op.drop_table("lab_rules")
    with op.batch_alter_table("investigations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_investigations_status"))

    op.drop_table("investigations")
    with op.batch_alter_table("mitre_techniques", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_mitre_techniques_parent_id"))
        batch_op.drop_index(batch_op.f("ix_mitre_techniques_framework"))

    op.drop_table("mitre_techniques")
    with op.batch_alter_table("mitre_tactics", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_mitre_tactics_framework"))

    op.drop_table("mitre_tactics")
    with op.batch_alter_table("learning_progress", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_learning_progress_profile_id"))

    op.drop_table("learning_progress")
    with op.batch_alter_table("learning_modules", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_learning_modules_track"))
        batch_op.drop_index(batch_op.f("ix_learning_modules_slug"))

    op.drop_table("learning_modules")
    with op.batch_alter_table("labs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_labs_slug"))
        batch_op.drop_index(batch_op.f("ix_labs_number"))
        batch_op.drop_index(batch_op.f("ix_labs_domain"))
        batch_op.drop_index(batch_op.f("ix_labs_difficulty"))
        batch_op.drop_index(batch_op.f("ix_labs_category"))

    op.drop_table("labs")
    with op.batch_alter_table("indicators", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_indicators_value"))
        batch_op.drop_index(batch_op.f("ix_indicators_type"))

    op.drop_table("indicators")
    with op.batch_alter_table("detection_rules", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_detection_rules_slug"))
        batch_op.drop_index(batch_op.f("ix_detection_rules_level"))
        batch_op.drop_index(batch_op.f("ix_detection_rules_format"))

    op.drop_table("detection_rules")
    op.drop_table("analysts")
