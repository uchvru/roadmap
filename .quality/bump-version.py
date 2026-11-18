#!/usr/bin/env python3
"""Совместимый вход в штатный инструмент нумерации Roadmap."""

import argparse
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('version', help='следующая версия X.Y, например v18.0')
    parser.add_argument('date', nargs='?', help='дата ДД.ММ.ГГГГ или ГГГГ-ММ-ДД')
    parser.add_argument('--check', action='store_true', help='показать изменения без записи')
    args = parser.parse_args()

    public = Path(__file__).resolve().parent.parent
    tool = public.parent / '_Служебное' / 'tools' / 'bump-version.mjs'
    if public.name != 'roadmap' or not tool.is_file():
        parser.exit(2, 'Нужен полный проект Roadmap. Отдельная копия сайта не изменена.\n')

    command = ['node', str(tool), '--version=' + args.version]
    if args.date is not None:
        command.append('--date=' + args.date)
    if args.check:
        command.append('--check')
    try:
        return subprocess.run(command, cwd=tool.parent.parent, check=False).returncode
    except FileNotFoundError:
        parser.exit(2, 'Не найден Node.js. Файлы не изменены.\n')


if __name__ == '__main__':
    sys.exit(main())
