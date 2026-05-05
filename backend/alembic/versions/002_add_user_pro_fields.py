"""add user pro fields

Revision ID: c3d4e5f6a7b8
Revises: fbf04bb24f1d
Create Date: 2026-05-05 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "fbf04bb24f1d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_pro", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "users",
        sa.Column("pro_until", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "pro_until")
    op.drop_column("users", "is_pro")
