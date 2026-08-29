FROM python:3.11-slim
WORKDIR /app/api
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PAKEMIS_API_LAZY=0
EXPOSE 8000
CMD ["python3", "-m", "uvicorn", "pakemis_api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
