#!/usr/bin/env python3
"""
Thin wrapper around pdf-craft-main for PDF → EPUB conversion.
Called by the BullMQ worker via child_process.spawn.

Usage: python3 convert_pdf.py '{"pdf_path": "...", "epub_path": "...", "title": "...", "author": ""}'
"""

import sys
import json
import os

# Add pdf-craft-main to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pdf-craft-main"))

from pdf_craft import transform_epub, BookMeta


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No arguments provided"}))
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
        pdf_path = args["pdf_path"]
        epub_path = args["epub_path"]
        title = args.get("title", "Untitled")
        author = args.get("author", "")

        authors = [author] if author else []

        transform_epub(
            pdf_path=pdf_path,
            epub_path=epub_path,
            book_meta=BookMeta(
                title=title,
                authors=authors,
            ),
            ocr_size="small",  # Balance speed vs quality
            includes_cover=True,
            includes_footnotes=True,
            ignore_pdf_errors=True,
            ignore_ocr_errors=True,
        )

        print(json.dumps({"success": True}))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
