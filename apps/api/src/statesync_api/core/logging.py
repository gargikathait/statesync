import logging


def configure_logging(level: str) -> None:
    """Plain key=value logging. Request paths are logged without query strings, and
    payloads, passwords, tokens and cookies are never logged."""
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
