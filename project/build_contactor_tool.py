"""
Build the TEG Contactor Sizer page: inline gas_props_grid.js, contactor_engine.js and the digitized GPSA
Figs 20-55..59 curves into contactor_tool_template.html -> TEG Contactor Sizer.html.

Run:  python build_contactor_tool.py
"""
import os

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "contactor_tool_template.html")
ENGINE = os.path.join(HERE, "contactor_engine.js")
GPSA = os.path.join(HERE, "gpsa_fig20-55_59_digitized.json")
GRID = os.path.join(HERE, "gas_props_grid.js")             # from gas_property_grid.py
THUMBS = os.path.join(HERE, "source_thumbs.js")            # from build_source_thumbs.py
DSHEET = os.path.join(HERE, "datasheet_template.js")       # from build_datasheet_template.py
PDFLIB = os.path.join(HERE, "lib", "pdf-lib.min.js")        # pdf-lib 1.17.1, vendored (same copy as the pump tool)
ECON_TAG = '<script src="../../../FEL Projects/Economics/scripts/column_cost_engine.js"></script>'
ECON = os.path.join(HERE, "..", "..", "..", "FEL Projects", "Economics", "scripts", "column_cost_engine.js")
OUT = os.path.join(os.path.dirname(HERE), "TEG Contactor Sizer.html")   # project root


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


if __name__ == "__main__":
    page = read(TEMPLATE)
    for marker, content in (('<script src="gas_props_grid.js"></script>', "<script>\n" + read(GRID) + "</script>"),
                            ('<script src="source_thumbs.js"></script>', "<script>\n" + read(THUMBS) + "</script>"),
                            ('<script src="datasheet_template.js"></script>', "<script>\n" + read(DSHEET) + "</script>"),
                            ('<script src="lib/pdf-lib.min.js"></script>', "<script>\n" + read(PDFLIB) + "\n</script>"),
                            (ECON_TAG, "<script>\n" + read(ECON) + "\n</script>"),
                            ('<script src="contactor_engine.js"></script>', "<script>\n" + read(ENGINE) + "\n</script>"),
                            ("/*__GPSA__*/[]", read(GPSA).strip())):
        if marker not in page:
            raise SystemExit(f"marker {marker} missing from template")
        page = page.replace(marker, content)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"wrote {OUT} ({len(page) / 1024:.0f} KB)")
