import os
import tempfile
import unittest
from pathlib import Path

TEMP = tempfile.TemporaryDirectory()
os.environ["LOVENEET_AUTH_DB"] = str(Path(TEMP.name) / "auth-test.db")
os.environ["LOVENEET_AUTH_SECRET"] = "test-secret-that-is-at-least-32-characters-long"

import auth


class AuthSecurityTests(unittest.TestCase):
    def test_password_hash_is_not_plaintext_and_verifies(self):
        password = "A-strong-test-password-123"
        encoded = auth.hashpw(password)
        self.assertNotEqual(encoded, password)
        self.assertTrue(auth.checkpw(password, encoded))
        self.assertFalse(auth.checkpw("incorrect-password", encoded))

    def test_session_signature_and_expiry_payload(self):
        signed = auth.token({"id": "test-user", "session_version": 4})
        payload = auth.decode(signed)
        self.assertEqual(payload["sub"], "test-user")
        self.assertEqual(payload["ver"], 4)
        self.assertIsNone(auth.decode(signed + "tampered"))

    def test_database_bootstrap_is_idempotent(self):
        auth.init_db()
        auth.init_db()
        with auth.db() as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"users", "companies", "plans", "audit_logs", "settings"}.issubset(tables))

    def test_pdf_watermark_is_embedded(self):
        import fitz
        source = fitz.open()
        page = source.new_page()
        page.insert_text((72, 72), "Sample document")
        original = source.tobytes()
        cfg = {"enabled": True, "text": "{company} · {user}", "position": "bottom-right", "opacity": 0.4}
        output = auth.watermark_bytes(original, "sample.pdf", cfg, "Example Company", "Test User")
        result = fitz.open(stream=output, filetype="pdf")
        extracted = result[0].get_text()
        self.assertIn("Example Company", extracted)
        self.assertIn("Test User", extracted)

    def test_company_tool_access_is_independent(self):
        auth.init_db()
        with auth.db() as conn:
            conn.execute("INSERT INTO companies(id,name,slug,tool_access,created_at) VALUES(?,?,?,?,?)",
                         ("company-a", "Company A", "company-a", '["pdf:merge"]', auth.now()))
            conn.execute("INSERT INTO companies(id,name,slug,tool_access,created_at) VALUES(?,?,?,?,?)",
                         ("company-b", "Company B", "company-b", '["convert"]', auth.now()))
        self.assertEqual(auth.company_tool_access("company-a"), ["pdf:merge"])
        self.assertEqual(auth.company_tool_access("company-b"), ["convert"])


if __name__ == "__main__":
    unittest.main()
