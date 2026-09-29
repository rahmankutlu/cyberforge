"""Detection playground: curated datasets, run a rule over them, explain each match."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy import select

from cyberforge.api.deps import BundleDep, SessionDep
from cyberforge.models import MitreTechnique
from cyberforge.services import playground

router = APIRouter(prefix="/playground", tags=["playground"])

Format = Literal["sigma", "yara", "suricata"]


class DatasetOut(BaseModel):
    slug: str
    name: str
    description: str
    source_type: str
    kind: Literal["events", "files"]
    difficulty: str
    item_count: int
    mitre: list[dict[str, str | None]]
    expected_rules: list[dict[str, str]]
    try_this: list[str]


class DatasetDetail(DatasetOut):
    items: list[dict[str, Any]]


class RunRequest(BaseModel):
    content: str = Field(min_length=1, max_length=65536)
    format: Format = "sigma"
    dataset: str | None = Field(None, max_length=96)
    events: list[dict[str, Any]] | None = Field(None, max_length=500)
    files: list[dict[str, Any]] | None = Field(None, max_length=50)


class ExplainRequest(RunRequest):
    index: int = Field(ge=0, le=100_000)


def _dataset_out(bundle: BundleDep, ds: Any, session: SessionDep) -> dict[str, Any]:
    names = dict(session.execute(select(MitreTechnique.id, MitreTechnique.name)).all())
    rules = {r.slug: r for r in bundle.rules}
    return {
        "slug": ds.slug,
        "name": ds.name,
        "description": " ".join(ds.description.split()),
        "source_type": ds.source_type,
        "kind": ds.kind,
        "difficulty": ds.difficulty,
        "item_count": len(playground.dataset_items(ds)),
        "mitre": [{"id": t, "name": names.get(t)} for t in ds.mitre],
        "expected_rules": [
            {"slug": s, "title": rules[s].title, "format": rules[s].format}
            for s in ds.expected_rules
            if s in rules
        ],
        "try_this": ds.try_this,
    }


@router.get("/datasets", response_model=list[DatasetOut], summary="Curated playground datasets")
def list_datasets(bundle: BundleDep, session: SessionDep) -> list[dict[str, Any]]:
    return [_dataset_out(bundle, ds, session) for ds in bundle.playground_datasets]


@router.get(
    "/datasets/{slug}", response_model=DatasetDetail, summary="A dataset with its events or files"
)
def get_dataset(
    slug: Annotated[str, Path(max_length=96)], bundle: BundleDep, session: SessionDep
) -> dict[str, Any]:
    ds = next((d for d in bundle.playground_datasets if d.slug == slug), None)
    if ds is None:
        raise HTTPException(404, "Dataset not found")
    out = _dataset_out(bundle, ds, session)
    out["items"] = [i.public() for i in playground.dataset_items(ds)]
    return out


def _items(body: RunRequest, bundle: BundleDep) -> list[playground.Item]:
    try:
        if body.dataset:
            ds = next((d for d in bundle.playground_datasets if d.slug == body.dataset), None)
            if ds is None:
                raise HTTPException(404, "Dataset not found")
            return playground.dataset_items(ds)
        if not body.events and not body.files:
            raise HTTPException(422, "Provide a dataset, events or files")
        return playground.custom_items(body.events, body.files)
    except playground.PlaygroundError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/run", summary="Run a rule over a dataset or custom samples")
def run_rule(body: RunRequest, bundle: BundleDep, session: SessionDep) -> dict[str, Any]:
    items = _items(body, bundle)
    known = dict(session.execute(select(MitreTechnique.id, MitreTechnique.name)).all())
    try:
        return playground.run(body.format, body.content, items, known)
    except playground.PlaygroundError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/explain", summary="Explain why a rule did or did not match one event")
def explain_match(body: ExplainRequest, bundle: BundleDep) -> dict[str, Any]:
    items = _items(body, bundle)
    try:
        return playground.explain(body.format, body.content, items, body.index)
    except playground.PlaygroundError as exc:
        raise HTTPException(422, str(exc)) from exc
