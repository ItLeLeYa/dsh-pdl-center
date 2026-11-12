# PDL Center Python 适配层
调用：`<python> pdl_center_adapter.py <command>`，stdin 传一个 JSON 请求，stdout 只返回单个 JSON 信封（`{"ok":true,"data":…}` / `{"ok":false,"error":{…}}`），日志一律走 stderr。
命令：`probe` / `batch.list` / `stage.plan` / `stage.run` / `artifact.list` / `artifact.preview` / `review.detect` / `reference.info` / `rules.resolve` / `demo.info`。
环境：Python 3.9+，`PYTHONPATH=<projectRoot>/src`，`PYTHONIOENCODING=utf-8`，cwd=`<projectRoot>`；适配层也会自动把 `<projectRoot>/src` 插到 `sys.path[0]`。
示例：`'{"projectRoot":"/path/to/project"}' | python pdl_center_adapter.py probe`
