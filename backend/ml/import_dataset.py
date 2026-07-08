from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

REQUIRED_COLUMNS = {"id", "subject", "body", "sender", "reply_to", "headers", "urls", "label", "source", "created_at", "verified"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and normalize a larger verified phishing dataset.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default=str(Path(__file__).parent / "data" / "imported_verified.csv"))
    args = parser.parse_args()
    df = pd.read_csv(args.input)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")
    df = df[df["label"].isin(["safe", "phishing"])].drop_duplicates(["subject", "body", "sender"])
    df.to_csv(args.output, index=False)
    print(f"Wrote {len(df)} verified records to {args.output}")


if __name__ == "__main__":
    main()
