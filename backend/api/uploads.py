"""Safe parsing of uploaded light-curve CSV files.

Uploaded bytes are only ever parsed as delimited text into numbers. Nothing in
the file is evaluated or executed.
"""
from __future__ import annotations

import io

import numpy as np
import pandas as pd

from .errors import ApiError

ALLOWED_EXTENSIONS = (".csv", ".txt", ".tsv", ".dat")
ALLOWED_CONTENT_TYPES = {"text/csv", "text/plain", "text/tab-separated-values", "application/csv",
                         "application/vnd.ms-excel", "application/octet-stream", ""}
TIME_NAMES = ("time", "t", "bjd", "bkjd", "btjd", "jd", "hjd", "mjd", "date", "days", "day", "timestamp")
FLUX_NAMES = ("flux", "pdcsap_flux", "sap_flux", "f", "brightness", "intensity", "counts", "lc_detrend",
              "normalized_flux", "norm_flux", "relative_flux")
FORMAT_HELP = ("Upload a CSV (comma, tab or semicolon separated) with a header row and at least one numeric "
               "flux column. A time column in days is recommended. Lines starting with # are ignored.")


def validate_upload_meta(filename: str | None, content_type: str | None, size: int, max_bytes: int) -> None:
    name = (filename or "").lower()
    if not name.endswith(ALLOWED_EXTENSIONS):
        raise ApiError(415, "unsupported_file_type",
                       f"'{filename}' is not a supported file. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS)}.",
                       {"help": FORMAT_HELP})
    base_type = (content_type or "").split(";")[0].strip().lower()
    if base_type not in ALLOWED_CONTENT_TYPES:
        raise ApiError(415, "unsupported_content_type",
                       f"Content type '{base_type}' is not accepted for light-curve uploads.", {"help": FORMAT_HELP})
    if size == 0:
        raise ApiError(400, "empty_file", "The uploaded file is empty.", {"help": FORMAT_HELP})
    if size > max_bytes:
        raise ApiError(413, "file_too_large",
                       f"The file is {size / 1e6:.1f} MB; the limit is {max_bytes / 1e6:.0f} MB.")


def parse_csv(content: bytes, max_rows: int) -> pd.DataFrame:
    if b"\x00" in content[:4096]:
        raise ApiError(400, "not_text", "The file looks binary, not a text CSV.", {"help": FORMAT_HELP})
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise ApiError(400, "not_text", "The file is not valid text.", {"help": FORMAT_HELP})
    try:
        df = pd.read_csv(io.StringIO(text), sep=None, engine="python", comment="#", nrows=max_rows + 1,
                         skip_blank_lines=True, on_bad_lines="error")
    except Exception as exc:
        raise ApiError(400, "csv_parse_error", f"Could not parse the file as CSV: {exc}", {"help": FORMAT_HELP})
    if len(df) > max_rows:
        raise ApiError(413, "too_many_rows", f"The file has more than {max_rows:,} rows.")
    if df.shape[1] == 0 or len(df) == 0:
        raise ApiError(400, "empty_table", "The file has no data rows.", {"help": FORMAT_HELP})
    df.columns = [str(c).strip() for c in df.columns]
    return df


def numeric_columns(df: pd.DataFrame) -> dict[str, dict]:
    """Per column: how many values parse as numbers and how many are missing."""
    info = {}
    for col in df.columns:
        numeric = pd.to_numeric(df[col], errors="coerce")
        n_numeric = int(np.isfinite(numeric).sum())
        info[col] = {"n_numeric": n_numeric, "n_missing": int(len(df) - n_numeric),
                     "is_numeric": n_numeric >= 0.5 * len(df)}
    return info


def guess_columns(df: pd.DataFrame, info: dict[str, dict]) -> dict[str, str | None]:
    lower = {c.lower(): c for c in df.columns if info[c]["is_numeric"]}
    time_col = next((lower[n] for n in TIME_NAMES if n in lower), None)
    flux_col = next((lower[n] for n in FLUX_NAMES if n in lower), None)
    if flux_col is None:
        flux_col = next((c for lc, c in lower.items() if "flux" in lc and c != time_col), None)
    numeric = [c for c in df.columns if info[c]["is_numeric"]]
    if flux_col is None and time_col is None and len(numeric) == 1:
        flux_col = numeric[0]
    elif flux_col is None and time_col is None and len(numeric) == 2:
        time_col, flux_col = numeric
    return {"time": time_col, "flux": flux_col}


def inspect(df: pd.DataFrame) -> dict:
    info = numeric_columns(df)
    return {
        "n_rows": int(len(df)),
        "columns": [{"name": c, **info[c]} for c in df.columns],
        "suggested_mapping": guess_columns(df, info),
        "preview": df.head(5).astype(object).where(df.head(5).notna(), None).astype(str).values.tolist(),
        "help": FORMAT_HELP,
    }


def extract_series(df: pd.DataFrame, time_column: str | None, flux_column: str | None
                   ) -> tuple[np.ndarray | None, np.ndarray, dict]:
    """Resolve the column mapping and return (time or None, flux, mapping report)."""
    info = numeric_columns(df)
    guess = guess_columns(df, info)
    flux_column = flux_column or guess["flux"]
    time_column = time_column if time_column is not None else guess["time"]
    available = list(df.columns)
    if not flux_column:
        raise ApiError(422, "flux_column_required",
                       "Could not tell which column holds the flux. Choose the flux column.",
                       {"columns": available, "help": FORMAT_HELP})
    for role, col in (("flux", flux_column), ("time", time_column)):
        if col and col not in df.columns:
            raise ApiError(422, "unknown_column", f"The {role} column '{col}' is not in the file.",
                           {"columns": available})
        if col and not info[col]["is_numeric"]:
            raise ApiError(422, "column_not_numeric", f"The {role} column '{col}' is not numeric.",
                           {"columns": available})
    if time_column and time_column == flux_column:
        raise ApiError(422, "same_column", "Time and flux must be different columns.", {"columns": available})
    flux = pd.to_numeric(df[flux_column], errors="coerce").to_numpy(dtype=np.float64)
    time = pd.to_numeric(df[time_column], errors="coerce").to_numpy(dtype=np.float64) if time_column else None
    missing = ~np.isfinite(flux) if time is None else ~(np.isfinite(flux) & np.isfinite(time))
    report = {"time_column": time_column, "flux_column": flux_column, "n_rows": int(len(df)),
              "n_rows_with_missing_values": int(missing.sum()),
              "missing_value_handling": "rows with a missing or non-numeric time/flux value are dropped",
              "time_axis": "from file" if time_column else "assumed Kepler long cadence (29.4 min) from row order"}
    return time, flux, report
