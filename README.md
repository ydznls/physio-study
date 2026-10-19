# Physio Study · 生理学学习台

从学校大纲出发，把资料、理解、练习和复习连接起来。当前版本用于个人学习，提供生理学A的期中（第1—5章）与期末（第1—11章）方案。

这是独立实现的轻量原型，不是DeepTutor的分支，也未使用其源码。代码以MIT许可提供，当前没有多人账号或生产环境安全加固。

## 已实现

- 11章课程地图，学习要求与重点/难点分开展示，按考试范围筛选。
- 知识点状态、学习统计、6道呼吸试学题、错题回看、主观题参考要点自查。
- 上传PDF、旧版DOC、DOCX、TXT和Markdown；PDF逐页提取，Word按文本分段。
- 按章节选取教材原文，连接兼容Chat Completions接口的模型服务，生成含来源的讲义。
- 按期中/期末分别保存讲义；编辑、Markdown导出、完整备份与恢复。
- 浏览器IndexedDB保存资料与讲义，localStorage保存学习记录；响应式布局与深色模式。

教材PDF、大纲原文件、用户数据和API Key均不包含在仓库中。课程地图是根据已确认大纲整理的分组导航，不等于完整大纲的逐条自动映射。知识点掌握记录共用，两种考试按范围统计；讲义按考试模式独立保存。

## 本地运行

只想先看界面：双击`preview.html`，用现代浏览器打开，无需安装运行环境。它是静态试用版，支持课程地图、样稿、练习和本地记录；PDF/Word及服务端模型调用需要以下完整本地服务。源文件修改后可运行`python scripts/build_preview.py`重新生成预览。

需要Node.js 20+、Python 3.10+。网页和服务端不需要npm依赖。

```sh
python -m pip install -r requirements.txt
cp .env.example .env
npm start
```

Windows复制配置文件：`Copy-Item .env.example .env`。访问终端打印的本地地址，默认 http://127.0.0.1:4189。也可双击`start-windows.cmd`运行；需要先安装上述运行环境与Python依赖。

在`.env`填写`AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY`，或在网页设置里填写。Base URL填写供应商提供的API根地址，例如`https://你的服务/v1`；程序追加`/chat/completions`。不要把密钥放到GitHub。网页填写的Key只驻留当前页面会话，不进入localStorage、IndexedDB或备份。

如果Python不在PATH中，可在`.env`指定`PYTHON_BIN`。PDF解析使用pypdf；旧版Word解析器支持常见OLE/Word97文本结构，未实现完整格式解析。新上传大纲只作为AI生成参考，不会自动改写课程地图。服务端只绑定回环地址，适用于本人电脑；公开部署完整后端前需要另行实现身份验证、配额、限流及上传管理。

## 使用顺序

1. 打开课程地图，切换期中或期末，检查章节范围。
2. 在“我的资料”上传自己的教材和大纲，设置资料角色。
3. 只有确认是已经核实的第10版PDF（正文p.1在PDF第24页）时，勾选版本标记。
4. 在“设置”配置模型服务，然后到章节“原文依据”检查选取页面。
5. 点击章节会直接打开“学习讲义”：已有讲义直接阅读，没有时自动生成。首次缺少模型连接会提示设置，保存后继续生成所选章节。期中/期末切换会打开或生成各自版本。生成失败不会自动重复请求；可手动重试。核对AI引用、遗漏与术语，修改后保存或导出。
6. 完成自测，回看错题，更新知识点状态。定期导出备份。

AI选页最多约22000字符（额外大纲最多24000字符），优先匹配确认版本的章节页范围，否则按关键词匹配。字符上限可能截断页面；选取部分页面不等于整章完整覆盖。此版本不含语义向量检索或整课考点自动对齐。

## 静态在线预览 / GitHub Pages

公开源码仓库：https://github.com/ydznls/physio-study 。也可以在仓库Settings → Pages选择Deploy from a branch，使用main分支根目录；根目录的index.html是完整的单文件静态试用版，和preview.html一起由预览脚本生成。

`dist/`可直接部署到静态托管。无需构建，文件路径支持GitHub仓库子路径。在GitHub仓库 Settings → Pages 选择 GitHub Actions，再手动运行`Deploy static preview to GitHub Pages`工作流。

静态版支持课程、试学讲义、练习、本地记录、TXT/Markdown导入和备份。PDF/Word解析依赖本地Node+Python服务；静态版无法执行Python。AI可通过浏览器直接连接允许CORS的HTTPS模型接口；跨域被阻止时需要运行本地服务。在线预览不会自动读取开发者电脑上的教材。

## 检查

```sh
npm run check
npm test
```

测试覆盖考试范围、进度筛选、教材偏移、原文截断、生成文本转义、备份结构、服务端请求边界和资料解析接口。浏览器QA记录见`VALIDATION.md`。

## 数据与内容边界

- 内置讲义和题目是学习样例，不是真题。主观题采用自查，未调用AI自动评分。
- “已掌握”是自报状态，不能当作学习效果或考试成绩保证。
- 新生成的医学内容需要核对上传资料，引用标签本身不能证明结论正确。
- PDF图片与扫描页不能靠文字提取完整读取；当前不含OCR。非PDF序号是文本分段而非纸书页码。
- 学校大纲的最新修改、具体机考题型和主观题评分要求仍应由使用者更新。
- MIT许可证适用于本项目代码及原创UI；用户上传教材、大纲等第三方材料仍遵循原有权利要求。

## 项目结构

```text
dist/             网页、课程导航与试学内容
server.mjs        本地HTTP服务、解析与模型调用接口
scripts/extract.py PDF / Word / 文本解析
tests/            Node内置测试
.github/workflows 自动检查与手动Pages部署
```

## 后续方向

精确考点映射与覆盖验证、医学图表/OCR、完整题库、可审阅的主观题评分、分段生成长章节、可打印讲义和多人账号。

## 许可证

MIT。欢迎通过Issue或Pull Request完善课程支持、资料解析与学习体验。

## 发布到自己的GitHub

1. 在自己的GitHub账号下新建Public仓库，例如`physio-study`，不额外勾选初始化README。
2. 将项目上传到仓库。使用Git时，在本项目目录运行以下命令，把地址改成实际仓库地址：

```sh
git remote add origin https://github.com/YOUR_USERNAME/physio-study.git
git push -u origin main
```

ZIP解压后的目录不带Git历史，需要先运行`git init -b main`、`git add .`和`git commit -m "Initial version"`。不要上传`.env`、个人备份或教材。

3. 需要公开静态网址时，按上文GitHub Pages说明启用工作流。完整PDF/Word服务仍运行在本机。
