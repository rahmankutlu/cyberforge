from fastapi import APIRouter

from cyberforge.api.v1 import (
    ai,
    alerts,
    detections,
    events,
    intel,
    investigations,
    labs,
    learning,
    meta,
    mitre,
    playground,
    stories,
)

api_router = APIRouter(prefix="/api/v1")
for module in (labs, events, alerts, investigations, detections, mitre, playground, stories, intel, learning, ai, meta):
    api_router.include_router(module.router)
