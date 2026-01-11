FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8080

# Run the server
CMD ["uvicorn", "src.synckit_server.main:app", "--host", "0.0.0.0", "--port", "8080"]
