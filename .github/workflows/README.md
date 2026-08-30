# Автоматизация GitHub

## `quality.yml`

Запускается для каждого pull request, push в `main` и вручную. Обязательный gate —
`node .quality/verify-public.mjs`; установка npm-пакетов и передача секретов не
нужны. Для pull request workflow имеет только `contents: read`. После успешной
проверки push в `main` отдельная job автоматически собирает tracked-only артефакт
и разворачивает GitHub Pages. До успешного gate публикация не начинается.

## `release.yml`

- При ручном запуске по умолчанию выполняет **dry run**: проверяет сборку и на 14
  дней прикладывает ZIP в артефакты Actions.
- `publish_release=true` требует тег вида `vX.Y` или `vX.Y.Z` и создаёт GitHub
  Release только после успешной проверки.
- Push корректного тега `v*` автоматически создаёт GitHub Release. При безопасном
  повторном запуске существующий ZIP и target обновляются без дублирования релиза.
- `deploy_pages=true` остаётся ручным резервным способом повторной публикации.
  Перед развёртыванием privacy gate выполняется повторно.
  `actions/upload-pages-artifact@v5` получает каталог только из отслеживаемых
  `git archive` файлов; символические ссылки запрещены.

Для Pages-деплоя в настройках репозитория источник публикации должен быть
**GitHub Actions**. Основной release и dry run от Pages не зависят.

Workflow не читает рабочий `roadmap-data.json`, Jira-токены и локальные папки —
их нет в публичном checkout и они запрещены quality gate.
