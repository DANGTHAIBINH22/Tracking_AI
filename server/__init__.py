"""FastAPI service that wraps the CV pipeline into a digital-signage backend.

The pipeline stays exactly as it is — this package only calls the one seam,
`Pipeline.process(frame) -> list[PersonMeta]`, and turns the stream of per-person
metadata into per-advert audience numbers.
"""
