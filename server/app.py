"""Optional LLM layer for Oroboros. The core app never needs it.

    pip install -r server/requirements.txt
    cp server/.env.example server/.env      # fill in RUNPOD_* to enable the model
    uvicorn server.app:app --port 8000
    open http://localhost:8765/?api=http://localhost:8000

The model does exactly two jobs and is never trusted with facts:
  /api/extract  CV text -> task ids, chosen ONLY from the occupation's O*NET task list.
                Any id the model returns that is not in that list is dropped.
  /api/explain  Rephrases sentences the engine already computed. The reply is rejected
                if it contains a number, URL or role/course id that was not in the input.
Model: Qwen2.5-7B-Instruct (Apache-2.0, open weights) served by Runpod's
OpenAI-compatible vLLM endpoint. Disclosed in the README and on the site.
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

SITE_DATA = Path(__file__).resolve().parents[1] / "site" / "data"


def _load_env() -> None:
    p = Path(__file__).with_name(".env")
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()
RUNPOD_KEY = os.environ.get("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT = os.environ.get("RUNPOD_ENDPOINT_ID", "")
MODEL = os.environ.get("RUNPOD_MODEL", "Qwen/Qwen2.5-7B-Instruct")
ORIGINS = [o.strip() for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:8765").split(",") if o.strip()]
LLM_ON = bool(RUNPOD_KEY and RUNPOD_ENDPOINT)

app = FastAPI(title="Oroboros LLM layer", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@lru_cache(maxsize=1024)
def occupation(code: str) -> dict:
    if not re.fullmatch(r"\d{2}-\d{4}\.\d{2}", code):
        raise HTTPException(400, "bad occupation code")
    p = SITE_DATA / "occ" / f"{code}.json"
    if not p.exists():
        raise HTTPException(404, "unknown occupation")
    return json.loads(p.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def course_ids() -> set[str]:
    return {c["id"] for c in json.loads((SITE_DATA / "courses.json").read_text(encoding="utf-8"))["courses"]}


def chat(messages: list[dict], max_tokens: int = 500) -> str:
    if not LLM_ON:
        raise HTTPException(503, "LLM not configured; the site falls back to computed text")
    url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT}/openai/v1/chat/completions"
    r = httpx.post(url, timeout=60, headers={"Authorization": f"Bearer {RUNPOD_KEY}"},
                   json={"model": MODEL, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens})
    if r.status_code != 200:
        raise HTTPException(502, f"model endpoint returned {r.status_code}")
    return r.json()["choices"][0]["message"]["content"]


class ExtractIn(BaseModel):
    cv_text: str = Field(max_length=6000)
    occupation: str


class ExplainIn(BaseModel):
    facts: list[str] = Field(max_length=8)
    occupation: str
    role_code: str
    task_ids: list[int] = []
    course_ids: list[str] = []


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "llm": LLM_ON, "model": MODEL if LLM_ON else None}


@app.post("/api/extract")
def extract(body: ExtractIn) -> dict:
    occ = occupation(body.occupation)
    allowed = {t["id"]: t["text"] for t in occ["tasks"]}
    listing = "\n".join(f"{i}: {t}" for i, t in allowed.items())
    raw = chat([
        {"role": "system", "content": "You map a worker's CV text to task IDs from a fixed list. Reply with JSON only: "
                                      '{"task_ids": [int, ...]}. Use only IDs from the list. Never invent IDs.'},
        {"role": "user", "content": f"TASK LIST:\n{listing}\n\nCV TEXT:\n{body.cv_text}"},
    ], max_tokens=200)
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        ids = json.loads(m.group(0))["task_ids"] if m else []
    except (ValueError, KeyError, TypeError):
        ids = []
    kept = [int(i) for i in ids if isinstance(i, (int, str)) and str(i).isdigit() and int(i) in allowed]
    dropped = [i for i in ids if not (str(i).isdigit() and int(i) in allowed)]
    return {"task_ids": kept, "dropped": dropped, "model": MODEL}


NUM = re.compile(r"\d+(?:\.\d+)?")


@app.post("/api/explain")
def explain(body: ExplainIn) -> dict:
    occ = occupation(body.occupation)
    occupation(body.role_code)                              # role must exist
    valid_tasks = {t["id"] for t in occ["tasks"]}
    if any(t not in valid_tasks for t in body.task_ids) or any(c not in course_ids() for c in body.course_ids):
        raise HTTPException(400, "unknown task or course id")
    facts = "\n".join(f"- {f}" for f in body.facts)
    text = chat([
        {"role": "system", "content": "Rewrite the facts below for a worker in warm, plain English, in at most three short "
                                      "paragraphs. Do not add any fact, number, job title, course or link that is not in the facts."},
        {"role": "user", "content": facts},
    ])
    allowed_nums = set(NUM.findall(facts))
    bad_nums = [n for n in NUM.findall(text) if n not in allowed_nums]
    has_link = "http" in text.lower() or "www." in text.lower()
    validated = not bad_nums and not has_link
    return {"text": text if validated else None, "validated": validated,
            "rejected_numbers": bad_nums, "model": MODEL}
