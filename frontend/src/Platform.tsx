import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { APIError, text } from "./api";
import type { APIClient, Row, School, Session } from "./api";
import {
  Brand,
  Dialog,
  Empty,
  Field,
  Heading,
  Icon,
  Loading,
  Status,
} from "./components";
import { LanguageChoice } from "./App";
import { useI18n, useWords } from "./i18n";

export function Platform({
  api,
  session,
  onWorkspace,
  onLogout,
}: {
  api: APIClient;
  session: Session;
  onWorkspace: () => void;
  onLogout: () => Promise<void>;
}) {
  const w = useWords();
  const { formatDate } = useI18n();
  const [schools, setSchools] = useState<School[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ school: School | null } | null>(null);
  const [members, setMembers] = useState<School | null>(null);
  const [confirm, setConfirm] = useState<School | null>(null);
  const [history, setHistory] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .request<School[]>("platform/schools/")
      .then((data) => {
        if (live) setSchools(data);
      })
      .catch((err) => {
        if (live && err instanceof APIError) setError(err.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [api, revision]);
  async function openSchool(school: School) {
    setBusy(true);
    setError("");
    api.cancelPending();
    try {
      const next = await api.request<Session>(
        `platform/schools/${school.id}/access/`,
        { method: "POST", body: "{}" },
      );
      api.replaceSession(next);
      onWorkspace();
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="platform-page">
      <header className="platform-topbar">
        <Brand name={w("School Workspace")} />
        <div className="topbar-tools">
          <LanguageChoice />
          {session.school && (
            <button className="button secondary" onClick={onWorkspace}>
              {w("Open workspace")}
            </button>
          )}
          <button className="button secondary" onClick={onLogout}>
            {w("Sign out")}
          </button>
        </div>
      </header>
      <main className="platform-content">
        <span className="eyebrow">{w("Platform administration")}</span>
        <Heading
          title={w("School workspaces")}
          description={w(
            "Create and manage independent schools from one place.",
          )}
        >
          <button
            className="button primary"
            onClick={() => setEditor({ school: null })}
          >
            <Icon name="plus" />
            {w("Create school")}
          </button>
        </Heading>
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        {busy ? (
          <Loading />
        ) : !schools.length ? (
          <Empty
            title={w("Create your first school")}
            description={w(
              "Each school gets its own administrator, records, and branding.",
            )}
          >
            <button
              className="button primary"
              onClick={() => setEditor({ school: null })}
            >
              {w("Create school")}
            </button>
          </Empty>
        ) : (
          <div className="school-grid">
            {schools.map((school) => (
              <article className="school-card" key={school.id}>
                <Brand name={school.name} logo={school.logo} />
                <div className="school-card-meta">
                  <span>{school.slug}</span>
                  <Status value={school.is_active ? "Active" : "Suspended"} />
                </div>
                <div className="school-card-actions">
                  <button
                    className="button primary"
                    disabled={!school.is_active}
                    onClick={() => openSchool(school)}
                  >
                    {w("Open workspace")}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setEditor({ school })}
                  >
                    {w("Edit")}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setMembers(school)}
                  >
                    {w("Manage members")}
                  </button>
                  <button
                    className={`button ${school.is_active ? "danger" : "secondary"}`}
                    onClick={() => setConfirm(school)}
                  >
                    {w(school.is_active ? "Suspend school" : "Activate school")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <section className="panel platform-history">
          <div className="section-title">
            <h2>{w("Administrative history")}</h2>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  setHistory(await api.request("platform/audit/"));
                } catch (err) {
                  if (err instanceof APIError) setError(err.message);
                }
              }}
            >
              {w("View")}
            </button>
          </div>
          {history && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {["Account", "School name", "Actions", "Date"].map((x) => (
                      <th key={x}>{w(x)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>{text(row.actor)}</td>
                      <td>{text(row.school)}</td>
                      <td>{text(row.action).replaceAll("_", " ")}</td>
                      <td>
                        {formatDate(text(row.created_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      {editor && (
        <SchoolEditor
          api={api}
          school={editor.school}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setRevision((x) => x + 1);
          }}
        />
      )}
      {members && (
        <Memberships
          api={api}
          school={members}
          onClose={() => setMembers(null)}
        />
      )}
      {confirm && (
        <Dialog
          title={w(confirm.is_active ? "Suspend school" : "Activate school")}
          onClose={() => setConfirm(null)}
        >
          <p>{confirm.name}</p>
          <p>
            {w(
              confirm.is_active
                ? "All school members will lose access until this school is activated again."
                : "Members can sign in again after activation.",
            )}
          </p>
          <div className="form-footer">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
            >
              {w("Cancel")}
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await api.request(`platform/schools/${confirm.id}/`, {
                    method: "PATCH",
                    body: JSON.stringify({ is_active: !confirm.is_active }),
                  });
                  setConfirm(null);
                  setRevision((x) => x + 1);
                } catch (err) {
                  if (err instanceof APIError) setError(err.message);
                  setConfirm(null);
                }
              }}
            >
              {w(confirm.is_active ? "Suspend school" : "Activate school")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SchoolEditor({
  api,
  school,
  onClose,
  onSaved,
}: {
  api: APIClient;
  school: School | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const w = useWords();
  const [name, setName] = useState(school?.name || "");
  const [slug, setSlug] = useState(school?.slug || "");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accent, setAccent] = useState(school?.appearance.accent || "#364e6a");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("slug", slug);
      form.append("appearance", JSON.stringify({ accent }));
      if (file) form.append("logo", file);
      if (!school) {
        form.append("admin_username", username);
        form.append("admin_email", email);
        form.append("admin_password", password);
      }
      await api.request(`platform/schools/${school ? `${school.id}/` : ""}`, {
        method: school ? "PATCH" : "POST",
        body: form,
      });
      onSaved();
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={w(school ? "Edit school" : "Create school")}
      onClose={onClose}
    >
      <form className="focused-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label={w("School name")} required>
            {(id) => (
              <input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label={w("School address (slug)")} required>
            {(id) => (
              <input
                id={id}
                value={slug}
                pattern="[a-z0-9-]+"
                onChange={(e) => setSlug(e.target.value)}
                required
                placeholder="my-school"
              />
            )}
          </Field>
        </div>
        <Field label={w("School logo")}>
          {(id) => (
            <div className="logo-upload">
              {school?.logo && <img src={school.logo} alt={school.name} />}
              <input
                id={id}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <small>PNG, JPEG, WebP · 2 MB</small>
            </div>
          )}
        </Field>
        <Field label={w("Accent color")}>
          {(id) => (
            <input
              id={id}
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          )}
        </Field>
        {!school && (
          <>
            <h3>{w("First school administrator")}</h3>
            <Field label={w("Administrator username")} required>
              {(id) => (
                <input
                  id={id}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  required
                />
              )}
            </Field>
            <Field label={w("Email")}>
              {(id) => (
                <input
                  id={id}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label={w("Temporary password")} required>
              {(id) => (
                <input
                  id={id}
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              )}
            </Field>
            <p className="muted">
              {w(
                "The administrator must change this password at their next sign-in.",
              )}
            </p>
          </>
        )}
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            {w("Cancel")}
          </button>
          <button className="button primary" disabled={busy}>
            {w(busy ? "Saving…" : school ? "Save" : "Create school")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Memberships({
  api,
  school,
  onClose,
}: {
  api: APIClient;
  school: School;
  onClose: () => void;
}) {
  const w = useWords();
  const [members, setMembers] = useState<Row[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reset, setReset] = useState<Row | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    api
      .request<Row[]>(`platform/schools/${school.id}/memberships/`)
      .then((rows) => {
        if (live) setMembers(rows);
      })
      .catch((err) => {
        if (live && err instanceof APIError) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api, school.id, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.request(`platform/schools/${school.id}/memberships/`, {
        method: "POST",
        body: JSON.stringify({
          username,
          temporary_password: password,
          role: "admin",
        }),
      });
      setRevision((x) => x + 1);
      setUsername("");
      setPassword("");
    } catch (err) {
      if (err instanceof APIError) setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`${w("Manage members")} · ${school.name}`} onClose={onClose}>
      <div className="member-list">
        {members.map((row) => (
          <div className="history-row" key={row.id}>
            <div>
              <strong>{text(row.username)}</strong>
              <select
                aria-label={`${w("Role")} ${text(row.username)}`}
                disabled={Boolean(row.platform)}
                value={text(row.role)}
                onChange={async (e) => {
                  try {
                    await api.request(
                      `platform/schools/${school.id}/memberships/`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          username: row.username,
                          role: e.target.value,
                          is_active: row.is_active,
                        }),
                      },
                    );
                    setRevision((x) => x + 1);
                  } catch (err) {
                    if (err instanceof APIError) setError(err.message);
                  }
                }}
              >
                <option value="admin">{w("School Admin")}</option>
                <option value="teacher" disabled={!row.teacher_profile}>
                  {w("Teacher")}
                </option>
              </select>
            </div>
            <Status value={row.is_active ? "Active" : "Inactive"} />
            <button
              className="button small secondary"
              disabled={Boolean(row.platform)}
              onClick={async () => {
                try {
                  await api.request(
                    `platform/schools/${school.id}/memberships/`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        username: row.username,
                        role: row.role,
                        is_active: !row.is_active,
                      }),
                    },
                  );
                  setRevision((x) => x + 1);
                } catch (err) {
                  if (err instanceof APIError) setError(err.message);
                }
              }}
            >
              {w(row.is_active ? "Deactivate account" : "Activate account")}
            </button>
            {!row.platform && (
              <button
                className="button small secondary"
                onClick={() => setReset(row)}
              >
                {w("Reset password")}
              </button>
            )}
          </div>
        ))}
      </div>
      {reset && (
        <form
          className="focused-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await api.request(
                `platform/memberships/${reset.id}/reset-password/`,
                {
                  method: "POST",
                  body: JSON.stringify({ temporary_password: resetPassword }),
                },
              );
              setReset(null);
              setResetPassword("");
            } catch (err) {
              if (err instanceof APIError) setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>
            {w("Reset password")} - {text(reset.username)}
          </h3>
          <Field label={w("Temporary password")} required>
            {(id) => (
              <input
                id={id}
                type="password"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                required
                minLength={8}
              />
            )}
          </Field>
          <p className="muted">
            {w("Sessions in all schools will end for this account.")}
          </p>
          <div className="form-footer">
            <button
              className="button secondary"
              type="button"
              onClick={() => setReset(null)}
            >
              {w("Cancel")}
            </button>
            <button className="button primary" disabled={busy}>
              {w("Reset password")}
            </button>
          </div>
        </form>
      )}
      <form className="focused-form" onSubmit={submit}>
        <h3>{w("Add school administrator")}</h3>
        <Field label={w("Username")} required>
          {(id) => (
            <input
              id={id}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          )}
        </Field>
        <Field label={w("Temporary password")}>
          {(id) => (
            <input
              id={id}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>
        <p className="muted">
          {w("For an existing account, leave the password blank.")}
        </p>
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {w(busy ? "Saving…" : "Add member")}
        </button>
      </form>
    </Dialog>
  );
}
