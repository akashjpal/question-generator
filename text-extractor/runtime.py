import os
import json
import redis
from main import main

redis_port = int(os.getenv("APPWRITE_FUNCTIONS_REDIS_PORT", 6379))
r = redis.Redis(port=redis_port)

print("🔵 Python OCR worker ready and listening for jobs...")

try:
    while True:
        print("⏳ Waiting for job...")
        job_data = r.brpop("appwrite_queue", timeout=5)  # <-- timeout added

        if job_data is None:
            continue  # No job yet → loop again, allows Ctrl+C interrupt

        _, payload = job_data
        job = json.loads(payload)
        print("✅ Job received:", job)
        print(job)
        result = main(job)

        print(result)

        print(job)

except KeyboardInterrupt:
    print("\n🛑 Worker stopped by user (Ctrl+C).")
