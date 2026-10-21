import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("blog", Path(__file__).resolve().parents[1] / "tools/blog.py")
blog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(blog)


class BlogBuildTests(unittest.TestCase):
    def test_unpublishing_deleting_and_rescheduling_remove_old_pages(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            source.mkdir()
            output = root / "generated"
            original = blog.POSTS
            blog.POSTS = source / "posts.json"
            post = dict(slug="test-note", title="Test", date="2026-10-19", body="Secret", published=True)
            try:
                for replacement in [{**post, "published": False}, {**post, "publish_at": "2099-01-01T00:00:00Z"}, None]:
                    blog.POSTS.write_text(json.dumps([post]), encoding="utf-8")
                    blog.build(output)
                    self.assertTrue((output / "test-note.html").exists())
                    # A stale committed page or private review in source must not enter output.
                    (source / "stale.html").write_text("Secret", encoding="utf-8")
                    blog.POSTS.write_text(json.dumps([replacement] if replacement else []), encoding="utf-8")
                    blog.build(output)
                    self.assertEqual([p.name for p in output.iterdir()], ["index.html"])
                    self.assertNotIn("Secret", (output / "index.html").read_text(encoding="utf-8"))
            finally:
                blog.POSTS = original

    def test_reserved_slugs_cannot_overwrite_ui(self):
        for slug in ["index", "editor", "post", "draft-review"]:
            with self.assertRaises(ValueError):
                blog.validate(dict(slug=slug, title="Test", date="2026-10-19", body="Text"))


if __name__ == "__main__":
    unittest.main()
