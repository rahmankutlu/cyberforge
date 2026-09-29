# syntax=docker/dockerfile:1.7
# Acme Portal: the INTENTIONALLY VULNERABLE lab target. Runs only on the internal `lab` network.
#   docker build -f docker/lab-web.Dockerfile -t cyberforge-lab-web .

FROM python:3.14-slim
LABEL org.opencontainers.image.title="CyberForge Lab: Acme Portal" \
      org.opencontainers.image.description="Intentionally vulnerable training application. Never expose it." \
      org.opencontainers.image.source="https://github.com/rahmankutlu/cyberforge" \
      org.opencontainers.image.licenses="MIT"
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN useradd --system --uid 10002 --no-create-home --shell /usr/sbin/nologin labapp
WORKDIR /app
COPY labs/web/vulnerable-app/requirements.txt .
RUN pip install -r requirements.txt
COPY labs/web/vulnerable-app/app.py .
USER 10002:10002
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["python", "-c", "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--no-server-header"]
