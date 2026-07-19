"""Local dev entrypoint: `python run_dev.py`.

Equivalent to `uvicorn main:app --reload --host 0.0.0.0 --port <PORT>`.
"""
import uvicorn

import config

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
