import { useEffect, useState } from "react";
import { allRows, number, text } from "./api";
import type { APIClient, Row, Session } from "./api";
import { Brand, Empty, Field, Heading, Loading } from "./components";
import { RecordsPage } from "./RecordPages";
import { useWords } from "./i18n";

export function TimetablePage({
  api,
  session,
  school,
  year,
  initialClass,
  onClassChange,
}: {
  api: APIClient;
  session: Session;
  school: Record<string, unknown>;
  year: string;
  initialClass: string;
  onClassChange: (value: string) => void;
}) {
  const w = useWords();
  const admin = session.user.role === "admin";
  const [classes, setClasses] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [mode, setMode] = useState("class");
  const [selected, setSelected] = useState(initialClass);
  const [teacher, setTeacher] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [manage, setManage] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([
      allRows(api, "classes/"),
      admin ? allRows(api, "teachers/") : Promise.resolve([]),
    ])
      .then(([c, t]) => {
        if (live) {
          setClasses(c.filter((row) => row.status === "Active"));
          setTeachers(t.filter((row) => row.status === "Active"));
          if (!initialClass && c.length) setSelected(String(c[0].id));
          if (t.length) setTeacher(String(t[0].id));
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api, admin, initialClass]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    const params =
      mode === "class"
        ? `view=class&school_class=${selected}`
        : admin
          ? `teacher=${teacher}`
          : "";
    if (
      (mode === "class" && !selected) ||
      (mode === "teacher" && admin && !teacher)
    ) {
      setBusy(false);
      setRows([]);
      return;
    }
    allRows(api, `timetable/?${params}`)
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [api, mode, selected, teacher, admin, manage]);
  if (manage)
    return (
      <>
        <button className="button secondary" onClick={() => setManage(false)}>
          {w("Back to weekly timetable")}
        </button>
        <RecordsPage
          api={api}
          session={session}
          section="timetable"
          year={year}
          initialClass={selected}
          onClassChange={onClassChange}
          onNavigate={() => undefined}
          onIntentUsed={() => undefined}
        />
      </>
    );
  const days = [
    "Saturday",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ].filter((day) => day !== "Friday" || rows.some((row) => row.day === day));
  const slots = [
    ...new Set(
      rows.map(
        (row) =>
          `${text(row.start_time).slice(0, 5)}–${text(row.end_time).slice(0, 5)}`,
      ),
    ),
  ].sort();
  const title =
    mode === "class"
      ? text(classes.find((row) => row.id === number(selected))?.name)
      : admin
        ? text(teachers.find((row) => row.id === number(teacher))?.name)
        : session.user.full_name || session.user.username;
  return (
    <>
      <Heading
        title={w("Timetable")}
        description={w(
          "Choose a class or teacher, then print the weekly schedule.",
        )}
      >
        {admin && (
          <button className="button primary" onClick={() => setManage(true)}>
            {w("Manage lessons")}
          </button>
        )}
      </Heading>
      <div className="panel timetable-controls">
        <Field label={w("Timetable for")}>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="class">{w("Class")}</option>
            <option value="teacher">{w("Teacher")}</option>
          </select>
        </Field>
        {mode === "class" ? (
          <Field label={w("Class")}>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                onClassChange(e.target.value);
              }}
            >
              {classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {text(row.name)}
                </option>
              ))}
            </select>
          </Field>
        ) : admin ? (
          <Field label={w("Teacher")}>
            <select
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            >
              {teachers.map((row) => (
                <option key={row.id} value={row.id}>
                  {text(row.name)} · {text(row.teacher_id)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <button
          className="button secondary"
          disabled={busy || !rows.length}
          onClick={() => window.print()}
        >
          {w("Print timetable")}
        </button>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <section className="panel timetable-print print-report">
        <Brand name={text(school.name)} logo={text(school.logo) || null} />
        <h2>
          {title} · {w("Weekly timetable")}
        </h2>
        <p>
          {w("Academic year")} {year}
        </p>
        {busy ? (
          <Loading />
        ) : !rows.length ? (
          <Empty title={w("No lessons scheduled")} />
        ) : (
          <div className="table-scroll">
            <table className="weekly-timetable">
              <thead>
                <tr>
                  <th>{w("Time")}</th>
                  {days.map((day) => (
                    <th key={day}>{w(day)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot}>
                    <th>{slot}</th>
                    {days.map((day) => (
                      <td key={day}>
                        {rows
                          .filter(
                            (row) =>
                              row.day === day &&
                              `${text(row.start_time).slice(0, 5)}–${text(row.end_time).slice(0, 5)}` ===
                                slot,
                          )
                          .map((row) => (
                            <div className="lesson-cell" key={row.id}>
                              <strong>{text(row.subject)}</strong>
                              <span>
                                {text(
                                  mode === "class"
                                    ? row.teacher_name
                                    : row.school_class_name,
                                )}
                              </span>
                            </div>
                          ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
