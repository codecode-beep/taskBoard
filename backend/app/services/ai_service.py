import json
import logging
from typing import Literal

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

GeminiErr = Literal["no_key", "insufficient_quota", "rate_limit", "invalid_key", "http_error", "network_error"]
AssistMode = Literal["gemini", "demo", "gemini_quota", "gemini_auth"]


_MSG_QUOTA = (
    "**Google Gemini: quota / rate limit**\n\n"
    "The **API key is valid**, but Google returned **429** or **RESOURCE_EXHAUSTED**. "
    "This usually means **free-tier limits**, **billing**, or **per-minute caps**.\n\n"
    "- Keys & quotas: https://aistudio.google.com/apikey\n"
    "- Limits: https://ai.google.dev/gemini-api/docs/rate-limits\n\n"
    "_Neural assist will use demo text until requests succeed again._"
)

_MSG_AUTH = (
    "**Google Gemini: API key rejected**\n\n"
    "Google returned **403** or **401** (invalid key, Generative Language API disabled, or wrong project). "
    "Create or fix a key at https://aistudio.google.com/apikey , enable the **Generative Language API** "
    "for your Cloud project if needed, and set `GOOGLE_API_KEY` in `backend/.env`, then restart the server.\n\n"
    "_Demo output below._"
)


def _gemini_extract_text(data: dict) -> str | None:
    cands = data.get("candidates") or []
    if not cands:
        return None
    parts = (cands[0].get("content") or {}).get("parts") or []
    text = "".join(str(p.get("text", "")) for p in parts if isinstance(p, dict))
    return text.strip() or None


