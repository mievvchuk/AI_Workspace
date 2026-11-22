# AI Workspace

Персональний робочий простір для навчання й розробки: предмети, матеріали, лабораторні, діагностика знань, проєкти та AI-сесії з прозорим журналом роботи AI.

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS 4 (власні дизайн-токени), TanStack Query, Zustand, Motion, Radix, cmdk.
- **Backend:** FastAPI, SQLAlchemy 2 (async, SQLite), SSE, NVIDIA NIM (OpenAI-сумісний API), Google OAuth 2.0 + PKCE.

## Запуск

```powershell
# backend
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env   # вкажіть NVIDIA_API_KEY (і за бажанням Google OAuth)
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

```powershell
# frontend (в іншому терміналі)
cd frontend
npm install
npm run dev   # http://localhost:5173, /api проксіюється на :8000
```

Без `NVIDIA_API_KEY` інтерфейс чесно показує, що AI-провайдер не налаштовано. Для локальної демонстрації можна запустити backend з `AI_PROVIDER=mock`: тоді в інтерфейсі буде позначка «Тестовий режим».

### Вхід через Google

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
2. Authorized redirect URI: `http://localhost:5173/api/auth/google/callback` (у продакшені — `${PUBLIC_API_URL}/api/auth/google/callback`).
3. Заповніть `GOOGLE_CLIENT_ID` і `GOOGLE_CLIENT_SECRET` у `backend/.env`. Кнопка «Продовжити з Google» з'явиться автоматично.

Акаунт Google прив'язується до наявного користувача з тим самим підтвердженим email.

Для продакшену в тому ж OAuth-клієнті додайте:

- **Authorized JavaScript origins:** `https://<ваш-сервіс>.onrender.com`
- **Authorized redirect URIs:** `https://<ваш-сервіс>.onrender.com/api/auth/google/callback`

Потім на екрані **OAuth consent screen** опублікуйте застосунок (Publishing status: In production) або додайте свої акаунти в Test users, інакше Google пускатиме лише тестових користувачів. Скоупи `openid`, `email`, `profile` не потребують перевірки Google.

## Деплой (Render)

Один Docker-сервіс: FastAPI віддає API і зібраний фронтенд з одного домену, тому cookies, CSRF і вхід через Google працюють без CORS між доменами. SQLite і завантажені файли лежать на постійному диску `/var/data`.

1. Запуште репозиторій на GitHub (гілка `main`).
2. Render → **New → Blueprint** → оберіть репозиторій. Render прочитає `render.yaml` і попросить значення `NVIDIA_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google можна лишити порожнім і додати пізніше).
3. Після першого деплою адреса сервісу (`https://<ім'я>.onrender.com`) автоматично стає origin застосунку й основою redirect URI для Google (`RENDER_EXTERNAL_URL`). Явні `PUBLIC_API_URL` і `FRONTEND_ORIGIN` мають пріоритет, якщо підключите свій домен.

Сервіс має працювати в одному екземплярі: SQLite і rate limit живуть у ньому самому.

## Гілки (git flow)

- `main` — те, що задеплоєно; кожен реліз має тег `vX.Y.Z`.
- `develop` — інтеграційна гілка.
- `feature/<назва>` — одна фіча, один коміт; вливається в `develop` через `--no-ff`.
- `release/<версія>` — підготовка релізу, вливається в `main` (з тегом) і назад у `develop`.

## Перевірки

```powershell
cd backend; .venv\Scripts\python -m pytest -q
```

```powershell
cd frontend; npm run typecheck; npm run lint; npm test; npm run build
```

## Архітектура

### AI Processing Panel (потік подій)

Кожен AI-запит — це `AIRequest` з послідовністю `AIEvent` (`request_id`, `event_id`, `seq`, `event_type`, `stage`, `status`, `title`, `description`, `timestamp`, `duration_ms`, `metadata`).

- `services/ai/events.py`: `EventRecorder` записує **фактичні** кроки (підготовка контексту, пошук у матеріалах, опрацювання вкладень, запит до моделі, стрімінг, валідація JSON, збереження) і перетворює їх на SSE-кадри. Метадані безпечні: лише назви, лічильники та джерела, без промптів і ключів. Журнал має обмежений розмір, а старі записи видаляються через `AI_EVENT_RETENTION_DAYS`.
- Транспорт: `POST` з `text/event-stream` (`event: ai | delta | start | message | result`). Кожен кадр має `request_id` і строго зростаючий `seq`. `FrameGuard` (frontend) відкидає дублікати, запізнілі та чужі кадри.
- `lib/sse.ts → applyEvent` згортає події одного етапу в один рядок журналу. Журнал можна відкрити після перезавантаження сторінки (`GET /api/requests/{id}`).
- Якщо сервер мовчить понад 6 с, панель показує «Очікування відповіді сервера…», не вигадуючи етапів.
- Сирі міркування моделі (`reasoning_content`) не відображаються. Фіксується лише сам факт етапу міркування.
- Скасування: `POST /api/requests/{id}/cancel`, після чого частина відповіді, що вже надійшла, зберігається. Розрив з'єднання теж коректно завершує запит.

### Автопідбір емодзі (`services/emoji.py`)

Нормалізація назви → фрази й основи слів (укр./англ.) у 40+ навчальних категоріях → найкраща категорія. Опис має меншу вагу. Під час введення підбір лише локальний (debounce). AI викликається тільки під час збереження, якщо локально не знайдено відповідності: обмежений список дозволених емодзі, тайм-аут 8 с. Інакше ставиться нейтральне 📘. Емодзі можна змінити вручну, а під час перейменування система пропонує оновити його.

### Моделі та effort

Реєстр звірено з каталогом NVIDIA 21.11.2026 за допомогою робочого ключа. Старі моделі (Llama 3.3, gpt-oss тощо) вже зняті з підтримки (HTTP 410). Зареєстровано лише моделі, які реально відповіли: Nemotron 3.5 Super VL (за замовчуванням), Nemotron 3 Ultra, Mistral Large 4, Nemotron 3.5 Lightning, Nemotron 3 Nano Omni. Kimi K3.1, Gemma 4 і GLM 5.3 не відповіли за 90 с, тому їх не додано. Усі зареєстровані моделі міркують перед відповіддю: панель показує етап «Модель міркує» з обсягом міркувань, але не з їхнім вмістом. `reasoning_effort` вони приймають, проте вимірного ефекту немає, тому в UI для них доступний лише рівень Medium.

`services/ai/registry.py` описує, що підтримує кожна модель. Рівні Low/Medium/High/Ultra відображаються на реальні параметри (`reasoning_effort` для gpt-oss; Ultra = high + більший `max_tokens`). Непідтримувані рівні недоступні в UI, а backend їх ніколи не надсилає. Непідтверджені метадані позначені в селекторі.

### Безпека

Сесії в httpOnly-cookie (у БД зберігається лише хеш токена), CSRF через double-submit з перевіркою на сервері, rate limit для входу й AI-запитів, валідація файлів (тип/розмір), безпечний Markdown (без raw HTML), ізоляція ключа NVIDIA на сервері, контроль доступу до кожного об'єкта, межа prompt injection (матеріали передаються як дані в тегах `<material>`).
