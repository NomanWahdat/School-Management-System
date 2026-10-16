import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { APIClient, APIError, readSession } from "./api";
import type { Session } from "./api";
import { Brand, Field, Icon, Loading } from "./components";
import { localeOptions, useI18n, useWords } from "./i18n";
import { Workspace } from "./Workspace";
import { Platform } from "./Platform";

export function LanguageChoice() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language-choice">
      <span>{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
      >
        {localeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function Login({ api }: { api: APIClient }) {
  const w = useWords();
  const [brand, setBrand] = useState<{
    school_name: string;
    logo: string | null;
  }>({ school_name: w("School Workspace"), logo: null });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [help, setHelp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = new URLSearchParams(location.search).get("school") || "";
  useEffect(() => {
    let live = true;
    api
      .request<{ school_name: string; logo: string | null }>(
        `school-branding/${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`,
      )
      .then((data) => {
        if (live) setBrand(data);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, slug]);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api.request<Session>("login/", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          ...(slug ? { school_slug: slug } : {}),
        }),
      });
      api.replaceSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-top">
        <Brand name={brand.school_name} logo={brand.logo} />
        <LanguageChoice />
      </div>
      <main className="auth-grid">
        <section className="auth-story">
          <span className="eyebrow">{w("School workspace")}</span>
          <h1>{w("A better school day starts here.")}</h1>
          <p>
            {w(
              "Students, teachers, and daily school work. Together in one simple place.",
            )}
          </p>
          <div className="campus-art" aria-hidden="true">
            <svg viewBox="0 0 500 285">
              <circle cx="405" cy="54" r="28" fill="#f4c576" />
              <path d="M15 260h470" stroke="#a6bcad" strokeWidth="2" />
              <rect
                x="130"
                y="110"
                width="240"
                height="150"
                rx="3"
                fill="#ece7dc"
              />
              <path d="m107 113 143-83 143 83" fill="#344c68" />
              <rect
                x="45"
                y="160"
                width="90"
                height="100"
                rx="3"
                fill="#d8e0d6"
              />
              <rect
                x="365"
                y="160"
                width="90"
                height="100"
                rx="3"
                fill="#d8e0d6"
              />
              <path d="m33 164 57-34 57 34m208 0 57-34 57 34" fill="#536b76" />
              <rect
                x="223"
                y="199"
                width="54"
                height="61"
                rx="25"
                fill="#344c68"
              />
              {[160, 220, 280, 340].slice(0, 3).map((x) => (
                <g key={x}>
                  <rect
                    x={x}
                    y="125"
                    width="27"
                    height="35"
                    rx="3"
                    fill="#8ea7ad"
                  />
                  <rect
                    x={x}
                    y="176"
                    width="27"
                    height="35"
                    rx="3"
                    fill="#8ea7ad"
                  />
                </g>
              ))}
              <circle cx="250" cy="82" r="17" fill="#fffaf0" />
              <path d="M250 72v12l7 4" stroke="#344c68" strokeWidth="2" />
              <path
                d="M25 260v-65m448 65v-65"
                stroke="#61755f"
                strokeWidth="7"
              />
              <circle cx="25" cy="187" r="24" fill="#a9bfa3" />
              <circle cx="448" cy="186" r="23" fill="#a9bfa3" />
            </svg>
          </div>
          <div className="auth-benefits">
            <span>
              <Icon name="check" />
              {w("Clear daily tasks")}
            </span>
            <span>
              <Icon name="people" />
              {w("Your school, your workspace")}
            </span>
          </div>
        </section>
        <section className="auth-form-section">
          <form className="auth-card" onSubmit={signIn}>
            <span className="eyebrow">{w("Welcome back")}</span>
            <h2>{w("Sign in")}</h2>
            <p>{w("Use the account provided by your school.")}</p>
            <Field label={w("Username")} required>
              {(id) => (
                <input
                  id={id}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              )}
            </Field>
            <Field label={w("Password")} required>
              {(id) => (
                <div className="password-control">
                  <input
                    id={id}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {w(showPassword ? "Hide password" : "Show password")}
                  </button>
                </div>
              )}
            </Field>
            {error && (
              <div className="error-message" role="alert">
                {w(error)}
              </div>
            )}
            <button className="button primary full-width" disabled={busy}>
              {busy ? w("Loading school records…") : w("Sign in")}
              <Icon name="arrow" />
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setHelp(!help)}
            >
              {w("Need help signing in?")}
            </button>
            {help && (
              <div className="notice">
                {w("Contact your school administrator for a password reset.")}
              </div>
            )}
          </form>
          <p className="auth-footer">{w("English · دری · پښتو")}</p>
        </section>
      </main>
    </div>
  );
}

