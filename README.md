# AI 트렌드 위클리

AI 실무 커뮤니티 대화를 주마다 정리한 대시보드입니다. 노션 데이터베이스를 읽어 정적 페이지로 구워 GitHub Pages에 올립니다.

- 화면: `site/` (HTML·CSS·JS, 외부 라이브러리 없음)
- 데이터 굽기: `scripts/build.mjs` → `site/data.json`
- 자동 배포: `.github/workflows/deploy.yml` (매일 오전 9시, 또는 Actions 탭에서 수동 실행)

공개 데이터에는 닉네임이 들어가지 않습니다. 빌드할 때 이름을 걸러내고, 남은 이름이 하나라도 있으면 배포를 멈춥니다.

## 로컬에서 미리 보기

```powershell
$env:NOTION_TOKEN = "노션 토큰"; node scripts/build.mjs
npx serve site
```
