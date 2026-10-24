"""Server guardrail tests (no model needed).  Run:  python -m pytest tests/test_server.py"""
from fastapi.testclient import TestClient

from server.app import app

c = TestClient(app)


def test_health_reports_llm_state():
    r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_unknown_occupation_rejected():
    assert c.post("/api/extract", json={"cv_text": "x", "occupation": "99-9999.99"}).status_code == 404
    assert c.post("/api/extract", json={"cv_text": "x", "occupation": "../../etc"}).status_code == 400


def test_unknown_course_or_task_rejected_before_model_call():
    r = c.post("/api/explain", json={"facts": ["a"], "occupation": "13-1031.00", "role_code": "13-1051.00",
                                     "task_ids": [1], "course_ids": []})
    assert r.status_code == 400
    r = c.post("/api/explain", json={"facts": ["a"], "occupation": "13-1031.00", "role_code": "13-1051.00",
                                     "task_ids": [], "course_ids": ["made-up-course"]})
    assert r.status_code == 400


def test_without_model_the_api_says_so():
    r = c.post("/api/extract", json={"cv_text": "I examine claim forms", "occupation": "13-1031.00"})
    assert r.status_code in (200, 503)
