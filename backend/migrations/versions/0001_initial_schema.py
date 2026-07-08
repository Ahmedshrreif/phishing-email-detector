"""Initial PhishGuard schema."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("sender", sa.String(500), nullable=True),
        sa.Column("reply_to", sa.String(500), nullable=True),
        sa.Column("classification", sa.String(64), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("model_version", sa.String(64), nullable=False),
        sa.Column("analysis_source", sa.String(64), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("raw_result_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_analyses_user_id", "analyses", ["user_id"])
    op.create_index("ix_analyses_classification", "analyses", ["classification"])
    op.create_index("ix_analyses_created_at", "analyses", ["created_at"])
    op.create_index("ix_analyses_model_version", "analyses", ["model_version"])
    op.create_index("ix_analyses_analysis_source", "analyses", ["analysis_source"])

    op.create_table(
        "email_indicators",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("indicator_type", sa.String(128), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("score_contribution", sa.Float(), nullable=False),
    )
    op.create_index("ix_email_indicators_analysis_id", "email_indicators", ["analysis_id"])
    op.create_index("ix_email_indicators_indicator_type", "email_indicators", ["indicator_type"])
    op.create_index("ix_email_indicators_severity", "email_indicators", ["severity"])

    op.create_table(
        "analyzed_urls",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_url", sa.Text(), nullable=False),
        sa.Column("display_text", sa.Text(), nullable=True),
        sa.Column("domain", sa.String(255), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("risk_level", sa.String(32), nullable=False),
        sa.Column("findings_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_analyzed_urls_analysis_id", "analyzed_urls", ["analysis_id"])
    op.create_index("ix_analyzed_urls_domain", "analyzed_urls", ["domain"])
    op.create_index("ix_analyzed_urls_risk_level", "analyzed_urls", ["risk_level"])

    op.create_table(
        "attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(255), nullable=True),
        sa.Column("extension", sa.String(32), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("risk_level", sa.String(32), nullable=False),
        sa.Column("findings_json", sa.Text(), nullable=False),
    )
    op.create_index("ix_attachments_analysis_id", "attachments", ["analysis_id"])

    op.create_table(
        "feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_id", sa.String(36), sa.ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("feedback_type", sa.String(64), nullable=False),
        sa.Column("suggested_label", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("reviewed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_feedback_analysis_id", "feedback", ["analysis_id"])
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"])
    op.create_index("ix_feedback_feedback_type", "feedback", ["feedback_type"])
    op.create_index("ix_feedback_status", "feedback", ["status"])
    op.create_index("ix_feedback_created_at", "feedback", ["created_at"])

    op.create_table(
        "training_samples",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("feedback_id", sa.String(36), sa.ForeignKey("feedback.id"), nullable=True),
        sa.Column("email_data_json", sa.Text(), nullable=False),
        sa.Column("verified_label", sa.String(64), nullable=False),
        sa.Column("dataset_version", sa.String(64), nullable=False),
        sa.Column("approved_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_training_samples_verified_label", "training_samples", ["verified_label"])
    op.create_index("ix_training_samples_dataset_version", "training_samples", ["dataset_version"])

    op.create_table(
        "model_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("model_path", sa.Text(), nullable=False),
        sa.Column("dataset_version", sa.String(64), nullable=False),
        sa.Column("metrics_json", sa.Text(), nullable=False),
        sa.Column("hyperparameters_json", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_model_versions_version", "model_versions", ["version"], unique=True)
    op.create_index("ix_model_versions_is_active", "model_versions", ["is_active"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("entity_type", sa.String(128), nullable=True),
        sa.Column("entity_id", sa.String(128), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "system_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("setting_key", sa.String(128), nullable=False),
        sa.Column("setting_value", sa.Text(), nullable=False),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_system_settings_setting_key", "system_settings", ["setting_key"], unique=True)


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("audit_logs")
    op.drop_table("model_versions")
    op.drop_table("training_samples")
    op.drop_table("feedback")
    op.drop_table("attachments")
    op.drop_table("analyzed_urls")
    op.drop_table("email_indicators")
    op.drop_table("analyses")
    op.drop_table("users")