async def _call_gemini(system: str, user: str) -> tuple[str | None, GeminiErr | None]:
    """Returns (content, error). error is None on success."""
    settings = get_settings()
    key = (settings.google_api_key or "").strip().strip('"').strip("'")
    if not key:
        return None, "no_key"
    model = (settings.gemini_model or "gemini-2.5-flash").strip().removeprefix("models/")
    if not model or not model.replace(".", "").replace("-", "").replace("_", "").isalnum():
        return None, "http_error"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": 0.65,
            "maxOutputTokens": 1200,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(
                url,
                params={"key": key},
                headers={"Content-Type": "application/json"},
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
            out = _gemini_extract_text(data)
            if out:
                return out, None
            logger.warning("Gemini empty candidates/parts: %s", str(data)[:500])
            return None, "http_error"
    except httpx.HTTPStatusError as e:
        err_body = (e.response.text or "")[:800]
        logger.warning("Gemini HTTP %s: %s", e.response.status_code, err_body)
        code = e.response.status_code
        if code in (401, 403):
            return None, "invalid_key"
        if code == 429:
            try:
                j = e.response.json()
                err = j.get("error") or {}
                status = str(err.get("status", "")).upper()
                if status == "RESOURCE_EXHAUSTED":
                    return None, "insufficient_quota"
            except Exception:
                pass
            return None, "rate_limit"
        return None, "http_error"
    except Exception as e:
        logger.warning("Gemini request failed: %s", e)
        return None, "network_error"


def _demo_polish(text: str, task_title: str | None) -> str:
    t = text.strip()
    if not t:
        return t
    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    if not lines:
        lines = [t]
    header = "**Polished (demo mode)** — add `GOOGLE_API_KEY` for live Gemini.\n\n"
    if task_title:
        header += f"_Task: {task_title}_\n\n"
    body = "\n".join(f"• {ln}" if not ln.startswith("•") else ln for ln in lines[:12])
    if len(lines) > 12:
        body += f"\n\n_…{len(lines) - 12} more lines summarized in workflow._"
    footer = "\n\n---\n_Suggested next step: define acceptance criteria and owner._"
    return header + body + footer


def _demo_titles(seed: str, context: str | None) -> str:
    base = seed.strip()[:80]
    ctx = (context or "").strip()[:200]
    ideas = [
        f"{base} — scope & deliverables",
        f"{base} (review): validation checklist",
        f"Follow-up: {base.lower()} dependencies",
    ]
    if ctx:
        ideas.append(f"Refinement: {base[:40]}… ({ctx[:40]}…)")
    return "**Title ideas (demo mode)**\n\n" + "\n".join(f"{i + 1}. {x}" for i, x in enumerate(ideas))


def _demo_board_brief(board_name: str, tasks: list[dict]) -> str:
    by_col: dict[str, int] = {}
    high = 0
    for t in tasks:
        col = str(t.get("column", "?"))
        by_col[col] = by_col.get(col, 0) + 1
        if str(t.get("priority", "")).lower() == "high":
            high += 1
    dist = ", ".join(f"{k}: {v}" for k, v in sorted(by_col.items(), key=lambda x: -x[1])[:6])
    return (
        f"**Board pulse — {board_name}** _(demo mode)_\n\n"
        f"- Work items tracked: **{len(tasks)}**\n"
        f"- High priority: **{high}**\n"
        f"- Column spread: {dist or '—'}\n\n"
        "**Heuristic focus:** balance Review vs Done; unblock anything stuck in In Progress > 5 days (check due dates).\n"
        "_Configure Gemini (`GOOGLE_API_KEY`) for narrative insights._"
    )


async def polish_description(text: str, task_title: str | None) -> tuple[str, AssistMode]:
    system = (
        "You are a concise editorial assistant for engineering task descriptions. "
        "Improve clarity, structure with short bullets if helpful, keep tone professional. "
        "Do not invent facts or stakeholders. Output markdown."
    )
    user = f"Task title: {task_title or '(none)'}\n\nDescription to polish:\n{text}"
    out, err = await _call_gemini(system, user)
    if out:
        return out, "gemini"
    if err == "insufficient_quota" or err == "rate_limit":
        return _MSG_QUOTA + "\n\n---\n\n" + _demo_polish(text, task_title), "gemini_quota"
    if err == "invalid_key":
        return _MSG_AUTH + "\n\n---\n\n" + _demo_polish(text, task_title), "gemini_auth"
    return _demo_polish(text, task_title), "demo"


async def title_ideas(seed: str, context: str | None) -> tuple[str, AssistMode]:
    system = "You suggest 4–5 short, actionable work item titles for a Kanban board. Output markdown numbered list. No preamble."
    user = f"Seed: {seed}\nExtra context: {context or 'none'}"
    out, err = await _call_gemini(system, user)
    if out:
        return out, "gemini"
    if err == "insufficient_quota" or err == "rate_limit":
        return _MSG_QUOTA + "\n\n---\n\n" + _demo_titles(seed, context), "gemini_quota"
    if err == "invalid_key":
        return _MSG_AUTH + "\n\n---\n\n" + _demo_titles(seed, context), "gemini_auth"
    return _demo_titles(seed, context), "demo"


async def board_brief(board_name: str, tasks: list[dict]) -> tuple[str, AssistMode]:
    compact = [
        {
            "title": str(t.get("title", ""))[:120],
            "column": str(t.get("column", ""))[:40],
            "priority": str(t.get("priority", "")),
        }
        for t in tasks[:80]
    ]
    system = (
        "You are an engineering manager AI. Given a board name and task snapshot, "
        "write a tight brief: risks, bottlenecks, 3 prioritized recommendations. Markdown. Under 200 words."
    )
    user = f"Board: {board_name}\n\nTasks JSON:\n{json.dumps(compact, indent=0)}"
    out, err = await _call_gemini(system, user)
    if out:
        return out, "gemini"
    if err == "insufficient_quota" or err == "rate_limit":
        return _MSG_QUOTA + "\n\n---\n\n" + _demo_board_brief(board_name, tasks), "gemini_quota"
    if err == "invalid_key":
        return _MSG_AUTH + "\n\n---\n\n" + _demo_board_brief(board_name, tasks), "gemini_auth"
    return _demo_board_brief(board_name, tasks), "demo"


async def copilot_chat(message: str, board_name: str | None, task_title: str | None) -> tuple[str, AssistMode]:
    system = (
        "You are a helpful AI copilot inside a team task board app. "
        "Answer briefly in markdown. If unsure, say so. No code execution claims."
    )
    ctx = f"Board: {board_name or 'unknown'}\nFocused task: {task_title or 'none'}\n"
    user = ctx + f"\nUser:\n{message}"
    out, err = await _call_gemini(system, user)
    if out:
        return out, "gemini"
    if err == "insufficient_quota" or err == "rate_limit":
        return (
            _MSG_QUOTA
            + f"\n\n---\n\n_You asked:_ {message[:280]}{'…' if len(message) > 280 else ''}\n\n"
            "**While quota resets:** use **Quick tools** (polish, titles, board pulse) for offline heuristics.",
            "gemini_quota",
        )
    if err == "invalid_key":
        return _MSG_AUTH, "gemini_auth"
    reply = (
        "**Copilot (demo mode)**\n\n"
        "I can reason with full context when you set `GOOGLE_API_KEY` on the server.\n\n"
        f"_Your question:_ {message[:200]}{'…' if len(message) > 200 else ''}\n\n"
        "**Try:** polish a task description, generate title ideas, or run **Board pulse** for workload heuristics."
    )
    return reply, "demo"
