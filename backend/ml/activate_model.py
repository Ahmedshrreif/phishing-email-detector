from __future__ import annotations

import argparse

from ml.registry import model_path_for_version, set_active_model


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    path = model_path_for_version(args.version)
    if not path.exists():
        raise FileNotFoundError(f"No model found for version {args.version}")
    set_active_model(args.version)
    print(f"Activated model version {args.version}")


if __name__ == "__main__":
    main()