export function PasswordChange({
  api,
  required = false,
  onDone,
}: {
  api: APIClient;
  required?: boolean;
  onDone?: () => void;
}) {
  const w = useWords();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const session = await api.request<Session>("change-password/", {
        method: "POST",
        body: JSON.stringify({
          current_password: current,
          new_password: password,
        }),
      });
      api.replaceSession(session);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="focused-form password-form" onSubmit={submit}>
      <h2>{w("Change password")}</h2>
      {required && (
        <p>
          {w("Choose your own password before opening your school workspace.")}
        </p>
      )}
      {[
        ["Current password", current, setCurrent],
        ["New password", password, setPassword],
        ["Confirm password", confirm, setConfirm],
      ].map(([label, value, setter], index) => (
        <Field key={String(label)} label={w(String(label))} required>
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete={index === 0 ? "current-password" : "new-password"}
              value={value as string}
              onChange={(e) =>
                (setter as (value: string) => void)(e.target.value)
              }
              required
              minLength={index === 0 ? undefined : 8}
            />
          )}
        </Field>
      ))}
      {error && (
        <p className="error-message" role="alert">
          {w(error)}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {w(busy ? "Saving…" : "Change password")}
      </button>
    </form>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  const api = useMemo(() => new APIClient(readSession()), []);
  const [platform, setPlatform] = useState(
    Boolean(session?.user.is_platform_admin && !session.school),
  );
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api.onSession = (next) => {
      setSession(next);
      if (!next?.school && next?.user.is_platform_admin) setPlatform(true);
    };
    return () => {
      api.cancelPending();
    };
  }, [api]);
  const w = useWords();
  async function switchTo(id: number) {
    setSwitching(true);
    setError("");
    try {
      await api.switchSchool(id);
      setPlatform(false);
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    } finally {
      setSwitching(false);
    }
  }
  async function logout() {
    await api
      .request("logout/", {
        method: "POST",
        body: JSON.stringify({ refresh: session?.refresh }),
      })
      .catch(() => undefined);
    api.replaceSession(null);
    setPlatform(false);
    setError("");
  }
  if (!session) return <Login api={api} />;
  if (session.user.must_change_password)
    return (
      <div className="gate-page">
        <LanguageChoice />
        <Brand
          name={session.school?.name || w("School Workspace")}
          logo={session.school?.logo}
        />
        <PasswordChange api={api} required />
        <button className="text-button" onClick={logout}>
          {w("Sign out")}
        </button>
      </div>
    );
  if (switching)
    return (
      <div className="gate-page">
        <Loading />
      </div>
    );
  if (platform && session.user.is_platform_admin)
    return (
      <Platform
        api={api}
        session={session}
        onWorkspace={() => setPlatform(false)}
        onLogout={logout}
      />
    );
  if (!session.school)
    return (
      <div className="gate-page">
        <LanguageChoice />
        <Brand name={w("School Workspace")} />
        <h1>{w("Choose your school")}</h1>
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        <div className="school-choices">
          {session.memberships.map(({ school, role }) => (
            <button
              className="school-choice"
              key={school.id}
              onClick={() => switchTo(school.id)}
            >
              <Brand name={school.name} logo={school.logo} />
              <span>
                {w(role === "admin" ? "School Admin" : "Teacher")}
                <Icon name="arrow" />
              </span>
            </button>
          ))}
        </div>
        <button className="text-button" onClick={logout}>
          {w("Sign out")}
        </button>
      </div>
    );
  return (
    <Workspace
      key={`${session.user.id}:${session.school.id}:${session.user.role}`}
      api={api}
      session={session}
      onSwitch={switchTo}
      onPlatform={() => setPlatform(true)}
      onLogout={logout}
      switchError={error}
    />
  );
}
