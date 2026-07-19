from agent.prompts import build_system_prompt, load_knowledge_doc


def test_load_knowledge_doc_returns_real_content():
    doc = load_knowledge_doc()
    assert "Information I'll need from you" in doc
    assert len(doc) > 200


def test_build_system_prompt_reports_no_pdf_and_no_job_by_default():
    prompt = build_system_prompt(pending_file=None, job_status=None, last_assessment_id=None)
    assert "PDF attached: no" in prompt
    assert "not started" in prompt
    assert "none yet" in prompt


def test_build_system_prompt_reflects_pending_file_and_job_status():
    prompt = build_system_prompt(
        pending_file={"file_id": "f1", "file_name": "bio.pdf"}, job_status=1, last_assessment_id=None,
    )
    assert "PDF attached: yes (bio.pdf)" in prompt
    assert "Generation job status: 1" in prompt


def test_build_system_prompt_surfaces_last_assessment_id():
    prompt = build_system_prompt(pending_file=None, job_status=None, last_assessment_id=42)
    assert "Published assessment in this session: 42" in prompt


def test_build_system_prompt_embeds_knowledge_doc():
    prompt = build_system_prompt(pending_file=None, job_status=None, last_assessment_id=None)
    assert "Reference knowledge" in prompt
    assert "Editing a published quiz" in prompt
