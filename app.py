from __future__ import annotations

import argparse
import sys

from label_date_generator.auto import generate_today
from label_date_generator.ui import run_app


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--auto-today", action="store_true")
    args, _unknown = parser.parse_known_args()

    if args.auto_today:
        try:
            generate_today()
            return 0
        except Exception as exc:
            # 自动任务没有界面，错误写入 stderr；Windows 任务计划程序会保留退出码。
            print(str(exc), file=sys.stderr)
            return 1

    run_app()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
