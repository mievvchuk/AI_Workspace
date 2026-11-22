import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Mail, User as UserIcon } from "lucide-react";
import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useAuthConfig, useMe } from "@/lib/queries";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

const ease = [0.22, 1, 0.36, 1] as const;

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9h-4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

const LOG_STEPS = [
  { title: "Отримано запит", meta: "Nemotron 3.5 Super VL" },
  { title: "Пошук у матеріалах", meta: "3 фрагменти · lecture-3.pdf" },
  { title: "Модель міркує", meta: "1 240 токенів міркувань" },
  { title: "Відповідь збережено", meta: "4,8 с" },
];

function ShowcasePanel() {
  return (
    <div className="relative hidden flex-col overflow-hidden rounded-[20px] bg-sunken lg:flex">
      <div className="p-8">
        <Link to="/" className="inline-flex rounded-md"><Logo size={22} /></Link>
      </div>
      <div className="mt-auto p-8">
        <p className="max-w-[440px] text-[28px] leading-[34px] font-medium tracking-[-0.025em]">Асистент відповідає з ваших лекцій і показує кожен крок.</p>
        <div className="mt-8 rounded-[12px] border border-line bg-surface p-5">
          <div className="flex items-center gap-2 text-sm">
            <Check className="size-4 text-success" strokeWidth={2.5} />
            <span className="font-medium">Опрацьовано</span>
            <span className="tabular ml-auto text-xs text-subtle">Машинне навчання · Learning rate</span>
          </div>
          <ol className="mt-4 space-y-3 border-t border-line pt-4">
            {LOG_STEPS.map((s) => (
              <li key={s.title} className="flex items-start gap-3">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="min-w-0">
                  <span className="block text-sm leading-5">{s.title}</span>
                  <span className="block text-xs text-subtle">{s.meta}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function IconInput({ icon, invalid, right, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; invalid?: boolean; right?: ReactNode }) {
  return (
    <div className="group relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle transition-colors group-focus-within:text-accent [&_svg]:size-4">{icon}</span>
      <input
        aria-invalid={invalid || undefined}
        className="h-12 short:h-10 w-full rounded-[8px] border border-line bg-surface pr-11 pl-10 text-[16px] text-fg transition-[border-color] duration-150 placeholder:text-subtle hover:border-line-hover focus:border-accent aria-[invalid=true]:border-danger"
        {...props}
      />
      {right && <span className="absolute top-1/2 right-2 -translate-y-1/2">{right}</span>}
    </div>
  );
}

function passwordScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-ZА-ЯІЇЄҐ]/.test(p) && /[a-zа-яіїєґ]/.test(p)) s++;
  if (/\d/.test(p) && /[^\w\s]/.test(p)) s++;
  return s;
}
const SCORE_LABEL = ["Закороткий", "Слабкий", "Нормальний", "Добрий", "Надійний"];
const SCORE_COLOR = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

function Strength({ password }: { password: string }) {
  const score = passwordScore(password);
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-hover">
            <motion.span className={cn("block h-full rounded-full", SCORE_COLOR[score])} initial={false} animate={{ scaleX: i < score ? 1 : 0 }} style={{ originX: 0 }} transition={{ duration: 0.3, ease }} />
          </span>
        ))}
      </div>
      <span className="shrink-0 text-right text-xs whitespace-nowrap text-subtle">{password ? SCORE_LABEL[score] : "мін. 8 символів"}</span>
    </div>
  );
}

