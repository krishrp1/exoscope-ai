FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend
COPY scripts/ ./scripts
COPY data/ ./data 2>/dev/null || true

# Copy pre-built model and artifacts if available
COPY backend/saved_models/ ./backend/saved_models 2>/dev/null || true
COPY backend/artifacts/ ./backend/artifacts 2>/dev/null || true

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]