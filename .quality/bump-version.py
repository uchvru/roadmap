#!/usr/bin/env python3
"""
Скрипт автоматического синхронного обновления версии во всех файлах Roadmap.
Поддерживает:
  - app.html (и внешний roadmap.html)
  - index.html
  - catalog.html
  - README.md
  - RELEASE_NOTES.md
  - media/media-manifest.json
  - catalog-img/media-manifest.json
"""

import sys
import os
import re
import json
from datetime import datetime

REPO_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__))) if '.quality' in os.path.dirname(__file__) else '/Users/uchv/Desktop/Проект Roadmap/roadmap'
ROOT_PROJECT_DIR = '/Users/uchv/Desktop/Проект Roadmap'

def get_current_version(app_path):
    with open(app_path, 'r', encoding='utf-8') as f:
        content = f.read()
    m_ver = re.search(r"const APP_VERSION = '([^']+)';", content)
    m_date = re.search(r"const APP_VERSION_DATE = '(\d{2}\.\d{2}\.\d{4})';", content)
    if not m_ver or not m_date:
        raise ValueError(f"Не удалось найти APP_VERSION или APP_VERSION_DATE в {app_path}")
    return m_ver.group(1), m_date.group(1)

def bump_version(new_version, new_date_str=None):
    new_version = new_version.lstrip('v').strip()
    if not re.match(r'^\d+\.\d+\.\d+$', new_version):
        print(f"Ошибка: Некорректный формат версии: '{new_version}'. Требуется semver (например, 16.5.0)")
        sys.exit(1)

    if not new_date_str:
        now = datetime.now()
        new_date_str = now.strftime('%d.%m.%Y')
        iso_date = now.strftime('%Y-%m-%d')
    else:
        parts = new_date_str.split('.')
        iso_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

    app_file = os.path.join(REPO_DIR, 'app.html')
    old_version, old_date = get_current_version(app_file)
    old_iso_date = f"{old_date.split('.')[2]}-{old_date.split('.')[1]}-{old_date.split('.')[0]}"

    print(f"==========================================")
    print(f"Обновление версии Roadmap:")
    print(f"  Старая версия : {old_version} ({old_date} / {old_iso_date})")
    print(f"  Новая версия  : {new_version} ({new_date_str} / {iso_date})")
    print(f"==========================================")

    # 1. Обновление app.html и внешнего roadmap.html
    html_targets = [os.path.join(REPO_DIR, 'app.html')]
    outer_roadmap = os.path.join(ROOT_PROJECT_DIR, 'roadmap.html')
    if os.path.exists(outer_roadmap):
        html_targets.append(outer_roadmap)

    for target in html_targets:
        with open(target, 'r', encoding='utf-8') as f:
            c = f.read()
        c = re.sub(r"const APP_VERSION = '[^']+';", f"const APP_VERSION = '{new_version}';", c)
        c = re.sub(r"const APP_VERSION_DATE = '\d{2}\.\d{2}\.\d{4}';", f"const APP_VERSION_DATE = '{new_date_str}';", c)
        c = re.sub(r"data-roadmap-modules=\"v[^\"]+\"", f'data-roadmap-modules="v{new_version}"', c)
        c = re.sub(r"id=\"appVersionBadge\">v[^\s<]+ · \d{2}\.\d{2}\.\d{4}</span>", f'id="appVersionBadge">v{new_version} · {new_date_str}</span>', c)
        c = re.sub(r"id=\"appVersionStartup\">версия [^<]+</span>", f'id="appVersionStartup">версия {new_version}</span>', c)
        # Чип в шапке (если есть)
        c = re.sub(r"v" + re.escape(old_version), f"v{new_version}", c)
        with open(target, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f"✔ Обновлен: {os.path.basename(target)}")

    # 2. Обновление index.html
    index_file = os.path.join(REPO_DIR, 'index.html')
    if os.path.exists(index_file):
        with open(index_file, 'r', encoding='utf-8') as f:
            c = f.read()
        c = c.replace(f"v{old_version}", f"v{new_version}")
        c = c.replace(old_date, new_date_str)
        with open(index_file, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f"✔ Обновлен: index.html")

    # 3. Обновление catalog.html
    catalog_file = os.path.join(REPO_DIR, 'catalog.html')
    if os.path.exists(catalog_file):
        with open(catalog_file, 'r', encoding='utf-8') as f:
            c = f.read()
        c = c.replace(f"v{old_version}", f"v{new_version}")
        c = c.replace(old_date, new_date_str)
        with open(catalog_file, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f"✔ Обновлен: catalog.html")

    # 4. Обновление README.md
    readme_file = os.path.join(REPO_DIR, 'README.md')
    if os.path.exists(readme_file):
        with open(readme_file, 'r', encoding='utf-8') as f:
            c = f.read()
        c = c.replace(f"v{old_version}", f"v{new_version}")
        c = c.replace(old_date, new_date_str)
        with open(readme_file, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f"✔ Обновлен: README.md")

    # 5. Обновление RELEASE_NOTES.md
    notes_file = os.path.join(REPO_DIR, 'RELEASE_NOTES.md')
    if os.path.exists(notes_file):
        with open(notes_file, 'r', encoding='utf-8') as f:
            c = f.read()
        c = c.replace(f"v{old_version}", f"v{new_version}")
        c = c.replace(old_date, new_date_str)
        with open(notes_file, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f"✔ Обновлен: RELEASE_NOTES.md")

    # 6. Обновление media/media-manifest.json и catalog-img/media-manifest.json
    manifests = [
        os.path.join(REPO_DIR, 'media', 'media-manifest.json'),
        os.path.join(REPO_DIR, 'catalog-img', 'media-manifest.json')
    ]
    for mf in manifests:
        if os.path.exists(mf):
            with open(mf, 'r', encoding='utf-8') as f:
                data = json.load(f)
            data['version'] = new_version
            data['generatedAt'] = iso_date
            with open(mf, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write('\n')
            print(f"✔ Обновлен манифест: {os.path.relpath(mf, REPO_DIR)}")

    print(f"\nВсе файлы успешно синхронизированы на v{new_version} ({new_date_str})!")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Использование: python3 bump_version.py <новая_версия> [дата_ДД.ММ.ГГГГ]")
        print("Пример:        python3 bump_version.py 16.5.0")
        print("Пример:        python3 bump_version.py 16.5.0 20.09.2026")
        sys.exit(1)
    v = sys.argv[1]
    d = sys.argv[2] if len(sys.argv) > 2 else None
    bump_version(v, d)
