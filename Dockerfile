FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static \
    PAGE_DIR=/app/pages \
    LOG_DIR=/app/logs

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --upgrade pip

COPY requirements.txt /app/
RUN pip install -r requirements.txt

COPY app ./app
COPY static ./static

RUN groupadd -r appuser && useradd -r -g appuser -u 1001 -m appuser \
    && chown -R appuser:appuser /app

USER appuser

VOLUME ["/app/pages"]
VOLUME ["/app/logs"]

CMD ["uvicorn", "app.__main__:app", "--host", "0.0.0.0", "--port", "3000"]
