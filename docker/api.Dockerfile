# syntax=docker/dockerfile:1.7
# CyberForge API. Build context: the repository root (content files are baked into the image).
#   docker build -f docker/api.Dockerfile -t cyberforge-api .

FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
WORKDIR /build
COPY apps/api/pyproject.toml apps/api/README.md ./
COPY apps/api/cyberforge ./cyberforge
RUN pip install .

FROM python:3.12-slim AS runtime
LABEL org.opencontainers.image.title="CyberForge API" \
      org.opencontainers.image.description="CyberForge API: telemetry, detections, MITRE mapping and the mini SOC" \
      org.opencontainers.image.source="https://github.com/rahmankutlu/cyberforge" \
      org.opencontainers.image.licenses="MIT"
# Non-root, no login shell, no home directory.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin cyberforge
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CYBERFORGE_CONTENT_DIR=/app/content
WORKDIR /app

# Content the API loads at start-up: labs, detections, datasets, MITRE data, learning content, docs.
COPY labs /app/content/labs
COPY detections /app/content/detections
COPY datasets /app/content/datasets
COPY mitre/attack.json mitre/atlas.json /app/content/mitre/
COPY packages/security-content /app/content/packages/security-content
COPY examples /app/content/examples
COPY stories /app/content/stories
COPY demos /app/content/demos
COPY docs /app/content/docs
COPY README.md ARCHITECTURE.md ROADMAP.md CONTRIBUTING.md SECURITY.md /app/content/

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=4s --start-period=40s --retries=5 \
  CMD ["python", "-c", "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=3).status == 200 else 1)"]
CMD ["uvicorn", "cyberforge.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header", "--proxy-headers"]
