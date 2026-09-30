"""
llm.py
------
The ONLY file that knows how to talk to an LLM provider.

Everything else in this server (planner.py, app.py, policy.py) just calls
ask_llm(prompt) and gets a plain string back. This means:

  - planner.py never needs to know whether you're using GPT or Gemini.
  - If you switch providers later (or add a local model), you only
    change this one file.

Which provider is used is controlled by the LLM_PROVIDER environment
variable, so you can flip between them without touching code:

    LLM_PROVIDER=openai   -> uses OpenAI (GPT models)
    LLM_PROVIDER=gemini   -> uses Google Gemini

Both API keys are read from environment variables, NEVER hard-coded,
so they don't end up in your code / git history / SIH demo screenshots.
"""

import os

# python-dotenv lets us keep secrets in a local .env file instead of
# exporting them in the terminal every time. It's optional -- if it's
# not installed, we just skip loading it silently.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini").lower()


def ask_llm(prompt: str) -> str:
    """
    Send `prompt` to whichever LLM provider is configured and return
    the raw text the model replied with (planner.py is responsible
    for turning that text into JSON -> Action).
    """
    if LLM_PROVIDER == "openai":
        return _ask_openai(prompt)
    elif LLM_PROVIDER == "gemini":
        return _ask_gemini(prompt)
    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER '{LLM_PROVIDER}'. "
            "Set it to 'openai' or 'gemini' in your .env file."
        )


# ---------------------------------------------------------------------
# OpenAI / GPT backend
# ---------------------------------------------------------------------
def _ask_openai(prompt: str) -> str:
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to your .env file."
        )

    client = OpenAI(api_key=api_key)

    # gpt-4o-mini is a good, cheap default for this kind of structured
    # reasoning task. Swap the model name if you have access to
    # something else / a college API credit tier gives you a different one.
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        # Ask the API to guarantee syntactically valid JSON back.
        # This does NOT guarantee it matches our Action schema exactly
        # (that's what policy.py + the try/except in planner.py are for)
        # but it does stop the classic "Sure! Here's the JSON:" problem.
        response_format={"type": "json_object"},
        temperature=0,
    )

    return response.choices[0].message.content


# ---------------------------------------------------------------------
# Gemini backend
# ---------------------------------------------------------------------
def _ask_gemini(prompt: str) -> str:
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your .env file."
        )

    genai.configure(api_key=api_key)

    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    model = genai.GenerativeModel(model_name)

    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=0,
            # Same idea as response_format on the OpenAI side: force
            # the reply to be JSON instead of conversational text.
            response_mime_type="application/json",
        ),
    )

    return response.text