export function LoginPage() {
  const location = useLocation();
  const mode: "login" | "register" = location.pathname.startsWith("/register") ? "register" : "login";
  const me = useMe();
  const config = useAuthConfig();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const submit = useMutation({
    mutationFn: () => (mode === "login" ? api.post<User>("/auth/login", { email: form.email.trim(), password: form.password }) : api.post<User>("/auth/register", { ...form, email: form.email.trim(), name: form.name.trim() })),
    onSuccess: (user) => {
      queryClient.setQueryData(qk.me, user);
      navigate("/", { replace: true });
    },
  });

  useEffect(() => submit.reset(), [mode]); // eslint-disable-line react-hooks/exhaustive-deps -- clear errors when switching tabs

  if (me.data) return <Navigate to="/" replace />;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const errors = {
    name: mode === "register" && !form.name.trim() ? "Вкажіть ім'я" : null,
    email: !emailOk ? "Перевірте формат email" : null,
    password: mode === "register" && form.password.length < 8 ? "Щонайменше 8 символів" : !form.password ? "Введіть пароль" : null,
  };
  const valid = !errors.name && !errors.email && !errors.password;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (valid && !submit.isPending) submit.mutate();
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  const err = (k: keyof typeof errors) => (touched[k] ? errors[k] : null);

  return (
    <div className="relative min-h-dvh bg-bg">
      <div className="mx-auto grid min-h-dvh max-w-[1200px] gap-6 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <ShowcasePanel />
        <div className="relative flex flex-col">
          <div className="relative flex items-center justify-between p-4 sm:p-6 short:py-2"> 
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:text-fg">
              <ArrowLeft className="size-4" /> На головну
            </Link>
            <Link to="/" className="rounded-md lg:hidden" aria-label="AI Workspace"><LogoMark size={24} /></Link>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-10 short:pb-4 sm:px-8">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="w-full max-w-[400px]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease }}>
                  <h1 className="text-[32px] leading-[38px] font-medium tracking-[-0.03em] short:text-2xl">{mode === "login" ? "З поверненням" : "Створіть свій простір"}</h1>
                  <p className="mt-2 text-[15px] text-muted short:mt-1 short:text-sm">{mode === "login" ? "Увійдіть, щоб продовжити навчання й проєкти." : "Хвилина — і можна додавати перший предмет."}</p>
                </motion.div>
              </AnimatePresence>

              <div role="tablist" aria-label="Режим" className="relative mt-7 grid grid-cols-2 rounded-[10px] border border-line bg-sunken p-1 short:mt-4">
                {(["login", "register"] as const).map((m) => (
                  <Link key={m} to={m === "login" ? "/login" : "/register"} replace role="tab" aria-selected={mode === m} className={cn("relative flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-colors", mode === m ? "text-fg" : "text-muted hover:text-fg")}>
                    {mode === m && <motion.span layoutId="auth-tab" transition={{ duration: 0.28, ease }} className="absolute inset-0 rounded-[7px] bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.08)]" />}
                    <span className="relative">{m === "login" ? "Вхід" : "Реєстрація"}</span>
                  </Link>
                ))}
              </div>

              {params.get("error") === "google" && (
                <p role="alert" className="mt-4 flex items-center gap-2 rounded-[8px] border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm"><AlertCircle className="size-4 text-danger" />Не вдалося увійти через Google. Спробуйте ще раз.</p>
              )}

              {config.data?.google_enabled && (
                <>
                  <button
                    type="button"
                    disabled={googleBusy}
                    onClick={() => { setGoogleBusy(true); window.location.href = "/api/auth/google/start"; }}
                    className="mt-5 flex h-12 short:h-10 short:mt-3 w-full items-center justify-center gap-2.5 rounded-[8px] border border-line bg-surface text-[15px] font-medium transition-[border-color,background-color] hover:border-line-hover hover:bg-hover disabled:opacity-60"
                  >
                    <GoogleIcon /> Продовжити з Google
                  </button>
                  <div className="my-5 short:my-3 flex items-center gap-3 text-xs text-subtle"><span className="h-px flex-1 bg-line" />або з email<span className="h-px flex-1 bg-line" /></div>
                </>
              )}

              <form onSubmit={onSubmit} noValidate className={cn("space-y-4 short:space-y-2.5", !config.data?.google_enabled && "mt-6 short:mt-4")}>
                <AnimatePresence initial={false}>
                  {mode === "register" && (
                    <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
                      <label htmlFor="name" className="mb-1.5 block text-sm font-medium">Ім'я</label>
                      <IconInput id="name" icon={<UserIcon />} autoComplete="name" placeholder="Як до вас звертатися" value={form.name} maxLength={120} onChange={set("name")} onBlur={blur("name")} invalid={!!err("name")} />
                      {err("name") && <p className="mt-1.5 text-xs text-danger">{err("name")}</p>}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
                  <IconInput id="email" type="email" icon={<Mail />} autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} onBlur={blur("email")} invalid={!!err("email")}
                    right={emailOk ? <Check className="mr-1.5 size-4 text-success" /> : null} />
                  {err("email") && <p className="mt-1.5 text-xs text-danger">{err("email")}</p>}
                </div>
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium">Пароль</label>
                  <IconInput
                    id="password"
                    type={showPassword ? "text" : "password"}
                    icon={<Lock />}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={mode === "login" ? "Ваш пароль" : "Придумайте пароль"}
                    value={form.password}
                    onChange={set("password")}
                    onBlur={blur("password")}
                    onKeyDown={onKey}
                    onKeyUp={onKey}
                    invalid={!!err("password")}
                    right={
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Сховати пароль" : "Показати пароль"} className="flex size-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-hover hover:text-fg">
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                  />
                  {capsLock && <p className="mt-1.5 text-xs text-warning">Увімкнено Caps Lock</p>}
                  {mode === "register" ? <Strength password={form.password} /> : err("password") && <p className="mt-1.5 text-xs text-danger">{err("password")}</p>}
                </div>

                <AnimatePresence>
                  {submit.isError && (
                    <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-[8px] border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm">
                      <AlertCircle className="size-4 shrink-0 text-danger" />
                      {errorMessage(submit.error)}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button type="submit" variant="primary" size="lg" className="group h-12 w-full rounded-[8px] text-[15px] short:h-10" loading={submit.isPending}>
                  {mode === "login" ? "Увійти" : "Створити акаунт"}
                  {!submit.isPending && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted short:mt-3">
                {mode === "login" ? "Ще немає акаунта? " : "Вже маєте акаунт? "}
                <Link to={mode === "login" ? "/register" : "/login"} replace className="font-medium text-accent hover:underline">
                  {mode === "login" ? "Зареєструватися" : "Увійти"}
                </Link>
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
