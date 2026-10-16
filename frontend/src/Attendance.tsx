import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { allRows, number, text, today } from "./api";
import type { APIClient, Row } from "./api";
import { Empty, Field, Heading, Loading } from "./components";
import { useI18n, useWords } from "./i18n";

type Register = {
  revision: number;
  actor_name: string;
  actor_identifier: string;
  actor_role: string;
  saved_at: string;
  can_retake: boolean;
  history: Row[];
};
export function AttendancePage({
  api,
  initialClass,
  onClassChange,
}: {
  api: APIClient;
  initialClass: string;
  onClassChange: (value: string) => void;
}) {
  const w = useWords();
  const { formatDate, formatNumber } = useI18n();
  const [classes, setClasses] = useState<Row[]>([]);
  const [selected, setSelected] = useState(initialClass);
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState<Row[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [session, setSession] = useState<Register | null>(null);
  const [editing, setEditing] = useState(true);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    allRows(api, "classes/")
      .then((rows) => {
        if (live) {
          const active = rows.filter((row) => row.status === "Active");
          setClasses(active);
          if (active.length === 1) setSelected(String(active[0].id));
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api]);
  useEffect(() => {
    let live = true;
    setStudents([]);
    setMarks({});
    setSession(null);
    setReason("");
    setError("");
    setEditing(true);
    if (!selected) return;
    setLoading(true);
    Promise.all([
      allRows(api, `students/?school_class=${selected}&status=Active`),
      allRows(
        api,
        `attendance/?school_class=${selected}&attendance_date=${date}`,
      ),
      api.request<{ session: Register | null }>(
        `attendance-session/?school_class=${selected}&date=${date}`,
      ),
    ])
      .then(([pupils, records, data]) => {
        if (live) {
          setStudents(pupils);
          setMarks(
            Object.fromEntries(
              records.map((row) => [number(row.student), text(row.status)]),
            ),
          );
          setSession(data.session);
          setEditing(!data.session);
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, selected, date, reload]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (students.some((row) => !marks[row.id])) {
      setError("Mark every student before saving attendance.");
      return;
    }
    setSaving(true);
    try {
      const result = await api.request<{ session: Register }>("attendance/", {
        method: "POST",
        body: JSON.stringify({
          records: students.map((row) => ({
            student: row.id,
            school_class: number(selected),
            attendance_date: date,
            status: marks[row.id],
          })),
          expected_revision: session?.revision || 0,
          reason,
        }),
      });
      setSession(result.session);
      setEditing(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }
  const unmarked = students.filter((row) => !marks[row.id]).length;
  return (
    <>
      <Heading
        title={w("Attendance")}
        description={w(
          "Choose a class, mark each student, then save the register.",
        )}
      />
      <section className="records-panel">
        <div className="record-toolbar">
          <Field label={w("Class")} required>
            <select
              value={selected}
              disabled={saving}
              onChange={(e) => {
                setSelected(e.target.value);
                onClassChange(e.target.value);
              }}
            >
              <option value="">{w("Select")}</option>
              {classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {text(row.name)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={w("Date")} required>
            <input
              type="date"
              value={date}
              max={today()}
              disabled={saving}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {editing && students.length > 0 && (
            <button
              className="button secondary"
              disabled={saving}
              onClick={() =>
                setMarks(
                  Object.fromEntries(
                    students.map((row) => [row.id, "Present"]),
                  ),
                )
              }
            >
              {w("Mark all present")}
            </button>
          )}
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => setReload((value) => value + 1)}
          >
            {w("Reload register")}
          </button>
        </div>
        {session && (
          <div className="attendance-confirmation" role="status">
            <strong>{w("Attendance saved")}</strong>
            <p>
              {session.actor_name} · {w("Staff ID")}: {session.actor_identifier}{" "}
              ·{" "}
              {w(session.actor_role === "teacher" ? "Teacher" : "School Admin")}
            </p>
            <small>
              {formatDate(session.saved_at, {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              · {w("Revision")} {formatNumber(session.revision)}
            </small>
            {!editing &&
              (session.can_retake ? (
                <button
                  className="button secondary"
                  onClick={() => setEditing(true)}
                >
                  {w("Retake attendance")}
                </button>
              ) : (
                <p>
                  {w("Contact the school administrator to correct attendance.")}
                </p>
              ))}
            <details>
              <summary>{w("Attendance history")}</summary>
              {session.history.map((row) => (
                <p key={number(row.revision)}>
                  {w("Revision")} {number(row.revision)} ·{" "}
                  {text(row.actor_name)} ({text(row.actor_identifier)}) ·{" "}
                  {formatDate(text(row.saved_at))}
                  {row.reason ? ` · ${text(row.reason)}` : ""}
                </p>
              ))}
            </details>
          </div>
        )}
        {error && (
          <p className="error-message" role="alert">
            {w(error)}
          </p>
        )}
        {loading ? (
          <Loading />
        ) : !selected ? (
          <Empty title={w("Choose a class to begin.")} />
        ) : !students.length ? (
          <Empty title={w("No records yet")} />
        ) : (
          <form onSubmit={save}>
            {editing && session && (
              <div className="retake-reason">
                <Field label={w("Reason for correction")} required>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={255}
                    required
                  />
                </Field>
              </div>
            )}
            <div className="attendance-register">
              {students.map((row) => (
                <div className="register-row" key={row.id}>
                  <div>
                    <strong>{text(row.name)}</strong>
                    <small>{text(row.student_id)}</small>
                  </div>
                  <div
                    className="attendance-options"
                    role="group"
                    aria-label={`${w("Attendance")} · ${text(row.name)}`}
                  >
                    {["Present", "Absent", "Late"].map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={!editing || saving}
                        className={`attendance-option ${marks[row.id] === status ? `selected ${status.toLowerCase()}` : ""}`}
                        aria-pressed={marks[row.id] === status}
                        onClick={() =>
                          setMarks((current) => ({
                            ...current,
                            [row.id]: status,
                          }))
                        }
                      >
                        {w(status)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="form-footer sticky-footer">
              <span className={`save-state ${!editing ? "saved" : ""}`}>
                {w(!editing ? "Attendance saved" : "Not saved")} ·{" "}
                {formatNumber(unmarked)} {w("Unmarked")}
              </span>
              {editing && (
                <button className="button primary" disabled={saving}>
                  {w(saving ? "Saving…" : "Save attendance")}
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </>
  );
}
